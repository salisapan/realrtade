// A Meet link on an event that is already on the calendar, behind EVENT_CALL_LINK (off).
// One explicit request to add a call link, exactly one event the person organizes that fits and
// has no call yet, a conference request patched with sendUpdates=none, read back by id for a
// created meet.google.com link with title, start and guests unchanged. Undo removes only the
// conference and refuses after the person changed anything else or the link. Calendar is mocked.
// Run: node test/event-call-link-corpus.cjs
'use strict';
const { FlowEventCallLink: L } = require('../core/event-call-link.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { EVENT_CALL_LINK: true };
const NOW = new Date('2026-10-21T09:00:00Z'); // a Wednesday
const STAMP = '2026-10-21T09:05:00.000Z';
const ME = { email: 'sali@example.com', self: true };
const ev = (id, summary, day, opts) => Object.assign({
  id, summary, status: 'confirmed', htmlLink: 'https://calendar.google.com/event?eid=' + id,
  start: { dateTime: day + 'T10:00:00+02:00' }, end: { dateTime: day + 'T10:30:00+02:00' },
  organizer: { email: 'sali@example.com', self: true }, attendees: [{ email: 'dana@example.com' }, Object.assign({ organizer: true }, ME)]
}, opts || {});
const CAL = [
  ev('E1', 'Weekly sync', '2026-10-22'),
  ev('E2', 'Product demo', '2026-10-28'),
  ev('E3', 'Board review', '2026-10-27'),
  ev('E4', 'ישיבת צוות', '2026-10-22', { start: { dateTime: '2026-10-22T15:00:00+02:00' }, end: { dateTime: '2026-10-22T15:30:00+02:00' } }),
  ev('E5', 'Planning meeting', '2026-10-22', { organizer: { email: 'dana@example.com' } }),
  ev('E6', 'Already online', '2026-10-23', { hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' }),
  ev('E7', 'Old kickoff', '2026-10-12'),
  ev('E8', 'Retro', '2026-10-24', { status: 'cancelled' })
];

console.log('\n--- an explicit ask for a call link, one event that fits ---\n');
const yes = [
  ['Please add a Google Meet link to the product demo on Oct 28.', 'E2'],
  ['Could you attach a video call link to the board review?', 'E3'],
  ['Can you make the board review a video call?', 'E3'],
  ['Please add a Meet link to the weekly sync on Thursday.', 'E1'],
  ['תוסיף בבקשה קישור למיט לישיבת צוות', 'E4']
];
for (const [text, id] of yes) {
  const out = L.plan({ flags: ON, text, events: CAL, now: NOW });
  check('offers the one event: ' + text, out.action === 'offer' && out.event.id === id, out);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please add a Zoom link to the product demo.', 'other-tool'],
  ['Maybe add a Meet link to the product demo if you want.', 'hedge'],
  ['No need to add a Meet link to the product demo.', 'negation'],
  ['Ask Dana to add a Meet link to the product demo.', 'third-party'],
  ['אולי תוסיף קישור למיט לישיבת צוות', 'hedge']
];
for (const [text, why] of no) {
  const r = L.recognize(text, NOW);
  check('silent (' + why + '): ' + text, r.kind === 'block' && r.reason === why, r);
}
check('a statement is ignored', L.recognize('The Meet link for the product demo is below.', NOW).kind === 'ignore');
const cases = [
  ['an event Dana organizes is never touched', 'Please add a Meet link to the planning meeting.', 'none'],
  ['an event that already has a link is not given another', 'Please add a Meet link to the already online event.', 'already-has-link'],
  ['a past event is not a candidate', 'Please add a Meet link to the old kickoff.', 'none'],
  ['a cancelled event is not a candidate', 'Please add a Meet link to the retro.', 'none'],
  ['no event fits', 'Please add a Meet link to the retreat.', 'none'],
  ['no day and no words: nothing to pick', 'Add a Meet link.', 'none'],
  ['two events on the day and neither named is a conflict', 'Please add a Meet link to the meeting on Thursday.', 'conflict']
];
for (const [name, text, why] of cases) {
  const out = L.plan({ flags: ON, text, events: CAL, now: NOW });
  check(name, out.action === 'silence' && out.reason === why, out);
}
check('a calendar that was not listed is silence', L.plan({ flags: ON, text: yes[0][0], now: NOW }).reason === 'not-searched');
check('off by default', L.SWITCH_DEFAULT === false && L.plan({ text: yes[0][0], events: CAL, now: NOW }).action === 'off');
const p = L.plan({ flags: ON, text: yes[0][0], events: CAL, now: NOW });
check('one Do It; the line names the event and its day', p.approval === 'DoIt' && p.line === 'Add a Meet link to the event: Product demo (2026-10-28)?', p);
check('Hebrew plan: Hebrew line', /^להוסיף קישור Meet לאירוע/.test(L.plan({ flags: ON, text: yes[4][0], events: CAL, now: NOW }).line));

// ---- the write, mocked ---------------------------------------------------------
function makeCal(opts) {
  opts = opts || {};
  const log = [];
  const store = { E2: JSON.parse(JSON.stringify(CAL[1])) };
  let gets = 0;
  const api = async (method, path, body) => {
    log.push({ method, path, body });
    if (opts.auth) return { status: opts.auth, ok: false, json: null };
    const id = decodeURIComponent(path.split('/events/')[1].split('?')[0]);
    const e = store[id];
    if (method === 'GET') {
      if (!e) return { status: 404, ok: false, json: null };
      gets++;
      const copy = JSON.parse(JSON.stringify(e));
      if (e._conf && !opts.noLink && !(opts.pending && gets <= opts.pending)) {
        copy.hangoutLink = opts.link || 'https://meet.google.com/abc-defg-hij';
        copy.conferenceData = { createRequest: { status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: copy.hangoutLink }] };
      } else if (e._conf && opts.noLink) {
        copy.conferenceData = { createRequest: { status: { statusCode: 'failure' } } };
      }
      delete copy._conf;
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'PATCH') {
      if (opts.patchFails) return { status: 500, ok: false, json: null };
      if (body.conferenceData === null) { delete e._conf; return { status: 200, ok: true, json: e }; }
      e._conf = body.conferenceData;
      return { status: 200, ok: true, json: e };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, store };
}
const input = { flags: ON, event: p.event, now: STAMP, readBackDelays: [0, 0, 0] };
const io = (c) => ({ calendar: c.api, sleep: async () => {} });

(async () => {
  console.log('\n--- Do It: patch only the conference, read it back ---\n');
  let c = makeCal();
  let r = await L.addLink(input, io(c));
  const patch = c.log.find((l) => l.method === 'PATCH');
  check('the patch is only a Meet conference request, with sendUpdates=none', patch.path.indexOf('conferenceDataVersion=1') >= 0 && patch.path.indexOf('sendUpdates=none') >= 0 && Object.keys(patch.body).join() === 'conferenceData' && patch.body.conferenceData.createRequest.conferenceSolutionKey.type === 'hangoutsMeet', patch);
  check('Handled: proof fetchedBack, system, id, link', r.ok === true && r.proof.fetchedBack === true && r.proof.system === 'google/calendar' && r.proof.externalId === 'E2' && r.meetUrl === 'https://meet.google.com/abc-defg-hij' && /· Meet$/.test(r.written), r);
  check('only Calendar is called and no guest was added', c.log.every((l) => /^\/calendars\/primary\/events/.test(l.path)) && c.store.E2.attendees.length === 2, c.log.map((l) => l.path));

  c = makeCal({ pending: 2 });
  r = await L.addLink(input, io(c));
  check('a link Google has not made yet is waited for', r.ok === true, r);

  c = makeCal({ noLink: true });
  r = await L.addLink(input, io(c));
  check('Google makes no link: nothing claimed, the half-made conference is taken off, the event stays', r.ok === false && r.reason === 'verify_failed' && !c.store.E2._conf && !!c.store.E2 && c.log.filter((l) => l.method === 'PATCH').length === 2, r);

  c = makeCal({ link: 'https://evil.example/abc-defg-hij' });
  r = await L.addLink(input, io(c));
  check('a link that is not meet.google.com is not claimed', r.ok === false && r.reason === 'verify_failed', r);

  c = makeCal({ mutate: (e) => { if (e.hangoutLink) e.summary = 'Other'; } });
  r = await L.addLink(input, io(c));
  check('the event changed under it: not Handled', r.ok === false && /event-changed/.test(r.why), r);

  c = makeCal();
  c.store.E2.hangoutLink = 'https://meet.google.com/zzz-yyyy-xxx';
  r = await L.addLink(input, io(c));
  check('the person added their own link since the card: never replaced', r.ok === false && r.reason === 'already-has-link' && !c.log.some((l) => l.method === 'PATCH'), r);

  c = makeCal();
  c.store.E2.organizer = { email: 'dana@example.com' };
  r = await L.addLink(input, io(c));
  check('not the person\'s event any more: no write', r.reason === 'not-yours' && !c.log.some((l) => l.method === 'PATCH'), r);

  check('not connected is said', (await L.addLink(input, io(makeCal({ auth: 401 })))).reason === 'not-connected');
  check('a failed write is a failed write', (await L.addLink(input, io(makeCal({ patchFails: true })))).reason === 'write-failed');
  c = makeCal();
  r = await L.addLink(Object.assign({}, input, { flags: {} }), io(c));
  check('switch off: no call', r.reason === 'switch-off' && c.log.length === 0);

  console.log('\n--- Undo removes only the conference, never the person\'s edit ---\n');
  c = makeCal();
  r = await L.addLink(input, io(c));
  let u = await L.undo(r.ref, io(c));
  check('untouched: Undo takes the link off and the read confirms; the event stays', u.ok === true && u.undone === true && !c.store.E2._conf && !!c.store.E2, u);

  c = makeCal();
  r = await L.addLink(input, io(c));
  c.store.E2.description = 'Agenda: pricing';
  u = await L.undo(r.ref, io(c));
  check('the person added an agenda: Undo unavailable, link stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && !!c.store.E2._conf, u);

  c = makeCal();
  r = await L.addLink(input, io(c));
  c.store.E2.attendees.push({ email: 'new@example.com' });
  check('the person invited someone: Undo leaves it', (await L.undo(r.ref, io(c))).reason === 'user-edited' && !!c.store.E2._conf);

  c = makeCal();
  r = await L.addLink(input, io(c));
  const swapped = makeCal({ link: 'https://meet.google.com/new-link-abc' });
  swapped.store.E2._conf = {};
  u = await L.undo(r.ref, io(swapped));
  check('the link is no longer the one Glance made: Undo leaves it', u.ok === false && u.reason === 'link-changed', u);

  c = makeCal();
  r = await L.addLink(input, io(c));
  u = await L.undo(Object.assign({}, r.ref, { before: null }), io(c));
  check('no stored hash: cannot confirm, leaves it', u.ok === false && u.reason === 'unconfirmed' && !!c.store.E2._conf, u);

  c = makeCal();
  r = await L.addLink(input, io(c));
  delete c.store.E2;
  check('the person deleted the event: nothing to undo', (await L.undo(r.ref, io(c))).ok === true);
  check('a ref that is not Glance\'s is refused', (await L.undo({ eventId: 'E9' }, io(makeCal()))).reason === 'not-ours');

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
