// A repeating commitment becomes ONE repeating Microsoft To Do task through the existing
// To Do card, behind the owner's switch RECURRING_TODO (off). Checks the rule mapping, the
// recognition silences, the read-back comparison, that a repeat rule is part of what Undo
// protects (a person changing the day is an edit), and the service worker wiring with stubs.
// Run: node test/todo-recurrence-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowRecurringReminder } = require('../core/recurring-reminder.js');
globalThis.FlowRecurringReminder = FlowRecurringReminder;
const { FlowTodoRecurrence: R } = require('../core/todo-recurrence.js');
const { FlowNativeEdit: N } = require('../src/native-edit.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { RECURRING_TODO: true };
const TODAY = '2026-10-21'; // a Wednesday

console.log('\n--- the rule and the first date ---\n');
const yes = [
  ['Please send the sales report every Monday at 9:00.', 'weekly', ['monday'], '2026-10-26'],
  ['Can you send the VAT summary on the 15th of each month at 10:00?', 'absoluteMonthly', null, '2026-11-15'],
  ['We need to update the stock sheet every weekday at 8:30.', 'weekly', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], '2026-10-22'],
  ['Please back up the shared drive every day at 22:00.', 'daily', null, null],
  ['בבקשה תעביר את דוח המכירות כל יום שני ב-9:00', 'weekly', ['monday'], '2026-10-26']
];
for (const [text, type, days, start] of yes) {
  const p = R.plan({ flags: ON, text, todayIso: TODAY });
  const ok = p && p.recurrence.pattern.type === type && (!days || JSON.stringify(p.recurrence.pattern.daysOfWeek) === JSON.stringify(days)) && (!start || p.dueIso === start) && p.recurrence.range.type === 'noEnd' && p.recurrence.range.startDate === p.dueIso;
  check('repeats: ' + text, !!ok, p);
}
check('the 15th maps to day of month 15', R.plan({ flags: ON, text: yes[1][0], todayIso: TODAY }).recurrence.pattern.dayOfMonth === 15);
check('the clock is kept for the reminder', R.plan({ flags: ON, text: yes[0][0], todayIso: TODAY }).hour === 9);

console.log('\n--- silence ---\n');
const no = [
  'Please send the report every other Monday at 9:00.',
  'Please send the report every Monday and every Thursday at 9:00.',
  'Maybe send the report every Monday at 9:00 if you want.',
  'Ask Dana to send the report every Monday at 9:00.',
  'No need to send the report every Monday at 9:00.',
  'Please send the report every Monday.',
  'FYI I used to send the report every Monday at 9:00.',
  'Please send the report tomorrow at 9:00.',
  'אולי תעביר את הדוח כל יום שני ב-9:00'
];
no.forEach((t) => check('one-off or unsure stays a plain task: ' + t, R.plan({ flags: ON, text: t, todayIso: TODAY }) === null));
check('switch off: never', R.plan({ text: yes[0][0], todayIso: TODAY }) === null && R.plan({ flags: { RECURRING_TODO: false }, text: yes[0][0], todayIso: TODAY }) === null && R.SWITCH_DEFAULT === false);
check('a rule it cannot map is null', R.fromRrule('RRULE:FREQ=YEARLY', TODAY) === null && R.fromRrule('RRULE:FREQ=MONTHLY;BYMONTHDAY=31', TODAY) === null && R.fromRrule('RRULE:FREQ=DAILY', 'nope') === null);

console.log('\n--- the read-back ---\n');
const want = R.plan({ flags: ON, text: yes[0][0], todayIso: TODAY }).recurrence;
const graphSpelling = { pattern: { type: 'weekly', interval: 1, month: 0, dayOfMonth: 0, daysOfWeek: ['Monday'], firstDayOfWeek: 'sunday', index: 'first' }, range: { type: 'noEnd', startDate: '2026-10-26', endDate: '0001-01-01', recurrenceTimeZone: 'Israel Standard Time', numberOfOccurrences: 0 } };
check('Graph\'s fuller spelling of the same rule agrees', R.agrees(want, graphSpelling));
check('another weekday does not', R.agrees(want, Object.assign({}, graphSpelling, { pattern: Object.assign({}, graphSpelling.pattern, { daysOfWeek: ['tuesday'] }) })) === false);
check('another first date does not', R.agrees(want, Object.assign({}, graphSpelling, { range: Object.assign({}, graphSpelling.range, { startDate: '2026-11-02' }) })) === false);
check('no recurrence on the read-back does not', R.agrees(want, null) === false && R.agrees(want, {}) === false);

console.log('\n--- Undo protects the repeat rule ---\n');
const task = (rec, title) => ({ title: title || 'send the sales report', body: { contentType: 'text', content: 'Open in Outlook' }, dueDateTime: { dateTime: '2026-10-26T00:00:00.0000000', timeZone: 'UTC' }, status: 'notStarted', recurrence: rec });
const snap = N.snapshotOf(task(graphSpelling));
check('the rule is in the snapshot', typeof snap.recurrence === 'string' && /weekly/.test(snap.recurrence), snap);
check('the same task read again matches', N.compareContent(snap, task(graphSpelling)) === 'match');
check('another spelling of the same rule is not an edit', N.compareContent(snap, task({ pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'] }, range: { type: 'noEnd', startDate: '2026-10-26' } })) === 'match');
check('the person moves it to Tuesday: an edit', N.compareContent(snap, task(Object.assign({}, graphSpelling, { pattern: Object.assign({}, graphSpelling.pattern, { daysOfWeek: ['tuesday'] }) }))) === 'edited');
check('the person removes the repeat: an edit', N.compareContent(snap, task(null)) === 'edited');
const plain = N.snapshotOf(task(null));
check('a one-off task is unchanged by this (recurrence null stays null)', N.compareContent(plain, task(null)) === 'match' && plain.recurrence === undefined || plain.recurrence === null);
check('the person adds a repeat to a one-off: not claimed as an edit, Undo asks to confirm', N.compareContent(plain, task(graphSpelling)) === 'unconfirmed');

console.log('\n--- the service worker, with stubs ---\n');
const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
function fn(name) {
  const start = bg.indexOf('function ' + name + '(');
  let a = start;
  if (bg.slice(start - 6, start) === 'async ') a = start - 6;
  let depth = 0, i = bg.indexOf('{', start);
  for (; i < bg.length; i++) {
    if (bg[i] === '{') depth++;
    else if (bg[i] === '}') { depth--; if (depth === 0) break; }
  }
  return bg.slice(a, i + 1);
}
function sandbox(switches) {
  const ctx = {
    chrome: { storage: { local: { get: async () => ({ glanceSwitches: switches || {} }) } } },
    FlowTodoRecurrence: R
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn('glanceSwitchOn') + '\n' + fn('outlookRecurrenceFor') + '\n' + fn('outlookTodoAgrees') + '\nthis.glanceSwitchOn = glanceSwitchOn; this.outlookRecurrenceFor = outlookRecurrenceFor; this.outlookTodoAgrees = outlookTodoAgrees; function outlookClockKey(v){ return v && v.dateTime ? String(v.dateTime).slice(0,16) : ""; } function outlookZoneKey(z){ return String(z||"").toLowerCase(); }', ctx);
  return ctx;
}
(async () => {
  let s = sandbox({});
  check('switch missing: a plain task', (await s.outlookRecurrenceFor(yes[0][0])) === null);
  s = sandbox({ RECURRING_TODO: false });
  check('switch false: a plain task', (await s.outlookRecurrenceFor(yes[0][0])) === null);
  s = sandbox({ RECURRING_TODO: true });
  const got = await s.outlookRecurrenceFor(yes[0][0]);
  check('switch on and one rule and one clock: a repeat', got && got.recurrence.pattern.type === 'weekly', got);
  check('switch on but a one-off: a plain task', (await s.outlookRecurrenceFor('Please send the report tomorrow at 9:00.')) === null && (await s.outlookRecurrenceFor('')) === null);
  const sent = { title: 'send the sales report', dueDateTime: { dateTime: '2026-10-26T00:00:00.0000000', timeZone: 'UTC' }, recurrence: want };
  check('a task read back with the same rule agrees', s.outlookTodoAgrees(sent, { title: 'send the sales report', dueDateTime: sent.dueDateTime, recurrence: graphSpelling }) === true);
  check('a task read back without the rule does not: no Handled', s.outlookTodoAgrees(sent, { title: 'send the sales report', dueDateTime: sent.dueDateTime, recurrence: null }) === false);
  check('a one-off sent agrees as before, whatever the read back says about repeats', s.outlookTodoAgrees({ title: 'x' }, { title: 'x', recurrence: null }) === true);

  const w = fn('outlookTaskWrite');
  check('the repeat fields are set only when the plan exists', /const rec = await outlookRecurrenceFor\(p && p\.text\);\s*if \(rec\) \{\s*body\.recurrence = rec\.recurrence;/.test(w));
  check('the first occurrence is the due date and the reminder is at the clock', /body\.dueDateTime = \{ dateTime: rec\.dueIso/.test(w) && /body\.reminderDateTime/.test(w));
  check('the receipt says it repeats only when it does', /\(rec \? ' · repeats' : ''\)/.test(w));
  check('nothing is sent and no new scope: the To Do list URL only', !/sendMail|Mail\.Send/.test(w) && /\/me\/todo\/lists\//.test(w));
  check('switch default off, stored with the other switches', R.SWITCH === 'RECURRING_TODO' && /glanceSwitches/.test(bg));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
