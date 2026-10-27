'use strict';
// A Hebrew sentence writes a date day first: 01/11 is 1 November, 05/12 is 5 December. English keeps both readings open.
// Found 2026-10-25: a headless spec that builds "פגישה <today+7> 11:00" failed on the one week where the day is 12 or less.
// Run: node test/hebrew-day-first-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const sb = { module: undefined, console };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sb, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sb);
const NOW = new Date('2026-10-25T11:00:00+02:00');
function iso(text) {
  const i = FlowIntent.classify(text, { now: NOW });
  return i && i.facts && i.facts.date && i.facts.date.iso ? i.facts.date.iso : null;
}
check('Hebrew 01/11 is 1 November', iso('פגישה 01/11 11:00 רוטשילד 12') === '2026-11-01', iso('פגישה 01/11 11:00 רוטשילד 12'));
check('Hebrew 05/12 is 5 December', iso('פגישה 05/12 11:00') === '2026-12-05', iso('פגישה 05/12 11:00'));
check('Hebrew 28/10 is still 28 October', iso('פגישה 28/10 11:00') === '2026-10-28');
check('Hebrew 15/11 is still 15 November', iso('פגישה 15/11 11:00') === '2026-11-15');
check('a past day-first date is not a date', iso('פגישה 5/6 בשעה 10:00') === null);
check('English 01/11 stays ambiguous', iso('Meeting 01/11 11:00 Rothschild 12') === null);
console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
