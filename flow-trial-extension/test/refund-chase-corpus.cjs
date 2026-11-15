// The chase that gets the refund done (core/refund-chase.js, switch REFUND_CHASE, off; wired with REFUND_LOOP).
// Pinned: switch off = nothing; a closed or released loop has no move; a late refund gets ONE next move with a draft built
// only from the loop's facts; a fresh reminder waits 5 workdays; two unanswered reminders escalate to the card company
// (no address invented) or ask which card; a refusal or store credit is the person's decision; "once we receive the item"
// is a step; a draft is never a close. Run: node test/refund-chase-corpus.cjs
const { FlowRefundChase: C } = require('../core/refund-chase.js');
const { FlowRefundLoop: R } = require('../core/refund-loop.js');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-11-15T10:00:00').getTime();      // a Sunday
const ON = { enabled: true, now: NOW };
const base = { id: 'L', merchant: 'שופ', email: 'service@shop.co.il', amount: 189, currency: 'ILS', orderNo: '4471', lang: 'he', stage: 'asked', askedAt: '2026-11-05', chaseIso: '2026-11-12', status: 'open' };
const L1 = (x) => Object.assign({}, base, x || {});

console.log('--- switch off: nothing ---');
check('every off form returns null', [undefined, null, {}, { enabled: false }, { enabled: 'true' }].every((o) => C.plan(L1(), o) === null));
check('the switch is named and defaults off', C.SWITCH === 'REFUND_CHASE' && C.SWITCH_DEFAULT === false);
check('not on the labs list: nothing is wired', L.IDS.indexOf('REFUND_CHASE') < 0);

console.log('--- when there is nothing to do ---');
check('a closed loop has no move', C.plan(L1({ status: 'closed', closedAs: 'refunded' }), ON) === null);
check('a released loop has no move', C.plan(L1({ status: 'closed', closedAs: 'released' }), ON) === null);
check('before the chase day: no move', C.plan(L1({ chaseIso: '2026-11-16' }), ON) === null);
check('the merchant\'s own day not passed yet: no move', C.plan(L1({ stage: 'approved', expectIso: '2026-11-15' }), ON) === null);
check('a reminder sent 3 workdays ago is still fresh', C.plan(L1({ reminders: 1, lastReminderIso: '2026-11-10' }), ON) === null);
check('a loop with no merchant has no move', C.plan(L1({ merchant: null }), ON) === null);

console.log('--- remind the merchant ---');
const r1 = C.plan(L1(), ON);
check('no answer by the chase day: remind, to the merchant, quoting order, amount and the day asked', r1 && r1.step === 'remind-merchant' && r1.draft.to === 'service@shop.co.il' && /4471/.test(r1.draft.subject) && /189 ₪/.test(r1.draft.body) && /5\/11/.test(r1.draft.body), r1);
const r2 = C.plan(L1({ stage: 'approved', expectIso: '2026-11-10' }), ON);
check('their day passed: the reminder quotes THEIR day', r2 && /עד 10\/11/.test(r2.draft.body) && /כתבתם/.test(r2.draft.body), r2 && r2.draft.body);
check('a reminder 5 workdays old: remind again', C.plan(L1({ reminders: 1, lastReminderIso: '2026-11-06' }), ON).step === 'remind-merchant');
const en = C.plan(L1({ lang: 'en', merchant: 'Maker Space', email: 'hello@makerspace.com', amount: 49, currency: 'USD', orderNo: '7731', stage: 'approved', expectIso: '2026-11-11' }), ON);
check('English: "$49", the order and "11 November"', /\$49/.test(en.draft.body) && /7731/.test(en.draft.subject) && /11 November/.test(en.draft.body), en.draft);
const noAmt = C.plan(L1({ amount: null, currency: null, orderNo: null }), ON);
check('no amount and no order: no figure is invented', noAmt && !/₪|\$/.test(noAmt.draft.body) && !/הזמנה/.test(noAmt.draft.body), noAmt && noAmt.draft.body);
check('cents are kept ($14.99)', /\$14\.99/.test(C.plan(L1({ lang: 'en', amount: 14.99, currency: 'USD' }), ON).draft.body));
check('thousands keep their comma (3,490 ₪)', /3,490 ₪/.test(C.plan(L1({ amount: 3490 }), ON).draft.body));
check('a draft never says it was sent or done', [r1, r2, en].every((p) => !/שלחתי לכם את|קיבלתי את הכסף|has been refunded|I received/.test(p.draft.body)));

console.log('--- escalate to the card company ---');
const e1 = C.plan(L1({ stage: 'approved', expectIso: '2026-10-26', reminders: 2, lastReminderIso: '2026-11-05', paidWith: 'ישראכרט', amount: 3490, merchant: 'אלקטרה', orderNo: '88120' }), ON);
check('two unanswered reminders: a dispute request naming card, merchant, order and amount', e1 && e1.step === 'escalate-card' && /ישראכרט/.test(e1.draft.body) && /אלקטרה/.test(e1.draft.body) && /88120/.test(e1.draft.body) && /3,490 ₪/.test(e1.draft.body), e1);
check('…with no address invented: To is empty and the card is the hint', e1.draft.to === null && e1.draft.toHint === 'ישראכרט');
check('…and it says their day and the two reminders', /עד 26\/10/.test(e1.draft.body) && /שתי תזכורות/.test(e1.draft.body));
check('the card unknown: one question, no draft', (C.plan(L1({ reminders: 2, lastReminderIso: '2026-11-02' }), ON) || {}).step === 'ask-card');
check('a fresh second reminder still waits', C.plan(L1({ reminders: 2, lastReminderIso: '2026-11-12', paidWith: 'מקס' }), ON) === null);
check('English dispute names the card ("Chase")', /my Chase card/.test(C.plan(L1({ lang: 'en', merchant: 'Airline X', currency: 'USD', amount: 412, reminders: 2, lastReminderIso: '2026-11-01', paidWith: 'Chase' }), ON).draft.body));

console.log('--- the person decides, or does a step ---');
check('a refusal is a decision with three options, no draft', (function () { const p = C.plan(L1({ stage: 'declined' }), ON); return p.step === 'decide' && !p.draft && p.options.join() === 'insist,escalate,release'; })());
check('store credit is a decision', C.plan(L1({ stage: 'store-credit' }), ON).step === 'decide');
check('"once we receive the item" is a step to send it back, no draft', (function () { const p = C.plan(L1({ stage: 'needs-you', need: 'return-item' }), ON); return p.step === 'return-item' && !p.draft && /להחזיר את המוצר לשופ/.test(p.title); })());
const a1 = C.plan(L1({ stage: 'needs-you' }), ON);
check('they asked for something: a reply with the order and a placeholder, never a guess', a1.step === 'answer-them' && /4471/.test(a1.draft.subject) && /\[מה שביקשתם\]/.test(a1.draft.body));

console.log('--- the loop is still the judge ---');
const sent = Object.assign({}, L1(), C.remindedPatch(L1(), NOW));
check('a sent reminder is counted with its day', sent.reminders === 1 && sent.lastReminderIso === '2026-11-15');
check('a draft does not close the loop', sent.status === 'open' && !sent.closedAs);
check('…only the credit does (refund-loop judge)', (R.judge([Object.assign({}, sent, { id: 'L' })], { fromEmail: 'alerts@isracard.co.il', text: 'זיכוי בסך 189 ₪ מבית העסק שופ נקלט בכרטיסך.' }, { enabled: true }) || {}).verdict === 'close');
check('the same input gives the same draft', JSON.stringify(C.plan(L1(), ON)) === JSON.stringify(C.plan(L1(), ON)));

console.log(failures ? '\n' + failures + ' FAILED' : '\nall refund-chase checks passed');
process.exit(failures ? 1 : 0);
