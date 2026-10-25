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
const confirmCalls = () => calls.filter((c) => c.url.includes('send-confirmation'));

async function run() {
  console.log('--- happy path ---\n');
  {
    const { res, json } = await post({ email: 'ada@example.com', lang: 'en' });
    check('returns 200 ok', res.statusCode === 200 && json.ok === true, json);
    check('response has no downloadUrl field', json.downloadUrl === undefined, json);
    check('response tells the visitor to check email', json.checkEmail === true && /check your email/i.test(json.message || ''), json);
    check('the signup row is written to Supabase', inserts().length === 1 && inserts()[0].body.email === 'ada@example.com', calls);
    check('send-confirmation is triggered for trial', confirmCalls().length === 1 && confirmCalls()[0].body.kind === 'trial' && confirmCalls()[0].body.email === 'ada@example.com', confirmCalls());
    check('send-confirmation payload has no download link', !confirmCalls()[0].body.downloadUrl, confirmCalls()[0].body);
  }

  console.log('\n--- database down ---\n');
  {
    supabase = () => { throw new Error('connection timeout'); };
    const { res, json } = await post({ email: 'lee@example.com' });
    check('still returns check-email when store fails', res.statusCode === 200 && json.checkEmail === true && !json.downloadUrl, json);
    check('stored:false is visible', json.stored === false, json);
    supabase = () => ({ ok: true, status: 201, text: async () => '', json: async () => [] });
  }

  console.log('\n--- confirmation mail fails ---\n');
  {
    confirmation = () => ({ ok: false, status: 502 });
    const { res, json } = await post({ email: 'mailfail@example.com' });
    check('502 when confirmation cannot be sent', res.statusCode === 502 && !json.downloadUrl, json);
    confirmation = () => ({ ok: true, status: 200 });
  }

  console.log('\n--- abuse handling ---\n');
  {
    const { res, json } = await post({ email: 'bot@example.com', company: 'Acme' });
    check('honeypot: ok without check email', res.statusCode === 200 && json.ok === true && !json.downloadUrl, json);
    check('honeypot: no outbound calls', calls.length === 0, calls);
  }

  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
}
run();
