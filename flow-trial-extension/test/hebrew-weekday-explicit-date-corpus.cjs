'use strict';
// Weekday name + Hebrew day-first date + clock: the numeric date wins (google-lane-http :465 class).
// English and mixed mail keep US M/D unless a Hebrew יום/ביום weekday sits beside the date.
// Run: TZ=UTC node test/hebrew-weekday-explicit-date-corpus.cjs && TZ=Asia/Jerusalem node test/hebrew-weekday-explicit-date-corpus.cjs
// CI: included in Glance headless E2E via flow-trial-extension/** paths on integration PRs.
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
const extractSrc = fs.readFileSync(path.join(ROOT, 'core', 'extract.js'), 'utf8');
vm.runInContext(extractSrc, sb, { filename: 'extract.js' });
const parseDate = vm.runInContext('FlowExtract.parseDate', sb);

function iso(text, nowIso) {
  const d = parseDate(text, new Date(nowIso));
  return d && d.iso ? d.iso : null;
}
function parsed(text, nowIso) {
  return parseDate(text, new Date(nowIso));
}

const TZ = process.env.TZ || 'UTC';
console.log('TZ', TZ);

check('day-first is scoped (hebrewWeekdayNear / preferDayFirst), not Hebrew anywhere in the mail',
  extractSrc.indexOf('hebrewWeekdayNear') >= 0 && extractSrc.indexOf('preferDayFirst') >= 0 &&
  extractSrc.indexOf('&& /[\\u0590-\\u05FF]/.test(src)) { day = a') < 0);

// Monday local: e2e builds "next Thu ≥4d" as 5/11; parser must not snap to 29/10.
check('Mon (+2) Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-26T09:00:00+02:00') === '2026-11-05');
check('Mon UTC Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-26T12:00:00Z') === '2026-11-05');

// Tuesday anchor (was missing on r4).
check('Tue (+2) Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-27T10:00:00+02:00') === '2026-11-05');

// Wednesday: same explicit date, weekday still agrees.
check('Wed (+2) Thu 5/11 14:00 is 5 November', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-28T10:00:00+02:00') === '2026-11-05');

// Midnight boundary: 25/10 23:30Z is still Mon in +2 and must read 5/11 as Nov 5.
check('Sun 25/10 23:30Z Thu 5/11 14:00 is 5 November (UTC)', iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-25T23:30:00Z') === '2026-11-05');
check('Sun 25/10 23:30Z Thu 5/11 14:00 is 5 November (AJ)', TZ === 'Asia/Jerusalem'
  ? iso('פגישה ביום חמישי 5/11 בשעה 14:00', '2026-10-25T23:30:00Z') === '2026-11-05'
  : true);

// Thursday–Sunday window: nearest Thursday in the e2e fixture is 29/10.
check('Sun (+2) Thu 29/10 14:00 is 29 October', iso('פגישה ביום חמישי 29/10 בשעה 14:00', '2026-10-25T18:00:00+02:00') === '2026-10-29');
check('Thu (+2) Thu 29/10 14:00 is 29 October', iso('פגישה ביום חמישי 29/10 בשעה 14:00', '2026-10-29T11:00:00+02:00') === '2026-10-29');

// Mismatch stays unresolved (no silent nearest-weekday override).
check('Mon (+2) Wed name with 5/11 has no iso', iso('פגישה ביום רביעי 5/11 בשעה 14:00', '2026-10-26T09:00:00+02:00') === null);

// Mon name vs Thu 5/11: ask which date (documented behavior change from base silent 11-05).
{
  const d = parsed('יום שני 5/11 14:00', '2026-10-26T09:00:00+02:00');
  check('Mon name vs Thu 5/11 asks instead of picking 11-05',
    d && d.iso == null && d.contradictsWeekday === true && Array.isArray(d.choices) && d.choices.length === 2, d);
}

// No clock: Hebrew Thu + 5/11 on Monday is still 5 November (not next-Thursday 29/10).
check('Mon (+2) Thu 5/11 with no clock is 5 November', iso('ביום חמישי 5/11', '2026-10-26T09:00:00+02:00') === '2026-11-05');

// Pins #241 heDayFirst: Hebrew letter within ±48 of the slash plus meeting context,
// without a weekday name beside the date (would fail if day-first required hebrewWeekdayNear only).
check('Hebrew within ±48 of 01/11 with meeting word is 1 November',
  iso('פגישה 01/11 בשעה 11:00', '2026-10-25T11:00:00+02:00') === '2026-11-01');

// English / mixed: US M/D must survive (kills always-day-first mutant).
check('English US Fri 12/4 is 4 December', iso('Call on Friday 12/4 at 10:00', '2026-12-01T12:00:00Z') === '2026-12-04');
check('mixed subject keeps US 12/4', iso('Re: הצעה – Call on Friday 12/4 at 10:00', '2026-12-01T12:00:00Z') === '2026-12-04');
check('mixed trailing שלום keeps US 12/4', iso('Call on Friday 12/4 at 10:00 — שלום', '2026-12-01T12:00:00Z') === '2026-12-04');
check('English Thu 11/5 with Hebrew parens stays unresolved like base', iso('Thursday 11/5 at 14:00 (שלום)', '2026-11-01T12:00:00Z') === null);

console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
