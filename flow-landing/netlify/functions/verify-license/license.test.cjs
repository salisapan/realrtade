// Tests for the Glance Pro money path: licence core, verify-license,
// stripe-webhook, create-checkout, billing-portal, and the glance-assist gate.
// Run: node netlify/functions/verify-license/license.test.cjs
const crypto = require('crypto');
Object.assign(process.env, {
  SUPABASE_SERVICE_ROLE_KEY: 'svc', LICENSE_SECRET: 'lic-secret', STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_PRO_MONTHLY: 'price_m', STRIPE_PRICE_PRO_YEARLY: 'price_y',
  RESEND_API_KEY: 're_x', PRO_PUBLIC: '1',
});

let calls = [];
let licenses = []; // fake `licenses` table
let stripeSub = null;
let coupon = null;
global.fetch = async (url, o) => {
  url = String(url); o = o || {};
  const body = o.body && typeof o.body === 'string' && o.body.startsWith('{') ? JSON.parse(o.body) : o.body;
  calls.push({ url, method: o.method || 'GET', body });
  const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
  if (url.includes('supabase.co/rest/v1/licenses')) {
    const u = new URL(url);
    if ((o.method || 'GET') === 'GET') {
      let rows = licenses.slice();
      for (const [k, v] of u.searchParams) if (k !== 'select' && k !== 'limit' && k !== 'order' && v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      return json(rows);
    }
    if (o.method === 'POST') {
      if (licenses.some((r) => r.stripe_subscription_id === body.stripe_subscription_id)) return json([]);
      licenses.push(Object.assign({ created_at: new Date().toISOString() }, body)); return json([body]);
    }
    if (o.method === 'PATCH') {
      const id = new URL(url).searchParams.get('stripe_subscription_id').slice(3);
      const hit = licenses.filter((r) => r.stripe_subscription_id === id); hit.forEach((r) => Object.assign(r, body)); return json(hit);
    }
  }
  if (url.includes('api.stripe.com/v1/subscriptions/')) return json(stripeSub);
  if (url.includes('api.stripe.com/v1/coupons/')) return coupon ? json(coupon) : json({ error: { message: 'nope' } }, 404);
  if (url.includes('api.stripe.com/v1/prices/')) return json({ unit_amount: url.endsWith('price_y') ? 13200 : 1400, currency: 'usd', recurring: { interval: url.endsWith('price_y') ? 'year' : 'month' } });
  if (url.includes('api.stripe.com/v1/checkout/sessions')) return json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  if (url.includes('api.stripe.com/v1/billing_portal/sessions')) return json({ url: 'https://billing.stripe.com/p/session/x' });
  if (url.includes('resend.com')) return json({ id: 'e1' });
  throw new Error('unexpected fetch ' + url);
};

const core = require('./license-core.js');
const { handler: verify } = require('./verify-license.js');
const { handler: webhook } = require('../stripe-webhook/stripe-webhook.js');
const { handler: checkout } = require('../create-checkout/create-checkout.js');
const { handler: portal } = require('../billing-portal/billing-portal.js');
const { handler: assist } = require('../glance-assist/glance-assist.js');

let fails = 0;
const check = (n, c, d) => { if (c) console.log('PASS:', n); else { fails++; console.log('FAIL:', n, JSON.stringify(d)); } };
let ipn = 0;
const ev = (method, body, headers) => ({ httpMethod: method, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), headers: Object.assign({ 'x-nf-client-connection-ip': '7.7.7.' + (++ipn) }, headers || {}) });
const parse = (r) => JSON.parse(r.body);
const signed = (payload, secret, ts) => {
  const t = ts || Math.floor(Date.now() / 1000);
  return { 'stripe-signature': 't=' + t + ',v1=' + crypto.createHmac('sha256', secret || 'whsec_x').update(t + '.' + payload).digest('hex') };
};

(async () => {
  // ---- core
  const key = core.deriveKey('lic-secret', 'sub_123');
  check('key has the GLNC-XXXXX-XXXXX-XXXXX-XXXXX shape', /^GLNC(-[A-Z2-9]{5}){4}$/.test(key), key);
  check('key derivation is deterministic', key === core.deriveKey('lic-secret', 'sub_123'));
  check('a different subscription gets a different key', key !== core.deriveKey('lic-secret', 'sub_124'));
  check('a different secret gets a different key', key !== core.deriveKey('other', 'sub_123'));
  check('pasted keys are normalised (case, spaces, missing dashes)', core.normalizeKey(key.toLowerCase().replace(/-/g, ' ')) === key && core.normalizeKey(key.replace(/-/g, '')) === key);
  check('garbage is not a key', core.normalizeKey('hello') === null && core.normalizeKey('') === null && core.normalizeKey(null) === null);
  const now = Date.now();
  check('active, trialing and comp are entitled', ['active', 'trialing', 'comp'].every((s) => core.isEntitled({ status: s }, now)));
  check('canceled / unpaid / unknown are not', ['canceled', 'unpaid', 'incomplete', 'paused'].every((s) => !core.isEntitled({ status: s }, now)) && !core.isEntitled(null, now));
  check('past_due keeps access for a 3 day grace, then loses it',
    core.isEntitled({ status: 'past_due', current_period_end: new Date(now - 86400000).toISOString() }, now) &&
    !core.isEntitled({ status: 'past_due', current_period_end: new Date(now - 4 * 86400000).toISOString() }, now));
  const payload = '{"a":1}';
  const goodSig = signed(payload)['stripe-signature'];
  check('a correctly signed webhook verifies', core.verifyStripeSignature(payload, goodSig, 'whsec_x', Date.now(), 300));
  check('a tampered body fails', !core.verifyStripeSignature(payload + ' ', goodSig, 'whsec_x', Date.now(), 300));
  check('the wrong secret fails', !core.verifyStripeSignature(payload, goodSig, 'whsec_y', Date.now(), 300));
  check('a stale (replayed) signature fails', !core.verifyStripeSignature(payload, signed(payload, 'whsec_x', Math.floor(Date.now() / 1000) - 3600)['stripe-signature'], 'whsec_x', Date.now(), 300));
  check('a missing header fails', !core.verifyStripeSignature(payload, undefined, 'whsec_x', Date.now(), 300));

  // ---- webhook: purchase creates a licence and emails the key
  stripeSub = { id: 'sub_123', status: 'trialing', customer: 'cus_1', trial_end: Math.floor(Date.now() / 1000) + 14 * 86400, items: { data: [{ price: { recurring: { interval: 'year' } }, current_period_end: Math.floor(Date.now() / 1000) + 14 * 86400 }] } };
  const completed = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_abc123456789', mode: 'subscription', subscription: 'sub_123', customer: 'cus_1', customer_details: { email: 'Buyer@Example.com' } } } });
  calls = [];
  let r = await webhook(ev('POST', completed, signed(completed)));
  check('webhook accepts a valid event', r.statusCode === 200, r);
  check('a licence row is stored, lower-cased email, hash only', licenses.length === 1 && licenses[0].email === 'buyer@example.com' && licenses[0].key_hash === core.hashKey(key) && !JSON.stringify(licenses[0]).includes(key), licenses);
  check('the row mirrors Stripe: trialing, yearly', licenses[0].status === 'trialing' && licenses[0].interval === 'year' && licenses[0].stripe_customer_id === 'cus_1', licenses[0]);
  const mails = calls.filter((c) => c.url.includes('resend.com'));
  check('the buyer is emailed their key', mails.some((m) => m.body.to[0] === 'buyer@example.com' && m.body.html.includes(key)), mails.map((m) => m.body.to));
  check('the owner is told about the sale', mails.some((m) => m.body.to[0] === 'ai.local.flow@gmail.com' && /trial/.test(m.body.subject)), mails.map((m) => m.body.subject));

  calls = [];
  r = await webhook(ev('POST', completed, signed(completed)));
  check('a retried event is accepted but creates nothing and re-sends nothing', r.statusCode === 200 && licenses.length === 1 && !calls.some((c) => c.url.includes('resend.com')), { licenses: licenses.length, calls: calls.map((c) => c.url) });
  r = await webhook(ev('POST', completed, signed(completed, 'whsec_wrong')));
  check('a forged event is rejected with 400', r.statusCode === 400, r);
  const before = licenses.length;
  r = await webhook(ev('POST', completed.replace('sub_123', 'sub_999'), signed(completed)));
  check('a payload that does not match its signature creates nothing', r.statusCode === 400 && licenses.length === before, r);

  // ---- webhook: lifecycle
  const upd = (status) => JSON.stringify({ type: 'customer.subscription.updated', data: { object: Object.assign({}, stripeSub, { status }) } });
  r = await webhook(ev('POST', upd('active'), signed(upd('active'))));
  check('trial converting to paid is mirrored as active', r.statusCode === 200 && licenses[0].status === 'active', licenses[0]);
  const del = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: Object.assign({}, stripeSub, { status: 'canceled' }) } });
  r = await webhook(ev('POST', del, signed(del)));
  check('a cancelled subscription is mirrored as canceled', licenses[0].status === 'canceled', licenses[0]);
  const other = JSON.stringify({ type: 'invoice.created', data: { object: {} } });
  r = await webhook(ev('POST', other, signed(other)));
  check('unrelated events are acknowledged and ignored', r.statusCode === 200, r);
  licenses[0].status = 'active';

  // ---- verify-license
  r = await verify(ev('POST', { key }));
  let j = parse(r);
  check('an active key verifies', r.statusCode === 200 && j.valid === true && j.plan === 'pro' && j.interval === 'year', j);
  check('verification never returns the buyer email', !r.body.includes('buyer@example.com'), r.body);
  r = await verify(ev('POST', { key: core.deriveKey('lic-secret', 'sub_unknown') }));
  check('an unknown key is simply not valid', parse(r).valid === false && parse(r).reason === 'unknown', parse(r));
  r = await verify(ev('POST', { key: 'not a key' }));
  check('a malformed key is not valid', parse(r).valid === false && parse(r).reason === 'format', parse(r));
  licenses[0].status = 'canceled'; core._cache.clear();
  r = await verify(ev('POST', { key }));
  check('a cancelled key stops verifying (after the cache expires)', parse(r).valid === false && parse(r).reason === 'inactive', parse(r));
  licenses[0].status = 'active'; core._cache.clear();

  r = await verify(ev('POST', { action: 'by-session', sessionId: 'cs_test_abc123456789' }));
  j = parse(r);
  check('the welcome page gets the key for the session it paid with', j.key === key, j);
  r = await verify(ev('POST', { action: 'by-session', sessionId: 'cs_test_doesnotexist01' }));
  check('an unknown session is "pending", not an error', parse(r).pending === true, parse(r));
  r = await verify(ev('POST', { action: 'by-session', sessionId: "x' or 1=1" }));
  check('a malformed session id is rejected', r.statusCode === 400, r);

  calls = [];
  r = await verify(ev('POST', { action: 'resend', email: 'buyer@example.com' }));
  check('resend emails the key to the address on file', parse(r).ok && calls.some((c) => c.url.includes('resend.com') && c.body.to[0] === 'buyer@example.com' && c.body.html.includes(key)), calls.map((c) => c.url));
  calls = [];
  r = await verify(ev('POST', { action: 'resend', email: 'stranger@example.com' }));
  check('resend answers the same for a stranger and sends nothing', parse(r).ok === true && !calls.some((c) => c.url.includes('resend.com')), calls.map((c) => c.url));
  const rl = ev('POST', { action: 'resend', email: 'spam@example.com' });
  await verify(rl); await verify(Object.assign({}, rl, { headers: { 'x-nf-client-connection-ip': '8.8.8.8' } }));
  r = await verify(Object.assign({}, rl, { headers: { 'x-nf-client-connection-ip': '8.8.8.9' } }));
  check('resend is rate limited per address', r.statusCode === 429, r);

  // ---- create-checkout
  r = await checkout(ev('GET'));
  j = parse(r);
  check('status reports enabled with prices read from Stripe', j.enabled === true && j.prices.month.amount === 1400 && j.prices.year.amount === 13200 && j.trialDays === 14, j);
  check('no founding offer unless a coupon is configured', j.founding === null, j);
  calls = [];
  r = await checkout(ev('POST', { interval: 'year', email: 'New@Person.com' }));
  j = parse(r);
  const sess = calls.find((c) => c.url.includes('/v1/checkout/sessions'));
  const form = new URLSearchParams(sess.body);
  check('POST returns the Stripe-hosted URL', r.statusCode === 200 && /^https:\/\/checkout\.stripe\.com\//.test(j.url), j);
  check('it sells the yearly price as a subscription with a 14 day trial', form.get('mode') === 'subscription' && form.get('line_items[0][price]') === 'price_y' && form.get('subscription_data[trial_period_days]') === '14', [...form]);
  check('it returns to the welcome page with the session id', form.get('success_url').endsWith('/pro-welcome.html?session_id={CHECKOUT_SESSION_ID}'), form.get('success_url'));
  check('the email is prefilled, lower-cased', form.get('customer_email') === 'new@person.com', [...form]);
  r = await checkout(ev('POST', { interval: 'weekly' }));
  check('an unknown billing interval is rejected', r.statusCode === 400, r);
  r = await checkout(ev('POST', { interval: 'month', email: 'nope' }));
  check('a bad email is rejected', r.statusCode === 400, r);
  process.env.FOUNDING_COUPON_ID = 'FOUNDING';
  coupon = { valid: true, percent_off: 35, max_redemptions: 100, times_redeemed: 40, duration: 'forever' };
  r = await checkout(ev('GET')); j = parse(r);
  check('a configured founding coupon reports how many are left', j.founding && j.founding.remaining === 60 && j.founding.percentOff === 35, j);
  calls = [];
  await checkout(ev('POST', { interval: 'month' }));
  const f2 = new URLSearchParams(calls.find((c) => c.url.includes('/v1/checkout/sessions')).body);
  check('the founding coupon is applied while redemptions remain', f2.get('discounts[0][coupon]') === 'FOUNDING' && !f2.get('allow_promotion_codes'), [...f2]);
  coupon = { valid: true, percent_off: 35, max_redemptions: 100, times_redeemed: 100, duration: 'forever' };
  r = await checkout(ev('GET')); j = parse(r);
  check('a used-up founding coupon disappears instead of lying', j.founding === null, j);
  delete process.env.FOUNDING_COUPON_ID;
  process.env.PRO_PUBLIC = '0';
  r = await checkout(ev('GET'));
  check('everything configured but PRO_PUBLIC unset: still not offered', parse(r).enabled === false, parse(r));
  process.env.PRO_PUBLIC = '1';
  const saved = process.env.STRIPE_PRICE_PRO_YEARLY; delete process.env.STRIPE_PRICE_PRO_YEARLY;
  r = await checkout(ev('GET'));
  check('with any Stripe setting missing, checkout reports disabled', parse(r).enabled === false, parse(r));
  r = await checkout(ev('POST', { interval: 'month' }));
  check('and refuses to create a session', r.statusCode === 503, r);
  process.env.STRIPE_PRICE_PRO_YEARLY = saved;

  // ---- billing portal
  r = await portal(ev('POST', { key }));
  check('a valid key opens the Stripe billing portal', r.statusCode === 200 && /^https:\/\/billing\.stripe\.com\//.test(parse(r).url), r);
  r = await portal(ev('POST', { key: core.deriveKey('lic-secret', 'sub_none') }));
  check('an unknown key gets 404', r.statusCode === 404, r);

  // ---- glance-assist gate (every action calls a paid model)
  calls = [];
  r = await assist(ev('POST', { action: 'classify', lang: 'en', maskedText: 'x' }));
  check('no licence key: 402 pro_required, no model call', r.statusCode === 402 && parse(r).code === 'pro_required' && !calls.some((c) => /anthropic|x\.ai|googleapis|openai/.test(c.url)), { r, calls: calls.map((c) => c.url) });
  r = await assist(ev('POST', { action: 'classify', licenseKey: core.deriveKey('lic-secret', 'sub_none') }));
  check('an unknown key: 402', r.statusCode === 402, r);
  licenses[0].status = 'canceled'; core._cache.clear();
  r = await assist(ev('POST', { action: 'classify', licenseKey: key }));
  check('a cancelled key: 402', r.statusCode === 402, r);
  licenses[0].status = 'active'; core._cache.clear();
  r = await assist(ev('POST', { action: 'nonsense', licenseKey: key }));
  check('a live key passes the gate (then fails normally on a bad action)', r.statusCode === 400 && /Invalid action/.test(r.body), r);
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; core._cache.clear();
  r = await assist(ev('POST', { action: 'classify', licenseKey: key }));
  check('with licensing unavailable the gate fails CLOSED (503)', r.statusCode === 503, r);
  process.env.SUPABASE_SERVICE_ROLE_KEY = svc;

  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
