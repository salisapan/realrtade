// core/chat-reminder.js: a reminder someone asks of the person in a chat becomes a day and a thing, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-reminder-corpus.cjs
const { FlowChatReminder: R } = require('../core/chat-reminder.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ["Don't forget to bring the signed form on Monday", '2026-10-26', /signed form/],
  ['Please remember to pay the deposit by Friday', '2026-10-30', /deposit/],
  ['Remember to send the invoice tomorrow', '2026-10-24', /invoice/],
  ['Make sure you book the room on Wednesday', '2026-10-28', /room/],
  ['אל תשכח להביא את הטופס החתום ביום שני', '2026-10-26', /הטופס/],
  ['תזכור לשלוח את החשבונית מחר', '2026-10-24', /החשבונית/],
  ['שלא תשכח לשלם את המקדמה ביום חמישי', '2026-10-29', /המקדמה/],
  ['אל תשכחי להתקשר לספק היום', '2026-10-23', /לספק/]
];
for (const [text, day, what] of YES) {
  const r = R.recognize(text, NOW);
  check('reminder: ' + text, r.kind === 'reminder' && r.dateIso === day && what.test(r.what) && !/(?:Monday|ביום|tomorrow|מחר)/.test(r.what), r);
}
const NO = [
  ["Don't forget to bring the form", 'no day'],
  ["Don't forget the form on Monday", 'no cue thing'],
  ['Can you remember to bring the form on Monday?', 'question'],
  ['I forgot to send it on Monday', 'look back'],
  ["I'll remember to send it on Monday", 'own promise'],
  ['Never mind, remember to skip Monday', 'never mind'],
  ['Maybe remember to call on Friday', 'hedge'],
  ['אתמול שכחתי להביא את הטופס ביום שני', 'look back'],
  ['אל תשכח להביא את הטופס ביום שני?', 'question'],
  ['Remember to call on 2025-01-02', 'past'],
  ['Remember the good times on Monday', 'no cue'],
  ['', 'empty'],
  ['x'.repeat(300), 'long']
];
for (const [text, why] of NO) check('not a reminder (' + why + '): ' + text.slice(0, 50), R.recognize(text, NOW).kind === 'none', R.recognize(text, NOW));
check('no throw on junk', (() => { try { R.recognize(null, null); R.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-reminder checks passed');
process.exit(failures ? 1 : 0);
