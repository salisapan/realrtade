// Flow deployment waitlist — homepage "Deploy Flow in your organization" card.
//
// This used to be two direct browser -> Supabase REST calls signed with the
// public anon key. Both calls were wrapped in .then()/.catch() that called
// proceed()/finish() either way, so a rejected insert (bad RLS policy, wrong
// table name, disabled anon access) looked exactly like success to the
// visitor and to us — nobody found out the lead was never stored. Moving the
// write server-side with the service-role key means a real failure can
// finally be reported as a real failure instead of silently vanishing.
//
// Two actions share this function because they are two steps of one lead:
// 'create' records the work email and kicks off the double opt-in email;
// 'update' attaches the company/role/website that make the lead sales-ready
// and is required — a deployment lead with no role or company is not
// something sales can act on, so the client blocks completion until this
// step succeeds.
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
const SITE_URL = 'https://theflow-ai.com';
const LOG_PREFIX = '[submit-waitlist]';

const LIMITS = { email: 200, company: 160, role: 120, website: 200 };

// In-memory, per-container rate limiting — a speed bump against a scripted
// flood, not a durable guarantee. Matches the pattern already used by
// submit-lead and send-confirmation.
const RATE = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 8;

function rateLimited(key, now) {
  const hits = (RATE.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  RATE.set(key, hits);
  if (RATE.size > 5000) for (const [k, v] of RATE) if (!v.some((t) => now - t < RATE_WINDOW_MS)) RATE.delete(k);
  return hits.length > RATE_MAX;
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// Netlify's log retention keeps whatever these print; the raw address isn't
// needed for what these lines are for — spotting a pattern or diagnosing a
// rejection — so this masks it the same way the other functions in this
// project do.
function maskEmail(value) {
  const s = String(value || '');
  const at = s.indexOf('@');
  if (at < 1) return '(invalid)';
  return s.slice(0, Math.min(2, at)) + '***@' + s.slice(at + 1);
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip, Date.now())) {
    logErr('rate limited');
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' }) };
  }

  const action = payload.action === 'update' ? 'update' : payload.action === 'create' ? 'create' : null;
  if (!action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
  }

  const email = clean(payload.email, LIMITS.email);
  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please enter a valid work email.' }) };
  }
  const lang = payload.lang === 'he' ? 'he' : 'en';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    logErr('SUPABASE_SERVICE_ROLE_KEY not configured — cannot store signup');
    return { statusCode: 500, body: JSON.stringify({ error: 'Signup is not configured. Please email hello@theflow-ai.com.' }) };
  }

  if (action === 'create') {
    // Honeypot: a real visitor never fills the hidden trap field on the form.
    if (clean(payload.hp, 200)) {
      log('honeypot tripped — accepting without storing');
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const source = clean(payload.source, 60) || 'flow-landing';
    try {
      const res = await fetch(SB_URL + '/rest/v1/waitlist', {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ email, lang, source, created_at: new Date().toISOString() }),
      });
      // 409 means this email already has a row (a repeat visitor re-submitting
      // the same form) — that is not a failure, the signup already exists.
      if (!res.ok && res.status !== 409) {
        const detail = await res.text();
        logErr('Supabase rejected the waitlist insert', { status: res.status, detail });
        return { statusCode: 502, body: JSON.stringify({ error: 'We could not save that. Please try again or email hello@theflow-ai.com.' }) };
      }
      log('waitlist row stored', { email: maskEmail(email), source, alreadyExisted: res.status === 409 });
    } catch (err) {
      logErr('network error storing waitlist row', String(err));
      return { statusCode: 502, body: JSON.stringify({ error: 'We could not save that. Please try again or email hello@theflow-ai.com.' }) };
    }

    // Fire-and-forget: emails a confirmation link (double opt-in). Not
    // awaiting the result here matches the rest of this flow — the signup is
    // already durably stored above, so a slow or failed send-confirmation
    // call should not turn a successful signup into an error for the visitor.
    fetch(SITE_URL + '/.netlify/functions/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, lang }),
    }).catch((err) => logErr('send-confirmation trigger failed (non-fatal)', String(err)));

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // action === 'update': the mandatory second step. A deployment lead with no
  // role or company is not sales-ready, so all three fields are required —
  // this is not the optional "tell us more" step it used to be.
  const company = clean(payload.company, LIMITS.company);
  const role = clean(payload.role, LIMITS.role);
  const website = clean(payload.website, LIMITS.website);
  if (!company || !role || !website) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Company, role, and website are all required.' }) };
  }

  try {
    const res = await fetch(SB_URL + '/rest/v1/waitlist?email=eq.' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ company, role, website }),
    });
    if (!res.ok) {
      const detail = await res.text();
      logErr('Supabase rejected the waitlist update', { status: res.status, detail });
      return { statusCode: 502, body: JSON.stringify({ error: 'We could not save that. Please try again or email hello@theflow-ai.com.' }) };
    }
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      // No row matched this email — the 'create' step for it never landed
      // (or landed under a different address). Tell the caller plainly
      // instead of reporting a false success.
      logErr('no waitlist row matched this email on update', { email: maskEmail(email) });
      return { statusCode: 404, body: JSON.stringify({ error: 'We could not find your signup. Please re-enter your email above.' }) };
    }
    log('waitlist row updated', { email: maskEmail(email), company });
  } catch (err) {
    logErr('network error updating waitlist row', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'We could not save that. Please try again or email hello@theflow-ai.com.' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
