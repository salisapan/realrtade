// Glance sign-up: one server call that (1) records the signup in Supabase when
// possible, (2) triggers the double opt-in confirmation email, and (3) answers
// the browser with "check your email" only — no download link in this response.
//
// The signed zip link is minted only in confirm-signup.js after confirmed_at is
// written. trial-signup must never hand out a link, so calling this endpoint
// directly cannot bypass email confirmation.
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
const SITE_URL = 'https://theflow-ai.com';
const FROM_GLANCE = 'Glance <info@theflow-ai.com>';
const OWNER_EMAIL = 'ai.local.flow@gmail.com';
const LOG_PREFIX = '[trial-signup]';
const SOURCE = 'trial-extension';
const NETWORK_TIMEOUT_MS = 6000;

// Same in-memory, per-container speed bump the other public functions use.
// Per-IP stops one source hitting many addresses; per-address stops many
// sources hitting one victim with our branded email.
const RATE_IP = new Map();
const RATE_EMAIL = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_IP = 10;
const RATE_MAX_EMAIL = 4;

function tooMany(store, key, max, now) {
  const hits = (store.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  store.set(key, hits);
  if (store.size > 5000) for (const [k, v] of store) if (!v.some((t) => now - t < RATE_WINDOW_MS)) store.delete(k);
  return hits.length > max;
}

// Free mailbox providers say nothing about an employer, so they never count
// toward the "several people from one company" signal below.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me',
  'msn.com', 'mail.com', 'gmx.com', 'yandex.com', 'zoho.com', 'fastmail.com',
]);
const CLUSTER_THRESHOLDS = [3, 5, 10, 20, 50];

function maskEmail(value) {
  const s = String(value || '');
  const at = s.indexOf('@');
  if (at < 1) return '(invalid)';
  return s.slice(0, Math.min(2, at)) + '***@' + s.slice(at + 1);
}

function withTimeout(promiseFactory) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctl) ctl.abort(); }, NETWORK_TIMEOUT_MS);
  return promiseFactory(ctl ? ctl.signal : undefined).finally(() => clearTimeout(timer));
}

// Inserts the signup row. 201 = stored; 409 = this address already signed up,
// which is success for a repeat visitor. A rejected ref_code (column missing
// or malformed) must not cost us the signup itself, so retry once without it.
async function storeSignup(serviceKey, row) {
  async function post(body) {
    return withTimeout((signal) => fetch(SB_URL + '/rest/v1/waitlist', {
      method: 'POST',
      signal,
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    }));
  }
  let res = await post(row);
  if (!res.ok && res.status === 400 && row.ref_code) {
    const plain = Object.assign({}, row);
    delete plain.ref_code;
    res = await post(plain);
  }
  if (res.ok) return { stored: true, alreadyExisted: false };
  if (res.status === 409) return { stored: true, alreadyExisted: true };
  const detail = await res.text().catch(() => '');
  const err = new Error('Supabase rejected the insert: HTTP ' + res.status + ' ' + detail.slice(0, 300));
  err.status = res.status;
  throw err;
}

async function sendMail(apiKey, opts) {
  const res = await withTimeout((signal) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal,
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  }));
  return { ok: res.ok, status: res.status };
}

// Bottom-up adoption inside one company is a warm enterprise lead. Counts
// Glance signups sharing this work domain and nudges the owner once per
// milestone (exact match, so each threshold fires a single time).
async function checkDomainCluster(email, serviceKey, apiKey, log, logErr) {
  const domain = email.split('@')[1].toLowerCase();
  if (FREE_EMAIL_DOMAINS.has(domain) || !serviceKey || !apiKey) return;
  const url = SB_URL + '/rest/v1/waitlist?select=id&source=in.(' + SOURCE + ',pricing-pro)&email=ilike.*%40' + encodeURIComponent(domain);
  const res = await withTimeout((signal) => fetch(url, { signal, headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } }));
  if (!res.ok) { logErr('domain cluster count failed', res.status); return; }
  const rows = await res.json();
  const count = Array.isArray(rows) ? rows.length : 0;
  if (!CLUSTER_THRESHOLDS.includes(count)) return;
  log('domain cluster threshold reached', { domain, count });
  await sendMail(apiKey, {
    from: FROM_GLANCE,
    to: [OWNER_EMAIL],
    subject: count + ' Glance signups from ' + domain,
    html: '<p><b>' + count + '</b> Glance signups now share the domain <b>' + domain + '</b>. This usually means a team is already using it inside an organization, which may be worth a warm Enterprise outreach.</p>',
  });
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { error: 'Invalid JSON' }); }

  const email = String(payload.email || '').trim().slice(0, 200);
  const lang = payload.lang === 'he' ? 'he' : 'en';
  const refRaw = String(payload.ref_code || '').trim();
  const refCode = /^[A-Za-z0-9_-]{1,32}$/.test(refRaw) ? refRaw : '';

  // Honeypot: a real visitor never fills the hidden field. Answer like a
  // success so a bot learns nothing, but store nothing and send no mail.
  if (String(payload.company || '').trim()) {
    log('honeypot tripped: accepting without storing or sending confirmation');
    return json(200, { ok: true, stored: false, checkEmail: false });
  }

  if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.' });

  const hdrs = event.headers || {};
  const ip = String(hdrs['x-nf-client-connection-ip'] || hdrs['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  if (tooMany(RATE_IP, ip, RATE_MAX_IP, now) || tooMany(RATE_EMAIL, email.toLowerCase(), RATE_MAX_EMAIL, now)) {
    logErr('rate limited');
    return json(429, { error: 'Too many attempts. Please try again in a few minutes.' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;

  // 1) Record the signup. A failure here is reported, never swallowed.
  let stored = false;
  let alreadyExisted = false;
  let storeError = null;
  if (!serviceKey) {
    storeError = new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  } else {
    try {
      const row = { email, lang, source: SOURCE, created_at: new Date().toISOString() };
      if (refCode) row.ref_code = refCode;
      const r = await storeSignup(serviceKey, row);
      stored = r.stored;
      alreadyExisted = r.alreadyExisted;
    } catch (err) {
      storeError = err;
    }
  }
  if (stored) {
    log('signup stored', { email: maskEmail(email), alreadyExisted });
  } else {
    logErr('SIGNUP NOT STORED (confirmation email will still be attempted)', String(storeError));
    if (apiKey) {
      sendMail(apiKey, {
        from: FROM_GLANCE,
        to: [OWNER_EMAIL],
        subject: 'ACTION NEEDED: Glance signup could not be saved: ' + email,
        html: '<p>A Glance signup was <b>not</b> saved to the database, so it is recorded here instead.</p><p>Email: <b>' + email + '</b><br>Language: ' + lang +
          (refCode ? '<br>Referral: ' + refCode : '') + '<br>Time: ' + new Date().toISOString() +
          '</p><p>Reason: <code>' + String(storeError && storeError.message || storeError).replace(/[<>&]/g, '') + '</code></p>' +
          '<p>If the Supabase project shows as paused, restore it in the dashboard. The person was asked to confirm by email.</p>',
      }).catch((e) => logErr('owner failure alert could not be sent', String(e)));
    }
  }

  // 2) Double opt-in only — send-confirmation mints the confirm link, not a zip link.
  let confirmationSent = false;
  try {
    const confRes = await withTimeout((signal) => fetch(SITE_URL + '/.netlify/functions/send-confirmation', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, lang, kind: 'trial' }),
    }));
    confirmationSent = confRes.ok;
    if (!confirmationSent) logErr('send-confirmation failed', confRes.status);
  } catch (err) {
    logErr('send-confirmation request failed', String(err));
  }

  if (stored && !alreadyExisted && serviceKey && apiKey) {
    await checkDomainCluster(email, serviceKey, apiKey, log, logErr).catch((e) => logErr('domain cluster check failed (non-fatal)', String(e)));
  }

  if (!confirmationSent) {
    return json(502, { error: 'Could not send the confirmation email. Please try again in a moment.' });
  }

  return json(200, {
    ok: true,
    stored,
    emailed: true,
    checkEmail: true,
    message: lang === 'he' ? 'בדקו את תיבת המייל לאישור.' : 'Check your email for a confirmation link.',
  });
};
