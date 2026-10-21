// A repeating commitment becomes one recurring Google Calendar reminder, behind
// RECURRING_REMINDER (off). One explicit request or commitment, one repeat rule, one clock,
// a commitment clause of at least two words. The series has no guest, is read back by id for
// title, first start and rule, and Undo deletes the whole series only while it is unedited.
// Calendar is mocked. Nothing is sent and nobody is invited.
// Run: node test/recurring-reminder-corpus.cjs
'use strict';
const { FlowRecurringReminder: R } = require('../core/recurring-reminder.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { RECURRING_REMINDER: true };
const TODAY = '2026-10-21'; // a Wednesday
const STAMP = '2026-10-21T09:05:00.000Z';

console.log('\n--- an explicit request with one repeat rule and one clock ---\n');
const yes = [
  ['Please send me the weekly sales report every Monday at 9:00.', 'send me the weekly sales report', 'RRULE:FREQ=WEEKLY;BYDAY=MO', '2026-10-26', 9, 0],
  ['Can you send the VAT summary on the 15th of each month at 10:00?', 'send the VAT summary', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15', '2026-11-15', 10, 0],
  ['Please update the pipeline sheet every weekday at 8:30', 'update the pipeline sheet', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-10-22', 8, 30],
  ['I will send the invoice to the accountant on the 1st of each month at 9:00.', 'send the invoice to the accountant', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1', '2026-11-01', 9, 0],
  ['Please back up the server every day at 23:00.', 'back up the server', 'RRULE:FREQ=DAILY', '2026-10-22', 23, 0],
  ['Could you post the team update every Friday at 16:00?', 'post the team update', 'RRULE:FREQ=WEEKLY;BYDAY=FR', '2026-10-23', 16, 0],
  ['בבקשה תשלח את דוח המכירות כל יום ראשון ב-9:00', 'תשלח את דוח המכירות', 'RRULE:FREQ=WEEKLY;BYDAY=SU', '2026-10-25', 9, 0],
  ['בבקשה תעביר את סיכום המע"מ ב-15 לחודש בשעה 10:00', 'תעביר את סיכום המע"מ', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15', '2026-11-15', 10, 0]
];
for (const [text, title, rrule, first, h, m] of yes) {
  const r = R.recognize(text, TODAY);
  check('clear: ' + text, r.kind === 'clear' && r.title === title && r.rrule === rrule && r.dateIso === first && r.hour === h && r.minute === m, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please send the report every Monday.', 'no-clock'],
  ['Please send the report every Monday and Thursday at 9:00.', 'several-rules'],
  ['Please send the report every day at 9:00 and every Friday at 16:00.', 'several-rules'],
  ['Please send the report every other Monday at 9:00.', 'other-rule'],
  ['Please send the report quarterly at 9:00.', 'other-rule'],
  ['Maybe send the report every Monday at 9:00 if you can.', 'hedge'],
  ['We used to send the report every Monday at 9:00.', 'past'],
  ['Ask Dana to send the report every Monday at 9:00.', 'third-party'],
  ['No need to send the report every Monday at 9:00 anymore.', 'negation'],
  ['Please send the report monthly at 9:00.', 'no-day-of-month'],
  ['Please send the report every week at 9:00.', 'no-weekday'],
  ['Please call every Monday at 9:00.', 'no-title'],
  ['The report goes out every Monday at 9:00.', 'no-request'],
  ['FYI the report goes out every Monday at 9:00, no action needed.', 'fyi'],
  ['Please send the report on the 31st of each month at 9:00.', 'bad-day-of-month']
];
for (const [text, why] of no) {
  const r = R.recognize(text, TODAY);
  check('silent (' + why + '): ' + text, r.kind === 'block' && r.reason === why, r);
}
for (const text of ['Please send the report on Monday at 9:00.', 'Lunch tomorrow at 13:00?']) {
  check('ignored (no repeat): ' + text, R.recognize(text, TODAY).kind === 'ignore');
}

console.log('\n--- the switch and the plan ---\n');
check('off by default', R.SWITCH_DEFAULT === false && R.plan({ text: yes[0][0], todayIso: TODAY }).action === 'off');
const p = R.plan({ flags: ON, text: yes[0][0], todayIso: TODAY });
check('one Do It; the line names the repeat and the clock', p.action === 'offer' && p.approval === 'DoIt' && /every Monday 09:00/.test(p.line) && p.when.dateIso === '2026-10-26', p);
check('the step says no guests', /no guests/.test(p.steps[0].label), p.steps);
const ph = R.plan({ flags: ON, text: yes[6][0], todayIso: TODAY });
check('Hebrew plan: Hebrew line with the weekday', /כל יום ראשון 09:00/.test(ph.line), ph);
check('a silent ask has no plan', R.plan({ flags: ON, text: no[0][0], todayIso: TODAY }).action === 'silence');

// ---- the write, mocked ---------------------------------------------------------
function makeCal(opts) {
  opts = opts || {};
  const log = [];
  const events = {};
  const api = async (method, path, body) => {
    log.push({ method, path, body });
    if (opts.auth) return { status: opts.auth, ok: false, json: null };
    if (method === 'POST') {
      if (opts.postFails) return { status: 500, ok: false, json: null };
      events.S1 = Object.assign({ id: 'S1', status: 'confirmed', htmlLink: 'https://calendar.google.com/event?eid=S1' }, JSON.parse(JSON.stringify(body)));
      return { status: 200, ok: true, json: { id: 'S1', htmlLink: events.S1.htmlLink } };
    }
    const id = decodeURIComponent(path.split('/events/')[1].split('?')[0]);
    if (method === 'GET') {
      const e = events[id];
      if (!e) return { status: 404, ok: false, json: null };
      const copy = JSON.parse(JSON.stringify(e));
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'DELETE') {
      if (opts.deleteFails) return { status: 500, ok: false, json: null };
      delete events[id];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, events };
}
const input = { flags: ON, title: p.title, rrule: p.rrule, when: p.when, timeZone: 'Asia/Jerusalem', now: STAMP };
const io = (c) => ({ calendar: c.api });

(async () => {
  console.log('\n--- Do It: create the series, read it back ---\n');
  let c = makeCal();
  let r = await R.create(input, io(c));
  const post = c.log.find((l) => l.method === 'POST');
  check('creates a repeating event with no guest, a popup at the start, no email', post.path.indexOf('sendUpdates=none') >= 0 && post.body.attendees.length === 0 && post.body.recurrence[0] === 'RRULE:FREQ=WEEKLY;BYDAY=MO' && post.body.reminders.overrides[0].minutes === 0, post);
  check('first start is the clock the person saw (Jerusalem 09:00 on Oct 26, after the clocks change on Oct 25, is 07:00Z)', post.body.start.dateTime === '2026-10-26T07:00:00Z', post.body.start);
  check('Handled needs the read-back: proof fetchedBack, system, id, hash kept', r.ok === true && r.proof.fetchedBack === true && r.proof.system === 'google/calendar' && r.proof.externalId === 'S1' && r.ref.contentHash, r);
  check('a standing reminder does not close the ask', r.loopClosed === false, r);
  check('only Calendar is called', c.log.every((l) => /^\/calendars\/primary\/events/.test(l.path)), c.log.map((l) => l.path));

  c = makeCal({ mutate: (e) => { e.summary = 'Other'; } });
  r = await R.create(input, io(c));
  check('another title on the read-back: deleted again, no Handled', r.ok === false && r.reason === 'verify_failed' && r.removed === true && !c.events.S1, r);
  c = makeCal({ mutate: (e) => { e.recurrence = ['RRULE:FREQ=DAILY']; } });
  r = await R.create(input, io(c));
  check('another rule on the read-back is not the series asked for', r.ok === false && /rule-differs/.test(r.why), r);
  c = makeCal({ mutate: (e) => { delete e.recurrence; } });
  r = await R.create(input, io(c));
  check('no rule at all on the read-back: a single event is not a series', r.ok === false && /rule-differs/.test(r.why), r);
  c = makeCal({ mutate: (e) => { e.start = { dateTime: '2026-10-27T07:00:00Z' }; } });
  r = await R.create(input, io(c));
  check('another first start is not the series asked for', r.ok === false && /time-differs/.test(r.why), r);
  c = makeCal({ mutate: (e) => { e.attendees = [{ email: 'x@example.com' }]; } });
  r = await R.create(input, io(c));
  check('a guest means an invitation could go out: not Handled', r.ok === false && /has-guests/.test(r.why), r);
  c = makeCal({ mutate: (e) => { e.summary = 'Other'; }, deleteFails: true });
  r = await R.create(input, io(c));
  check('cannot delete it either: the ref is kept for Undo', r.ok === false && r.removed === false && r.ref && r.ref.eventId === 'S1', r);
  check('not connected is said', (await R.create(input, io(makeCal({ auth: 401 })))).reason === 'not-connected');
  check('a failed write is a failed write', (await R.create(input, io(makeCal({ postFails: true })))).reason === 'write-failed');
  for (const bad of ['RRULE:FREQ=YEARLY', 'RRULE:FREQ=DAILY;COUNT=999', 'FREQ=DAILY', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31', '']) {
    c = makeCal();
    r = await R.create(Object.assign({}, input, { rrule: bad }), io(c));
    check('only the rules this module builds are written: ' + (bad || '(empty)'), r.reason === 'unclear' && c.log.length === 0, r);
  }
  c = makeCal();
  r = await R.create(Object.assign({}, input, { flags: {} }), io(c));
  check('switch off: no call', r.reason === 'switch-off' && c.log.length === 0);

  console.log('\n--- Undo never overwrites a person\'s edit ---\n');
  c = makeCal();
  r = await R.create(input, io(c));
  let u = await R.undo(r.ref, io(c));
  check('untouched: Undo deletes the whole series and the read confirms', u.ok === true && u.undone === true && !c.events.S1, u);

  c = makeCal();
  r = await R.create(input, io(c));
  c.events.S1.description = 'Include the EU numbers';
  u = await R.undo(r.ref, io(c));
  check('the person added a note: Undo unavailable, series stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && !!c.events.S1, u);

  c = makeCal();
  r = await R.create(input, io(c));
  c.events.S1.recurrence = ['RRULE:FREQ=WEEKLY;BYDAY=TU'];
  u = await R.undo(r.ref, io(c));
  check('the person moved the day: Undo leaves it', u.ok === false && u.reason === 'user-edited' && !!c.events.S1, u);

  c = makeCal();
  r = await R.create(input, io(c));
  c.events.S1.attendees = [{ email: 'dana@example.com' }];
  check('the person invited someone: Undo leaves it', (await R.undo(r.ref, io(c))).reason === 'user-edited');

  c = makeCal();
  r = await R.create(input, io(c));
  delete c.events.S1;
  check('already deleted by the person: nothing to undo', (await R.undo(r.ref, io(c))).ok === true);
  check('a ref that is not Glance\'s is refused', (await R.undo({ eventId: 'S9' }, io(makeCal()))).reason === 'not-ours');
  c = makeCal();
  r = await R.create(input, io(c));
  check('no stored hash: cannot confirm, leaves it', (await R.undo(Object.assign({}, r.ref, { contentHash: null }), io(c))).reason === 'user-edited' && !!c.events.S1);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
