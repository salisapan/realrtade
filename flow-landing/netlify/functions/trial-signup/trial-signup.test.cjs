// Regression test for trial-signup.js: records (or reports) the signup, triggers
// send-confirmation only, and never returns a download link.
//
// Run: node netlify/functions/trial-signup/trial-signup.test.cjs

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 'test-resend-key';

let calls = [];
let supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
let confirmation = () => ({ ok: true, status: 200 });
global.fetch = async (url, opts) => {
  opts = opts || {};
  calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('supabase.co')) return supabase(url, opts);
  if (String(url).includes('send-confirmation')) return confirmation();
  if (String(url).includes('send-trial-access')) throw new Error('trial-signup must not call send-trial-access');
  if (String(url).includes('api.resend.com')) return { ok: true, status: 200 };
  throw new Error('unexpected fetch ' + url);
};

const { handler } = require('./trial-signup.js');

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
const confirmCalls = () => calls.filter((c) => c.url.includes('send-confirmation'));

async function run() {
  console.log('--- happy path ---\n');
  {
    const { res, json } = await post({ email: 'ada@example.com', lang: 'en' });
    check('returns 200 ok', res.statusCode === 200 && json.ok === true, json);
    check('response has no downloadUrl field', json.downloadUrl === undefined, json);
    check('response tells the visitor to check email', json.checkEmail === true && /check your email/i.test(json.message || ''), json);
    check('the signup row is written to Supabase', inserts().length === 1 && inserts()[0].body.email === 'ada@example.com' && inserts()[0].body.source === 'trial-extension', calls);
    check('it reports stored:true only because Supabase accepted it', json.stored === true, json);
    check('send-confirmation is triggered for trial', confirmCalls().length === 1 && confirmCalls()[0].body.kind === 'trial' && confirmCalls()[0].body.email === 'ada@example.com', confirmCalls());
    check('send-confirmation payload has no download link', !confirmCalls()[0].body.downloadUrl, confirmCalls()[0].body);
    check('emailed:true on the happy path (install mail is triggered separately)', json.emailed === true, json);
  }

  console.log('\n--- repeat visitor ---\n');
  {
    supabase = () => ({ ok: false, status: 409, text: async () => 'duplicate key', json: async () => [] });
    const { json } = await post({ email: 'ada@example.com' });
    check('an existing address is success (409), still gets check-email', json.ok && json.stored === true && json.checkEmail === true && !json.downloadUrl, json);
    supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
  }

  console.log('\n--- our database is down (the paused-project case) ---\n');
  {
    supabase = () => { throw new Error('connection timeout'); };
    const { res, json } = await post({ email: 'lee@example.com' });
    check('the visitor still gets check-email when store fails', res.statusCode === 200 && json.checkEmail === true && !json.downloadUrl, json);
    check('but the response says stored:false, so the failure is visible', json.stored === false, json);
    const alert = mails().find((c) => /ACTION NEEDED/.test(c.body.subject || ''));
    check('and the owner is emailed the address so the lead is not lost', Boolean(alert) && alert.body.subject.includes('lee@example.com'), mails());
    supabase = () => ({ ok: false, status: 503, text: async () => 'paused', json: async () => [] });
    const r2 = await post({ email: 'lee2@example.com' });
    check('an HTTP 503 from Supabase is handled the same way', r2.json.stored === false && r2.json.checkEmail === true && !r2.json.downloadUrl, r2.json);
    supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
  }
  {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { json } = await post({ email: 'nokey@example.com' });
    check('a missing service key is reported as stored:false, not hidden', json.stored === false && json.checkEmail === true && !json.downloadUrl, json);
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }

  console.log('\n--- robustness ---\n');
  {
    confirmation = () => ({ ok: false, status: 502 });
    const { res, json } = await post({ email: 'mailfail@example.com' });
    check('a failed confirmation email returns 502 with no download link', res.statusCode === 502 && !json.downloadUrl, json);
    confirmation = () => ({ ok: true, status: 200 });
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

  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
}
run();
