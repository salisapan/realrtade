// The Meet link on the live Gmail Hold It, behind the owner's switch MEET_LINK (off).
// The hold is written and proved by core/google-calendar.js unchanged; the link adds one
// condition to Handled: the event read back by id carries a created meet.google.com link.
// Checks: the light call check; the create carries a conference request with no guest;
// no link means the event is deleted and nothing is claimed; Undo still deletes an
// unedited event; the worker wiring is switch-gated and passes the mail text on.
// Run: node test/meet-wiring-corpus.cjs
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
for (const f of ['proof-of-close.js', 'google-config.js', 'google-calendar.js', 'meet-link.js']) {
  vm.runInContext(fs.readFileSync(path.join(EXT, 'core', f), 'utf8'), sandbox, { filename: f });
}
const M = vm.runInContext('FlowMeetLink', sandbox);
const Cal = vm.runInContext('FlowGoogleCalendar', sandbox);
const Cfg = vm.runInContext('FlowGoogleConfig', sandbox);

console.log('\n--- the light check for a call ---\n');
const yes = ['Can we do a Google Meet call tomorrow at 15:00?', "Let's hop on a video call on Thursday.", 'נעשה שיחת וידאו מחר', 'Shall we schedule an online meeting on Oct 22?'];
const no = ["Let's do a video call on Zoom tomorrow.", 'Maybe a video call sometime.', 'FYI recording of the video call.', 'Ask Dana to set up a video call.', 'No need for a video call.', 'The video call is tomorrow.', 'Lunch tomorrow at 13:00?', 'בואו נעשה שיחת וידאו בזום', 'Can we meet Thursday at 14:00?'];
yes.forEach((t) => check('asks for a call: ' + t, M.callAsked(t) === true));
no.forEach((t) => check('not a call to hold: ' + t, M.callAsked(t) === false));
check('empty is not a call', M.callAsked('') === false && M.callAsked(null) === false);

// ---- a fake Calendar API behind one http function ---------------------------
function makeApi(opts) {
  opts = opts || {};
  const log = [];
  const events = {};
  let gets = 0;
  const http = async (req) => {
    log.push({ method: req.method, url: req.url, body: req.body, json: req.json });
    const u = String(req.url);
    if (req.method === 'POST') {
      const body = req.json || JSON.parse(req.body);
      events.E1 = Object.assign({ id: 'E1', status: 'confirmed', htmlLink: 'https://calendar.google.com/event?eid=E1', organizer: { email: 'me@gmail.com' } }, body);
      delete events.E1.conferenceData;
      events.E1._conf = body.conferenceData;
      return { status: 200, ok: true, json: { id: 'E1', htmlLink: events.E1.htmlLink } };
    }
    const id = decodeURIComponent((u.split('/events/')[1] || '').split('?')[0]);
    if (req.method === 'GET') {
      const e = events[id];
      if (!e) return { status: 404, ok: false, json: null };
      gets++;
      const copy = JSON.parse(JSON.stringify(e));
      const wantsConf = u.indexOf('conferenceDataVersion=1') >= 0;
      delete copy._conf;
      if (e._conf && wantsConf && !opts.noLink && !(opts.pending && gets <= opts.pending)) {
        copy.hangoutLink = opts.link || 'https://meet.google.com/abc-defg-hij';
        copy.conferenceData = { createRequest: { status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: copy.hangoutLink }] };
      } else if (e._conf && wantsConf && opts.noLink) {
        copy.conferenceData = { createRequest: { status: { statusCode: 'failure' } } };
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
const input = { scopes: Cfg.SCOPES, dateIso: '2026-10-22', hour: 14, minute: 0, title: 'Call with Dana', timeZone: 'Asia/Jerusalem', quote: "Let's hop on a video call Thursday at 14:00", sleep: async () => {}, meetDelays: [0, 0, 0] };
const CLOCK = new Date('2026-10-21T08:00:00Z');

(async () => {
  console.log('\n--- the live hold with a Meet link ---\n');
  let api = makeApi();
  let r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  const post = api.log.find((l) => l.method === 'POST');
  check('the create carries a Meet conference request, no guest, no email', post.url.indexOf('conferenceDataVersion=1') >= 0 && post.url.indexOf('sendUpdates=none') >= 0 && post.json.conferenceData.createRequest.conferenceSolutionKey.type === 'hangoutsMeet' && post.json.attendees.length === 0, post);
  check('Handled: the hold proof stands and the link was read back by id', r.ok === true && r.proof.fetchedBack === true && r.proof.system === 'google/calendar' && r.meetUrl === 'https://meet.google.com/abc-defg-hij' && r.joinUrl === r.meetUrl, r);
  check('the receipt names the Meet', /· Meet$/.test(r.written), r.written);
  check('only Calendar is called', api.log.every((l) => /\/calendar\/v3\/calendars\/primary\/events/.test(l.url)), api.log.map((l) => l.url));

  api = makeApi({ pending: 3 });
  r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  check('a link Google has not made yet is waited for, then shown', r.ok === true && !!r.meetUrl, r);

  api = makeApi({ noLink: true });
  r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  check('Google makes no link: the event is deleted, no Handled', r.ok === false && r.reason === 'meet-link-failed' && r.removed === true && !api.events.E1, r);

  api = makeApi({ noLink: true, deleteFails: true });
  r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  check('delete fails too: the ref is kept so Undo can remove it', r.ok === false && r.removed === false && r.ref && r.ref.eventId === 'E1', r);

  api = makeApi({ link: 'https://evil.example/abc-defg-hij' });
  r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  check('a link that is not meet.google.com is not a Meet link', r.ok === false && r.reason === 'meet-link-failed', r);

  api = makeApi();
  r = await M.holdWithMeet(Object.assign({}, input, { dateIso: '2026-13-40' }), api.http, CLOCK, Cal);
  check('an impossible date is the hold\'s own refusal, nothing created', r.ok === false && !api.events.E1, r);

  console.log('\n--- Undo is the hold\'s own Undo ---\n');
  api = makeApi();
  r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  let u = await Cal.undo(r.ref, api.http);
  check('an unedited event is deleted', u.ok === true && !api.events.E1, u);
  api = makeApi();
  r = await M.holdWithMeet(input, api.http, CLOCK, Cal);
  api.events.E1.description = 'Agenda: pricing';
  u = await Cal.undo(r.ref, api.http);
  check('an event the person edited is left alone', u.ok === false && u.reason === 'user-edited' && !!api.events.E1, u);

  console.log('\n--- the worker wiring ---\n');
  const host = fs.readFileSync(path.join(EXT, 'src', 'google-lane-host.js'), 'utf8');
  const gmail = fs.readFileSync(path.join(EXT, 'src', 'content-gmail.js'), 'utf8');
  check('the host imports the module', /import '\.\.\/core\/meet-link\.js'/.test(host));
  check('the Meet path needs the call check AND the switch', /async function meetWanted/.test(host) && /M\.callAsked\(text\)/.test(host) && /laneSwitchOn\(M\.SWITCH\)/.test(host));
  check('only the Hold It connector takes the Meet path', /connectorId !== 'googleHold'/.test(host));
  check('the switch is read from the owner\'s storage object and is off when missing', /glanceSwitches/.test(host) && M.SWITCH === 'MEET_LINK' && M.SWITCH_DEFAULT === false);
  check('the Gmail card passes the mail text to the worker, capped', /params\.callText = String\(ctx\.bodyText\)\.slice\(0, 1500\)/.test(gmail));
  const manifest = fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8');
  check('no new scope or host: the manifest is not changed by this wiring', !/meet\.google\.com/.test(manifest));

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
