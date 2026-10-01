// Stripe -> Glance Pro licences.
//
// Stripe is the source of truth for who is paying. This function mirrors that
// into `public.licenses` and sends the buyer their key.
//
//   checkout.session.completed        create the licence, email the key, tell the owner
//   customer.subscription.updated     mirror status / renewal / trial end (trial -> active,
//   customer.subscription.deleted     active -> past_due, cancelled ...)
//
// Everything is idempotent because Stripe retries: the insert ignores a
// duplicate subscription, and the key email and owner alert are only sent when
// a row was actually created. A bad signature is rejected before any work is
// done. A processing failure returns 500 so Stripe retries instead of the sale
// silently producing no licence.
const crypto = require('crypto');
const core = require('../verify-license/license-core.js');

const LOG_PREFIX = '[stripe-webhook]';
const OWNER_EMAIL = 'ai.local.flow@gmail.com';

function iso(unixSeconds) {
  return typeof unixSeconds === 'number' && unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : null;
}

// Stripe API versions moved current_period_end from the subscription onto its
// items. Read either so a Stripe version bump cannot break licence renewals.
function periodEnd(sub) {
  if (sub && typeof sub.current_period_end === 'number') return sub.current_period_end;
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  return item && typeof item.current_period_end === 'number' ? item.current_period_end : null;
}

function subscriptionFields(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const recurring = item && item.price && item.price.recurring;
  return {
    status: sub.status,
    interval: recurring ? recurring.interval : null,
    current_period_end: iso(periodEnd(sub)),
    trial_end: iso(sub.trial_end),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null,
    updated_at: new Date().toISOString(),
  };
}

async function stripeGet(secretKey, path) {
  const res = await core.withTimeout((signal) => fetch('https://api.stripe.com' + path, { signal, headers: { Authorization: 'Bearer ' + secretKey } }));
  if (!res.ok) throw new Error('Stripe GET ' + path + ' failed: HTTP ' + res.status);
  return res.json();
}

async function insertLicense(serviceKey, row) {
  const res = await core.withTimeout((signal) => fetch(core.SB_URL + '/rest/v1/licenses?on_conflict=stripe_subscription_id', {
    method: 'POST',
    signal,
    headers: core.sbHeaders(serviceKey, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify(row),
  }));
  if (!res.ok) throw new Error('licence insert failed: HTTP ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function patchBySubscription(serviceKey, subscriptionId, fields) {
  const url = core.SB_URL + '/rest/v1/licenses?stripe_subscription_id=eq.' + encodeURIComponent(subscriptionId);
  const res = await core.withTimeout((signal) => fetch(url, {
    method: 'PATCH',
    signal,
    headers: core.sbHeaders(serviceKey, { Prefer: 'return=representation' }),
    body: JSON.stringify(fields),
  }));
  if (!res.ok) throw new Error('licence update failed: HTTP ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function onCheckoutCompleted(session, env, log) {
  if (session.mode !== 'subscription' || !session.subscription) { log('ignoring non-subscription checkout'); return; }
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const email = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
  if (!email) throw new Error('checkout session has no email');

  const sub = await stripeGet(env.STRIPE_SECRET_KEY, '/v1/subscriptions/' + encodeURIComponent(subscriptionId));
  const key = core.deriveKey(env.LICENSE_SECRET, subscriptionId);
  const fields = subscriptionFields(sub);
  const created = await insertLicense(env.SUPABASE_SERVICE_ROLE_KEY, Object.assign({
    key_hash: core.hashKey(key),
    email,
    plan: 'pro',
    stripe_subscription_id: subscriptionId,
    checkout_session_id: session.id,
  }, fields));
  if (!created) { log('licence already existed; no email re-sent', { subscriptionId }); return; }

  log('licence created', { status: fields.status, interval: fields.interval });
  if (!env.RESEND_API_KEY) { console.error(LOG_PREFIX, 'RESEND_API_KEY missing: licence created but key email NOT sent'); return; }
  const mail = core.licenseEmail(key, { trialEnds: fields.status === 'trialing' ? fields.trial_end : null });
  const sent = await core.sendMail(env.RESEND_API_KEY, { from: core.FROM_GLANCE, to: [email], subject: mail.subject, html: mail.html });
  if (!sent.ok) console.error(LOG_PREFIX, 'key email failed', sent.status);
  await core.sendMail(env.RESEND_API_KEY, {
    from: core.FROM_GLANCE,
    to: [OWNER_EMAIL],
    subject: 'New Glance Pro ' + (fields.status === 'trialing' ? 'trial' : 'subscriber') + ' (' + (fields.interval || 'plan') + ')',
    html: '<p>' + core.esc(email) + ' just started Glance Pro.</p><p>Status: <b>' + core.esc(fields.status) + '</b> &middot; billing: <b>' + core.esc(fields.interval || '?') + '</b></p>',
  }).catch(() => {});
}

async function onSubscriptionChanged(sub, env, log) {
  const id = sub.id;
  const patched = await patchBySubscription(env.SUPABASE_SERVICE_ROLE_KEY, id, subscriptionFields(sub));
  log('subscription mirrored', { status: sub.status, rows: patched });
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const env = process.env;
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.LICENSE_SECRET) {
    logErr('not configured');
    return { statusCode: 503, body: 'Not configured' };
  }

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const headers = event.headers || {};
  const sig = headers['stripe-signature'] || headers['Stripe-Signature'];
  if (!core.verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET, Date.now(), 300)) {
    logErr('bad signature');
    return { statusCode: 400, body: 'Bad signature' };
  }

  let evt;
  try { evt = JSON.parse(raw); } catch (e) { return { statusCode: 400, body: 'Bad payload' }; }

  try {
    const obj = evt.data && evt.data.object;
    if (evt.type === 'checkout.session.completed') await onCheckoutCompleted(obj, env, log);
    else if (evt.type === 'customer.subscription.updated' || evt.type === 'customer.subscription.deleted') await onSubscriptionChanged(obj, env, log);
    else log('ignored event', evt.type);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    logErr('processing failed: ' + evt.type, String(err && err.message || err));
    return { statusCode: 500, body: 'Processing failed' };
  }
};
