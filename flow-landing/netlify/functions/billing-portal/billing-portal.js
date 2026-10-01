// Lets a Glance Pro customer cancel, switch plan or update their card without
// emailing us. POST { key } -> { url } (a Stripe-hosted billing portal page).
// The portal must be switched on once in the Stripe dashboard
// (Settings > Billing > Customer portal). Easy cancellation is a feature: it
// is what makes people willing to start the trial.
const crypto = require('crypto');
const core = require('../verify-license/license-core.js');

const LOG_PREFIX = '[billing-portal]';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const RATE = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
function tooMany(key, max, now) {
  const hits = (RATE.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  RATE.set(key, hits);
  if (RATE.size > 2000) for (const [k, v] of RATE) if (!v.some((t) => now - t < RATE_WINDOW_MS)) RATE.delete(k);
  return hits.length > max;
}
function reply(statusCode, body) { return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) }; }

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });

  const env = process.env;
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(503, { ok: false, error: 'Billing is not available right now.' });

  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (tooMany(ip, 10, Date.now())) return reply(429, { ok: false, error: 'Too many requests' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Invalid JSON' }); }
  const key = core.normalizeKey(body.key);
  if (!key) return reply(400, { ok: false, error: 'That does not look like a Glance Pro key.' });

  try {
    const row = await core.findByHash(env.SUPABASE_SERVICE_ROLE_KEY, core.hashKey(key));
    if (!row || !row.stripe_customer_id) return reply(404, { ok: false, error: 'No subscription found for that key.' });
    const res = await core.withTimeout((signal) => fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      signal,
      headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ customer: row.stripe_customer_id, return_url: core.SITE_URL + '/pricing.html#glance-pro' }).toString(),
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) { logErr('portal session failed', res.status); return reply(502, { ok: false, error: 'We could not open billing. Reply to your key email and we will sort it out.' }); }
    return reply(200, { ok: true, url: data.url });
  } catch (err) {
    logErr('failed', String(err && err.message || err));
    return reply(502, { ok: false, error: 'We could not open billing right now.' });
  }
};
