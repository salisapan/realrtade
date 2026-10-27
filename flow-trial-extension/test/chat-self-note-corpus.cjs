// core/chat-self-note.js: a reminder the person writes to themselves becomes a thing and a day, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/chat-self-note-corpus.cjs
const { FlowChatSelfNote: A } = require('../core/chat-self-note.js');
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
let failures = 0;
function check(name, ok, detail) { if (ok) console.log('PASS: ' + name); else { failures++; console.log('FAIL: ' + name + (detail ? ' ' + JSON.stringify(detail) : '')); } }
const YES = [
  ['Remind me tomorrow to pay the electricity bill', '2026-10-24', /pay the electricity bill/i],
  ['Note to self: renew the passport by Thursday', '2026-10-29', /renew the passport/i],
  ['Reminder: book the dentist on Monday', '2026-10-26', /book the dentist/i],
  ['Please remind me on Sunday to water the plants', '2026-10-25', /water the plants/i],
  ['תזכיר לי מחר לשלם חשבון חשמל', '2026-10-24', /לשלם חשבון חשמל/],
  ['לעצמי: לחדש דרכון עד יום חמישי', '2026-10-29', /לחדש דרכון/],
  ['תזכורת: להזמין תור לרופא ביום שני', '2026-10-26', /להזמין תור/],
  ['תזכירי לי ביום ראשון להשקות את הצמחים', '2026-10-25', /להשקות/]
];
for (const [text, day, what] of YES) { const r = A.recognize(text, NOW); check('note: ' + text, r.kind === 'note' && r.dateIso === day && what.test(r.what) && !/(?:tomorrow|Thursday|Monday|מחר|ביום)/i.test(r.what), r); }
const NO = [
  ['Reminder: please transfer 500 NIS to my account by Sunday', 'addressed to someone'],
  ['Reminder: you owe me 200 NIS by Sunday', 'addressed to someone'],
  ['תזכורת: תעביר לי 500 שקל עד יום ראשון', 'addressed to someone'],
  ['Remind me to pay the bill', 'no day'],
  ['Can you remind me tomorrow to pay the bill?', 'question'],
  ['Remind me tomorrow', 'no thing'],
  ['Maybe remind me tomorrow to pay the bill', 'hedge'],
  ["Don't remind me tomorrow to pay the bill", 'refusal'],
  ['I already reminded him to pay on Monday', 'no cue'],
  ['Note to self: renew the passport by 2025-01-02', 'past'],
  ['Notes from the meeting on Monday', 'no cue'],
  ['תזכיר לי', 'no day'],
  ['אל תזכיר לי מחר לשלם', 'refusal'],
  ['תזכורת: להזמין תור', 'no day'],
  ['', 'empty'],
  ['x'.repeat(300), 'long']
];
for (const [text, why] of NO) check('not a note (' + why + '): ' + text.slice(0, 50), A.recognize(text, NOW).kind === 'none', A.recognize(text, NOW));
check('no throw on junk', (() => { try { A.recognize(null, null); A.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll chat-self-note checks passed');
process.exit(failures ? 1 : 0);
