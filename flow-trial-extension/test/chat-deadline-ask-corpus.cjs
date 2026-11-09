// core/chat-deadline-ask.js: a task with a deadline asked of the person in a chat without a question becomes a thing and a day.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-deadline-ask-corpus.cjs
const { FlowChatDeadlineAsk: A } = require('../core/chat-deadline-ask.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['נא לשלוח את הטפסים החתומים עד יום רביעי', '2026-10-28', 'הטפסים החתומים'],
  ['אנא להחזיר את החוזה עד מחר', '2026-10-24', 'החוזה'],
  ['Please let me have the signed copy by Friday', '2026-10-30', 'Signed copy'],
  ['Get me the invoice by Thursday', '2026-10-29', 'Invoice'],
  ['I am waiting for your signed copy by Friday', '2026-10-30', 'Signed copy'],
  ['אנחנו מחכים לאישור שלכם עד מחר', '2026-10-24', 'אישור שלכם'],
  ['Reminder: please send the signed form by Monday', '2026-10-26', /signed form/],
  ['Gentle reminder, we need the invoice before Thursday', '2026-10-29', /invoice/],
  ['תזכורת: תשלח לי את החוזה עד יום חמישי', '2026-10-29', /החוזה/],
  ['Need the report by Wednesday', '2026-10-28', /report/],
  ['I need the signed contract by tomorrow', '2026-10-24', /contract/],
  ['We need the invoice before Thursday', '2026-10-29', /invoice/],
  ['Please sign the lease by Monday', '2026-10-26', /sign the lease/],
  ['Submit the form by Tuesday', '2026-10-27', /form/],
  ['אני צריך את המצגת עד מחר', '2026-10-24', /המצגת/],
  ['צריך את החשבונית עד יום חמישי', '2026-10-29', /החשבונית/],
  ['תחתום על החוזה עד יום שישי', '2026-10-30', /החוזה/],
  ['תעביר לי את המסמכים לפני יום שני', '2026-10-26', /המסמכים/]
];
for (const [text, day, what] of YES) {
  const r = A.recognize(text, NOW);
  check('ask: ' + text, r.kind === 'ask' && r.dateIso === day && new RegExp(what.source, 'i').test(r.what) && !/(?:by|before|עד|לפני)\s/.test(r.what), r);
}
const NO = [
  ['נא לא לשלוח עד יום רביעי', 'a polite refusal'],
  ['Please let me know by Friday', 'let me know is not a thing'],
  ["I'm waiting for the delivery by Friday", 'a wait for somebody else'],
  ['אני מחכה לשליח עד מחר', 'a wait for somebody else'],
  ['We are waiting for the bus until 5', 'not a day'],
  ['Need the report', 'no day'],
  ['Need the report by Wednesday?', 'question'],
  ['Could you send the report by Wednesday', 'no cue verb first'],
  ['I need the report by 2025-01-02', 'past'],
  ["I'll send the report by Wednesday", 'own promise'],
  ['He needs the report by Wednesday', 'someone else'],
  ['Maybe sign the lease by Monday', 'hedge'],
  ['I already sent the report by Wednesday', 'done'],
  ['Thanks, the report was sent by Wednesday', 'no cue'],
  ['אולי תחתום על החוזה עד יום שישי', 'hedge'],
  ['תחתום על החוזה', 'no day'],
  ['תחתום על החוזה עד יום שישי?', 'question'],
  ['תודה על הדוח עד יום שישי', 'no cue'],
  ['', 'empty'],
  ['x'.repeat(300), 'long']
];
for (const [text, why] of NO) check('not an ask (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-deadline-ask checks passed');
process.exit(failures ? 1 : 0);
