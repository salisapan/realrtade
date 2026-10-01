// Glance Pro licence endpoint.
//
//   POST { key }                  -> { ok, valid, status, plan, renewsAt, trialEnds }
//        Called by the extension's service worker to learn whether a pasted
//        key is a live subscription. Never reveals the buyer's email.
//   POST { action:'by-session', sessionId }
//                                  -> { ok, pending:true } | { ok, key }
//        Called by /pro-welcome.html right after Stripe Checkout. The
//        Checkout session id is an unguessable value only the buyer was sent
//        in the redirect, so it is the proof of purchase for showing the key.
//   POST { action:'resend', email } -> { ok:true } always (no account probing)
//        Emails the key again to the address on file.
const crypto = require('crypto');
const core = require('./license-core.js');

const LOG_PREFIX = '[verify-license]';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const RATE = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
function tooMany(bucket, key, max, now) {
  const k = bucket + '|' + key;
  const hits = (RATE.get(k) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  RATE.set(k, hits);
  if (RATE.size > 5000) for (const [kk, v] of RATE) if (!v.some((t) => now - t < RATE_WINDOW_MS)) RATE.delete(kk);
  return hits.length > max;
}

function reply(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');

  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Invalid JSON' }); }

  const env = process.env;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = env.LICENSE_SECRET;
  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const action = body.action || 'verify';

  try {
    if (action === 'verify') {
      // Generous: the extension re-checks on a schedule, but a wrong key
      // pasted repeatedly is the only abuse worth slowing.
      if (tooMany('verify', ip, 60, now)) return reply(429, { ok: false, error: 'Too many requests' });
      const res = await core.checkLicense(body.key, env, now);
      if (!res.configured) return reply(503, { ok: false, error: 'Licensing is not available right now.' });
      if (!res.valid) return reply(200, { ok: true, valid: false, reason: res.reason || 'unknown', status: res.status || null });
      return reply(200, { ok: true, valid: true, status: res.status, plan: res.plan, interval: res.interval, renewsAt: res.renewsAt, trialEnds: res.trialEnds });
    }

    if (action === 'by-session') {
      if (tooMany('session', ip, 30, now)) return reply(429, { ok: false, error: 'Too many requests' });
      const sessionId = String(body.sessionId || '');
      if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return reply(400, { ok: false, error: 'Invalid session' });
      if (!serviceKey || !secret) return reply(503, { ok: false, error: 'Licensing is not available right now.' });
      const rows = await core.findBy(serviceKey, 'checkout_session_id', sessionId);
      if (!rows.length) return reply(200, { ok: true, pending: true });
      const row = rows[0];
      if (!row.stripe_subscription_id) return reply(200, { ok: true, pending: true });
      const key = core.deriveKey(secret, row.stripe_subscription_id);
      if (core.hashKey(key) !== row.key_hash) {
        logErr('derived key does not match stored hash; LICENSE_SECRET was probably rotated');
        return reply(200, { ok: true, pending: false, key: null, error: 'Your key was emailed to you. Reply to that email if it did not arrive.' });
      }
      return reply(200, { ok: true, key, status: row.status, trialEnds: row.trial_end || null });
    }

    if (action === 'resend') {
      // Same response whether or not the address has a licence, so this cannot
      // be used to discover who is a customer.
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) return reply(400, { ok: false, error: 'Enter a valid email address.' });
      if (tooMany('resend-ip', ip, 5, now) || tooMany('resend-email', email, 2, now)) return reply(429, { ok: false, error: 'Too many requests. Try again later.' });
      if (serviceKey && secret && env.RESEND_API_KEY) {
        const rows = (await core.findBy(serviceKey, 'email', email)).filter((r) => core.isEntitled(r, now) && r.stripe_subscription_id);
        for (const row of rows) {
          const key = core.deriveKey(secret, row.stripe_subscription_id);
          const mail = core.licenseEmail(key, { trialEnds: row.status === 'trialing' ? row.trial_end : null });
          await core.sendMail(env.RESEND_API_KEY, { from: core.FROM_GLANCE, to: [email], subject: mail.subject, html: mail.html });
        }
        log('resend processed', { count: rows.length });
      }
      return reply(200, { ok: true });
    }

    return reply(400, { ok: false, error: 'Invalid action' });
  } catch (err) {
    logErr(action + ' failed', String(err && err.message || err));
    return reply(502, { ok: false, error: 'We could not check that right now. Please try again.' });
  }
};
