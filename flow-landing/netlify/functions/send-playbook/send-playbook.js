const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Flow <hello@the-flow-ai.com>';
const LOG_PREFIX = '[send-playbook]';

const SUBJECT = {
  en: 'Your Hybrid Automation Playbook',
  he: 'The Hybrid Automation Playbook — המדריך שלכם',
};

function htmlBody(lang) {
  if (lang === 'he') {
    return (
      '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#232B44;line-height:1.6">' +
      '<p>שלום,</p>' +
      '<p>תודה שהצטרפתם לרשימת ההמתנה של Flow. מצורף המדריך <b>The Hybrid Automation Playbook</b> — כיצד תעשיות מוסדרות מבטלות הזנת נתונים ידנית, ללא סיכון רגולטורי.</p>' +
      '<p>נשמח לתאם שיחת היכרות כדי לבדוק יחד איזו תצורת פריסה — ענן מאובטח, או Flow-Edge / Flow-OnPrem — הכי מתאימה לארגון שלכם.</p>' +
      '<p>בברכה,<br>צוות Flow</p>' +
      '</div>'
    );
  }
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#232B44;line-height:1.6">' +
    '<p>Hi,</p>' +
    '<p>Thanks for joining the Flow waitlist. Attached is <b>The Hybrid Automation Playbook</b> — how regulated industries eliminate manual data entry with zero compliance risk.</p>' +
    "<p>We'd love to set up a discovery call to walk through which deployment model — Secure Cloud, or Flow-Edge / Flow-OnPrem — fits your organization.</p>" +
    '<p>Best,<br>The Flow Team</p>' +
    '</div>'
  );
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
    log('calling Resend API', { to: email, from: FROM, subject: SUBJECT[lang] });
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
    });

    var resText = await res.text();

    if (!res.ok) {
      // Common causes surfaced here: unverified sending domain, invalid/revoked
      // API key, or a "from" address on a domain not verified in Resend.
      logErr('Resend API rejected the send — check the "from" domain is verified in Resend', {
        status: res.status,
        response: resText,
      });
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send email', detail: resText }) };
    }

    log('Resend accepted the send', { status: res.status, response: resText });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    logErr('network/request error calling Resend', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send email' }) };
  }
};
