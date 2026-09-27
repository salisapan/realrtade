// Calls the real download-trial-zip handler against the zip produced by
// scripts/package_trial_extension.py. Fixture HMAC secret only — never a
// deployed value.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const functionDir = path.join(repoRoot, 'flow-landing', 'netlify', 'functions', 'download-trial-zip');
const zipPath = path.join(functionDir, 'flow-trial-extension.zip');
const handlerPath = path.join(functionDir, 'download-trial-zip.js');

if (!fs.existsSync(zipPath)) {
  console.error('verify_download_handler: zip missing at ' + zipPath);
  process.exit(1);
}

process.env.EMAIL_VERIFY_SECRET = 'verify-trial-install-fixture';
const { handler } = require(handlerPath);

function sign(email, exp) {
  return crypto.createHmac('sha256', process.env.EMAIL_VERIFY_SECRET).update(email + '|download|' + exp).digest('base64url');
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

(async function main() {
  const email = 'person@example.com';
  const exp = String(Date.now() + 60 * 1000);
  const sig = sign(email, exp);

  const ok = await handler({ queryStringParameters: { email, exp, sig } });
  assert(ok.statusCode === 200, 'signed token should return 200, got ' + ok.statusCode);
  assert(ok.isBase64Encoded === true, 'zip body should be base64');
  assert(String(ok.headers['Content-Type']).indexOf('application/zip') === 0, 'content type');
  assert(String(ok.headers['Content-Disposition']).indexOf('flow-trial-extension.zip') !== -1, 'filename');
  const bytes = Buffer.from(ok.body, 'base64');
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, 'body is not a zip');
  assert(bytes.length === fs.statSync(zipPath).size, 'served byte length should match the built zip');

  const bad = await handler({ queryStringParameters: { email, exp, sig: 'not-a-signature' } });
  assert(bad.statusCode === 400, 'bad signature should return 400, got ' + bad.statusCode);
  assert(String(bad.body).indexOf('isn’t valid') !== -1, 'bad signature should render the invalid-link page');

  const expired = await handler({
    queryStringParameters: { email, exp: '1', sig: sign(email, '1') }
  });
  assert(expired.statusCode === 400, 'expired token should return 400, got ' + expired.statusCode);

  const aside = zipPath + '.aside';
  fs.renameSync(zipPath, aside);
  try {
    const missing = await handler({ queryStringParameters: { email, exp, sig } });
    assert(missing.statusCode === 500, 'missing zip should return 500, got ' + missing.statusCode);
    assert(String(missing.body).indexOf('temporarily unavailable') !== -1, 'missing zip should say the download is unavailable');
    assert(String(missing.body).indexOf('isn’t valid') === -1, 'a missing zip is not an invalid link');
  } finally {
    fs.renameSync(aside, zipPath);
  }

  console.log('download handler ok (' + bytes.length + ' bytes)');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
