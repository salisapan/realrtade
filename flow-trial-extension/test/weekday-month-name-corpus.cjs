'use strict';
// A weekday written beside a month-name date must agree with it. When it does not and a clock was written, no day is booked: both dates come back as choices
// (the same rule the numeric form «Friday 20/11» already follows). Invented sentences. 21 Nov 2026 is a Saturday; 24 Nov 2026 is a Tuesday, 25 Nov a Wednesday.
// Run: TZ=UTC node test/weekday-month-name-corpus.cjs && TZ=Asia/Jerusalem node test/weekday-month-name-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const sb = { module: undefined, console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'extract.js'), 'utf8'), sb, { filename: 'extract.js' });
const parseDate = vm.runInContext('FlowExtract.parseDate', sb);
const NOW = '2026-11-21T10:00:00Z';
const read = (t) => parseDate(t, new Date(NOW));
const choiceIsos = (d) => (d && d.choices ? d.choices.map((c) => c.iso).sort() : []);

console.log('\n--- a weekday that disagrees with a month-name date books no day ---\n');
for (const t of ['Can we meet on Tuesday, November 25 at 10:00 to review the plan?', "Let's meet Tuesday 25 November at 10:00 to review the plan.", 'Shall we speak on Tuesday the 25th of November at 10:00?', 'נפגש ביום שלישי 25 בנובמבר בשעה 10:00 לעבור על התוכנית.']) {
  const d = read(t);
  check('conflict books no day: ' + t.slice(0, 40), d && d.iso === null && d.contradictsWeekday === true, d);
  check('and offers both readings: ' + t.slice(0, 40), choiceIsos(d).join() === '2026-11-24,2026-11-25', d);
}

console.log('\n--- an agreeing weekday keeps the date ---\n');
for (const t of ['Can we meet on Wednesday, November 25 at 10:00 to review the plan?', "Let's meet Wednesday 25 November at 10:00 to review the plan.", 'נפגש ביום רביעי 25 בנובמבר בשעה 10:00 לעבור על התוכנית.', 'Call on Tuesday, November 24, 2026 at 10:00.']) {
  const d = read(t);
  check('agreeing weekday keeps the date: ' + t.slice(0, 40), d && /^2026-11-2[45]$/.test(d.iso || '') && !d.contradictsWeekday, d);
}

console.log('\n--- contrast: what is not one statement stays as it was ---\n');
const noClock = read('Can we meet on Tuesday, November 25 to review the plan?');
check('no clock written: the older read stands (no new event is made from a conflict)', noClock && noClock.iso === '2026-11-25' && !noClock.contradictsWeekday, noClock);
const apart = read('Tuesday works for me. The renewal is due on November 25 at 10:00.');
check('a weekday in another sentence is not a conflict with a far date', apart && !apart.contradictsWeekday, apart);
const plain = read('The renewal is due on November 25 at 10:00.');
check('a month-name date with no weekday is read as before', plain && plain.iso === '2026-11-25', plain);

console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
