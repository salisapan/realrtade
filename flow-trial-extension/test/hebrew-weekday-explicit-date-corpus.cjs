'use strict';
// Weekday name + Hebrew day-first date + clock: the numeric date wins (google-lane-http :465 class).
// Run: TZ=UTC node test/hebrew-weekday-explicit-date-corpus.cjs && TZ=Asia/Jerusalem node test/hebrew-weekday-explicit-date-corpus.cjs
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
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', 'extract.js'), 'utf8'), sb, { filename: 'extract.js' });
const parseDate = vm.runInContext('FlowExtract.parseDate', sb);

function iso(text, nowIso) {
  const d = parseDate(text, new Date(nowIso));
  return d && d.iso ? d.iso : null;
}

const TZ = process.env.TZ || 'UTC';
console.log('TZ', TZ);

// Monday local: e2e builds "next Thu ≥4d" as 5/11; parser must not snap to 29/10.
check('Mon (+2) Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-26T09:00:00+02:00') === '2026-11-05');
check('Mon UTC Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-26T12:00:00Z') === '2026-11-05');

// Wednesday: same explicit date, weekday still agrees.
check('Wed (+2) Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-28T10:00:00+02:00') === '2026-11-05');

// Thursday–Sunday window: nearest Thursday in the e2e fixture is 29/10.
check('Sun (+2) Thu 29/10 14:00 is 29 October', iso('פגישה ביום חמישי 29/10 בשעה 14:00', '2026-10-25T18:00:00+02:00') === '2026-10-29');
check('Thu (+2) Thu 29/10 14:00 is 29 October', iso('פגישה ביום חמישי 29/10 בשעה 14:00', '2026-10-29T11:00:00+02:00') === '2026-10-29');

// Mismatch stays unresolved (no silent nearest-weekday override).
check('Mon (+2) Wed name with 5/11 has no iso', iso('פגישה ביום רביעי 5/11 בשעה 14:00', '2026-10-26T09:00:00+02:00') === null);

console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
