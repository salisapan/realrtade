// A repeat on the live Gmail Hold It, behind the owner's switch RECURRING_HOLD (off).
// The hold is written and proved by core/google-calendar.js unchanged; the repeat rule rides the
// same create. Checks: the rule is taken only when the mail states one rule and the hold's own
// date is an occurrence of it; the create carries that rule and no guest; a master event that does
// not carry exactly the rule is deleted and nothing is claimed; Meet and the repeat compose; Undo is
// the hold's own; the worker wiring is switch-gated and the manifest is not touched.
// Run: node test/recurring-hold-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const EXT = path.join(__dirname, '..');
const sandbox = { module: undefined, console, Date, setTimeout, Promise, Intl };
vm.createContext(sandbox);
for (const f of ['proof-of-close.js', 'google-config.js', 'google-calendar.js', 'meet-link.js', 'recurring-reminder.js']) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const R = vm.runInContext('FlowRecurringReminder', sandbox);
const M = vm.runInContext('FlowMeetLink', sandbox);
const Cal = vm.runInContext('FlowGoogleCalendar', sandbox);
const Cfg = vm.runInContext('FlowGoogleConfig', sandbox);

console.log('\n--- when a hold becomes a series ---\n');
const yes = [
  ['Weekly sync every Tuesday at 10:00, can you hold it?', '2026-10-27', 'RRULE:FREQ=WEEKLY;BYDAY=TU'],
  ['Standup every weekday at 9:30 please', '2026-10-22', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ['Invoice review on the 15th of each month at 10:00', '2026-11-15', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15'],
  ['Team call every day at 8:00', '2026-10-22', 'RRULE:FREQ=DAILY'],
  ['סנכרון צוות כל יום שלישי ב-10:00', '2026-10-27', 'RRULE:FREQ=WEEKLY;BYDAY=TU']
];
for (const [text, date, rule] of yes) check('a series: ' + text, R.seriesFor(text, date) === rule, R.seriesFor(text, date));
const no = [
  ['Weekly sync every Tuesday at 10:00', '2026-10-28', 'the hold date is a Wednesday, not a Tuesday'],
  ['Standup every weekday at 9:30', '2026-10-24', 'the hold date is a Saturday'],
  ['Invoice review on the 15th of each month at 10:00', '2026-11-16', 'the hold date is the 16th'],
  ['Sync every other Tuesday at 10:00', '2026-10-27', 'every other is not built'],
  ['Sync every Tuesday and Thursday at 10:00', '2026-10-27', 'two rules'],
  ['Maybe sync every Tuesday at 10:00 if you want', '2026-10-27', 'a hedge'],
  ['We used to sync every Tuesday at 10:00', '2026-10-27', 'a past habit'],
  ['Ask Dana to hold the sync every Tuesday at 10:00', '2026-10-27', 'a third party'],
  ['Sync on Tuesday at 10:00', '2026-10-27', 'no repeat stated'],
  ['', '2026-10-27', 'no text']
];
for (const [text, date, why] of no) check('stays a single event (' + why + ')', R.seriesFor(text, date) === '', R.seriesFor(text, date));
check('no date: stays single', R.seriesFor(yes[0][0], '') === '');

function makeApi(opts) {
  opts = opts || {};
  const log = [];
  const events = {};
  const http = async (req) => {
    log.push({ method: req.method, url: req.url, json: req.json });
    const u = String(req.url);
    if (req.method === 'POST') {
      const body = req.json || JSON.parse(req.body);
      events.E1 = Object.assign({ id: 'E1', status: 'confirmed', htmlLink: 'https://calendar.google.com/event?eid=E1', organizer: { email: 'me@gmail.com' } }, body);
      if (opts.dropRule) delete events.E1.recurrence;
      if (opts.otherRule) events.E1.recurrence = ['RRULE:FREQ=DAILY'];
      events.E1._conf = body.conferenceData;
      delete events.E1.conferenceData;
      return { status: 200, ok: true, json: { id: 'E1', htmlLink: events.E1.htmlLink } };
    }
    const id = decodeURIComponent((u.split('/events/')[1] || '').split('?')[0]);
    if (req.method === 'GET') {
      const e = events[id];
      if (!e) return { status: 404, ok: false, json: null };
      const copy = JSON.parse(JSON.stringify(e));
      delete copy._conf;
      if (e._conf && u.indexOf('conferenceDataVersion=1') >= 0) {
        copy.hangoutLink = 'https://meet.google.com/abc-defg-hij';
        copy.conferenceData = { createRequest: { status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: copy.hangoutLink }] };
      }
      return { status: 200, ok: true, json: copy };
    }
    if (req.method === 'DELETE') {
      if (opts.deleteFails) return { status: 500, ok: false, json: null };
      delete events[id];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  };
  return { http, log, events };
}
const input = { scopes: Cfg.SCOPES, dateIso: '2026-10-27', hour: 10, minute: 0, title: 'Weekly sync', timeZone: 'Asia/Jerusalem', quote: yes[0][0], sleep: async () => {}, meetDelays: [0, 0] };
const CLOCK = new Date('2026-10-21T08:00:00Z');
const RULE = 'RRULE:FREQ=WEEKLY;BYDAY=TU';

(async () => {
  console.log('\n--- the live hold as a series ---\n');
  let api = makeApi();
  let r = await Cal.write(input, R.withRecurrence(api.http, RULE), CLOCK);
  const post = api.log.find((l) => l.method === 'POST');
  check('the create carries the rule, no guest, no email', post.json.recurrence[0] === RULE && post.json.attendees.length === 0 && post.url.indexOf('sendUpdates=none') >= 0, post);
  r = await R.confirmSeries(r, RULE, api.http);
  check('Handled: the hold proof stands and the master carries exactly the rule', r.ok === true && r.proof.fetchedBack === true && r.recurrence === RULE && /weekly$/.test(r.written), r);
  check('only Calendar is called', api.log.every((l) => /\/calendar\/v3\/calendars\/primary\/events/.test(l.url)));

  api = makeApi({ dropRule: true });
  r = await R.confirmSeries(await Cal.write(input, R.withRecurrence(api.http, RULE), CLOCK), RULE, api.http);
  check('the master has no rule: deleted, no Handled', r.ok === false && r.reason === 'series-failed' && r.removed === true && !api.events.E1, r);
  api = makeApi({ otherRule: true });
  r = await R.confirmSeries(await Cal.write(input, R.withRecurrence(api.http, RULE), CLOCK), RULE, api.http);
  check('another rule on the master: deleted, no Handled', r.ok === false && r.reason === 'series-failed' && !api.events.E1, r);
  api = makeApi({ dropRule: true, deleteFails: true });
  r = await R.confirmSeries(await Cal.write(input, R.withRecurrence(api.http, RULE), CLOCK), RULE, api.http);
  check('delete fails too: the ref is kept so Undo can remove it', r.ok === false && r.removed === false && r.ref && r.ref.eventId === 'E1', r);
  const failed = await R.confirmSeries({ ok: false, reason: 'unclear' }, RULE, makeApi().http);
  check('a hold that did not succeed is passed through untouched', failed.ok === false && failed.reason === 'unclear');

  console.log('\n--- Meet and the repeat together ---\n');
  api = makeApi();
  const http = R.withRecurrence(api.http, RULE);
  r = await R.confirmSeries(await M.holdWithMeet(input, http, CLOCK, Cal), RULE, api.http);
  const post2 = api.log.find((l) => l.method === 'POST');
  check('one create carries both the rule and the Meet request', post2.json.recurrence[0] === RULE && post2.json.conferenceData.createRequest.conferenceSolutionKey.type === 'hangoutsMeet', post2.json);
  check('Handled needs both read-backs: link and rule', r.ok === true && r.meetUrl === 'https://meet.google.com/abc-defg-hij' && r.recurrence === RULE && /Meet/.test(r.written), r);

  console.log('\n--- Undo is the hold\'s own ---\n');
  api = makeApi();
  r = await R.confirmSeries(await Cal.write(input, R.withRecurrence(api.http, RULE), CLOCK), RULE, api.http);
  let u = await Cal.undo(r.ref, api.http);
  check('an unedited series is deleted (the master delete removes the series)', u.ok === true && !api.events.E1, u);
  api = makeApi();
  r = await R.confirmSeries(await Cal.write(input, R.withRecurrence(api.http, RULE), CLOCK), RULE, api.http);
  api.events.E1.description = 'Agenda: pricing';
  u = await Cal.undo(r.ref, api.http);
  check('a series the person edited is left alone', u.ok === false && u.reason === 'user-edited' && !!api.events.E1, u);

  console.log('\n--- the worker wiring ---\n');
  const host = fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8');
  check('the host imports the module', /import '\.\.\/core\/recurring-reminder\.js'/.test(host));
  check('the series path needs the stated rule AND the switch', /async function seriesWanted/.test(host) && /R\.seriesFor\(text, first && first\.dateIso\)/.test(host) && /laneSwitchOn\(R\.HOLD_SWITCH\)/.test(host));
  check('only the Hold It connector takes it', /connectorId !== 'googleHold' \|\| !R/.test(host));
  check('the series is confirmed after the write', /confirmSeries\(written, rule, laneHttp\)/.test(host));
  check('the switch is off by default and named', R.HOLD_SWITCH === 'RECURRING_HOLD' && /glanceSwitches/.test(host));
  const manifest = fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8');
  check('the manifest is not changed by this wiring', !/recurring-reminder|RECURRING_HOLD/.test(manifest));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
