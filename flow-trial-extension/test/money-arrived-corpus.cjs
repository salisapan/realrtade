// The money you chased really arrived (close map Y3), behind MONEY_ARRIVED (off).
// A payment-received notice from an allowlisted bank or payment app, with one amount,
// closes the one open payment loop with that amount (and that payer, when named).
// The notice is read back by id before the loop says paid. Undo reopens the loop
// only while it is still Glance's close. The mailbox is mocked. Nothing is sent.
// Run: node test/money-arrived-corpus.cjs
'use strict';
const { FlowMoneyArrived: M } = require('../core/money-arrived.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { MONEY_ARRIVED: true };
const DAY = 86400000;
const T0 = Date.parse('2026-10-20T09:00:00Z');
const loop = (id, value, currency, name, email, extra) => Object.assign({
  id, kind: 'payment', status: 'waiting', createdAt: T0, lang: 'he',
  amount: { value, currency, raw: (currency === 'ILS' ? '₪' : '$') + value.toLocaleString('en-US') },
  counterpart: { name, email }, closedAs: null
}, extra || {});
const LOOPS = [
  loop('w-dana', 12000, 'ILS', 'Dana Cohen', 'dana@acme.co.il'),
  loop('w-acme', 3850, 'ILS', 'אקמה בע"מ', 'billing@acme.co.il'),
  loop('w-cole', 1200, 'USD', 'Dana Cole', 'dana.cole@meridian.com', { lang: 'en' }),
  loop('w-noa', 500, 'USD', 'Noa Bar', 'noa@vendor.co', { lang: 'en' }),
  loop('w-old', 700, 'ILS', 'Moshe', 'moshe@x.co.il', { status: 'resolved', closedAs: 'paid' })
];
const mail = (id, from, subject, text, extra) => Object.assign({ id, from, subject, text, dateMs: T0 + DAY }, extra || {});

// ---- 1. notices that close one loop -----------------------------------------
console.log('\n--- a real money-in notice closes the one loop it matches ---\n');
const positives = [
  { m: mail('m1', 'notifications@bit.co.il', 'קיבלת 12,000 ₪', 'דנה כהן שלחה לך 12,000 ₪ בביט'), loop: 'w-dana', why: 'Bit, Hebrew, payer in Hebrew' },
  { m: mail('m2', 'alerts@bankhapoalim.co.il', 'התקבלה העברה', 'התקבלה העברה בסך 3,850 ש"ח לחשבונך מאת אקמה בע"מ'), loop: 'w-acme', why: 'bank transfer, Hebrew' },
  { m: mail('m3', 'service@paypal.com', "You've got money", 'Dana Cole sent you $1,200.00 USD'), loop: 'w-cole', why: 'PayPal, English' },
  { m: mail('m4', 'no-reply@stripe.com', 'Payment received', 'You received a payment of $500.00'), loop: 'w-noa', why: 'Stripe, no payer named' },
  { m: mail('m5', 'info@mail.leumi.co.il', 'זיכוי בחשבון', 'זוכה חשבונך ב-12,000 ₪ מאת דנה כהן'), loop: 'w-dana', why: 'a bank subdomain' }
];
let closed = 0;
for (const p of positives) {
  const out = M.plan({ flags: ON, loops: LOOPS, mail: p.m });
  const ok = out.action === 'close' && out.loopId === p.loop;
  if (ok) closed++;
  check('closes ' + p.loop + ': ' + p.why, ok, out);
}
check('the Hebrew line names the amount', M.plan({ flags: ON, loops: LOOPS, mail: positives[0].m }).line === 'התשלום התקבל: ₪12,000');

// ---- 2. silence -------------------------------------------------------------
console.log('\n--- silence wins ---\n');
const negatives = [
  { why: 'a look-alike domain', m: mail('n1', 'service@paypa1-secure.com', "You've got money", 'Dana Cole sent you $1,200.00 USD') },
  { why: 'the payer\'s own "I paid" (a claim, not a notice)', m: mail('n2', 'dana@acme.co.il', 'שולם', 'העברתי 12,000 ₪ היום') },
  { why: 'authentication failed', m: mail('n3', 'service@paypal.com', "You've got money", 'Dana Cole sent you $1,200.00 USD', { authPass: false }) },
  { why: 'money out', m: mail('n4', 'service@paypal.com', 'You sent a payment', 'You sent $1,200.00 USD to Dana Cole') },
  { why: 'a charge', m: mail('n5', 'alerts@bankhapoalim.co.il', 'חיוב', 'חויב חשבונך ב-3,850 ש"ח') },
  { why: 'a request for money', m: mail('n6', 'service@paypal.com', 'Request', 'Dana Cole is requesting $1,200.00 from you') },
  { why: 'pending', m: mail('n7', 'notifications@bit.co.il', 'העברה ממתינה', 'קיבלת 12,000 ₪ מדנה כהן, ההעברה ממתינה לאישור') },
  { why: 'failed', m: mail('n8', 'service@paypal.com', 'Payment received', 'You received a payment of $500.00 but it failed') },
  { why: 'a promotion', m: mail('n9', 'offers@paypal.com', 'You got money back!', 'Get $500 back with this promo') },
  { why: 'two amounts', m: mail('n10', 'service@paypal.com', 'Payment received', 'You received $1,200 and $300') },
  { why: 'no amount', m: mail('n11', 'service@paypal.com', 'Payment received', 'You received a payment.') },
  { why: 'another amount', m: mail('n12', 'service@paypal.com', 'Payment received', 'You received a payment of $1,250.00') },
  { why: 'another currency', m: mail('n13', 'service@paypal.com', 'Payment received', 'You received a payment of €1,200.00') },
  { why: 'another payer', m: mail('n14', 'service@paypal.com', "You've got money", 'Yossi Levi sent you $1,200.00 USD') },
  { why: 'a notice older than the loop', m: mail('n15', 'service@paypal.com', "You've got money", 'Dana Cole sent you $1,200.00 USD', { dateMs: T0 - 3 * DAY }) },
  { why: 'a loop already closed', m: mail('n16', 'notifications@bit.co.il', 'קיבלת 700 ₪', 'משה שלח לך 700 ₪') },
  { why: 'another payer in Hebrew against an English name', m: mail('n17', 'notifications@bit.co.il', 'קיבלת 12,000 ₪', 'יוסי לוי שלח לך 12,000 ₪ בביט') },
  { why: 'another payer in English against a Hebrew name', m: mail('n18', 'alerts@bankhapoalim.co.il', 'Incoming transfer', 'Incoming transfer of ₪3,850 from Yossi Levi') },
  { why: 'no message id', m: mail(null, 'service@paypal.com', "You've got money", 'Dana Cole sent you $1,200.00 USD') }
];
let wrong = 0;
for (const n of negatives) {
  const out = M.plan({ flags: ON, loops: LOOPS, mail: n.m });
  if (out.action === 'close') wrong++;
  check('silent: ' + n.why, out.action === 'silence', out);
}
const twoLoops = [loop('a', 500, 'USD', 'Noa Bar', 'noa@vendor.co'), loop('b', 500, 'USD', 'Avi Levi', 'avi@x.io')];
const amb = M.plan({ flags: ON, loops: twoLoops, mail: positives[3].m });
if (amb.action === 'close') wrong++;
check('two loops with that amount and no payer named: silence', amb.action === 'silence' && amb.reason === 'several-loops', amb);
const named = M.plan({ flags: ON, loops: twoLoops, mail: mail('x', 'no-reply@stripe.com', 'Payment received', 'You received a payment of $500.00 from Avi Levi') });
check('the payer\'s name picks the one loop among two', named.action === 'close' && named.loopId === 'b', named);

console.log('\n--- the switch ---\n');
check('the switch is MONEY_ARRIVED and defaults off', M.SWITCH === 'MONEY_ARRIVED' && M.SWITCH_DEFAULT === false && M.enabled() === false && M.enabled({ MONEY_ARRIVED: 'true' }) === false);
for (const p of positives) check('switch off: no close for ' + p.why, M.plan({ loops: LOOPS, mail: p.m }).action === 'off');

// ---- 3. close with a read-back, and Undo -------------------------------------
function box(messages, opts) {
  opts = opts || {};
  const calls = [];
  return {
    calls,
    readMessage: async (id) => {
      calls.push(id);
      if (opts.status) return { ok: false, status: opts.status };
      const m = messages[id];
      return m ? { ok: true, status: 200, message: m } : { ok: false, status: 404 };
    }
  };
}
const NOW = '2026-10-21T10:00:00.000Z';

(async () => {
  console.log('\n--- close: read the notice back by id ---\n');
  const planned = M.plan({ flags: ON, loops: LOOPS, mail: positives[0].m });
  const w = LOOPS[0];
  const io = box({ m1: positives[0].m });
  const res = await M.close({ flags: ON, plan: planned, loop: w, now: NOW }, io);
  check('closed with a proof read back by id', res.ok === true && Proof.allowsHandled(res) && io.calls.join() === 'm1', res);
  check('ProofOfClose names the notice in the mailbox', res.proof.system === 'gmail/message' && res.proof.externalId === 'm1' && res.proof.fetchedBack === true && res.proof.verifiedAt === NOW, res.proof);
  check('the loop closes as paid, by the notice', res.patch.status === 'resolved' && res.patch.closedAs === 'paid' && res.patch.resolvedBy === 'notice' && res.loopClosed === true, res.patch);
  const ol = await M.close({ flags: ON, plan: planned, loop: w, now: NOW, surface: 'outlook' }, box({ m1: positives[0].m }));
  check('on Outlook the proof system is microsoft/mail', ol.ok && ol.proof.system === 'microsoft/mail');

  const misses = [
    ['the notice is gone', box({}), 'verify_failed'],
    ['the token is refused', box({}, { status: 403 }), 'not-connected'],
    ['the notice reads back with another amount', box({ m1: Object.assign({}, positives[0].m, { text: 'דנה כהן שלחה לך 1,200 ₪', subject: 'קיבלת 1,200 ₪' }) }), 'verify_failed']
  ];
  for (const [why, b, reason] of misses) {
    const r = await M.close({ flags: ON, plan: planned, loop: w, now: NOW }, b);
    check(why + ' → ' + reason + ', not closed', r.ok === false && r.reason === reason && !Proof.allowsHandled(r), r);
  }
  const closedLoop = Object.assign({}, w, { status: 'resolved' });
  check('a loop that closed meanwhile is not closed twice', (await M.close({ flags: ON, plan: planned, loop: closedLoop, now: NOW }, box({ m1: positives[0].m }))).reason === 'loop-not-open');
  const off = box({ m1: positives[0].m });
  check('switch off: nothing is read', (await M.close({ plan: planned, loop: w, now: NOW }, off)).reason === 'switch-off' && off.calls.length === 0);

  console.log('\n--- Undo ---\n');
  const after = Object.assign({}, w, res.patch);
  const u = M.undo(res.ref, after);
  check('Undo reopens the loop as it was', u.ok === true && u.patch.status === 'waiting' && u.patch.closedAs === null && u.patch.paidProof === null, u);
  const touched = Object.assign({}, after, { resolvedBy: 'manual', closedAs: 'manual' });
  const u2 = M.undo(res.ref, touched);
  check('the person changed the loop since: Undo refuses', u2.ok === false && u2.reason === 'changed-since' && u2.undoUnavailable === true, u2);
  check('Undo refuses what Glance did not close', M.undo({ loopId: 'w-dana', createdByGlance: false }, after).reason === 'not-ours');

  console.log('\nprecision: closes ' + closed + '/' + positives.length + ' notices, wrong closes ' + wrong + '/' + (negatives.length + 1) + ' silent cases');
  check('precision gate: zero wrong closes', wrong === 0);
  check('recall on the positive set is 100%', closed === positives.length);
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
