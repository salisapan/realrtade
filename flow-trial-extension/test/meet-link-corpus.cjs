// Hold a call on the calendar with a real Google Meet link, behind MEET_LINK (off).
// One proposal of a video call with one day and one clock, a calendar event made
// with conferenceData and no guest, read back by id for the title, both instants and
// a created meet.google.com link. Undo deletes it and refuses after the person
// edited it. Calendar is mocked. Nothing is sent.
// Run: node test/meet-link-corpus.cjs
'use strict';
const { FlowMeetLink: M } = require('../core/meet-link.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { MEET_LINK: true };
const NOW = new Date('2026-10-19T09:00:00Z'); // a Monday
const STAMP = '2026-10-19T09:05:00.000Z';
const SPEED = { readBackDelays: [0, 0, 0] };

// ---- 1. recognition ------------------------------------------------------------
console.log('\n--- a call proposed with one day and one clock ---\n');
const yes = [
  ['Can we do a video call tomorrow at 15:00?', '2026-10-20', 15, 0],
  ["Let's hop on a Google Meet on Thursday at 14:00.", '2026-10-22', 14, 0],
  ['Could we set up a video call on 2026-10-23 at 10:30?', '2026-10-23', 10, 30],
  ['How about a video call Wednesday at 4pm?', '2026-10-21', 16, 0],
  ['Shall we schedule an online meeting on Oct 22 at 11:00?', '2026-10-22', 11, 0],
  ['נעשה שיחת וידאו מחר ב-15:00', '2026-10-20', 15, 0],
  ['בואו נקבע פגישה במיט ביום חמישי ב-14:00', '2026-10-22', 14, 0],
  ['אפשר שיחת וידאו ביום רביעי בשעה 10:30?', '2026-10-21', 10, 30]
];
for (const [text, d, h, m] of yes) {
  const r = M.recognize(text, NOW);
  check('clear: ' + text, r.kind === 'clear' && r.dateIso === d && r.hour === h && r.minute === m, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ["Let's do a video call tomorrow at 3pm or Thursday at 4pm.", 'several-times'],
  ["Let's do a video call tomorrow at 15:00 or 16:00.", 'several-times'],
  ["Let's do a video call on Zoom tomorrow at 15:00.", 'other-tool'],
  ["Let's do a Teams video call tomorrow at 15:00.", 'other-tool'],
  ['בואו נעשה שיחת וידאו בזום מחר ב-15:00', 'other-tool'],
  ['Maybe we could do a video call tomorrow at 15:00 if you want.', 'hedge'],
  ['Can we do a video call sometime?', 'hedge'],
  ['אולי נעשה שיחת וידאו מחר ב-15:00', 'hedge'],
  ['FYI here is the recording of the video call from today at 15:00.', 'fyi'],
  ['Ask Dana to set up a video call tomorrow at 15:00.', 'third-party'],
  ['No need for a video call tomorrow at 15:00.', 'negation'],
  ['אין צורך בשיחת וידאו מחר ב-15:00', 'negation'],
  ['The video call is tomorrow at 15:00.', 'no-proposal'],
  ['נעשה שיחת וידאו מחר', 'no-clock'],
  ["Let's do a video call at 15:00.", 'no-day'],
  ["Let's do a video call yesterday at 15:00", 'no-day']
];
for (const [text, why] of no) {
  const r = M.recognize(text, NOW);
  check('silent (' + why + '): ' + text, r.kind !== 'clear' && (r.reason === why || (why === 'no-day' && r.kind === 'block')), r);
}
check('no call at all is ignored', M.recognize('Lunch tomorrow at 13:00?', NOW).kind === 'ignore');
check('a day in the past is silent', M.recognize("Let's do a video call on 2026-10-12 at 10:00.", NOW).reason === 'past');

console.log('\n--- the switch and the plan ---\n');
check('off by default', M.SWITCH_DEFAULT === false && M.plan({ text: yes[0][0], now: NOW }).action === 'off');
const p = M.plan({ flags: ON, text: yes[0][0], now: NOW, senderName: 'Dana' });
check('one Do It, clock as named, title with the name', p.action === 'offer' && p.approval === 'DoIt' && p.title === 'Video call with Dana' && p.when.dateIso === '2026-10-20' && p.when.hour === 15, p);
check('the share step is the person\'s, not Glance\'s', p.steps.some((s) => s.kind === 'manual') && !p.steps.some((s) => /send/i.test(s.kind)), p.steps);
const ph = M.plan({ flags: ON, text: yes[5][0], now: NOW });
check('Hebrew plan: Hebrew line and title', ph.lang === 'he' && ph.title === 'שיחת וידאו' && /Meet/.test(ph.line), ph);
check('a silent ask has no plan', M.plan({ flags: ON, text: no[0][0], now: NOW }).action === 'silence');

// ---- 2. the write, mocked ------------------------------------------------------
function makeCalendar(opts) {
  opts = opts || {};
  const log = [];
  const store = {};
  let nGet = 0;
  const api = async (method, path, body) => {
    log.push({ method, path, body });
    if (opts.auth) return { status: opts.auth, ok: false, json: null };
    if (method === 'POST') {
      if (opts.postFails) return { status: 500, ok: false, json: null };
      const ev = Object.assign({ id: 'EV1', status: 'confirmed', htmlLink: 'https://calendar.google.com/event?eid=EV1', organizer: { email: 'sali@example.com', self: true } }, body);
      delete ev.conferenceData;
      store.EV1 = ev;
      return { status: 200, ok: true, json: { id: 'EV1', htmlLink: ev.htmlLink } };
    }
    const id = decodeURIComponent(path.split('/events/')[1].split('?')[0]);
    if (method === 'GET') {
      nGet++;
      const ev = store[id];
      if (!ev) return { status: 404, ok: false, json: null };
      const copy = JSON.parse(JSON.stringify(ev));
      if (opts.pendingReads && nGet <= opts.pendingReads) {
        copy.conferenceData = { createRequest: { status: { statusCode: 'pending' } } };
      } else if (opts.noLink) {
        copy.conferenceData = { createRequest: { status: { statusCode: 'failure' } } };
      } else {
        copy.hangoutLink = opts.link || 'https://meet.google.com/abc-defg-hij';
        copy.conferenceData = { createRequest: { status: { statusCode: 'success' } }, entryPoints: [{ entryPointType: 'video', uri: copy.hangoutLink }] };
      }
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'PATCH') { Object.assign(store[id], body); return { status: 200, ok: true, json: store[id] }; }
    if (method === 'DELETE') {
      if (opts.deleteFails) return { status: 500, ok: false, json: null };
      delete store[id];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, store };
}
const input = Object.assign({ flags: ON, title: 'Video call with Dana', when: p.when, timeZone: 'Asia/Jerusalem', now: STAMP }, SPEED);
const io = (c) => ({ calendar: c.api, sleep: async () => {} });

(async () => {
  console.log('\n--- Do It: create with a Meet link, read back ---\n');
  let c = makeCalendar();
  let r = await M.create(input, io(c));
  const post = c.log.find((l) => l.method === 'POST');
  check('creates with conferenceData hangoutsMeet, no guest, no email', post.path.includes('conferenceDataVersion=1') && post.path.includes('sendUpdates=none') && post.body.conferenceData.createRequest.conferenceSolutionKey.type === 'hangoutsMeet' && post.body.attendees.length === 0, post);
  check('the instants are the clock the person saw (Jerusalem, 15:00 = 12:00Z on Oct 20)', post.body.start.dateTime === '2026-10-20T12:00:00Z' && post.body.end.dateTime === '2026-10-20T12:30:00Z', post.body.start);
  check('Handled needs the read-back: ok, proof fetchedBack, link, ref', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.externalId === 'EV1' && r.proof.system === 'google/calendar' && r.meetUrl === 'https://meet.google.com/abc-defg-hij' && r.ref.contentHash, r);
  check('a held call is not a closed ask: the loop stays open', r.loopClosed === false, r);
  check('the receipt row names the Meet', /Meet/.test(r.written), r.written);
  check('nothing is sent: no mail or message call', c.log.every((l) => /calendars\/primary\/events/.test(l.path)), c.log.map((l) => l.path));

  c = makeCalendar({ pendingReads: 2 });
  r = await M.create(input, io(c));
  check('a link Google has not made yet is waited for, then proved', r.ok === true && c.log.filter((l) => l.method === 'GET').length === 3, r);

  c = makeCalendar({ noLink: true });
  r = await M.create(input, io(c));
  check('Google fails to make the link: the event is removed, no Handled', r.ok === false && r.reason === 'verify_failed' && r.removed === true && r.ref === null && !c.store.EV1, r);

  c = makeCalendar({ noLink: true, deleteFails: true });
  r = await M.create(input, io(c));
  check('removal fails too: the ref is kept so Undo can still delete it', r.ok === false && r.removed === false && r.ref && r.ref.eventId === 'EV1', r);

  c = makeCalendar({ link: 'https://evil.example/abc-defg-hij' });
  r = await M.create(input, io(c));
  check('a link that is not meet.google.com is not a Meet link', r.ok === false && r.reason === 'verify_failed' && /no-meet-link/.test(r.why), r);

  c = makeCalendar({ mutate: (e) => { e.summary = 'Something else'; } });
  r = await M.create(input, io(c));
  check('another title on the read-back is not the event asked for', r.ok === false && /title-differs/.test(r.why), r);

  c = makeCalendar({ mutate: (e) => { e.start = { dateTime: '2026-10-20T13:00:00Z' }; } });
  r = await M.create(input, io(c));
  check('another start on the read-back is not the event asked for', r.ok === false && /time-differs/.test(r.why), r);

  c = makeCalendar({ mutate: (e) => { e.attendees = [{ email: 'x@example.com' }]; } });
  r = await M.create(input, io(c));
  check('a guest on the event means an invitation could go out: not Handled', r.ok === false && /has-guests/.test(r.why), r);

  c = makeCalendar();
  r = await M.create(Object.assign({}, input, { expectAccount: 'other@example.com' }), io(c));
  check('the wrong account is withdrawn', r.ok === false && /wrong-account/.test(r.why) && !c.store.EV1, r);

  r = await M.create(input, io(makeCalendar({ auth: 401 })));
  check('not connected is said, not guessed', r.ok === false && r.reason === 'not-connected', r);
  r = await M.create(input, io(makeCalendar({ postFails: true })));
  check('a failed write is a failed write', r.ok === false && r.reason === 'write-failed', r);
  r = await M.create(Object.assign({}, input, { flags: {} }), io(makeCalendar()));
  check('switch off: nothing is called', r.ok === false && r.reason === 'switch-off');
  c = makeCalendar();
  r = await M.create(Object.assign({}, input, { when: { dateIso: '2026-13-40', hour: 15, minute: 0 } }), io(c));
  check('an impossible date makes no call', r.ok === false && r.reason === 'unclear' && c.log.length === 0, r);

  console.log('\n--- Undo never overwrites a person\'s edit ---\n');
  c = makeCalendar();
  r = await M.create(input, io(c));
  let u = await M.undo(r.ref, io(c));
  check('untouched: Undo deletes it and the delete is read back', u.ok === true && u.undone === true && !c.store.EV1, u);

  c = makeCalendar();
  r = await M.create(input, io(c));
  c.store.EV1.description = 'Agenda: pricing';
  u = await M.undo(r.ref, io(c));
  check('the person added an agenda: Undo is unavailable and the event stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && !!c.store.EV1, u);

  c = makeCalendar();
  r = await M.create(input, io(c));
  c.store.EV1.attendees = [{ email: 'dana@example.com' }];
  u = await M.undo(r.ref, io(c));
  check('the person invited someone: Undo leaves it', u.ok === false && u.reason === 'user-edited' && !!c.store.EV1, u);

  c = makeCalendar();
  r = await M.create(input, io(c));
  delete c.store.EV1;
  u = await M.undo(r.ref, io(c));
  check('the person already deleted it: nothing left to undo, said as undone', u.ok === true, u);

  check('a ref that is not Glance\'s is refused', (await M.undo({ eventId: 'EV9' }, io(makeCalendar()))).reason === 'not-ours');
  check('no ref, no call', (await M.undo(null, io(makeCalendar()))).ok === false);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
