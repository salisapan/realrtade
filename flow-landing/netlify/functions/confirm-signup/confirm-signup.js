const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = 'https://theflow-ai.com';
const FROM = 'Flow <hello@theflow-ai.com>';
const OWNER_EMAIL = 'ai.local.flow@gmail.com';

// Bottom-up adoption inside a company with sensitive data is a good thing
// happening in the wrong product — Flow Trial is explicitly the general,
// non-sensitive-data tier (see docs/product-architecture.md). Rather than
// build a whole separate distribution channel to chase that signal, this
// just tells sales when it's already happening: several confirmed signups
// from the same real work domain is a warm, low-effort Enterprise lead.
// Public mailbox providers are excluded since a cluster of gmail.com
// addresses says nothing about who employs them.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me',
  'msn.com', 'mail.com', 'gmx.com', 'yandex.com', 'zoho.com', 'fastmail.com',
]);
const CLUSTER_THRESHOLDS = [3, 5, 10, 20, 50];
const SB_URL = 'https://zjquktirlrhbqcnkfaok.supabase.co';
// Confirming a signup means PATCHing a row by email with no prior SELECT --
// Postgres RLS requires SELECT visibility to even locate a row for UPDATE,
// and this table deliberately has no SELECT policy for anon (so the public
// anon key can never list signup emails). This function runs server-side on
// Netlify only, never reaching the browser, so it's the one place safe to
// hold a key that bypasses RLS entirely.
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOG_PREFIX = '[confirm-signup]';
const DOWNLOAD_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — long enough that "check your email later" still works

function signDownload(email, exp, secret) {
  return crypto.createHmac('sha256', secret).update(email + '|download|' + exp).digest('base64url');
}

// send-playbook is a public Netlify function like any other — it's only ever
// meant to be triggered by this file after a real double opt-in, but nothing
// else stops someone from POSTing to it directly and spamming an arbitrary
// inbox with a real branded email + PDF attachment from Flow's trusted
// sending domain. This short-lived signature proves the call actually came
// from here, right after token verification succeeded.
const INTERNAL_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes — this is an immediate server-to-server call
function signInternalAuth(email, exp, secret) {
  return crypto.createHmac('sha256', secret).update('internal-send|' + email + '|' + exp).digest('base64url');
}

const COPY = {
  playbook: {
    en: {
      title: 'You’re confirmed',
      body: 'Thanks for confirming your email. The Hybrid Automation Playbook is on its way to your inbox.',
      home: 'Back to theflow-ai.com',
      errTitle: 'This link isn’t valid',
      errBody: 'This confirmation link is expired or invalid. Please rejoin the waitlist to get a fresh one.',
    },
    he: {
      title: 'האימייל אושר',
      body: 'תודה שאישרתם את כתובת המייל. ה-Hybrid Automation Playbook בדרך אליכם.',
      home: 'חזרה ל-theflow-ai.com',
      errTitle: 'הקישור אינו תקין',
      errBody: 'קישור האישור פג תוקף או שאינו תקין. הצטרפו שוב לרשימת ההמתנה כדי לקבל קישור חדש.',
    },
  },
  trial: {
    en: {
      title: 'You’re confirmed',
      body: 'Thanks for confirming your email. Install instructions for Flow Trial are on their way to your inbox.',
      home: 'Back to theflow-ai.com',
      errTitle: 'This link isn’t valid',
      errBody: 'This confirmation link is expired or invalid. Please request access again on the Flow Trial page.',
    },
    he: {
      title: 'האימייל אושר',
      body: 'תודה שאישרתם את כתובת המייל. הוראות ההתקנה של Flow Trial בדרך אליכם.',
      home: 'חזרה ל-theflow-ai.com',
      errTitle: 'הקישור אינו תקין',
      errBody: 'קישור האישור פג תוקף או שאינו תקין. בקשו גישה מחדש בעמוד Flow Trial.',
    },
  },
};

function page(lang, ok, kind, downloadUrl) {
  var isHe = lang === 'he';
  var dir = isHe ? 'rtl' : 'ltr';
  var c = (COPY[kind] || COPY.playbook)[lang] || (COPY[kind] || COPY.playbook).en;
  var title = ok ? c.title : c.errTitle;
  var body = ok ? c.body : c.errBody;
  var iconColor = ok ? '#1A4EF5' : '#C0392B';
  var icon = ok
    ? '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
    : '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>';
  var downloadLabel = isHe ? 'הורדת התוסף' : 'Download the extension';
  var downloadBtn = ok && kind === 'trial' && downloadUrl
    ? '<a href="' + downloadUrl + '" style="display:inline-block; background:#1A4EF5; color:#fff; text-decoration:none; font-weight:700; padding:13px 28px; border-radius:999px; margin-bottom:14px;">' + downloadLabel + '</a><br>'
    : '';

  return (
    '<!doctype html><html lang="' + lang + '" dir="' + dir + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Flow</title>' +
    '<meta name="robots" content="noindex">' +
    '<style>' +
    "body{margin:0; background:#07090F; color:#EEF2F9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px}" +
    '.card{max-width:420px}' +
    '.card h1{font-size:1.5rem; margin:20px 0 12px}' +
    '.card p{color:#AEB9D6; line-height:1.6; margin:0 0 28px}' +
    '.card a.home{display:inline-block; color:#8891A4; text-decoration:none; font-weight:600; font-size:.9rem}' +
    '</style></head><body>' +
    '<div class="card">' + icon + '<h1>' + title + '</h1><p>' + body + '</p>' +
    downloadBtn +
    '<a class="home" href="' + SITE_URL + '/">' + c.home + '</a>' +
    '</div></body></html>'
  );
}

async function sendEmail(apiKey, opts) {
  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  var text = await res.text();
  return { ok: res.ok, status: res.status, text: text };
}

// Counts confirmed waitlist signups sharing this email's domain and, if the
// new total lands exactly on a threshold, emails one heads-up to sales. The
// exact-match check (rather than "N or more") is what keeps this a one-time
// nudge per milestone instead of an alert on every subsequent signup.
async function checkDomainCluster(email, log, logErr) {
  var domain = email.split('@')[1].toLowerCase();
  if (FREE_EMAIL_DOMAINS.has(domain)) return;
  if (!SB_SERVICE_KEY) return;
  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  var url = SB_URL + '/rest/v1/waitlist?select=id&confirmed_at=not.is.null&email=ilike.*%40' + encodeURIComponent(domain);
  var res = await fetch(url, { headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY } });
  if (!res.ok) { logErr('domain cluster count query failed', res.status); return; }
  var rows = await res.json();
  var count = Array.isArray(rows) ? rows.length : 0;
  if (!CLUSTER_THRESHOLDS.includes(count)) return;

  log('domain cluster threshold reached', { domain: domain, count: count });
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#232B44;">' +
    '<p><b>' + count + '</b> confirmed Flow Trial signups now share the domain <b>' + domain + '</b>.</p>' +
    '<p>Might be worth a warm Enterprise outreach — this usually means a team is already using Flow Trial inside an organization.</p>' +
    '</div>';
  var result = await sendEmail(apiKey, {
    from: FROM,
    to: [OWNER_EMAIL],
    subject: count + ' Flow Trial signups from ' + domain,
    html: html,
  });
  if (!result.ok) logErr('domain cluster alert send failed', { status: result.status, response: result.text });
}

function verify(email, exp, sig, secret) {
  var expected = crypto.createHmac('sha256', secret).update(email + '|' + exp).digest('base64url');
  var a = Buffer.from(expected);
  var b = Buffer.from(String(sig));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async function (event) {
  var reqId = crypto.randomBytes(4).toString('hex');
  var log = function (msg, extra) { console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : ''); };
  var logErr = function (msg, extra) { console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : ''); };

  var q = event.queryStringParameters || {};
  var email = String(q.email || '').trim();
  var exp = String(q.exp || '').trim();
  var sig = String(q.sig || '').trim();
  var lang = q.lang === 'he' ? 'he' : 'en';
  var kind = q.kind === 'trial' ? 'trial' : 'playbook';

  var secret = process.env.EMAIL_VERIFY_SECRET;
  var invalid = !secret || !email || !exp || !sig || !EMAIL_RE.test(email) || Date.now() > Number(exp) || !verify(email, exp, sig, secret);

  if (invalid) {
    logErr('rejected: invalid or expired token', { email: email, hasSecret: !!secret });
    return { statusCode: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: page(lang, false, kind) };
  }

  var followUpFn = kind === 'trial' ? 'send-trial-access' : 'send-playbook';
  log('token verified, triggering follow-up send', { email: email, kind: kind, followUpFn: followUpFn });

  var downloadUrl;
  if (kind === 'trial') {
    var downloadExp = Date.now() + DOWNLOAD_TTL_MS;
    var downloadSig = signDownload(email, downloadExp, secret);
    downloadUrl =
      SITE_URL + '/.netlify/functions/download-trial-zip?email=' + encodeURIComponent(email) +
      '&exp=' + downloadExp + '&sig=' + encodeURIComponent(downloadSig);
  }

  try {
    var authExp = Date.now() + INTERNAL_AUTH_TTL_MS;
    var authSig = signInternalAuth(email, authExp, secret);
    var followUpBody = { email: email, lang: lang, authExp: authExp, authSig: authSig };
    if (downloadUrl) followUpBody.downloadUrl = downloadUrl;
    await fetch(SITE_URL + '/.netlify/functions/' + followUpFn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(followUpBody),
    });
  } catch (err) {
    logErr('failed to trigger ' + followUpFn + ' (customer will still see success page)', String(err));
  }

  try {
    if (!SB_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    await fetch(SB_URL + '/rest/v1/waitlist?email=eq.' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
    });
  } catch (err) {
    logErr('failed to mark waitlist row confirmed (customer will still see success page)', String(err));
  }

  try {
    await checkDomainCluster(email, log, logErr);
  } catch (err) {
    logErr('domain cluster check failed (non-fatal)', String(err));
  }

  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: page(lang, true, kind, downloadUrl) };
};
