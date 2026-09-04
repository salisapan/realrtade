const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Flow <hello@theflow-ai.com>';
const OWNER_EMAIL = 'ai.local.flow@gmail.com';
const LOGO_URL = 'https://theflow-ai.com/email-logo.png';
const ZIP_URL = 'https://theflow-ai.com/downloads/flow-trial-extension.zip';
const INSTALL_PAGE_URL = 'https://theflow-ai.com/trial.html#install';
const LOG_PREFIX = '[send-trial-access]';

const SUBJECT = {
  en: 'Your Flow Trial install instructions',
  he: 'הוראות ההתקנה של Flow Trial',
};

function htmlBody(lang) {
  var isHe = lang === 'he';
  var dir = isHe ? 'rtl' : 'ltr';
  var align = isHe ? 'right' : 'left';

  var greeting = isHe ? 'שלום,' : 'Hi,';
  var intro = isHe
    ? 'תודה שביקשתם גישה מוקדמת ל-Flow Trial. זו עדיין גרסת בדיקה מוקדמת — לא בחנות Chrome עדיין — כך שההתקנה דורשת כמה צעדים ידניים.'
    : "Thanks for requesting early access to Flow Trial. This is still a pre-release build — not yet on the Chrome Web Store — so installing it takes a few manual steps.";
  var steps = isHe
    ? [
        'הורידו את קובץ ה-ZIP וחלצו אותו לתיקייה.',
        'ב-Chrome, פתחו chrome://extensions.',
        'הפעילו את מצב המפתחים (Developer mode) בפינה הימנית העליונה.',
        'לחצו Load unpacked ובחרו את התיקייה שחילצתם.',
        'פתחו את התוסף, סמנו מערכת עבודה ותחום עבודה, ושמרו.',
      ]
    : [
        'Download the ZIP file and unzip it to a folder.',
        'In Chrome, open chrome://extensions.',
        'Turn on Developer mode (top-right corner).',
        'Click Load unpacked and select the unzipped folder.',
        'Open the extension, pick a connector and a work domain, and save.',
      ];
  var stepsHtml = steps
    .map(function (s, i) {
      return '<tr><td style="padding:4px 0; color:#232B44; font-size:14px;"><b>' + (i + 1) + '.</b> ' + s + '</td></tr>';
    })
    .join('');
  var moreLabel = isHe ? 'הוראות מלאות בעמוד' : 'Full instructions on the page';
  var ctaLabel = isHe ? 'הורדת קובץ ההתקנה' : 'Download the install file';
  var sigTeam = 'FLOW TEAM';
  var sigTagline = isHe ? 'ביצוע אוטונומי. בתנאים שלכם.' : 'Autonomous Execution. Deployed On Your Terms.';

  var content = (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px; margin:0 auto; font-family:Arial,Helvetica,sans-serif; background:#ffffff;">' +
    '<tr><td align="' + align + '" style="padding-bottom:22px;"><img src="' + LOGO_URL + '" alt="Flow" width="120" style="display:block; width:120px; height:auto;"></td></tr>' +
    '<tr><td dir="' + dir + '" align="' + align + '" style="color:#232B44; font-size:15px; line-height:1.65;">' +
    '<p style="margin:0 0 14px">' + greeting + '</p>' +
    '<p style="margin:0 0 18px">' + intro + '</p>' +
    '</td></tr>' +
    '<tr><td dir="' + dir + '" align="' + align + '">' +
    '<table role="presentation" cellpadding="0" cellspacing="0">' + stepsHtml + '</table>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:24px 0 6px">' +
    '<a href="' + ZIP_URL + '" style="display:inline-block; background:#1A4EF5; color:#ffffff; font-family:Arial,Helvetica,sans-serif; font-weight:bold; font-size:15px; text-decoration:none; padding:14px 30px; border-radius:999px;">' + ctaLabel + '</a>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding-top:10px; font-size:13px;"><a href="' + INSTALL_PAGE_URL + '" style="color:#455073;">' + moreLabel + '</a></td></tr>' +
    '<tr><td dir="' + dir + '" align="' + align + '" style="border-top:1px solid #e3e8f3; padding-top:18px; margin-top:18px;">' +
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

function ownerNotificationHtml(email, lang) {
  var rows = [
    ['Email', email],
    ['Language', lang],
    ['Time', new Date().toISOString()],
  ];
  var rowsHtml = rows
    .map(function (r) {
      return '<tr><td style="padding:4px 12px 4px 0; color:#455073;">' + r[0] + '</td><td style="padding:4px 0; color:#060B16; font-weight:bold;">' + r[1] + '</td></tr>';
    })
    .join('');
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#232B44;">' +
    '<p>Flow Trial install instructions sent:</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0">' + rowsHtml + '</table>' +
    '</div>'
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

exports.handler = async function (event) {
  var reqId = crypto.randomBytes(4).toString('hex');
  var log = function (msg, extra) { console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : ''); };
  var logErr = function (msg, extra) { console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : ''); };

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

  if (!EMAIL_RE.test(email)) {
    logErr('rejected: invalid email', email);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  var apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logErr('RESEND_API_KEY is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  try {
    var result = await sendEmail(apiKey, {
      from: FROM,
      to: [email],
      subject: SUBJECT[lang],
      html: htmlBody(lang),
    });

    if (!result.ok) {
      logErr('Resend API rejected the trial-access send', { status: result.status, response: result.text });
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send install instructions' }) };
    }
    log('trial access email sent', { to: email });

    try {
      var ownerResult = await sendEmail(apiKey, {
        from: FROM,
        to: [OWNER_EMAIL],
        subject: 'Flow Trial install instructions sent: ' + email,
        html: ownerNotificationHtml(email, lang),
      });
      if (!ownerResult.ok) {
        logErr('owner notification failed', { status: ownerResult.status, response: ownerResult.text });
      }
    } catch (ownerErr) {
      logErr('owner notification request threw', String(ownerErr));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    logErr('network/request error calling Resend', String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send install instructions' }) };
  }
};
