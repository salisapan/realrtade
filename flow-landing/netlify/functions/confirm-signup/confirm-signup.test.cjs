// confirm-signup.js: download link only after confirmed_at is written.
// Run: node netlify/functions/confirm-signup/confirm-signup.test.cjs

const crypto = require('crypto');

process.env.EMAIL_VERIFY_SECRET = 'test-verify-secret';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 'test-resend-key';

let calls = [];
let patchResult = () => ({ ok: true, status: 200, json: async () => [{ id: 1, email: 'ada@example.com' }] });

global.fetch = async (url, opts) => {
  opts = opts || {};
  const u = String(url);
  calls.push({ url: u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes('/rest/v1/waitlist') && opts.method === 'PATCH') return patchResult();
  if (u.includes('send-trial-access') || u.includes('send-playbook') || u.includes('api.resend.com')) {
    return { ok: true, status: 200, text: async () => '' };
  }
  throw new Error('unexpected fetch ' + u);
};

const { handler } = require('./confirm-signup.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function signedQuery(email) {
  const exp = String(Date.now() + 3600000);
  const sig = crypto.createHmac('sha256', process.env.EMAIL_VERIFY_SECRET).update(email + '|' + exp).digest('base64url');
  return { email, exp, sig, lang: 'en', kind: 'trial' };
}

async function run() {
  console.log('--- claim failure: no download link ---\n');
  {
    calls = [];
    patchResult = () => ({ ok: false, status: 503, json: async () => [] });
    const q = signedQuery('ada@example.com');
    const res = await handler({ queryStringParameters: q });
    check('503 when confirmed_at cannot be written', res.statusCode === 503, res);
    check('error page has no download button href', !/download-trial-zip/.test(res.body || ''), res.body && res.body.slice(0, 200));
    const trialAccess = calls.find((c) => c.url.includes('send-trial-access'));
    check('send-trial-access not called when claim fails', !trialAccess, calls.map((c) => c.url));
  }

  console.log('\n--- claim success: trial may issue link ---\n');
  {
    calls = [];
    patchResult = () => ({ ok: true, status: 200, json: async () => [{ id: 2, email: 'bob@example.com' }] });
    const q = signedQuery('bob@example.com');
    const res = await handler({ queryStringParameters: q });
    check('200 on successful claim', res.statusCode === 200, res);
    check('success page includes download button', /download-trial-zip/.test(res.body || ''), res.body && res.body.indexOf('id="dl"'));
    const trialAccess = calls.find((c) => c.url.includes('send-trial-access'));
    check('send-trial-access receives a signed downloadUrl', Boolean(trialAccess && trialAccess.body && trialAccess.body.downloadUrl), trialAccess && trialAccess.body && { hasUrl: !!trialAccess.body.downloadUrl });
  }

  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
}
run();
