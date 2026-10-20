// Hold a call on the Outlook calendar with a real Teams link, behind TEAMS_MEETING (off).
// One proposal of a call with one day and one clock, an event posted with
// isOnlineMeeting and no guest, read back by id for the subject, the wall clock and a
// teams join link. Undo deletes it and refuses after the person edited it.
// Graph is mocked. Nothing is sent.
// Run: node test/teams-meeting-corpus.cjs
'use strict';
const { FlowTeamsMeeting: T } = require('../core/teams-meeting.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { TEAMS_MEETING: true };
const NOW = new Date('2026-10-19T09:00:00Z'); // a Monday
const STAMP = '2026-10-19T09:05:00.000Z';
const SPEED = { readBackDelays: [0, 0, 0] };
const JOIN = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d';

console.log('\n--- a call proposed with one day and one clock ---\n');
const yes = [
  ['Can we do a Teams call tomorrow at 15:00?', '2026-10-20', 15, 0],
  ["Let's hop on a video call on Thursday at 14:00.", '2026-10-22', 14, 0],
  ['Could we set up a Teams meeting on 2026-10-23 at 10:30?', '2026-10-23', 10, 30],
  ['How about a video call Wednesday at 4pm?', '2026-10-21', 16, 0],
  ['Shall we schedule an online meeting on Oct 22 at 11:00?', '2026-10-22', 11, 0],
  ['נעשה שיחת וידאו מחר ב-15:00', '2026-10-20', 15, 0],
  ['בואו נקבע שיחה בטימס ביום חמישי ב-14:00', '2026-10-22', 14, 0],
  ['אפשר פגישת וידאו ביום רביעי בשעה 10:30?', '2026-10-21', 10, 30]
];
for (const [text, d, h, m] of yes) {
  const r = T.recognize(text, NOW);
  check('clear: ' + text, r.kind === 'clear' && r.dateIso === d && r.hour === h && r.minute === m, r);
}

console.log('\n--- silence, with the reason ---\n');
const no = [
  ["Let's do a video call tomorrow at 3pm or Thursday at 4pm.", 'several-times'],
  ["Let's do a video call tomorrow at 15:00 or 16:00.", 'several-times'],
  ["Let's do a video call on Zoom tomorrow at 15:00.", 'other-tool'],
  ["Let's do a Google Meet video call tomorrow at 15:00.", 'other-tool'],
  ['בואו נעשה שיחת וידאו בזום מחר ב-15:00', 'other-tool'],
  ['Maybe we could do a Teams call tomorrow at 15:00 if you want.', 'hedge'],
  ['Can we do a video call sometime?', 'hedge'],
  ['אולי נעשה שיחת וידאו מחר ב-15:00', 'hedge'],
  ['FYI here is the recording of the Teams meeting from today at 15:00.', 'fyi'],
  ['Ask Dana to set up a Teams call tomorrow at 15:00.', 'third-party'],
  ['No need for a video call tomorrow at 15:00.', 'negation'],
  ['אין צורך בשיחת וידאו מחר ב-15:00', 'negation'],
  ['The Teams call is tomorrow at 15:00.', 'no-proposal'],
  ['נעשה שיחת וידאו מחר', 'no-clock'],
  ["Let's do a video call at 15:00.", 'no-day']
];
for (const [text, why] of no) {
  const r = T.recognize(text, NOW);
  check('silent (' + why + '): ' + text, r.kind !== 'clear' && r.reason === why, r);
}
check('no call at all is ignored', T.recognize('Lunch tomorrow at 13:00?', NOW).kind === 'ignore');
check('a day in the past is silent', T.recognize("Let's do a video call on 2026-10-12 at 10:00.", NOW).reason === 'past');

console.log('\n--- the switch and the plan ---\n');
check('off by default', T.SWITCH_DEFAULT === false && T.plan({ text: yes[0][0], now: NOW }).action === 'off');
const p = T.plan({ flags: ON, text: yes[0][0], now: NOW, senderName: 'Dana' });
check('one Do It, clock as named, title with the name', p.action === 'offer' && p.approval === 'DoIt' && p.title === 'Teams call with Dana' && p.when.dateIso === '2026-10-20' && p.when.hour === 15, p);
check('the share step is the person\'s, not Glance\'s', p.steps.some((s) => s.kind === 'manual') && !p.steps.some((s) => /send/i.test(s.kind)), p.steps);
const ph = T.plan({ flags: ON, text: yes[5][0], now: NOW });
check('Hebrew plan: Hebrew line and title', ph.lang === 'he' && ph.title === 'שיחת Teams' && /Teams/.test(ph.line), ph);
check('a silent ask has no plan', T.plan({ flags: ON, text: no[0][0], now: NOW }).action === 'silence');

function makeGraph(opts) {
  opts = opts || {};
  const log = [];
  const store = {};
  let nGet = 0;
  const api = async (method, path, body) => {
    log.push({ method, path, body });
    if (opts.auth) return { status: opts.auth, ok: false, json: null };
    if (method === 'POST') {
      if (opts.postFails) return { status: 500, ok: false, json: null };
      const ev = Object.assign({ id: 'EV1', isCancelled: false, webLink: 'https://outlook.office.com/calendar/item/EV1', organizer: { emailAddress: { address: 'sali@example.com' } } }, body);
      ev.start = { dateTime: body.start.dateTime + '.0000000', timeZone: body.start.timeZone };
      ev.end = { dateTime: body.end.dateTime + '.0000000', timeZone: body.end.timeZone };
      ev.isOnlineMeeting = false;
      store.EV1 = ev;
      return { status: 201, ok: true, json: { id: 'EV1' } };
    }
    const id = decodeURIComponent(path.split('/events/')[1].split('?')[0]);
    if (method === 'GET') {
      nGet++;
      const ev = store[id];
      if (!ev) return { status: 404, ok: false, json: null };
      const copy = JSON.parse(JSON.stringify(ev));
      if (opts.pendingReads && nGet <= opts.pendingReads) {
        copy.isOnlineMeeting = false; copy.onlineMeeting = null;
      } else if (!opts.noLink) {
        copy.isOnlineMeeting = true;
        copy.onlineMeeting = { joinUrl: opts.link || JOIN };
        copy.body = { contentType: 'html', content: '<html><body>' + (ev.body ? ev.body.content : '') + '<div>________________________________________________________________________________</div><a href="' + JOIN + '">Join the meeting now</a></body></html>' };
      }
      if (opts.mutate) opts.mutate(copy);
      return { status: 200, ok: true, json: copy };
    }
    if (method === 'DELETE') {
      if (opts.deleteFails) return { status: 500, ok: false, json: null };
      delete store[id];
      return { status: 204, ok: true, json: null };
    }
    return { status: 400, ok: false, json: null };
  };
  return { api, log, store };
}
const input = Object.assign({ flags: ON, title: 'Teams call with Dana', when: p.when, timeZone: 'Asia/Jerusalem', now: STAMP }, SPEED);
const io = (c) => ({ graph: c.api, sleep: async () => {} });

(async () => {
  console.log('\n--- Do It: create with a Teams link, read back ---\n');
  let c = makeGraph();
  let r = await T.create(input, io(c));
  const post = c.log.find((l) => l.method === 'POST');
  check('posts an online meeting, Teams provider, no guest', post.path === '/me/events' && post.body.isOnlineMeeting === true && post.body.onlineMeetingProvider === 'teamsForBusiness' && post.body.attendees.length === 0, post);
  check('wall clock in the person\'s zone, no Z', post.body.start.dateTime === '2026-10-20T15:00:00' && post.body.start.timeZone === 'Asia/Jerusalem' && post.body.end.dateTime === '2026-10-20T15:30:00', post.body.start);
  check('Handled needs the read-back: ok, proof fetchedBack, link, ref', r.ok === true && r.proof && r.proof.fetchedBack === true && r.proof.externalId === 'EV1' && r.proof.system === 'microsoft/calendar' && r.joinUrl === JOIN && r.ref.contentHash, r);
  check('a held call is not a closed ask: the loop stays open', r.loopClosed === false, r);
  check('the receipt row names Teams', /Teams/.test(r.written), r.written);
  check('nothing is sent: only /me/events calls', c.log.every((l) => /^\/me\/events/.test(l.path)), c.log.map((l) => l.path));

  c = makeGraph({ pendingReads: 2 });
  r = await T.create(input, io(c));
  check('a link Microsoft has not attached yet is waited for, then proved', r.ok === true && c.log.filter((l) => l.method === 'GET').length === 3, r);

  c = makeGraph({ noLink: true });
  r = await T.create(input, io(c));
  check('no link ever appears: the event is removed, no Handled', r.ok === false && r.reason === 'verify_failed' && r.removed === true && r.ref === null && !c.store.EV1, r);

  c = makeGraph({ noLink: true, deleteFails: true });
  r = await T.create(input, io(c));
  check('removal fails too: the ref is kept so Undo can still delete it', r.ok === false && r.removed === false && r.ref && r.ref.eventId === 'EV1', r);

  c = makeGraph({ link: 'https://evil.example/l/meetup-join/abc' });
  r = await T.create(input, io(c));
  check('a link that is not a Teams join link is not one', r.ok === false && /no-teams-link/.test(r.why), r);

  c = makeGraph({ mutate: (e) => { e.subject = 'Something else'; } });
  r = await T.create(input, io(c));
  check('another subject on the read-back is not the event asked for', r.ok === false && /title-differs/.test(r.why), r);

  c = makeGraph({ mutate: (e) => { e.start = { dateTime: '2026-10-20T16:00:00.0000000', timeZone: 'Asia/Jerusalem' }; } });
  r = await T.create(input, io(c));
  check('another start on the read-back is not the event asked for', r.ok === false && /time-differs/.test(r.why), r);

  c = makeGraph({ mutate: (e) => { e.attendees = [{ emailAddress: { address: 'x@example.com' } }]; } });
  r = await T.create(input, io(c));
  check('a guest on the event means an invitation could go out: not Handled', r.ok === false && /has-guests/.test(r.why), r);

  c = makeGraph();
  r = await T.create(Object.assign({}, input, { expectAccount: 'other@example.com' }), io(c));
  check('the wrong account is withdrawn', r.ok === false && /wrong-account/.test(r.why) && !c.store.EV1, r);

  c = makeGraph();
  r = await T.create(Object.assign({}, input, { grantedScopes: ['Mail.Read', 'Calendars.Read'] }), io(c));
  check('Calendars.Read cannot write: no call is made', r.ok === false && r.reason === 'no-calendar-scope' && c.log.length === 0, r);
  c = makeGraph();
  r = await T.create(Object.assign({}, input, { grantedScopes: ['Mail.Read', 'Calendars.ReadWrite'] }), io(c));
  check('Calendars.ReadWrite is enough', r.ok === true, r);

  r = await T.create(input, io(makeGraph({ auth: 401 })));
  check('not connected is said, not guessed', r.ok === false && r.reason === 'not-connected', r);
  r = await T.create(input, io(makeGraph({ postFails: true })));
  check('a failed write is a failed write', r.ok === false && r.reason === 'write-failed', r);
  r = await T.create(Object.assign({}, input, { flags: {} }), io(makeGraph()));
  check('switch off: nothing is called', r.ok === false && r.reason === 'switch-off');
  c = makeGraph();
  r = await T.create(Object.assign({}, input, { when: { dateIso: '2026-13-40', hour: 15, minute: 0 } }), io(c));
  check('an impossible date makes no call', r.ok === false && r.reason === 'unclear' && c.log.length === 0, r);
  c = makeGraph();
  r = await T.create(Object.assign({}, input, { timeZone: 'Not/AZone' }), io(c));
  check('an unknown zone makes no call', r.ok === false && r.reason === 'unclear' && c.log.length === 0, r);

  console.log('\n--- Undo never overwrites a person\'s edit ---\n');
  c = makeGraph();
  r = await T.create(input, io(c));
  let u = await T.undo(r.ref, io(c));
  check('untouched (Microsoft added its join block): Undo deletes it and the delete is read back', u.ok === true && u.undone === true && !c.store.EV1, u);

  c = makeGraph();
  r = await T.create(input, io(c));
  c.store.EV1.body = { contentType: 'Text', content: 'Agenda: pricing' };
  u = await T.undo(r.ref, io(c));
  check('the person wrote an agenda: Undo is unavailable and the event stays', u.ok === false && u.reason === 'user-edited' && u.undoUnavailable === true && !!c.store.EV1, u);

  c = makeGraph();
  r = await T.create(input, io(c));
  c.store.EV1.attendees = [{ emailAddress: { address: 'dana@example.com' } }];
  u = await T.undo(r.ref, io(c));
  check('the person invited someone: Undo leaves it', u.ok === false && u.reason === 'user-edited' && !!c.store.EV1, u);

  c = makeGraph();
  r = await T.create(input, io(c));
  c.store.EV1.start = { dateTime: '2026-10-20T17:00:00.0000000', timeZone: 'Asia/Jerusalem' };
  u = await T.undo(r.ref, io(c));
  check('the person moved it: Undo leaves it', u.ok === false && u.reason === 'user-edited' && !!c.store.EV1, u);

  c = makeGraph();
  r = await T.create(input, io(c));
  delete c.store.EV1;
  u = await T.undo(r.ref, io(c));
  check('the person already deleted it: nothing left to undo, said as undone', u.ok === true, u);

  check('a ref that is not Glance\'s is refused', (await T.undo({ eventId: 'EV9' }, io(makeGraph()))).reason === 'not-ours');
  check('no ref, no call', (await T.undo(null, io(makeGraph()))).ok === false);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
