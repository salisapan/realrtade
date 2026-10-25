// A bill is closed only when it is paid (core/bill-paid.js, switch BILL_PAID in core/labs-switches.js, off).
// Pinned: switch off = nothing; the payee's receipt, a bank / card / provider debit naming the payee, and the person's own
// "I paid" to the payee close it with the message as proof; a debit with no recipient asks once; a failed, scheduled or
// future charge, a reminder, money coming in, a refund, a payment to someone else and a promise to pay never do; two
// bills that fit equally stay silent; overdue bills are listed. Run: node test/bill-paid-corpus.cjs
const { FlowBillPaid: B } = require('../core/bill-paid.js');
const { FlowLabsSwitches: L } = require('../core/labs-switches.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { enabled: true };
const NOW = new Date('2026-10-25T10:00:00').getTime();
const cpa = { id: 'b1', status: 'open', payee: 'משרד רו"ח לוי', email: 'office@levi-cpa.co.il', amount: 2340, currency: 'ILS', invoiceNo: '4471', dueIso: '2026-11-10' };
const host = { id: 'b2', status: 'open', payee: 'Hosting Co', email: 'billing@hostco.example', amount: 640, currency: 'USD', invoiceNo: '8812', dueIso: '2026-10-20' };
const gan = { id: 'b3', status: 'open', payee: 'מיכל הגננת', email: 'michal.gan@gmail.com', amount: 2100, currency: 'ILS', dueIso: '2026-10-01' };

console.log('--- switch off: nothing ---');
const receipt = { dir: 'in', fromEmail: 'office@levi-cpa.co.il', text: 'שלום, מצורפת קבלה מספר 4471 על סך 2,340 ₪. תודה על התשלום!' };
check('every off form returns null', [undefined, null, {}, { enabled: false }, { enabled: 'true' }].every((o) => B.judge([cpa], receipt, o) === null));
check('not yet on the labs list: nothing is wired, so no switch is shown to the person', L.IDS.indexOf('BILL_PAID') < 0);

console.log('--- paid, with proof ---');
const r1 = B.judge([cpa, host, gan], receipt, ON);
check('the payee\'s receipt for that amount closes that bill (Hebrew)', r1 && r1.billId === 'b1' && r1.verdict === 'close' && r1.kind === 'payee', r1);
check('the payee\'s receipt with only the invoice number closes it', (B.judge([host], { dir: 'in', fromEmail: 'billing@hostco.example', text: 'Payment received for invoice #8812. Thank you!' }, ON) || {}).verdict === 'close');
check('a receipt from a colleague at the same company counts', (B.judge([cpa], { dir: 'in', fromEmail: 'dana@levi-cpa.co.il', text: 'מצורפת קבלה על 2,340 ₪, תודה' }, ON) || {}).verdict === 'close');
check('a bank debit naming the payee closes it', (B.judge([gan], { dir: 'in', fromEmail: 'noreply@bit.co.il', text: 'העברת 2,100 ₪ למיכל הגננת באמצעות ביט.' }, ON) || {}).verdict === 'close');
check('PayPal "You sent ... to Hosting Co" closes it', (B.judge([host], { dir: 'in', fromEmail: 'service@paypal.com', text: 'You sent $640.00 USD to Hosting Co. Your payment is complete.' }, ON) || {}).kind === 'bank');
check('the person\'s own "I paid" to the payee closes it', (B.judge([host], { dir: 'out', toEmail: 'billing@hostco.example', text: 'Hi, I just paid invoice 8812 by bank transfer.' }, ON) || {}).kind === 'own');
check('a transfer confirmation attached, Hebrew', (B.judge([gan], { dir: 'out', toEmail: 'michal.gan@gmail.com', text: 'היי מיכל, העברתי. מצורף אישור.', attachments: ['אישור העברה.pdf'] }, ON) || {}).verdict === 'close');
check('a debit with no recipient asks once', (B.judge([host], { dir: 'in', fromEmail: 'alerts@chase.com', text: 'A payment of $640.00 was made from your account ending 4411.' }, ON) || {}).verdict === 'ask');

console.log('--- never proof ---');
const never = [
  ['a reminder from the payee', cpa, { dir: 'in', fromEmail: 'office@levi-cpa.co.il', text: 'תזכורת: חשבונית 4471 על סך 2,340 ₪ טרם שולמה.' }],
  ['a failed transfer', gan, { dir: 'in', fromEmail: 'noreply@bit.co.il', text: 'ההעברה בסך 2,100 ₪ למיכל הגננת לא בוצעה.' }],
  ['a scheduled charge', host, { dir: 'in', fromEmail: 'alerts@chase.com', text: 'Your scheduled payment of $640.00 to Hosting Co is set for November 1.' }],
  ['a standing order that will charge', cpa, { dir: 'in', fromEmail: 'office@levi-cpa.co.il', text: 'סכום של 2,340 ₪ יחויב בהוראת קבע.' }],
  ['money coming in', gan, { dir: 'in', fromEmail: 'noreply@bit.co.il', text: 'התקבלה העברה בסך 2,100 ₪ ממיכל הגננת.' }],
  ['a refund', host, { dir: 'in', fromEmail: 'service@paypal.com', text: 'You received a refund of $640.00 USD from Hosting Co.' }],
  ['the same amount to someone else', gan, { dir: 'in', fromEmail: 'noreply@bit.co.il', text: 'העברת 2,100 ₪ לרון אברהם באמצעות ביט.' }],
  ['a promise to pay', host, { dir: 'out', toEmail: 'billing@hostco.example', text: "I'll pay the $640 invoice next week." }],
  ['"I paid" to someone who is not the payee', host, { dir: 'out', toEmail: 'friend@gmail.com', text: 'I paid the $640 hosting bill.' }],
  ['an untrusted sender saying money went out', host, { dir: 'in', fromEmail: 'random@spam.example', text: 'You sent $640.00 to Hosting Co.' }],
  ['a debit for a different amount', host, { dir: 'in', fromEmail: 'service@paypal.com', text: 'You sent $64.00 USD to Hosting Co.' }],
  ['a receipt with neither the amount nor the invoice', cpa, { dir: 'in', fromEmail: 'office@levi-cpa.co.il', text: 'מצורפת קבלה. תודה!' }]
];
never.forEach(([name, bill, msg]) => check(name + ': no close', B.judge([bill], msg, ON) === null, B.judge([bill], msg, ON)));
const twin = Object.assign({}, host, { id: 'b4', payee: 'Hosting Co', email: 'billing@hostco.example' });
check('two open bills from the same payee for the same amount: silence', B.judge([host, twin], { dir: 'in', fromEmail: 'service@paypal.com', text: 'You sent $640.00 USD to Hosting Co.' }, ON) === null);
check('a paid bill is not matched again', B.judge([Object.assign({}, cpa, { status: 'paid' })], receipt, ON) === null);

console.log('--- the close, and what is overdue ---');
const p = B.closePatch(cpa, r1, { id: 'msg-77', fetchedBack: true }, NOW);
check('the close carries the message as proof', p.status === 'paid' && p.proof.system === 'mail' && p.proof.externalId === 'msg-77' && p.proof.fetchedBack === true && p.proof.kind === 'payee');
check('without a read-back the proof says so', B.closePatch(cpa, r1, { id: 'm' }, NOW).proof.fetchedBack === false);
const late = B.overdue([cpa, host, gan, Object.assign({}, gan, { id: 'b5', status: 'paid' })], NOW);
check('overdue: the bills past due with no proof, most overdue first', late.map((b) => b.id).join(',') === 'b3,b2', late.map((b) => b.id));

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nTOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
