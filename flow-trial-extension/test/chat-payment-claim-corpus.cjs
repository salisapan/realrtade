// core/chat-payment-claim.js: the other side says they paid. Only the claim and an amount, never a payment seen; later, never, a question,
// a condition, somebody else's payment and a payment for something else stay quiet. The lines are invented, written after the rules.
// Run: node test/chat-payment-claim-corpus.cjs
const { FlowChatPaymentClaim: A } = require('../core/chat-payment-claim.js');
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['I transferred 500 NIS', '500', 'NIS'],
  ['I paid you 1,200 ₪ yesterday', '1200', 'NIS'],
  ['Just sent the payment', null, null],
  ['Done, I transferred it', null, null],
  ['Paid!', null, null],
  ['Payment sent for $200', '200', 'USD'],
  ['We wired 80 EUR this morning', '80', 'EUR'],
  ['העברתי לך 500 ש"ח', '500', 'NIS'],
  ['שילמתי 1,500 ₪ בביט', '1500', 'NIS'],
  ['שילמתי', null, null],
  ['שלחתי את התשלום', null, null],
  ['התשלום בוצע', null, null],
  ['העברנו 300 שקל', '300', 'NIS']
];
for (const text of ['I sent the invoice payment', 'I sent 500 NIS for the contract']) check('a payment that names a document is still a payment: ' + text, A.recognize(text).kind === 'claim', A.recognize(text));
for (const [text, amount, currency] of YES) { const r = A.recognize(text); check('claim: ' + text, r.kind === 'claim' && r.amount === amount && r.currency === currency, r); }
const NO = [
  ['I sent you the contract', 'a document'],
  ['I have sent the invoice', 'a document'],
  ['I just sent the signed agreement', 'a document'],
  ['שלחתי לך את החוזה', 'a document'],
  ['I will pay tomorrow', 'later'],
  ["I'll transfer 500 NIS tonight", 'later'],
  ["I haven't paid yet", 'not yet'],
  ["I didn't send it", 'denial'],
  ['Did you get the payment?', 'question'],
  ['He paid already', 'somebody else'],
  ['If I transfer 500 NIS will it work', 'condition'],
  ['I paid for the pizza at lunch', 'for something else'],
  ['Thanks for the pizza', 'no claim'],
  ['The payment page is down', 'no claim'],
  ['אעביר מחר', 'later'],
  ['לא שילמתי עדיין', 'not yet'],
  ['קיבלת את התשלום?', 'question'],
  ['הוא שילם כבר', 'somebody else'],
  ['שילמתי על הפיצה', 'for something else'],
  ['מחר אשלם', 'later'],
  ['', 'empty']
];
for (const [text, why] of NO) check('not a claim (' + why + '): ' + text.slice(0, 50), A.recognize(text).kind === 'none', A.recognize(text));
check('no throw on junk', (() => { try { A.recognize(null); A.recognize(undefined); A.recognize(42); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-payment-claim checks passed');
process.exit(failures ? 1 : 0);
