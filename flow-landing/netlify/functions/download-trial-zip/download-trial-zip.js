// Serves the Flow Trial extension zip — but only to someone holding a
// signed, time-limited download token minted by confirm-signup.js after a
// real double opt-in confirmation. The zip itself is bundled inside this
// function's own directory (not under the site's public static root), so
// there is no plain URL that serves it without passing through this check —
// the earlier version of this page linked the zip directly from
// /downloads/, which meant the "confirm your email first" promise wasn't
// actually enforced by anything. This closes that gap.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = 'https://theflow-ai.com';
const LOG_PREFIX = '[download-trial-zip]';

function verify(email, exp, sig, secret) {
  const expected = crypto.createHmac('sha256', secret).update(email + '|download|' + exp).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function errorPage(message) {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Flow</title>' +
    '<meta name="robots" content="noindex">' +
    '<style>body{margin:0;background:#07090F;color:#EEF2F9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}' +
    '.card{max-width:420px}.card h1{font-size:1.4rem;margin:0 0 12px}.card p{color:#AEB9D6;line-height:1.6;margin:0 0 24px}' +
    '.card a{display:inline-block;background:#1A4EF5;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:999px}</style>' +
    '</head><body><div class="card"><h1>This download link isn’t valid</h1><p>' + message + '</p>' +
    '<a href="' + SITE_URL + '/trial.html#signup">Request access again</a></div></body></html>'
  );
}

exports.handler = async function (event) {
  const reqId = crypto.randomBytes(4).toString('hex');
  const log = (msg, extra) => console.log(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');
  const logErr = (msg, extra) => console.error(LOG_PREFIX, '[' + reqId + ']', msg, extra !== undefined ? extra : '');

  const q = event.queryStringParameters || {};
  const email = String(q.email || '').trim();
  const exp = String(q.exp || '').trim();
  const sig = String(q.sig || '').trim();

  const secret = process.env.EMAIL_VERIFY_SECRET;
  const invalid = !secret || !email || !exp || !sig || !EMAIL_RE.test(email) || Date.now() > Number(exp) || !verify(email, exp, sig, secret);

  if (invalid) {
    logErr('rejected: invalid or expired download token', { email, hasSecret: !!secret });
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: errorPage('This link is expired or invalid. Confirmation links are good for 30 days after you request access.')
    };
  }

  try {
    const zipPath = path.join(__dirname, 'flow-trial-extension.zip');
    const bytes = fs.readFileSync(zipPath);
    log('serving zip', { email, bytes: bytes.length });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="flow-trial-extension.zip"'
      },
      body: bytes.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    logErr('failed to read bundled zip', String(err));
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: errorPage('Download is temporarily unavailable. Please try again shortly or contact hello@theflow-ai.com.')
    };
  }
};
