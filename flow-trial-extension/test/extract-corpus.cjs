// extract.js corpus — the cases where the engine could state something WRONG.
//
// Every other test file here asks "does it notice the right things". This one
// asks the harder question: when it speaks, is what it says true? A missed
// email costs the user nothing; a calendar event on the wrong day, or a figure
// off by six orders of magnitude, costs them trust they do not give back.
//
// Each block below started as a real defect found in this file's own logic, so
// each one is a regression guard, not a hypothetical.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'extract.js'), 'utf8'), sandbox);
const FlowExtract = vm.runInContext('FlowExtract', sandbox);

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log('PASS: ' + label); return; }
  failures++;
  console.log('FAIL: ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
}
const NOW = new Date('2026-09-18T10:00:00Z');
const money = (t) => { const r = FlowExtract.parseMoney(t); return r ? r.value : null; };
const dateOf = (t, now) => FlowExtract.parseDate(t, now || NOW);

console.log('\n--- extract.js: a magnitude suffix must be a whole word ---\n');
{
  // Written as a bare (k|m)?, the suffix matched the first letter of the NEXT
  // word: "$20 monthly" parsed as $20,000,000. Per-seat pricing is written
  // this way constantly, so this was a routine six-orders-of-magnitude error.
  check('"$20 monthly per seat" is twenty dollars', money('$20 monthly per seat') === 20, money('$20 monthly per seat'));
  check('"$12 minimum" is twelve dollars', money('$12 minimum') === 12, money('$12 minimum'));
  check('"$30 max" is thirty dollars', money('$30 max') === 30, money('$30 max'));
  check('"$50 kits" is fifty dollars', money('$50 kits') === 50, money('$50 kits'));
  check('"$8 km" is eight dollars', money('$8 km') === 8, money('$8 km'));
  // ...while the real suffixes must still work, including the ones reached
  // only by backtracking past the single-letter alternative.
  check('"$5m" is five million', money('$5m') === 5e6, money('$5m'));
  check('"$5 million" is five million', money('$5 million') === 5e6, money('$5 million'));
  check('"$5k" is five thousand', money('$5k') === 5e3, money('$5k'));
  check('"$2 billion" is two billion', money('a $2 billion fund') === 2e9, money('a $2 billion fund'));
  check('Hebrew "15 אלף שקלים" is fifteen thousand', money('15 אלף שקלים') === 15e3, money('15 אלף שקלים'));
  check('a plain figure is untouched', money('$3,900/mo for the 14th floor') === 3900, money('$3,900/mo for the 14th floor'));
}

console.log('\n--- extract.js: a bare month/day must survive New Year ---\n');
{
  // Assuming the current year put "we signed on December 28", read on 5 Jan,
  // eleven months into the FUTURE. The heaviest email weeks of the year sit
  // either side of this boundary.
  const jan = new Date('2027-01-05T10:00:00Z');
  check('"December 28" read on 5 Jan 2027 is last December',
    dateOf('We signed on December 28.', jan).iso === '2026-12-28', dateOf('We signed on December 28.', jan));
  const dec = new Date('2026-12-30T10:00:00Z');
  check('"January 4" read on 30 Dec 2026 is next January',
    dateOf('Kickoff January 4.', dec).iso === '2027-01-04', dateOf('Kickoff January 4.', dec));
  check('a near-future day in the same year still resolves',
    dateOf('on October 5').iso === '2026-10-05', dateOf('on October 5'));
  check('a recent past day in the same year still resolves',
    dateOf('we agreed September 1').iso === '2026-09-01', dateOf('we agreed September 1'));
}

console.log('\n--- extract.js: genuinely ambiguous years are still refused ---\n');
{
  // The fix above must not become an excuse to guess. Half a year out in
  // either direction, the message really did not say which year it meant.
  const r = dateOf('the March 3 kickoff');
  check('"March 3" in September is flagged ambiguous', r && r.ambiguousYear === true, r);
  check('...and emits no ISO date', r && r.iso === null, r);
  check('...but keeps the words the sender actually wrote', r && /March 3/.test(r.raw), r);
}

console.log('\n--- extract.js: a day the calendar does not have is not a date ---\n');
{
  // new Date(y, m, d) rolls silently: February 30 becomes March 2. That put a
  // real-looking ISO date on a day nobody wrote.
  check('"February 30" is not a date', dateOf('Closing on February 30.', new Date('2026-02-15T10:00:00Z')) === null);
  check('"April 31" is not a date', dateOf('Due April 31.', new Date('2026-04-02T10:00:00Z')) === null);
  check('"June 31" is not a date', dateOf('Kickoff June 31.', new Date('2026-06-02T10:00:00Z')) === null);
  check('29 February in a leap year IS a date', dateOf('February 29, 2028').iso === '2028-02-29', dateOf('February 29, 2028'));
  check('29 February in a common year is not', dateOf('February 29, 2027') === null, dateOf('February 29, 2027'));
}

console.log('\n--- extract.js: ISO-shaped is not the same as ISO-valid ---\n');
{
  // Reference and order codes in invoice mail take this shape all the time.
  check('"2026-13-45" is rejected', dateOf('ref 2026-13-45') === null, dateOf('ref 2026-13-45'));
  check('"2026-00-00" is rejected', dateOf('order 2026-00-00') === null, dateOf('order 2026-00-00'));
  check('"2026-02-30" is rejected', dateOf('dated 2026-02-30') === null, dateOf('dated 2026-02-30'));
  check('a real ISO date is accepted', dateOf('on 2026-10-02').iso === '2026-10-02', dateOf('on 2026-10-02'));
}

console.log('\n--- extract.js: an hour that could be either half of the day ---\n');
{
  // "let's meet at 3" means 15:00 in a work email essentially always, and
  // logging 03:00 puts the meeting in the middle of the night. We cannot know,
  // so we decline — the same rule the ambiguous year follows.
  check('"at 3" is refused', FlowExtract.parseTime('meet at 3') === null, FlowExtract.parseTime('meet at 3'));
  check('"at 5" is refused', FlowExtract.parseTime('call at 5') === null);
  check('"at 12" is refused (noon or midnight)', FlowExtract.parseTime('at 12') === null);
  check('"at 3pm" resolves to 15:00', FlowExtract.parseTime('at 3pm').hour === 15);
  check('"at 9" resolves to 09:00', FlowExtract.parseTime('at 9').hour === 9);
  check('"at 15:00" resolves to 15:00', FlowExtract.parseTime('at 15:00').hour === 15);
  check('"at 9:30" keeps its minutes', FlowExtract.parseTime('at 9:30').minute === 30);
}

console.log('\n--- extract.js: "next <weekday>" and Hebrew "יום X הבא" are not this week ---\n');
{
  // NOW is Friday 2026-09-18. "next Friday" with no "on" in front used to
  // parse as no date at all, so "a call next Friday at 3pm" stayed silent.
  // Hebrew "הבא" was matched against a string that ended at the weekday,
  // so "ביום שני הבא" landed on this Monday.
  check('"next Friday" with no introducer is the Friday after this one',
    dateOf('Let us do a call next Friday at 3pm.').iso === '2026-09-25', dateOf('Let us do a call next Friday at 3pm.'));
  check('"on next Friday" stays the same week-ahead date',
    dateOf('on next Friday').iso === '2026-09-25', dateOf('on next Friday'));
  check('Hebrew "ביום שני" from a Friday is the coming Monday',
    dateOf('פגישה ביום שני בשעה 15:00').iso === '2026-09-21', dateOf('פגישה ביום שני בשעה 15:00'));
  check('Hebrew "ביום שני הבא" is the Monday after that',
    dateOf('פגישה ביום שני הבא בשעה 15:00').iso === '2026-09-28', dateOf('פגישה ביום שני הבא בשעה 15:00'));
  check('"הבאנו" is "we brought", not "next"',
    dateOf('ביום שני הבאנו את החוזה').iso === '2026-09-21', dateOf('ביום שני הבאנו את החוזה'));
}

console.log('\n--- extract.js: a stated today/tomorrow is a date; a guessed one is not ---\n');
{
  check('"tomorrow" is the next day', dateOf('the invoice is due tomorrow').iso === '2026-09-19', dateOf('the invoice is due tomorrow'));
  check('"meet today at" is today', dateOf('let us meet today at 3pm').iso === '2026-09-18', dateOf('let us meet today at 3pm'));
  check('"due today" is today', dateOf('the invoice is due today').iso === '2026-09-18', dateOf('the invoice is due today'));
  check('a bare "today" on a quote is not a date', dateOf('scope document today') === null, dateOf('scope document today'));
  check('"as of today" is not a date', dateOf('fully executed as of today') === null, dateOf('fully executed as of today'));
  check('"the day after tomorrow" is two days out',
    dateOf('call the day after tomorrow').iso === '2026-09-20', dateOf('call the day after tomorrow'));
  check('Hebrew "מחר" is tomorrow', dateOf('שיחה מחר בשעה 15:00').iso === '2026-09-19', dateOf('שיחה מחר בשעה 15:00'));
  check('Hebrew "מחרתיים" is not clipped to "מחר"', dateOf('פגישה מחרתיים').iso === '2026-09-20', dateOf('פגישה מחרתיים'));
  check('Hebrew "פגישה היום" is today', dateOf('פגישה היום בשעה 10:00').iso === '2026-09-18', dateOf('פגישה היום בשעה 10:00'));
  check('a bare Hebrew "היום" is not a date', dateOf('המסמך המצורף היום') === null, dateOf('המסמך המצורף היום'));
  check('Hebrew "למחר" is still tomorrow', dateOf('נתאם למחר').iso === '2026-09-19', dateOf('נתאם למחר'));
  check('an explicit weekday still wins over "tomorrow" later in the line',
    dateOf('on Monday, or tomorrow if needed').iso === '2026-09-21', dateOf('on Monday, or tomorrow if needed'));
}

console.log('\n--- extract.js: Hebrew day-and-month uses the same year window ---\n');
{
  check('"21 בספטמבר" in September resolves',
    dateOf('פגישה ב-21 בספטמבר בשעה 15:00').iso === '2026-09-21', dateOf('פגישה ב-21 בספטמבר בשעה 15:00'));
  check('"7 בספטמבר" eleven days ago still resolves',
    dateOf('בתוקף מ-7 בספטמבר').iso === '2026-09-07', dateOf('בתוקף מ-7 בספטמבר'));
  check('an explicit Hebrew year is taken literally',
    dateOf('21 בספטמבר 2026').iso === '2026-09-21', dateOf('21 בספטמבר 2026'));
  const march = dateOf('7 במרץ');
  check('"7 במרץ" in September does not invent a year', march && march.iso === null && march.ambiguousYear === true, march);
  check('"31 בספטמבר" is not a date', dateOf('31 בספטמבר') === null, dateOf('31 בספטמבר'));
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
