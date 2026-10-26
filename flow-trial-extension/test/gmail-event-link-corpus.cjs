// A Meet link on an event already on the calendar, on the existing Gmail card, behind the owner's switch
// EVENT_CALL_LINK (off). Checks: the module speaks the Google lane's writer signature (an http function),
// the lane maps the connector, the worker reads the calendar only when the switch is on AND the mail asks
// for a link, the page shows a card only when the worker offers one, and the subject never steers the pick.
// The real-browser run is e2e/gmail-event-link.spec.js.
// Run: node test/gmail-event-link-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowEventCallLink: E } = require('../core/event-call-link.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const store = { E1: { id: 'E1', summary: 'Weekly sync', status: 'confirmed', organizer: { self: true }, htmlLink: 'https://calendar.google.com/event?eid=E1', start: { dateTime: '2026-10-26T10:00:00+00:00' }, end: { dateTime: '2026-10-26T11:00:00+00:00' }, attendees: [{ email: 'dana@example.com' }] } };
const calls = [];
const http = async (req) => {
  calls.push(req);
  const u = String(req.url);
  const id = decodeURIComponent((u.split('/events/')[1] || '').split('?')[0]);
  const e = store[id];
  if (!e) return { status: 404, ok: false, json: null };
  if (req.method === 'PATCH') {
    const body = JSON.parse(req.body);
    if (body.conferenceData === null) { delete e._conf; return { status: 200, ok: true, json: e }; }
    e._conf = body.conferenceData;
    return { status: 200, ok: true, json: e };
  }
  const copy = JSON.parse(JSON.stringify(e));
  delete copy._conf;
  if (e._conf) {
    copy.hangoutLink = 'https://meet.google.com/abc-defg-hij';
    copy.conferenceData = { createRequest: { status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: copy.hangoutLink }] };
  }
  return { status: 200, ok: true, json: copy };
};
(async () => {
  console.log('\n--- the Google lane writer signature ---\n');
  const r = await E.write({ flags: { EVENT_CALL_LINK: true }, event: { id: 'E1' }, now: '2026-10-21T10:00:00.000Z', readBackDelays: [0, 0] }, http);
  check('write(input, http) patches only the conference and proves the link', r.ok === true && r.proof.system === 'google/calendar' && r.meetUrl === 'https://meet.google.com/abc-defg-hij', r);
  const patch = calls.find((c) => c.method === 'PATCH');
  check('the request is the conference only, with conferenceDataVersion and sendUpdates=none', /conferenceDataVersion=1/.test(patch.url) && /sendUpdates=none/.test(patch.url) && Object.keys(JSON.parse(patch.body)).join() === 'conferenceData', patch);
  const u = await E.undo(r.ref, http);
  check('undo(ref, http) removes the link while the event is as Glance left it', u.ok === true && !store.E1._conf, u);
  const r2 = await E.write({ flags: { EVENT_CALL_LINK: true }, event: { id: 'E1' }, now: '2026-10-21T10:00:01.000Z', readBackDelays: [0, 0] }, http);
  store.E1.description = 'Agenda';
  const u2 = await E.undo(r2.ref, http);
  check('undo(ref, http) refuses after an edit and leaves the link', u2.ok === false && u2.reason === 'user-edited' && !!store.E1._conf, u2);
  check('switch off: the lane writer changes nothing', (await E.write({ flags: {}, event: { id: 'E1' } }, http)).reason === 'switch-off');

  console.log('\n--- the wiring ---\n');
  const lane = read('src', 'google-lane.js');
  const host = read('src', 'google-lane-host.js');
  const gmail = read('src', 'content-gmail.js');
  const manifest = read('manifest.json');
  check('the lane maps the connector to the module', /googleEventCallLink: 'FlowEventCallLink'/.test(lane));
  check('the host imports the module and reads the switch for the write', /import '\.\.\/core\/event-call-link\.js'/.test(host) && /\[E\.SWITCH\]: await laneSwitchOn\(E\.SWITCH\)/.test(host));
  check('the plan reads the calendar only with the switch on AND an ask for a link', /flow:google-event-link-plan/.test(host) && /if \(!\(await laneSwitchOn\(E\.SWITCH\)\)\) return \{ action: 'off'/.test(host) && /E\.recognize\(text, Date\.now\(\)\)\.kind !== 'clear'/.test(host));
  check('the calendar read goes through the lane http, which checks the account', /laneHttp\(\{ method: 'GET', url: url \}\)/.test(host));
  check('reopening verifies the event by id like a hold', /connectorId === 'googleHold' \|\| connectorId === 'googleEventCallLink'/.test(host));
  check('the page shows a card only when the worker offers one, for inbound mail on a connected Google', /inboundMail && usingGoogle && await showEventLinkChip\(/.test(gmail) && /plan\.action !== 'offer' \|\| !plan\.event/.test(gmail));
  check('the subject never steers the pick: the body only is sent', /flow:google-event-link-plan', text: c\.text/.test(gmail));
  check('only the event id and title travel with the step', /action\.kind === 'calendarCallLink'/.test(gmail) && /event: \{ id: ev\.id, summary: ev\.summary \|\| '', day: ev\.day \|\| '' \}/.test(gmail));
  check('the manifest is not changed by this wiring', !/event-call-link|EVENT_CALL_LINK/.test(manifest));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
