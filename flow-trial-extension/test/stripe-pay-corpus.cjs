// A message the person sent that waits on a payment and names one Stripe invoice becomes one watch-only Do It, behind STRIPE_PAYMENT (off).
// Hebrew and English, positive and negative. Pure recognition and plan: nothing is called. Run: node test/stripe-pay-corpus.cjs
'use strict';
const { FlowStripePay: Z } = require('../core/stripe-pay.js');
const { FlowStripeClose: C } = require('../core/stripe-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { STRIPE_PAYMENT: true };
const INV = 'in_1Abc2Def3Ghi4Jkl';
const INV2 = 'in_9Zzz8Yyy7Xxx6Www';
const PI = 'pi_3Mno4Pqr5Stu6Vwx';
const LINK = 'https://dashboard.stripe.com/invoices/' + INV;

console.log('\n--- a sent message that waits on one Stripe payment ---\n');
const yes = [
  ['Hi Dana, please pay invoice ' + INV + ' by Thursday.', INV],
  ['Payment is due on ' + INV + ', thanks.', INV],
  ['Let me know when it is paid: ' + LINK, INV],
  ['Still awaiting payment for ' + PI + '.', PI],
  ['Reminder: unpaid invoice ' + INV, INV],
  ['בבקשה לשלם את החשבונית ' + INV + ' עד יום חמישי', INV],
  ['מחכה לתשלום על ' + LINK, INV],
  ['תעדכן אותי כשהתשלום עבר ' + PI, PI]
];
for (const [text, id] of yes) {
  const r = Z.recognize(text, 'theirs');
  check('clear: ' + text.slice(0, 55), r.kind === 'clear' && r.objectId === id, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please pay ' + INV + ' or ' + INV2, 'several-objects', 'theirs'],
  ['Please pay the invoice ch_1Abc2Def3Ghi4Jkl', 'not-an-invoice', 'theirs'],
  ['Please pay ' + INV + ' and cus_1Abc2Def3Ghi4', 'not-an-invoice', 'theirs'],
  ['Please pay ' + INV, 'you-owe', 'mine'],
  ['I will pay ' + INV + ' tomorrow', 'you-owe', 'theirs'],
  ['אני אשלם את ' + INV + ' מחר', 'you-owe', 'theirs'],
  ['The invoice ' + INV + ' has been paid, here is the receipt', 'already-paid', 'theirs'],
  ['התקבל תשלום על ' + INV, 'already-paid', 'theirs'],
  ['No need to pay ' + INV + ', it was cancelled', 'negation', 'theirs'],
  ['אין צורך לשלם את ' + INV, 'negation', 'theirs'],
  ['Maybe pay ' + INV + ' whenever you can', 'hedge', 'theirs'],
  ['FYI invoice ' + INV + ' is unpaid', 'fyi', 'theirs'],
  ['Ask Dana to pay ' + INV, 'third-party', 'theirs'],
  ['The invoice is ' + INV, 'no-ask', 'theirs'],
  ['Please pay ' + INV, 'no-direction', undefined],
  ['Please pay ' + INV, 'no-direction', 'both']
];
for (const [text, why, dir] of no) {
  const r = Z.recognize(text, dir);
  check('silent (' + why + '): ' + text.slice(0, 55), r.kind === 'block' && r.reason === why, r);
}
check('no Stripe id at all is ignored (an invoice is never guessed from a name or an amount)', Z.recognize('Please pay the invoice for 1,200 shekel', 'theirs').kind === 'ignore' && Z.plan({ flags: ON, text: 'Please pay the invoice for 1,200 shekel', direction: 'theirs' }).action === 'silence');
check('empty and null are ignored', Z.recognize('', 'theirs').kind === 'ignore' && Z.recognize(null, 'theirs').kind === 'ignore');
check('a secret key in the text is never an invoice id', Z.recognize('Please pay sk_live_abcdefghijklmnop', 'theirs').kind !== 'clear' && Z.plan({ flags: ON, text: 'Please pay sk_live_abcdefghijklmnop in_1Abc2Def3Ghi4Jkl', direction: 'theirs' }).action === 'silence');

console.log('\n--- the switch and the plan ---\n');
check('off by default', Z.SWITCH_DEFAULT === false && Z.plan({ text: yes[0][0], direction: 'theirs' }).action === 'off');
const p = Z.plan({ flags: ON, text: yes[0][0], direction: 'theirs' });
check('one Do It that only watches one payment; the note says Glance never charges, refunds or sends', p.action === 'offer' && p.approval === 'DoIt' && p.objectId === INV && p.steps.length === 2 && p.steps[0].kind === 'watch' && p.steps[0].proof === 'stripe/payment' && /never charges/.test(p.steps[1].label), p);
check('nothing in the plan is a charge, refund, send or invoice action', !p.steps.some((s) => /charge|refund|send|invoice|pay/i.test(s.kind)), p.steps);
const ph = Z.plan({ flags: ON, text: yes[5][0], direction: 'theirs' });
check('Hebrew plan: Hebrew line and steps', ph.lang === 'he' && /[֐-׿]/.test(ph.line) && /[֐-׿]/.test(ph.steps[0].label), ph);
check('a received ask to pay has no plan', Z.plan({ flags: ON, text: yes[0][0], direction: 'mine' }).action === 'silence');
check('the id the recognizer returns is one the engine accepts', C.parseObjectId(p.objectId) === INV && Z.SYSTEM === C.SYSTEM && C.parseObjectId(Z.recognize(yes[3][0], 'theirs').objectId) === PI);

console.log('\nTOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
