const fs = require('fs');
const path = require('path');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Flow <hello@the-flow-ai.com>';

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var email = String(payload.email || '').trim();
  var lang = payload.lang === 'he' ? 'he' : 'en';
  var honey = String(payload.company || '').trim();

  if (honey) {
    // honeypot tripped — respond as if successful, but do nothing
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  var pdfBase64;
  try {
    var pdfPath = path.join(__dirname, 'hybrid-automation-playbook.pdf');
    pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  } catch (err) {
    console.error('Failed to read Playbook PDF', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Attachment unavailable' }) };
  }

  try {
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

    if (!res.ok) {
      var errText = await res.text();
      console.error('Resend API error', res.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send email' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Resend request failed', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send email' }) };
  }
};
