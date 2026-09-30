// Glance sign-up: one server call that (1) records the signup in Supabase,
// (2) hands back a signed download link immediately, and (3) emails the same
// link as a backup.
//
// Why this exists. The trial form used to insert into Supabase straight from
// the browser with the public anon key and swallow any failure
// (`.catch(function(){})`), then made people confirm an email link before the
// extension would download. So a dead database looked exactly like success,
// and the person who just asked for the product had to leave the page, open
// their inbox and come back. This keeps the signed-link gate (nobody can
// fetch the zip without a link minted here) but removes the detour.
//
// Order of priorities:
//   - Never make someone wait for, or lose, the thing they asked for because
//     OUR database or mail provider is down. The download link is returned
//     regardless.
//   - Never lose the lead silently. If the database write fails, the owner
//     gets an email carrying the address, the log says so, and the response
//     says `stored:false` so the failure is visible instead of masquerading
//     as success.
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
const SITE_URL = 'https://theflow-ai.com';
const DOWNLOAD_PATH = '/.netlify/functions/download-trial-zip';
const DOWNLOAD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FROM_GLANCE = 'Glance <hello@theflow-ai.com>';
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

function signDownload(email, exp, secret) {
  return crypto.createHmac('sha256', secret).update(email + '|download|' + exp).digest('base64url');
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
  // success so a bot learns nothing, but hand it no link and store nothing.
  if (String(payload.company || '').trim()) {
    log('honeypot tripped: accepting without storing or issuing a link');
    return json(200, { ok: true, stored: false });
  }

  if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.' });

  const hdrs = event.headers || {};
  const ip = String(hdrs['x-nf-client-connection-ip'] || hdrs['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  if (tooMany(RATE_IP, ip, RATE_MAX_IP, now) || tooMany(RATE_EMAIL, email.toLowerCase(), RATE_MAX_EMAIL, now)) {
    logErr('rate limited');
    return json(429, { error: 'Too many attempts. Please try again in a few minutes.' });
  }

  const secret = process.env.EMAIL_VERIFY_SECRET;
  if (!secret) {
    logErr('EMAIL_VERIFY_SECRET is not set: cannot mint a download link');
    return json(500, { error: 'Signup is not configured. Please email hello@theflow-ai.com.' });
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
    logErr('SIGNUP NOT STORED (download link still issued)', String(storeError));
    if (apiKey) {
      // The lead must not vanish with the database. Put the address in the
      // owner's inbox so it can be added by hand.
      sendMail(apiKey, {
        from: FROM_GLANCE,
        to: [OWNER_EMAIL],
        subject: 'ACTION NEEDED: Glance signup could not be saved: ' + email,
        html: '<p>A Glance signup was <b>not</b> saved to the database, so it is recorded here instead.</p><p>Email: <b>' + email + '</b><br>Language: ' + lang +
          (refCode ? '<br>Referral: ' + refCode : '') + '<br>Time: ' + new Date().toISOString() +
          '</p><p>Reason: <code>' + String(storeError && storeError.message || storeError).replace(/[<>&]/g, '') + '</code></p>' +
          '<p>If the Supabase project shows as paused, restore it in the dashboard. The person already received their download link.</p>',
      }).catch((e) => logErr('owner failure alert could not be sent', String(e)));
    }
  }

  // 2) Mint the signed download link (same scheme download-trial-zip verifies).
  const exp = Date.now() + DOWNLOAD_TTL_MS;
  const sig = signDownload(email, exp, secret);
  const downloadUrl = SITE_URL + DOWNLOAD_PATH + '?email=' + encodeURIComponent(email) + '&exp=' + exp + '&sig=' + encodeURIComponent(sig);

  // 3) Backup copy by email plus the bottom-up lead signal. Awaited, because a
  // serverless function may be frozen the moment it responds, and neither one
  // may delay or block the download if it fails.
  let emailed = false;
  const tasks = [
    withTimeout((signal) => fetch(SITE_URL + '/.netlify/functions/send-trial-access', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, lang, downloadUrl }),
    })).then((r) => { emailed = r.ok; if (!r.ok) logErr('install email not sent', r.status); })
      .catch((e) => logErr('install email request failed', String(e))),
  ];
  if (stored && !alreadyExisted) {
    tasks.push(checkDomainCluster(email, serviceKey, apiKey, log, logErr).catch((e) => logErr('domain cluster check failed (non-fatal)', String(e))));
  }
  await Promise.all(tasks);

  return json(200, { ok: true, stored, emailed, downloadUrl });
};
