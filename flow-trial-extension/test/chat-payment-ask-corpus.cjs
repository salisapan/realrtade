// core/chat-payment-ask.js: a payment asked of the person in a chat, with one amount and one day, becomes an amount and a day
// and never a payment. The lines are invented and were written after the rules, not tuned to them.
// Run: node test/chat-payment-ask-corpus.cjs
const { FlowChatPaymentAsk: A } = require('../core/chat-payment-ask.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Please transfer 500 NIS to my account by Sunday', '2026-10-25', '500', 'NIS'],
  ['Can you pay the 1,200 ₪ invoice before Thursday?', '2026-10-29', '1200', 'NIS'],
  ['Could you send $250 tomorrow?', '2026-10-24', '250', 'USD'],
  ['Please wire 80 EUR by Monday', '2026-10-26', '80', 'EUR'],
  ['תעביר לי 500 שקל עד יום ראשון', '2026-10-25', '500', 'NIS'],
  ['תשלם 300 ש"ח עד מחר', '2026-10-24', '300', 'NIS'],
  ['אפשר שתעביר 1,500 ₪ ביום חמישי?', '2026-10-29', '1500', 'NIS'],
  ['אתה חייב לי 200 ש"ח, תעביר ביום שני', '2026-10-26', '200', 'NIS'],
  ['תעביר לי חמש מאות שקל עד יום ראשון', '2026-10-25', '500', 'NIS'],
  ['תשלם אלפיים ש"ח עד מחר', '2026-10-24', '2000', 'NIS'],
  ['תעביר שלוש מאות וחמישים שקל עד יום ראשון', '2026-10-25', '350', 'NIS'],
  ['תעביר שלושת אלפים ש״ח עד יום ראשון', '2026-10-25', '3000', 'NIS'],
  ['Please transfer five hundred shekels by Sunday', '2026-10-25', '500', 'NIS'],
  ['Please pay two thousand five hundred NIS by Sunday', '2026-10-25', '2500', 'NIS'],
  ['Please pay a hundred dollars by Sunday', '2026-10-25', '100', 'USD']
];
for (const [text, day, amount, cur] of YES) { const r = A.recognize(text, NOW); check('payment ask: ' + text, r.kind === 'ask' && r.dateIso === day && r.amount === amount && r.currency === cur, r); }
const NO = [
  ['Please transfer the money by Sunday', 'no amount'],
  ['Please transfer 500 NIS', 'no day'],
  ['Please transfer 500 NIS or 600 NIS by Sunday', 'two amounts'],
  ["I'll transfer 500 NIS by Sunday", 'own promise'],
  ['I already paid 500 NIS on Sunday', 'done'],
  ['Maybe pay 500 NIS by Sunday', 'hedge'],
  ["Don't pay 500 NIS before Sunday", 'refusal'],
  ['I sent you 500 NIS yesterday', 'look back'],
  ['The price is 500 NIS by Sunday', 'no pay verb'],
  ['Hello, the invoice is 500 NIS, due Sunday', 'not aimed at you'],
  ['Please pay 500 NIS on 2025-01-02', 'past'],
  ['אני אעביר 500 שקל עד יום ראשון', 'own promise'],
  ['העברתי לך 500 שקל אתמול', 'look back'],
  ['תעביר 500 שקל', 'no day'],
  ['תעביר חמישה אנשים עד יום ראשון', 'a number of people, not money'],
  ['Please pay five people by Sunday', 'a number of people, not money'],
  ['תעביר לי 500 שקל או חמש מאות שקל עד יום ראשון', 'two amounts'],
  ['חמש מאות שקל זה יקר, תעביר לי את זה עד יום ראשון', 'no pay-aimed ask'],
  ['תעביר לי את הכסף עד יום ראשון', 'no amount'],
  ['', 'empty'],
  ['x'.repeat(300), 'long']
];
for (const [text, why] of NO) check('not a payment ask (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-payment-ask checks passed');
process.exit(failures ? 1 : 0);
