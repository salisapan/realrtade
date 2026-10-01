// Regression test for submit-waitlist.js 'create': the stored-then-confirmed
// path behind the homepage waitlist and the Glance Pro "Notify Me" form.
// Run: node netlify/functions/submit-waitlist/submit-waitlist.test.cjs
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.EMAIL_VERIFY_SECRET = 's';
let calls = [], sb = () => ({ ok: true, status: 201, text: async () => '' }), mail = () => ({ ok: true, status: 200 });
global.fetch = async (url, o) => { calls.push({ url: String(url), body: o && o.body ? JSON.parse(o.body) : null });
  if (String(url).includes('supabase.co')) return sb(); if (String(url).includes('send-confirmation')) return mail(); if (String(url).includes('resend.com')) return { ok: true, status: 200 }; throw new Error('unexpected ' + url); };
const { handler } = require('./submit-waitlist.js');
let fails = 0; const check = (n, c, d) => { if (c) console.log('PASS:', n); else { fails++; console.log('FAIL:', n, JSON.stringify(d)); } };
let n = 0; async function post(b) { calls = []; const r = await handler({ httpMethod: 'POST', body: JSON.stringify(b), headers: { 'x-nf-client-connection-ip': '9.9.9.' + (++n) } }); return { r, j: JSON.parse(r.body) }; }
(async () => {
  let { r, j } = await post({ action: 'create', email: 'a@b.co', source: 'pricing-pro', kind: 'pro' });
  check('stores the row with the given source', calls[0].body.source === 'pricing-pro' && calls[0].body.email === 'a@b.co', calls);
  const conf = calls.find((c) => c.url.includes('send-confirmation'));
  check('asks send-confirmation for the pro flow', conf && conf.body.kind === 'pro', conf);
  check('reports emailed:true when the mail step succeeds', r.statusCode === 200 && j.ok && j.emailed === true, j);
  ({ j } = await post({ action: 'create', email: 'c@d.co' }));
  check('default flow sends no kind (Playbook)', calls.find((c) => c.url.includes('send-confirmation')).body.kind === undefined, calls);
  mail = () => ({ ok: false, status: 502 });
  ({ r, j } = await post({ action: 'create', email: 'e@f.co', kind: 'pro' }));
  check('a failed confirmation email is reported, not hidden', r.statusCode === 200 && j.emailed === false, j);
  mail = () => ({ ok: true, status: 200 });
  sb = () => ({ ok: false, status: 503, text: async () => 'paused' });
  ({ r, j } = await post({ action: 'create', email: 'g@h.co', kind: 'pro' }));
  check('a database failure is a real error (502), not success', r.statusCode === 502 && !j.ok, { r, j });
  check('and no confirmation email is sent for an unsaved signup', !calls.some((c) => c.url.includes('send-confirmation')), calls);
  sb = () => ({ ok: false, status: 409, text: async () => 'dup' });
  ({ r, j } = await post({ action: 'create', email: 'i@j.co' }));
  check('an existing address (409) is success', r.statusCode === 200 && j.ok, j);
  sb = () => ({ ok: true, status: 201, text: async () => '' });
  ({ r, j } = await post({ action: 'create', email: 'k@l.co', hp: 'bot' }));
  check('honeypot stores nothing and sends nothing', !calls.length && j.ok, calls);
  ({ r } = await post({ action: 'create', email: 'nope' }));
  check('invalid email is 400', r.statusCode === 400, r);
  process.env.RESEND_API_KEY = 'r';
  const sec = process.env.EMAIL_VERIFY_SECRET, crypto = require('crypto'), exp = Date.now() + 60000;
  const sig = crypto.createHmac('sha256', sec).update('waitlist-update|m@n.co|' + exp).digest('base64url');
  sb = () => ({ ok: true, status: 200, json: async () => [{ id: 1 }], text: async () => '' });
  ({ r, j } = await post({ action: 'update', email: 'm@n.co', company: 'Acme <b>', role: 'GC', website: 'https://acme.co', authExp: exp, authSig: sig }));
  const note = calls.find((c) => c.url.includes('resend.com'));
  check('a completed deployment form notifies the owner', r.statusCode === 200 && note && /Acme/.test(note.body.subject), { r, calls });
  check('and escapes visitor input in that email', note && !note.body.html.includes('Acme <b>') && note.body.html.includes('Acme &lt;b&gt;'), note);
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
