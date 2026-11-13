// A repeat on the live Outlook meeting Hold It, behind the owner's switch RECURRING_HOLD
// (off, the same switch as the Gmail Hold It). One stated rule that the hold's own date fits
// makes the event the series; the series master is read back for exactly that rule or the
// event is deleted; the rule is part of what Undo protects. Stubs only; nothing is sent.
// Run: node test/recurring-hold-outlook-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowRecurringReminder } = require('../core/recurring-reminder.js');
globalThis.FlowRecurringReminder = FlowRecurringReminder;
const { FlowTodoRecurrence: T } = require('../core/todo-recurrence.js');
const { FlowNativeEdit: N } = require('../src/native-edit.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
function fn(name) {
  const start = bg.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let a = start;
  if (bg.slice(start - 6, start) === 'async ') a = start - 6;
  let depth = 0, i = bg.indexOf('{', start);
  for (; i < bg.length; i++) {
    if (bg[i] === '{') depth++;
    else if (bg[i] === '}') { depth--; if (depth === 0) break; }
  }
  return bg.slice(a, i + 1);
}
function sandbox(switches, remote) {
  const calls = [];
  const ctx = {
    OUTLOOK_GRAPH: 'https://graph.microsoft.com/v1.0',
    setTimeout: (f) => { f(); return 0; },
    Promise,
    chrome: { storage: { local: { get: async () => ({ glanceSwitches: switches || {} }) } } },
    FlowRecurringReminder, FlowTodoRecurrence: T,
    outlookAssertNotSend: (u) => { if (/\/send|sendMail/i.test(u)) throw new Error('send'); },
    outlookReadJson: async (res) => res.json(),
    outlookFetch: async (url, init) => {
      calls.push({ url, method: (init && init.method) || 'GET' });
      if (remote === 'down') return { ok: false, status: 500, json: async () => null };
      return { ok: true, status: 200, json: async () => remote };
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fn('glanceSwitchOn') + '\n' + fn('outlookSeriesWanted') + '\n' + fn('outlookSeriesRuleOk') + '\nthis.glanceSwitchOn = glanceSwitchOn; this.outlookSeriesWanted = outlookSeriesWanted; this.outlookSeriesRuleOk = outlookSeriesRuleOk;', ctx);
  return { ctx, calls };
}

(async () => {
  const ON = { RECURRING_HOLD: true };
  console.log('\n--- which holds become a series ---\n');
  let s = sandbox({});
  check('switch missing: a single event', (await s.ctx.outlookSeriesWanted('Weekly sync every Tuesday at 10:00', '2026-10-27')) === null);
  s = sandbox({ RECURRING_HOLD: false });
  check('switch false: a single event', (await s.ctx.outlookSeriesWanted('Weekly sync every Tuesday at 10:00', '2026-10-27')) === null);
  s = sandbox(ON);
  const tue = await s.ctx.outlookSeriesWanted('Please hold the weekly sync every Tuesday at 10:00.', '2026-10-27'); // a Tuesday
  check('a Tuesday hold for every Tuesday is the series', tue && tue.rrule === 'RRULE:FREQ=WEEKLY;BYDAY=TU' && tue.recurrence.pattern.type === 'weekly' && tue.recurrence.pattern.daysOfWeek[0] === 'tuesday' && tue.recurrence.range.startDate === '2026-10-27', tue);
  check('a Wednesday hold for every Tuesday stays one event', (await s.ctx.outlookSeriesWanted('Please hold the weekly sync every Tuesday at 10:00.', '2026-10-28')) === null);
  const he = await s.ctx.outlookSeriesWanted('בבקשה תשמור את הסנכרון כל יום שלישי ב-10:00', '2026-10-27');
  check('Hebrew every Tuesday works', he && he.recurrence.pattern.daysOfWeek[0] === 'tuesday', he);
  const mon = await s.ctx.outlookSeriesWanted('Hold the review on the 15th of each month at 11:00', '2026-12-15');
  check('the 15th of each month on the 15th is monthly', mon && mon.recurrence.pattern.type === 'absoluteMonthly' && mon.recurrence.pattern.dayOfMonth === 15, mon);
  const silent = ['Hold the sync every other Tuesday at 10:00', 'Maybe hold the sync every Tuesday at 10:00 if you want', 'Ask Dana to hold the sync every Tuesday at 10:00', 'No need to hold the sync every Tuesday at 10:00', 'Hold the sync tomorrow at 10:00', 'Hold the sync every Tuesday and every Thursday at 10:00'];
  for (const t of silent) check('stays one event: ' + t, (await s.ctx.outlookSeriesWanted(t, '2026-10-27')) === null);
  check('no mail text: a single event', (await s.ctx.outlookSeriesWanted('', '2026-10-27')) === null && (await s.ctx.outlookSeriesWanted('every Tuesday', '')) === null);

  console.log('\n--- the read-back of the master ---\n');
  const graphRule = { pattern: { type: 'weekly', interval: 1, month: 0, dayOfMonth: 0, daysOfWeek: ['tuesday'], firstDayOfWeek: 'sunday', index: 'first' }, range: { type: 'noEnd', startDate: '2026-10-27', endDate: '0001-01-01', recurrenceTimeZone: 'Israel Standard Time', numberOfOccurrences: 0 } };
  s = sandbox(ON, { id: 'EV1', isCancelled: false, recurrence: graphRule });
  check('the master with the same rule is ok, read by id', (await s.ctx.outlookSeriesRuleOk('EV1', tue.recurrence)) === true && /\/me\/events\/EV1\?\$select=id,recurrence/.test(s.calls[0].url), s.calls);
  s = sandbox(ON, { id: 'EV1', isCancelled: false, recurrence: null });
  check('a master with no rule is not ok: the caller deletes it', (await s.ctx.outlookSeriesRuleOk('EV1', tue.recurrence)) === false);
  s = sandbox(ON, { id: 'EV1', isCancelled: false, recurrence: Object.assign({}, graphRule, { pattern: Object.assign({}, graphRule.pattern, { daysOfWeek: ['wednesday'] }) }) });
  check('another day is not ok', (await s.ctx.outlookSeriesRuleOk('EV1', tue.recurrence)) === false);
  s = sandbox(ON, 'down');
  check('an unreadable event is not ok', (await s.ctx.outlookSeriesRuleOk('EV1', tue.recurrence)) === false && s.calls.length === 3);

  console.log('\n--- Undo protects the series rule ---\n');
  const ev = (rec) => ({ subject: 'Weekly sync', body: { contentType: 'text', content: 'Weekly sync' }, start: { dateTime: '2026-10-27T10:00:00.0000000' }, end: { dateTime: '2026-10-27T10:30:00.0000000' }, attendees: [], recurrence: rec });
  const snap = N.snapshotOf(ev(graphRule));
  check('the rule is in the event snapshot', typeof snap.recurrence === 'string' && /weekly/.test(snap.recurrence), snap);
  check('untouched: match', N.compareContent(snap, ev(graphRule)) === 'match');
  check('the person moves the series to Wednesday: an edit', N.compareContent(snap, ev(Object.assign({}, graphRule, { pattern: Object.assign({}, graphRule.pattern, { daysOfWeek: ['wednesday'] }) }))) === 'edited');
  check('the person ends the repeat: an edit', N.compareContent(snap, ev(null)) === 'edited');
  check('a single event is unchanged by this', N.compareContent(N.snapshotOf(ev(null)), ev(null)) === 'match');

  console.log('\n--- the write path, read as source ---\n');
  const w = fn('outlookMeetingWrite');
  check('the series is asked for only through the switch helper, after the invite refusal', w.indexOf("reason: 'refused'") < w.indexOf('outlookSeriesWanted(params.callText, dateIso)') && /if \(series\) body\.recurrence = series\.recurrence;/.test(w));
  check('the rule is read back before the snapshot; no match deletes the event', w.indexOf('outlookSeriesRuleOk(event.id') < w.indexOf('outlookEventRead(event.id,') && /reason: 'series-failed'/.test(w) && /method: 'DELETE'/.test(w));
  check('it composes with the Teams link and says it repeats only when it does', /isOnlineMeeting = true/.test(w) && /\(series \? ' · repeats' : ''\)/.test(w));
  check('no guest, nothing sent', /attendees\.length\) \|\| body\.isOnlineMeeting/.test(w) && !/sendMail|Mail\.Send/.test(w));
  check('the event read selects the recurrence', /OUTLOOK_EVENT_SELECT = '[^']*recurrence'/.test(bg));
  check('the page already passes the mail text only on a meeting hold', /params\.meeting === true && ctx && ctx\.bodyText\) params\.callText/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8')));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
