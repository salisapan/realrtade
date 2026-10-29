'use strict';
// The repeating reminder on the Gmail card (switch RECURRING_REMINDER, off): the lane's http signature, the
// read-back by id, Undo that leaves an edited series alone, and the wiring (worker plan message gated by the
// switch, card kind, lane connector, verify URL). In-memory Google Calendar stand-in.
// Run: node test/recurring-reminder-wiring-corpus.cjs
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
for (const f of ['proof-of-close.js', 'google-config.js', 'extract.js', 'file-attach.js', 'google-calendar.js', 'recurring-reminder.js']) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const R = vm.runInContext('FlowRecurringReminder', sandbox);
const flags = { [R.SWITCH]: true };
const TODAY = '2026-10-23'; // a Friday

function calendar(opts) {
  opts = opts || {};
  const events = {};
  const calls = [];
  async function http(req) {
    calls.push(req.method + ' ' + req.url);
    if (opts.status) return { status: opts.status, ok: false, json: null };
    const body = req.body ? JSON.parse(req.body) : null;
    let m;
    if (req.method === 'POST' && /\/calendars\/primary\/events\?sendUpdates=none$/.test(req.url)) {
      const id = 'ev' + (Object.keys(events).length + 1);
      events[id] = Object.assign({ id: id, status: 'confirmed', htmlLink: 'https://www.google.com/calendar/event?eid=' + id }, body);
      if (opts.changeRule) events[id].recurrence = ['RRULE:FREQ=DAILY'];
      return { status: 200, ok: true, json: events[id] };
    }
    if ((m = req.url.match(/\/calendars\/primary\/events\/([^/?]+)(\?.*)?$/))) {
      const ev = events[m[1]];
      if (!ev) return { status: 404, ok: false, json: null };
      if (req.method === 'GET') return { status: 200, ok: true, json: ev };
      if (req.method === 'DELETE') { delete events[m[1]]; return { status: 204, ok: true, json: null }; }
    }
    return { status: 400, ok: false, json: null };
  }
  return { http, events, calls };
}

(async () => {
  const text = 'Please send the sales report every Monday at 9:00.';
  const plan = R.plan({ flags: flags, text: text, todayIso: TODAY });
  check('plan: an offer with the one rule and the clock', plan.action === 'offer' && plan.rrule === 'RRULE:FREQ=WEEKLY;BYDAY=MO' && plan.when.hour === 9 && plan.when.minute === 0, plan);
  check('plan: the first start is the next Monday', plan.when.dateIso === '2026-10-26', plan.when);
  check('plan: the switch off stays off', R.plan({ flags: {}, text: text, todayIso: TODAY }).action === 'off');
  const he = R.plan({ flags: flags, text: 'בבקשה תשלח את דוח המכירות כל יום שני ב-9:00', todayIso: TODAY });
  check('plan: Hebrew', he.action === 'offer' && he.lang === 'he' && he.rrule === 'RRULE:FREQ=WEEKLY;BYDAY=MO', he);
  for (const t of ['Maybe send the report every Monday at 9:00', 'Please send the report every Monday', 'Ask Dana to send the report every Monday at 9:00', 'FYI we sent it every Monday at 9:00', 'Send it every other Monday at 9:00']) {
    check('quiet: ' + t, R.plan({ flags: flags, text: t, todayIso: TODAY }).action === 'silence');
  }

  const input = { flags: flags, title: plan.title, rrule: plan.rrule, when: plan.when, timeZone: 'Asia/Jerusalem' };
  const cal = calendar();
  const w = await R.write(input, cal.http);
  check('write through the lane http: ok, read back, no guest', w.ok === true && w.proof && w.proof.fetchedBack === true && w.proof.system === 'google/calendar', w);
  check('write: sendUpdates=none and one series event', cal.calls[0].indexOf('sendUpdates=none') > -1 && Object.keys(cal.events).length === 1 && cal.events.ev1.attendees.length === 0, cal.calls);
  check('write: a standing reminder does not close the ask', w.loopClosed === false);

  const u = await R.undo(w.ref, cal.http);
  check('undo: the untouched series is deleted', u.ok === true && u.undone === true && !cal.events.ev1, u);

  const cal2 = calendar();
  const w2 = await R.write(input, cal2.http);
  cal2.events.ev1.summary = cal2.events.ev1.summary + ' (mine)';
  const u2 = await R.undo(w2.ref, cal2.http);
  check('undo: an edited series is left alone', u2.ok === false && u2.reason === 'user-edited' && !!cal2.events.ev1, u2);

  const cal3 = calendar({ changeRule: true });
  const w3 = await R.write(input, cal3.http);
  check('a series read back with another rule is deleted, never Handled', w3.ok === false && w3.reason === 'verify_failed' && w3.removed === true && !cal3.events.ev1, w3);

  const w4 = await R.write(input, calendar({ status: 403 }).http);
  check('not connected: nothing claimed', w4.ok === false && w4.reason === 'not-connected' && w4.proof === null, w4);
  const w5 = await R.write(Object.assign({}, input, { flags: {} }), calendar().http);
  check('switch off: nothing is written', w5.ok === false && w5.reason === 'switch-off', w5);
  const w6 = await R.write(Object.assign({}, input, { rrule: 'RRULE:FREQ=HOURLY' }), calendar().http);
  check('an unknown rule is refused', w6.ok === false && w6.reason === 'unclear', w6);

  // Wiring.
  const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
  const host = read('src/google-lane-host.js');
  const lane = read('src/google-lane.js');
  const gm = read('src/content-gmail.js');
  check('the lane maps the connector to the module', /googleRecurringReminder: 'FlowRecurringReminder'/.test(lane));
  check('the worker answers the plan only with the switch on', /flow:google-recurring-plan[\s\S]{0,400}laneSwitchOn\(R\.SWITCH\)/.test(host));
  check('the worker builds the write input with the switch flag and the zone', /connectorId === 'googleRecurringReminder'[\s\S]{0,400}laneSwitchOn\(R\.SWITCH\)[\s\S]{0,300}timeZone/.test(host));
  check('the verify URL reads the event by id', /connectorId === 'googleRecurringReminder'\) \{\s*const id = r\.eventId/.test(host) || /googleEventCallLink' \|\| connectorId === 'googleRecurringReminder'/.test(host));
  check('the card kind, payload and lane connector exist', /kind: 'calendarRecurring'/.test(gm) && /action\.kind === 'calendarRecurring'/.test(gm) && /calendarRecurring: 'googleRecurringReminder'/.test(gm));
  check('a meeting stays the Hold It card', /c\.intent\.type === 'event'\) return false/.test(gm));
  const manifest = JSON.parse(read('manifest.json'));
  check('the manifest has no forms.body scope or forms.googleapis.com host (v1 six scopes)', manifest.oauth2.scopes.length === 6 && !manifest.oauth2.scopes.includes('https://www.googleapis.com/auth/forms.body') && manifest.host_permissions.filter((h) => /googleapis/.test(h)).length === 7 && !manifest.host_permissions.some((h) => /forms\.googleapis/.test(h)));

  console.log(failures ? failures + ' failure(s)' : 'all passed');
  process.exit(failures ? 1 : 0);
})();
