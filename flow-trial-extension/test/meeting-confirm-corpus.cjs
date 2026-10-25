'use strict';
// core/meeting-confirm.js: a meeting just agreed in a short message becomes a day and a clock to hold, never anything else.
// The lines are invented and were written after the rules, not tuned to them. Run: node test/meeting-confirm-corpus.cjs
const { FlowMeetingConfirm: M } = require('../core/meeting-confirm.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date(2026, 9, 23, 10, 0, 0); // a Friday, local time like the page's clock

const YES = [
  ['מעולה, נתראה ביום חמישי ב-15:00', '2026-10-29', 15, 0],
  ['סגור, מחר ב-10:00 אצלך', '2026-10-24', 10, 0],
  ['סבבה, ביום שני ב-16:30 מתאים לי', '2026-10-26', 16, 30],
  ['נתראה מחר בשעה 9', '2026-10-24', 9, 0],
  ['קבענו, ביום רביעי ב-11:15 במשרד', '2026-10-28', 11, 15],
  ['Sounds good, see you Thursday at 3pm', '2026-10-29', 15, 0],
  ['Confirmed, tomorrow at 10:00 at my office', '2026-10-24', 10, 0],
  ['Great, Thursday 3pm works for me', '2026-10-29', 15, 0],
  ["Perfect, I'll be there Monday at 9:30am", '2026-10-26', 9, 30],
  ['Locked in: Wednesday 2:45pm', '2026-10-28', 14, 45]
];
for (const [text, iso, h, m] of YES) {
  const r = M.recognize(text, NOW);
  check('agreed meeting: ' + text, r.kind === 'confirmed' && r.dateIso === iso && r.hour === h && r.minute === m, r);
}

const NO = [
  ['מעולה, אפשר מחר ב-10:00?', 'a question'],
  ['Can we meet tomorrow at 10:00?', 'a question'],
  ['תודה על הפגישה אתמול ב-15:00', 'looks back'],
  ["Sorry, I can't make Thursday at 3pm", 'cannot'],
  ['נתראה ביום חמישי ב-15:00 אלא אם יבוטל', 'cancel'],
  ['See you tomorrow', 'no clock'],
  ['Sounds good, see you Thursday', 'no clock'],
  ['Sounds good, see you at 3pm', 'no day'],
  ['מצטער, לא אוכל ביום שני ב-16:00', 'cannot'],
  ['Maybe Thursday at 3pm', 'maybe'],
  ['The meeting was great, see you next time', 'no day'],
  ['', 'empty'],
  ['Sounds good, see you on 2025-01-02 at 3pm', 'past'],
  ['x'.repeat(300), 'long']
];
for (const [text, why] of NO) {
  const r = M.recognize(text, NOW);
  check('not an agreement (' + why + '): ' + text.slice(0, 50), r.kind === 'none', r);
}
const early = M.recognize('סגור, היום ב-08:00', NOW);
check('a clock already past today is not held', early.kind === 'none' && early.reason === 'already-past', early);
check('no throw on junk input', (() => { try { M.recognize(null, null); M.recognize(undefined, 'x'); return true; } catch (e) { return false; } })());
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll meeting-confirm checks passed');
process.exit(failures ? 1 : 0);
