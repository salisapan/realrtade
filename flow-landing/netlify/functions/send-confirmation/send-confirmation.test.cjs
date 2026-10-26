// send-confirmation.js: branded confirm mail; fails closed without EMAIL_VERIFY_SECRET.
// Run: node netlify/functions/send-confirmation/send-confirmation.test.cjs

const crypto = require('crypto');

process.env.RESEND_API_KEY = 'test-resend-key';
process.env.EMAIL_VERIFY_SECRET = 'test-verify-secret';

let calls = [];
global.fetch = async (url, opts) => {
  opts = opts || {};
  const u = String(url);
  calls.push({ url: u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  if (u.includes('api.resend.com')) return { ok: true, status: 200, text: async () => '' };
  throw new Error('unexpected fetch ' + u);
};

const { handler } = require('./send-confirmation.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function post(body, extra) {
  calls = [];
  const res = await handler(Object.assign({
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-nf-client-connection-ip': '10.0.0.1' }
  }, extra || {}));
  return { res, json: res.body ? JSON.parse(res.body) : null };
}

async function run() {
  console.log('--- missing EMAIL_VERIFY_SECRET ---\n');
  {
    const saved = process.env.EMAIL_VERIFY_SECRET;
    delete process.env.EMAIL_VERIFY_SECRET;
    const { res, json } = await post({ email: 'ada@example.com', lang: 'en', kind: 'trial' });
    check('returns 500 when secret is unset', res.statusCode === 500 && json.error === 'Confirmation service not configured', json);
    check('no Resend call without secret', !calls.some((c) => c.url.includes('api.resend.com')), calls);
    process.env.EMAIL_VERIFY_SECRET = saved;
  }

  console.log('\n--- happy path ---\n');
  {
    const { res, json } = await post({ email: 'trial@example.com', lang: 'en', kind: 'trial' });
    check('returns 200 ok', res.statusCode === 200 && json.ok === true, json);
    check('Resend was called', calls.filter((c) => c.url.includes('api.resend.com')).length >= 1, calls.length);
    const html = (calls.find((c) => c.body && c.body.to && c.body.to[0] === 'trial@example.com') || {}).body;
    const htmlStr = html && html.html ? html.html : '';
    const m = htmlStr.match(/confirm-signup\?[^"']+/);
    check('email HTML carries a confirm-signup link', Boolean(m), htmlStr && htmlStr.slice(0, 120));
    if (m) {
      const qs = m[0].split('?')[1];
      const params = new URLSearchParams(qs);
      check('confirm link kind is trial', params.get('kind') === 'trial', params.get('kind'));
      const email = params.get('email');
      const exp = params.get('exp');
      const sig = params.get('sig');
      const expected = crypto.createHmac('sha256', process.env.EMAIL_VERIFY_SECRET).update(email + '|' + exp).digest('base64url');
      check('confirm link sig matches EMAIL_VERIFY_SECRET (confirm-signup would accept)', sig === expected, { sig, expected });
    }
  }

  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
}
run();
