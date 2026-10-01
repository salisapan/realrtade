// Glance Pro checkout.
//
//   GET  -> { enabled, trialDays, prices:{month,year}, founding }
//        Pricing page asks this on load. `enabled` is true only when every
//        Stripe setting is present, so the "Start free trial" button can never
//        appear before it can actually take payment. The prices come from
//        Stripe itself, so the number shown is the number charged.
//   POST { interval:'month'|'year', email? } -> { url }
//        Creates a Stripe Checkout session and returns its hosted URL.
//
// Settings (Netlify environment):
//   STRIPE_SECRET_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
//   STRIPE_WEBHOOK_SECRET, LICENSE_SECRET, SUPABASE_SERVICE_ROLE_KEY   required
//   PRO_PUBLIC=1            the last switch: nothing is offered to visitors until
//                           this is set, so keys can be installed and tested first
//   PRO_TRIAL_DAYS          optional, default 14, 0 = no trial
//   FOUNDING_COUPON_ID      optional Stripe coupon with max_redemptions; applied
//                           automatically while redemptions remain
const crypto = require('crypto');
const core = require('../verify-license/license-core.js');

const LOG_PREFIX = '[create-checkout]';
const SITE_URL = 'https://theflow-ai.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const RATE = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
function tooMany(key, max, now) {
  const hits = (RATE.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  RATE.set(key, hits);
  if (RATE.size > 5000) for (const [k, v] of RATE) if (!v.some((t) => now - t < RATE_WINDOW_MS)) RATE.delete(k);
  return hits.length > max;
}

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function settings(env) {
  const trialRaw = env.PRO_TRIAL_DAYS === undefined || env.PRO_TRIAL_DAYS === '' ? 14 : Number(env.PRO_TRIAL_DAYS);
  const trialDays = Number.isInteger(trialRaw) && trialRaw >= 0 && trialRaw <= 90 ? trialRaw : 14;
  return {
    secretKey: env.STRIPE_SECRET_KEY,
    priceMonth: env.STRIPE_PRICE_PRO_MONTHLY,
    priceYear: env.STRIPE_PRICE_PRO_YEARLY,
    trialDays,
    coupon: env.FOUNDING_COUPON_ID || '',
    enabled: Boolean(env.PRO_PUBLIC === '1' && env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO_MONTHLY && env.STRIPE_PRICE_PRO_YEARLY && env.LICENSE_SECRET && env.SUPABASE_SERVICE_ROLE_KEY && env.STRIPE_WEBHOOK_SECRET),
  };
}

async function stripe(secretKey, method, path, form) {
  const res = await core.withTimeout((signal) => fetch('https://api.stripe.com' + path, {
    method,
    signal,
    headers: Object.assign({ Authorization: 'Bearer ' + secretKey }, form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    body: form ? new URLSearchParams(form).toString() : undefined,
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('Stripe ' + method + ' ' + path + ' failed: HTTP ' + res.status + ' ' + ((data.error && data.error.message) || ''));
    err.status = res.status;
    throw err;
  }
  return data;
}

// Founding coupon: usable only while it is valid and has redemptions left.
async function foundingState(cfg) {
  if (!cfg.coupon) return null;
  const c = await stripe(cfg.secretKey, 'GET', '/v1/coupons/' + encodeURIComponent(cfg.coupon));
  if (!c.valid) return null;
  const remaining = typeof c.max_redemptions === 'number' ? c.max_redemptions - (c.times_redeemed || 0) : null;
  if (remaining !== null && remaining <= 0) return null;
  return {
    remaining,
    percentOff: c.percent_off || null,
    amountOff: c.amount_off || null,
    duration: c.duration,
    months: c.duration_in_months || null,
  };
}

async function priceInfo(cfg, id) {
  const p = await stripe(cfg.secretKey, 'GET', '/v1/prices/' + encodeURIComponent(id));
  return { amount: p.unit_amount, currency: p.currency, interval: p.recurring && p.recurring.interval };
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const cfg = settings(process.env);
  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();

  if (event.httpMethod === 'GET') {
    if (!cfg.enabled) return reply(200, { enabled: false });
    if (tooMany('get|' + ip, 60, now)) return reply(429, { enabled: false });
    try {
      const [month, year, founding] = await Promise.all([priceInfo(cfg, cfg.priceMonth), priceInfo(cfg, cfg.priceYear), foundingState(cfg).catch(() => null)]);
      return reply(200, { enabled: true, trialDays: cfg.trialDays, prices: { month, year }, founding });
    } catch (err) {
      logErr('status lookup failed', String(err.message || err));
      return reply(200, { enabled: false });
    }
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!cfg.enabled) return reply(503, { error: 'Checkout is not open yet.' });
  if (tooMany('post|' + ip, 12, now)) return reply(429, { error: 'Too many attempts. Please try again in a few minutes.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
  if (!interval) return reply(400, { error: 'Choose monthly or yearly.' });
  const email = String(body.email || '').trim().toLowerCase();
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) return reply(400, { error: 'Enter a valid email address.' });

  try {
    const form = {
      mode: 'subscription',
      'line_items[0][price]': interval === 'year' ? cfg.priceYear : cfg.priceMonth,
      'line_items[0][quantity]': '1',
      success_url: SITE_URL + '/pro-welcome.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: SITE_URL + '/pricing.html#glance-pro',
      'metadata[product]': 'glance-pro',
      'subscription_data[metadata][product]': 'glance-pro',
    };
    if (email) form.customer_email = email;
    if (cfg.trialDays > 0) form['subscription_data[trial_period_days]'] = String(cfg.trialDays);
    const founding = await foundingState(cfg).catch(() => null);
    if (founding) form['discounts[0][coupon]'] = cfg.coupon;
    else form.allow_promotion_codes = 'true';
    const session = await stripe(cfg.secretKey, 'POST', '/v1/checkout/sessions', form);
    return reply(200, { url: session.url });
  } catch (err) {
    logErr('session creation failed', String(err.message || err));
    return reply(502, { error: 'We could not open checkout. Please try again.' });
  }
};
