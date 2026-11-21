// X-Hub-Signature-256 check for the WhatsApp Cloud API webhook.
// Meta signs the raw POST body with the app secret. A mismatch means the
// payload is not from Meta (or the secret is wrong) and must be rejected
// before any state change or reply.
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || signatureHeader == null || signatureHeader === '') return false;
  const raw = rawBody == null ? '' : String(rawBody);
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(String(signatureHeader));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifySignature };
