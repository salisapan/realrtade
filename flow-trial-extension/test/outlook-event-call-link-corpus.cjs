// A Teams link on an event that is already on the Outlook calendar, behind
// OUTLOOK_EVENT_CALL_LINK (off). One explicit request, exactly one event the person organizes that
// fits and is not online yet, a PATCH of isOnlineMeeting only, read back by id for a Teams join link
// with subject, start and guests unchanged. Undo turns the online meeting off, refuses after an edit
// or a changed link, and Microsoft's own join block in the body never reads as an edit. Graph is mocked.
// Run: node test/outlook-event-call-link-corpus.cjs
'use strict';
const { FlowOutlookEventCallLink: L } = require('../core/outlook-event-call-link.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ON = { OUTLOOK_EVENT_CALL_LINK: true };
const NOW = new Date('2026-10-21T09:00:00Z');
const STAMP = '2026-10-21T09:05:00.000Z';
const JOIN = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d';
const BLOCK = '<div>________________________________________________________________________________</div><div>Microsoft Teams meeting</div><div>Join: <a href="' + JOIN + '">Join the meeting now</a></div><div>Meeting ID: 123 456 789</div>';
const ev = (id, subject, day, opts) => Object.assign({
  id, subject, isOrganizer: true, isOnlineMeeting: false, isCancelled: false, webLink: 'https://outlook.office.com/calendar/item/' + id,
  start: { dateTime: day + 'T10:00:00.0000000', timeZone: 'Asia/Jerusalem' }, end: { dateTime: day + 'T10:30:00.0000000', timeZone: 'Asia/Jerusalem' },
  body: { contentType: 'text', content: subject }, attendees: [{ emailAddress: { address: 'dana@example.com' } }]
}, opts || {});
const CAL = [
  ev('E1', 'Weekly sync', '2026-10-22'),
  ev('E2', 'Product demo', '2026-10-28'),
  ev('E3', 'Board review', '2026-10-27'),
  ev('E4', 'ישיבת צוות', '2026-10-23'),
  ev('E5', 'Planning meeting', '2026-10-22', { isOrganizer: false }),
  ev('E6', 'Already online', '2026-10-24', { isOnlineMeeting: true, onlineMeeting: { joinUrl: JOIN } }),
  ev('E7', 'Old kickoff', '2026-10-12'),
  ev('E8', 'Retro', '2026-10-24', { isCancelled: true })
];

console.log('\n--- an explicit ask for a call link, one event that fits ---\n');
const yes = [
  ['Please add a Teams link to the product demo on Oct 28.', 'E2'],
  ['Could you attach a video call link to the board review?', 'E3'],
  ['Can you make the board review a Teams meeting?', 'E3'],
  ['Can you add a Teams link to the weekly sync on Thursday?', 'E1'],
  ['תוסיף בבקשה קישור לטימס לישיבת צוות', 'E4']
];
for (const [text, id] of yes) {
  const out = L.plan({ flags: ON, text, events: CAL, now: NOW });
  check('offers the one event: ' + text, out.action === 'offer' && out.event.id === id, out);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ['Please add a Teams link to the product demo if you want.', 'hedge'],
  ['No need to add a Teams link to the product demo.', 'negation'],
  ['Ask Dana to add a Teams link to the product demo.', 'third-party'],
  ['אולי תוסיף קישור לטימס לישיבת צוות', 'hedge'],
  ['Please add a Teams link to the demo, not Zoom.', 'other-tool']
];
for (const [text, why] of no) {
  const r = L.recognize(text, NOW);
  check('silent (' + why + '): ' + text, r.kind === 'block' && r.reason === why, r);
}
for (const text of ['Please add a Zoom link to the product demo.', 'Please add a Meet link to the product demo.', 'The Teams link for the product demo is below.']) {
  check('ignored: ' + text, L.recognize(text, NOW).kind === 'ignore');
}
const cases = [
  ['an event Dana organizes is never touched', 'Please add a Teams link to the planning meeting.', 'none'],
  ['an event that is already online is not given another', 'Please add a Teams link to the already online event.', 'already-has-link'],
  ['a past event is not a candidate', 'Please add a Teams link to the old kickoff.', 'none'],
  ['a cancelled event is not a candidate', 'Please add a Teams link to the retro.', 'none'],
  ['no event fits', 'Please add a Teams link to the retreat.', 'none']
];
for (const [name, text, why] of cases) {
  const out = L.plan({ flags: ON, text, events: CAL, now: NOW });
  check(name, out.action === 'silence' && out.reason === why, out);
}
check('a calendar that was not listed is silence', L.plan({ flags: ON, text: yes[0][0], now: NOW }).reason === 'not-searched');
check('off by default', L.SWITCH_DEFAULT === false && L.plan({ text: yes[0][0], events: CAL, now: NOW }).action === 'off');
const p = L.plan({ flags: ON, text: yes[0][0], events: CAL, now: NOW });
check('one Do It; the line names the event and its day', p.approval === 'DoIt' && p.line === 'Add a Teams link to the event: Product demo (2026-10-28)?', p);
check('Hebrew plan: Hebrew line', /^להוסיף קישור Teams לאירוע/.test(L.plan({ flags: ON, text: yes[4][0], events: CAL, now: NOW }).line));

// ---- the write, mocked ---------------------------------------------------------
function makeGraph(opts) {
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
      if (e.isOnlineMeeting && !(opts.pending && gets <= opts.pending) && !opts.noLink) {
        copy.onlineMeeting = { joinUrl: opts.link || JOIN };
        // Microsoft appends its join block to whatever body the person has.
        copy.body = { contentType: 'html', content: '<p>' + String(e.body.content).replace(/\n/g, '<br>') + '</p>' + BLOCK };
      }
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'PATCH') {
      if (opts.patchFails) return { status: 500, ok: false, json: null };
      Object.assign(e, body);
      return { status: 200, ok: true, json: e };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, store };
}
const input = { flags: ON, event: p.event, now: STAMP, readBackDelays: [0, 0, 0] };
const io = (g) => ({ graph: g.api, sleep: async () => {} });

(async () => {
  console.log('\n--- Do It: patch only the online meeting, read it back ---\n');
  let g = makeGraph();
  let r = await L.addLink(input, io(g));
  const patch = g.log.find((l) => l.method === 'PATCH');
  check('the patch is only isOnlineMeeting and the provider', Object.keys(patch.body).sort().join() === 'isOnlineMeeting,onlineMeetingProvider' && patch.body.isOnlineMeeting === true && patch.body.onlineMeetingProvider === 'teamsForBusiness', patch);
  check('Handled: proof fetchedBack, system, id, link; Microsoft\'s join block is not a change', r.ok === true && r.proof.fetchedBack === true && r.proof.system === 'microsoft/calendar' && r.proof.externalId === 'E2' && r.joinUrl === JOIN && /· Teams$/.test(r.written), r);
  check('only Calendar is called and no guest was added', g.log.every((l) => /^\/me\/events\//.test(l.path)) && g.store.E2.attendees.length === 1, g.log.map((l) => l.path));

  g = makeGraph({ pending: 2 });
  r = await L.addLink(input, io(g));
  check('a link Microsoft has not made yet is waited for', r.ok === true, r);

  g = makeGraph({ noLink: true });
  r = await L.addLink(input, io(g));
  check('Microsoft makes no link: nothing claimed, the online meeting is turned off, the event stays', r.ok === false && r.reason === 'verify_failed' && g.store.E2.isOnlineMeeting === false && !!g.store.E2, r);

  g = makeGraph({ link: 'https://evil.example/meetup-join/x' });
  r = await L.addLink(input, io(g));
  check('a link that is not a Teams join link is not claimed', r.ok === false && r.reason === 'verify_failed', r);

  g = makeGraph({ mutate: (e) => { if (e.onlineMeeting) e.subject = 'Other'; } });
  r = await L.addLink(input, io(g));
  check('the event changed under it: not Handled', r.ok === false && /event-changed/.test(r.why), r);

  g = makeGraph();
  g.store.E2.isOnlineMeeting = true;
  r = await L.addLink(input, io(g));
  check('the person made it online themselves since the card: never replaced', r.ok === false && r.reason === 'already-has-link' && !g.log.some((l) => l.method === 'PATCH'), r);

  g = makeGraph();
  g.store.E2.isOrganizer = false;
  r = await L.addLink(input, io(g));
  check('not the person\'s event any more: no write', r.reason === 'not-yours' && !g.log.some((l) => l.method === 'PATCH'), r);

  check('not connected is said', (await L.addLink(input, io(makeGraph({ auth: 401 })))).reason === 'not-connected');
  check('a failed write is a failed write', (await L.addLink(input, io(makeGraph({ patchFails: true })))).reason === 'write-failed');
  g = makeGraph();
  r = await L.addLink(Object.assign({}, input, { flags: {} }), io(g));
  check('switch off: no call', r.reason === 'switch-off' && g.log.length === 0);

  console.log('\n--- Undo turns it off, never overwrites the person\'s edit ---\n');
  g = makeGraph();
  r = await L.addLink(input, io(g));
  let u = await L.undo(r.ref, io(g));
  check('untouched: Undo turns the online meeting off and the read confirms; the event stays', u.ok === true && u.undone === true && g.store.E2.isOnlineMeeting === false && !!g.store.E2, u);

  g = makeGraph();
  r = await L.addLink(input, io(g));
  g.store.E2.body = { contentType: 'text', content: 'Product demo\nAgenda: pricing' };
  u = await L.undo(r.ref, io(g));
  check('the person added an agenda: Undo unavailable, link stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && g.store.E2.isOnlineMeeting === true, u);

  g = makeGraph();
  r = await L.addLink(input, io(g));
  g.store.E2.attendees.push({ emailAddress: { address: 'new@example.com' } });
  check('the person invited someone: Undo leaves it', (await L.undo(r.ref, io(g))).reason === 'user-edited' && g.store.E2.isOnlineMeeting === true);

  g = makeGraph();
  r = await L.addLink(input, io(g));
  const other = makeGraph({ link: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_new%40thread.v2/0' });
  other.store.E2.isOnlineMeeting = true;
  u = await L.undo(r.ref, io(other));
  check('the link is no longer the one Glance made: Undo leaves it', u.ok === false && u.reason === 'link-changed', u);

  g = makeGraph();
  r = await L.addLink(input, io(g));
  u = await L.undo(Object.assign({}, r.ref, { before: null }), io(g));
  check('no stored hash: cannot confirm, leaves it', u.ok === false && u.reason === 'unconfirmed' && g.store.E2.isOnlineMeeting === true, u);

  g = makeGraph();
  r = await L.addLink(input, io(g));
  delete g.store.E2;
  check('the person deleted the event: nothing to undo', (await L.undo(r.ref, io(g))).ok === true);
  check('a ref that is not Glance\'s is refused', (await L.undo({ eventId: 'E9' }, io(makeGraph()))).reason === 'not-ours');

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
