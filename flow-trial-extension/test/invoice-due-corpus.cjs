// An invoice or bill that names its number and its day but no amount ("Reminder: your invoice 2231 is due on 30/10", «חשבונית מספר 2231 לתשלום
// עד 30/10») becomes the task "Pay invoice 2231" / «לשלם חשבונית 2231» on that day (PAYMENT_ASK, off), through the shared judge that Outlook and Gmail
// use. A bill with an amount stays the amount ask; a receipt, a paid invoice, an automatic charge and an invoice with no day stay quiet. Glance pays
// nothing. Run: node test/invoice-due-corpus.cjs
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CORE = ['domains.js', 'extract.js', 'day-words.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'chat-payment-ask.js', 'incoming-judge.js'];
const sb = { console }; vm.createContext(sb);
for (const f of CORE) { try { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f }); } catch (e) { if (f !== 'day-words.js') throw e; } }
const judge = vm.runInContext('FlowIncomingJudge.judge', sb);
const NOW = new Date('2026-10-26T10:00:00+02:00');
const base = { subject: 'Invoice', sender: { email: 'billing@vendor.example', name: 'Dana' }, to: ['me@example.com'], ownAddresses: ['me@example.com'], now: NOW, attachmentCount: 0, userName: 'Sali', ownNames: ['Sali'], surface: 'outlook' };
let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const run = (t, on) => judge(Object.assign({ text: t, paymentAskOn: on !== false }, base), {});
const YES = [
  ['Reminder: your invoice 2231 is due on 30/10', 'Pay invoice 2231 · Dana', '2026-10-30'],
  ['Your invoice #INV-4412 is due on Friday', 'Pay invoice INV-4412 · Dana', '2026-10-30'],
  ['Hi, a friendly note that your invoice no. 8890 is payable by November 5', 'Pay invoice 8890 · Dana', '2026-11-05'],
  ['חשבונית מספר 2231 לתשלום עד 30/10', 'לשלם חשבונית 2231 · Dana', '2026-10-30'],
  ['תזכורת: חשבונית 7754 לתשלום עד יום חמישי', 'לשלם חשבונית 7754 · Dana', '2026-10-29']
];
for (const [text, title, day] of YES) {
  const r = run(text);
  check('task: ' + text, r.show === true && r.intent && r.intent.label === title && r.intent.entities.deadline === day, r.show ? r.intent.label : r.reason);
}
check('an invoice with an amount keeps the amount title', (run('Your invoice 2231 of 500 NIS is due on 30/10').intent || {}).label === 'Pay 500 NIS · Dana');
for (const t of [
  'Your invoice 2231 has been paid, thank you',
  'Your invoice 2231 is overdue',
  'Your invoice 2231 will be charged automatically, due on 30/10',
  'We attach your invoice 2231, due 30/10, receipt to follow, already paid by card',
  'Invoice 2231 was due on 30/10 and was paid yesterday'
]) {
  const r = run(t);
  check('stays quiet: ' + t, !(r.show && r.intent && r.intent.paymentAsk), r.show ? r.intent.label : r.reason);
}
check('off by default: no switch, no card', !(run('Reminder: your invoice 2231 is due on 30/10', false).intent || {}).paymentAsk);
console.log(failures ? failures + ' FAILED' : 'All invoice-due checks passed');
process.exit(failures ? 1 : 0);
