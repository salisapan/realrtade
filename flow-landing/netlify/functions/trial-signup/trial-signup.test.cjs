// Regression test for trial-signup.js: the one server call behind the Glance
// sign-up form. Stubs fetch so it asserts what would have been sent to
// Supabase / Resend / send-trial-access, and feeds the link it mints to the
// real download-trial-zip handler to prove the two halves agree.
//
// Run: node netlify/functions/trial-signup/trial-signup.test.cjs

process.env.EMAIL_VERIFY_SECRET = 'test-verify-secret';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 'test-resend-key';

let calls = [];
let supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
let access = () => ({ ok: true, status: 200 });
global.fetch = async (url, opts) => {
  opts = opts || {};
  calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('supabase.co')) return supabase(url, opts);
  if (String(url).includes('send-trial-access')) return access();
  if (String(url).includes('api.resend.com')) return { ok: true, status: 200 };
  throw new Error('unexpected fetch ' + url);
};

const { handler } = require('./trial-signup.js');
const download = require('../download-trial-zip/download-trial-zip.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
let n = 0;
async function post(body, extra) {
  calls = [];
  const res = await handler(Object.assign({ httpMethod: 'POST', body: JSON.stringify(body), headers: { 'x-nf-client-connection-ip': '10.0.0.' + (++n) } }, extra || {}));
  return { res, json: res.body ? JSON.parse(res.body) : null };
}
const inserts = () => calls.filter((c) => c.url.includes('/rest/v1/waitlist') && c.method === 'POST');
const mails = () => calls.filter((c) => c.url.includes('api.resend.com'));

async function run() {
  console.log('--- happy path ---\n');
  {
    const { res, json } = await post({ email: 'ada@example.com', lang: 'en' });
    check('returns 200 ok', res.statusCode === 200 && json.ok === true, json);
    check('the signup row is written to Supabase', inserts().length === 1 && inserts()[0].body.email === 'ada@example.com' && inserts()[0].body.source === 'trial-extension', calls);
    check('it reports stored:true only because Supabase accepted it', json.stored === true, json);
    check('a download link is returned immediately', /download-trial-zip\?email=ada%40example\.com&exp=\d+&sig=/.test(json.downloadUrl || ''), json);
    const toAccess = calls.find((c) => c.url.includes('send-trial-access'));
    check('the same link is emailed as a backup copy', Boolean(toAccess) && toAccess.body.downloadUrl === json.downloadUrl, toAccess);
    check('emailed:true when the mail step succeeds', json.emailed === true, json);
    const u = new URL(json.downloadUrl);
    const dl = await download.handler({ queryStringParameters: { email: u.searchParams.get('email'), exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') } });
    check('the minted link passes download-trial-zip token verification', dl.statusCode !== 400, { status: dl.statusCode });
    const bad = await download.handler({ queryStringParameters: { email: 'other@example.com', exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') } });
    check('the same link does not work for a different address', bad.statusCode === 400, { status: bad.statusCode });
  }

  console.log('\n--- repeat visitor ---\n');
  {
    supabase = () => ({ ok: false, status: 409, text: async () => 'duplicate key', json: async () => [] });
    const { json } = await post({ email: 'ada@example.com' });
    check('an existing address is success (409), still gets the link', json.ok && json.stored === true && Boolean(json.downloadUrl), json);
    supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
  }

  console.log('\n--- our database is down (the paused-project case) ---\n');
  {
    supabase = () => { throw new Error('connection timeout'); };
    const { res, json } = await post({ email: 'lee@example.com' });
    check('the visitor still gets their download link', res.statusCode === 200 && Boolean(json.downloadUrl), json);
    check('but the response says stored:false, so the failure is visible', json.stored === false, json);
    const alert = mails().find((c) => /ACTION NEEDED/.test(c.body.subject || ''));
    check('and the owner is emailed the address so the lead is not lost', Boolean(alert) && alert.body.subject.includes('lee@example.com'), mails());
    supabase = () => ({ ok: false, status: 503, text: async () => 'paused', json: async () => [] });
    const r2 = await post({ email: 'lee2@example.com' });
    check('an HTTP 503 from Supabase is handled the same way', r2.json.stored === false && Boolean(r2.json.downloadUrl), r2.json);
    supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
  }
  {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { json } = await post({ email: 'nokey@example.com' });
    check('a missing service key is reported as stored:false, not hidden', json.stored === false && Boolean(json.downloadUrl), json);
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }

  console.log('\n--- robustness ---\n');
  {
    access = () => ({ ok: false, status: 502 });
    const { res, json } = await post({ email: 'mailfail@example.com' });
    check('a failed backup email does not block the download', res.statusCode === 200 && Boolean(json.downloadUrl) && json.emailed === false, json);
    access = () => ({ ok: true, status: 200 });
  }
  {
    let first = true;
    supabase = (url, opts) => {
      const body = JSON.parse(opts.body);
      if (first && body.ref_code) { first = false; return { ok: false, status: 400, text: async () => 'column ref_code does not exist', json: async () => [] }; }
      return { ok: true, status: 201, text: async () => '', json: async () => [] };
    };
    const { json } = await post({ email: 'ref@example.com', ref_code: 'abc123' });
    check('a rejected ref_code retries without it instead of losing the signup', json.stored === true && inserts().length === 2 && !('ref_code' in inserts()[1].body), { json, inserts: inserts().map((i) => i.body) });
    supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
  }
  {
    const { json } = await post({ email: 'inj@example.com', ref_code: 'x"; drop table waitlist;--' });
    check('a malformed ref_code is dropped, not stored', json.ok && !('ref_code' in (inserts()[0] || { body: {} }).body), inserts().map((i) => i.body));
  }

  console.log('\n--- abuse handling ---\n');
  {
    const { res, json } = await post({ email: 'bot@example.com', company: 'Acme' });
    check('the honeypot gets a success-shaped reply', res.statusCode === 200 && json.ok === true, json);
    check('but no row, no link, no email', calls.length === 0 && !json.downloadUrl, calls);
  }
  {
    const { res } = await post({ email: 'not-an-email' });
    check('an invalid address is rejected with 400', res.statusCode === 400, res);
    const get = await handler({ httpMethod: 'GET' });
    check('non-POST is 405', get.statusCode === 405, get);
    const badJson = await handler({ httpMethod: 'POST', body: '{nope' });
    check('malformed JSON is 400', badJson.statusCode === 400, badJson);
  }
  {
    let last;
    for (let i = 0; i < 6; i++) last = await post({ email: 'spam@example.com' });
    check('hammering one address is rate limited (429)', last.res.statusCode === 429, last.res);
  }
  {
    const s = process.env.EMAIL_VERIFY_SECRET;
    delete process.env.EMAIL_VERIFY_SECRET;
    const { res } = await post({ email: 'nosecret@example.com' });
    check('without a signing secret it fails closed (500), issuing no link', res.statusCode === 500, res);
    process.env.EMAIL_VERIFY_SECRET = s;
  }

  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
}
run();
