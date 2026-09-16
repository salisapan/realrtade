// Anonymous, opt-in submission from missed-deadline.html's "Contribute this
// catch" button, feeding the /almost-missed.html gallery.
//
// The client only ever sends four things: which domain it landed in, the
// engine-generated headline (built solely from structured facts — amount,
// date — the same template the real product uses for its own record
// titles), the score, and two booleans. It never sends the raw pasted
// email or the decisive-sentence quote — missed-deadline.html's own
// buildCard() keeps those in the DOM only, never in the object this
// function receives. Every field here is still re-validated against an
// allowlist rather than trusted, because a request can be crafted by hand
// and does not have to come from that page's own JS.
//
// Rows land with approved=false. There is no public read of a row until a
// human flips that in the Supabase dashboard — this function has no path
// that sets it true. That gate is what keeps an anonymous, loginless
// submission endpoint from being able to put arbitrary text in front of
// every visitor to a public gallery page.
const crypto = require('crypto');

const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
const LOG_PREFIX = '[submit-catch]';

// Must match assets/glance-engine.js's FLOW_DOMAINS ids exactly. A request
// naming anything else is rejected rather than stored under a made-up
// domain the gallery page's filter tabs don't know how to label.
const DOMAINS = ['sales', 'legal', 'finance', 'ops', 'support', 'hr'];

const LIMITS = { headline: 200 };

// In-memory, per-container rate limiting — the same speed-bump pattern
// submit-lead and submit-waitlist already use. Tighter than those two
// (this form has no email to key off of, and nothing stops a script from
// POSTing directly without ever loading the page).
const RATE = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;

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

  // Honeypot: a real visitor never fills a field they cannot see.
  if (clean(payload.hp, 200)) {
    log('honeypot tripped — accepting without storing');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const domainId = DOMAINS.includes(payload.domainId) ? payload.domainId : null;
  if (!domainId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unrecognised domain.' }) };
  }

  const headline = clean(payload.headline, LIMITS.headline);
  if (!headline) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nothing to contribute.' }) };
  }

  const score = Number.isFinite(payload.score) ? Math.max(0, Math.min(999, Math.round(payload.score))) : null;
  const hasMoney = payload.hasMoney === true;
  const hasDate = payload.hasDate === true;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    logErr('SUPABASE_SERVICE_ROLE_KEY not configured — cannot store submission');
    return { statusCode: 500, body: JSON.stringify({ error: 'Submissions are not configured right now.' }) };
  }

  try {
    const res = await fetch(SB_URL + '/rest/v1/catches', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        domain_id: domainId,
        headline,
        score,
        has_money: hasMoney,
        has_date: hasDate,
        approved: false,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      logErr('Supabase rejected the catch insert', { status: res.status, detail });
      return { statusCode: 502, body: JSON.stringify({ error: 'We could not save that. Please try again.' }) };
    }
    log('catch stored (pending review)', { domainId, hasMoney, hasDate });
  } catch (err) {
    logErr('network error storing catch', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'We could not save that. Please try again.' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
