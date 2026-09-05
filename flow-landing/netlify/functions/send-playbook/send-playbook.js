const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Flow <hello@theflow-ai.com>';
const OWNER_EMAIL = 'ai.local.flow@gmail.com';
const LOGO_URL = 'https://theflow-ai.com/email-logo.png';
const DOIT_BUTTON_URL = 'https://theflow-ai.com/email-doit-button.png';
const LOG_PREFIX = '[send-playbook]';

// This function is only ever meant to be called by confirm-signup.js right
// after a real double opt-in, never directly by the browser. Without this
// check it would be a free, unauthenticated way to send a real branded
// email + PDF attachment to any address from Flow's trusted sending domain
// — i.e. an open spam/reputation-abuse relay. Require a short-lived
// signature that only confirm-signup.js (which holds EMAIL_VERIFY_SECRET)
// can produce.
function verifyInternalAuth(email, authExp, authSig, secret) {
  if (!authExp || !authSig) return false;
  if (Date.now() > Number(authExp)) return false;
  const expected = crypto.createHmac('sha256', secret).update('internal-send|' + email + '|' + authExp).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(authSig));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Temporary CTA until a real scheduling link (e.g. Calendly) is wired up.
// Uses a plain https:// URL rather than mailto: — mailto links are not
// reliably clickable inside sandboxed/embedded viewers (e.g. a PDF opened
// inline in Gmail or a browser), while https:// links work everywhere.
// Swap this one constant for the real booking URL once it exists; nothing
// else needs to change.
const CTA_URL = 'https://theflow-ai.com/#waitlist';

const SUBJECT = {
  en: 'Your Hybrid Automation Playbook',
  he: 'The Hybrid Automation Playbook — המדריך שלכם',
};

function ctaButton(altLabel) {
  return (
    '<tr><td align="center" style="padding:28px 0 10px">' +
    '<a href="' + CTA_URL + '" style="display:inline-block;">' +
    '<img src="' + DOIT_BUTTON_URL + '" alt="' + altLabel + '" width="220" style="display:block; width:220px; height:auto;">' +
    '</a></td></tr>'
  );
}

function htmlBody(lang) {
  var isHe = lang === 'he';
  var dir = isHe ? 'rtl' : 'ltr';
  var align = isHe ? 'right' : 'left';

  var greeting = isHe ? 'שלום,' : 'Hi,';
  var intro = isHe
    ? 'תודה שהצטרפתם לרשימת ההמתנה של Flow. כבר ראיתם את הדמו המשפטי החי באתר — מצורף כאן הסיפור המלא: <b>The Hybrid Automation Playbook</b>, על איך תעשיות מוסדרות מבטלות הזנת נתונים ידנית, ללא סיכון רגולטורי.'
    : "Thanks for joining the Flow waitlist. You've already seen the Legal Demo live on the site — attached is the full story: <b>The Hybrid Automation Playbook</b>, on exactly how regulated industries eliminate manual data entry with zero compliance risk.";
  var pitch = isHe
    ? 'הדרך הכי מהירה לראות את זה עובד על הנתונים שלכם היא שיחת היכרות קצרה. נמפה יחד את תצורת הפריסה המדויקת — ענן מאובטח, או Flow-Edge / Flow-OnPrem — ונראה לכם איך זה נראה רץ אצלכם.'
    : "The fastest way to see this running on your own data is a short discovery call. We'll map your exact deployment model — Secure Cloud, or Flow-Edge / Flow-OnPrem — and show you what it looks like in your environment.";
  var ctaLabel = isHe ? 'תיאום שיחת היכרות' : 'Book a Discovery Call';
  var ctaFine = isHe
    ? 'לחצו למטה ונתאם זמן שנוח לכם.'
    : "Click below and we'll find a time that works for you.";
  var sigTeam = isHe ? 'FLOW TEAM' : 'FLOW TEAM';
  var sigTagline = isHe ? 'ביצוע אוטונומי. בתנאים שלכם.' : 'Autonomous Execution. Deployed On Your Terms.';

  var content = (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px; margin:0 auto; font-family:Arial,Helvetica,sans-serif; background:#ffffff;">' +
    '<tr><td align="' + align + '" style="padding-bottom:22px;"><img src="' + LOGO_URL + '" alt="Flow" width="120" style="display:block; width:120px; height:auto;"></td></tr>' +
    '<tr><td dir="' + dir + '" align="' + align + '" style="color:#232B44; font-size:15px; line-height:1.65;">' +
    '<p style="margin:0 0 14px">' + greeting + '</p>' +
    '<p style="margin:0 0 14px">' + intro + '</p>' +
    '<p style="margin:0 0 14px">' + pitch + '</p>' +
    '</td></tr>' +
    '<tr><td dir="' + dir + '" align="center" style="color:#455073; font-size:13px; padding-top:8px;">' + ctaFine + '</td></tr>' +
    ctaButton(ctaLabel) +
    '<tr><td dir="' + dir + '" align="' + align + '" style="border-top:1px solid #e3e8f3; padding-top:18px;">' +
    '<img src="' + LOGO_URL + '" alt="Flow" width="28" style="display:block; width:28px; height:auto; margin-bottom:8px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif; color:#232B44; font-size:13px; line-height:1.5; letter-spacing:.04em;"><b>' + sigTeam + '</b><br><span style="color:#455073; letter-spacing:normal;">' + sigTagline + '</span></div>' +
    '</td></tr>' +
    '</table>'
  );

  return (
    '<!DOCTYPE html><html dir="' + dir + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<title>Flow</title></head>' +
    '<body style="margin:0; padding:0; background:#ffffff;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:32px 20px;">' +
    content +
    '</td></tr></table>' +
    '</body></html>'
  );
}

function ownerNotificationHtml(email, lang, extra) {
  var rows = [
    ['Email', email],
    ['Language', lang],
    ['Time', new Date().toISOString()],
  ];
  if (extra) rows.push(['Note', extra]);
  var rowsHtml = rows
    .map(function (r) {
      return '<tr><td style="padding:4px 12px 4px 0; color:#455073;">' + r[0] + '</td><td style="padding:4px 0; color:#060B16; font-weight:bold;">' + r[1] + '</td></tr>';
    })
    .join('');
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#232B44;">' +
    '<p>New Flow waitlist signup:</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0">' + rowsHtml + '</table>' +
    '</div>'
  );
}

async function sendEmail(apiKey, opts) {
  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts),
  });
  var text = await res.text();
  return { ok: res.ok, status: res.status, text: text };
}

exports.handler = async function (event) {
  var reqId = crypto.randomBytes(4).toString('hex');
  var log = function (msg, extra) {
    console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  };
  var logErr = function (msg, extra) {
    console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  };

  log('invoked', { method: event.httpMethod });

  if (event.httpMethod !== 'POST') {
    logErr('rejected: wrong method');
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    logErr('rejected: invalid JSON body', String(err));
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var email = String(payload.email || '').trim();
  var lang = payload.lang === 'he' ? 'he' : 'en';
  var honey = String(payload.company || '').trim();

  if (honey) {
    log('honeypot tripped — silently accepting, not sending');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  if (!EMAIL_RE.test(email)) {
    logErr('rejected: invalid email', email);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  var verifySecret = process.env.EMAIL_VERIFY_SECRET;
  if (!verifySecret) {
    logErr('EMAIL_VERIFY_SECRET is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Confirmation service not configured' }) };
  }
  if (!verifyInternalAuth(email, payload.authExp, payload.authSig, verifySecret)) {
    logErr('rejected: missing or invalid internal auth (this function is only ever called by confirm-signup)', { email: email });
    return { statusCode: 400, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  log('validated request', { email: email, lang: lang, from: FROM });

  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logErr('RESEND_API_KEY is not set in this environment — add it in Netlify > Site configuration > Environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
  }
  log('RESEND_API_KEY present', { length: apiKey.length });

  var pdfBase64;
  try {
    var pdfPath = path.join(__dirname, 'hybrid-automation-playbook.pdf');
    pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
    log('PDF attachment loaded', { bytes: Math.round((pdfBase64.length * 3) / 4) });
  } catch (err) {
    logErr('failed to read Playbook PDF from function bundle', String(err));
    return { statusCode: 500, body: JSON.stringify({ error: 'Attachment unavailable' }) };
  }

  try {
    log('calling Resend API (customer email)', { to: email, from: FROM, subject: SUBJECT[lang] });
    var result = await sendEmail(apiKey, {
      from: FROM,
      to: [email],
      subject: SUBJECT[lang],
      html: htmlBody(lang),
      attachments: [
        {
          filename: 'The-Hybrid-Automation-Playbook.pdf',
          content: pdfBase64,
        },
      ],
    });

    if (!result.ok) {
      // Common causes surfaced here: unverified sending domain, invalid/revoked
      // API key, or a "from" address on a domain not verified in Resend.
      logErr('Resend API rejected the customer send — check the "from" domain is verified in Resend', {
        status: result.status,
        response: result.text,
      });
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send email', detail: result.text }) };
    }

    log('Resend accepted the customer send', { status: result.status, response: result.text });

    // Best-effort owner notification — never blocks or fails the customer-facing response.
    try {
      var ownerResult = await sendEmail(apiKey, {
        from: FROM,
        to: [OWNER_EMAIL],
        subject: 'New Flow waitlist signup: ' + email,
        html: ownerNotificationHtml(email, lang),
      });
      if (!ownerResult.ok) {
        logErr('owner notification failed (customer email still sent fine)', { status: ownerResult.status, response: ownerResult.text });
      } else {
        log('owner notification sent', { to: OWNER_EMAIL });
      }
    } catch (ownerErr) {
      logErr('owner notification request threw (customer email still sent fine)', String(ownerErr));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    logErr('network/request error calling Resend', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send email' }) };
  }
};
