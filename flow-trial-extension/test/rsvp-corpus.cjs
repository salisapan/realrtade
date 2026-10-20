// Answer an invite already on the calendar (close map C5), behind RSVP_REPLY (off).
// One explicit ask to confirm attendance, exactly one open invite that fits (by the
// day the mail names, or its words), a choice the person makes, their own answer
// set with sendUpdates=none and read back by id. Undo restores the previous answer
// and refuses after the person changed it. Calendar is mocked. Nothing is sent.
// Run: node test/rsvp-corpus.cjs
'use strict';
const { FlowRsvp: R } = require('../core/rsvp.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { RSVP_REPLY: true };
const NOW = new Date('2026-10-19T09:00:00Z'); // a Monday
const STAMP = '2026-10-19T09:05:00.000Z';
const me = (status) => ({ email: 'sali@example.com', self: true, responseStatus: status });
const them = { email: 'dana@example.com', organizer: true, responseStatus: 'accepted' };
const ev = (id, summary, day, opts) => Object.assign({
  id, summary, status: 'confirmed', htmlLink: 'https://calendar.google.com/event?eid=' + id,
  start: { dateTime: day + 'T10:00:00+03:00' }, organizer: { email: 'dana@example.com' },
  attendees: [them, me('needsAction')]
}, opts || {});
const CAL = [
  ev('E1', 'Product demo', '2026-10-22'),
  ev('E2', 'Board review', '2026-10-27'),
  ev('E3', 'ישיבת צוות', '2026-10-22', { start: { dateTime: '2026-10-22T15:00:00+03:00' } }),
  ev('E4', 'Offsite', '2026-10-28'),
  ev('E5', 'My own 1:1', '2026-10-21', { organizer: { email: 'sali@example.com', self: true }, attendees: [Object.assign(me('accepted'), { organizer: true }), them] }),
  ev('E6', 'Old kickoff', '2026-10-12'),
  ev('E7', 'כנס לקוחות', '2026-11-03')
];

// ---- 1. recognition and the plan ---------------------------------------------
console.log('\n--- one ask, one open invite that fits ---\n');
const positives = [
  { text: 'Please confirm you will attend the Thursday demo.', events: CAL.filter((e) => e.id !== 'E3'), id: 'E1' },
  { text: 'Can you confirm you\'re coming to the offsite on Oct 28?', events: CAL, id: 'E4' },
  { text: 'Will you be joining the board review?', events: CAL, id: 'E2' },
  { text: 'RSVP by Friday for the offsite on Oct 28', events: CAL, id: 'E4' },
  { text: 'נא לאשר הגעה לישיבה ביום חמישי', events: CAL, id: 'E3' },
  { text: 'תאשר בבקשה השתתפות בכנס', events: CAL, id: 'E7' },
  { text: 'נא לאשר הגעה לכנס עד יום רביעי', events: CAL, id: 'E7' }
];
let offered = 0;
for (const p of positives) {
  const out = R.plan({ flags: ON, text: p.text, events: p.events, now: NOW });
  const ok = out.action === 'offer' && out.event.id === p.id;
  if (ok) offered++;
  check('offers the one invite: ' + p.text, ok, out);
}
const he = R.plan({ flags: ON, text: positives[4].text, events: CAL, now: NOW });
check('the person chooses: three answers, none preselected', he.approval === 'Choice' && he.choices.map((c) => c.answer).join(',') === 'accepted,tentative,declined' && !he.choices.some((c) => c.default), he.choices);
check('the Hebrew line names the event and its day', he.line === 'לענות על ההזמנה: ישיבת צוות (2026-10-22)', he.line);
check('a deadline is not the event day: "RSVP by Friday" alone names no event', R.recognize('RSVP by Friday please.', NOW).dayIso === null);
check('"עד יום רביעי" is a deadline, not the day', R.recognize('נא לאשר הגעה לכנס עד יום רביעי', NOW).dayIso === null);

// ---- 2. silence ---------------------------------------------------------------
console.log('\n--- silence wins ---\n');
const negatives = [
  { why: 'no need to confirm', text: 'No need to confirm, see you Thursday.' },
  { why: 'אין צורך לאשר', text: 'אין צורך לאשר הגעה' },
  { why: 'fyi', text: 'FYI the demo is Thursday, please confirm attendance.' },
  { why: 'hedge', text: 'Maybe let us know if you can make it.' },
  { why: 'third party', text: 'Can you ask Dana to confirm she is coming?' },
  { why: 'third party (he)', text: 'תבקש מדנה לאשר הגעה לישיבה ביום חמישי' },
  { why: 'a thank-you, not an ask', text: 'Thanks for confirming your attendance!' },
  { why: 'confirm something else', text: 'Please confirm the invoice amount.' },
  { why: 'two invites on that day, no words to split them', text: 'Please confirm you will attend on Thursday.' },
  { why: 'a deadline only, nothing to match', text: 'RSVP by Friday please.' },
  { why: 'no invite fits', text: 'Please confirm you will attend the budget workshop.' },
  { why: 'the person organizes it', text: 'Please confirm you will attend the 1:1 on Wednesday.' },
  { why: 'already answered', text: 'Will you be joining the board review?', events: [ev('A', 'Board review', '2026-10-27', { attendees: [them, me('accepted')] })] },
  { why: 'cancelled', text: 'Will you be joining the board review?', events: [ev('B', 'Board review', '2026-10-27', { status: 'cancelled' })] },
  { why: 'in the past', text: 'Will you be joining the old kickoff?', events: [ev('C', 'Old kickoff', '2026-10-12')] },
  { why: 'not invited (no self attendee)', text: 'Will you be joining the board review?', events: [ev('D', 'Board review', '2026-10-27', { attendees: [them] })] },
  { why: 'calendar not read', text: 'Will you be joining the board review?', events: null }
];
let wrongOffers = 0;
for (const n of negatives) {
  const out = R.plan({ flags: ON, text: n.text, events: n.events === undefined ? CAL : n.events, now: NOW });
  if (out.action === 'offer') wrongOffers++;
  check('silent: ' + n.why, out.action === 'silence', out);
}
check('already answered is reported as such', R.plan({ flags: ON, text: negatives[12].text, events: negatives[12].events, now: NOW }).reason === 'already-answered');
check('two on one day is a conflict', R.plan({ flags: ON, text: negatives[8].text, events: CAL, now: NOW }).reason === 'conflict');

console.log('\n--- the switch ---\n');
check('the switch is RSVP_REPLY and defaults off', R.SWITCH === 'RSVP_REPLY' && R.SWITCH_DEFAULT === false && R.enabled() === false && R.enabled({ RSVP_REPLY: 'yes' }) === false);
for (const p of positives) check('switch off: no offer for ' + p.text, R.plan({ text: p.text, events: CAL, now: NOW }).action === 'off');

// ---- 3. the writer with a mocked Calendar API --------------------------------
function mockCal(opts) {
  opts = opts || {};
  const calls = [];
  let event = JSON.parse(JSON.stringify(opts.event || ev('E1', 'Product demo', '2026-10-22')));
  async function calendar(method, path, body) {
    calls.push({ method, path, body });
    if (method === 'GET') {
      if (opts.getStatus) return { status: opts.getStatus, ok: false, json: null };
      if (opts.flakyBack && calls.filter((c) => c.method === 'GET').length > 1) return { status: 500, ok: false, json: null };
      return { status: 200, ok: true, json: JSON.parse(JSON.stringify(event)) };
    }
    if (method === 'PATCH') {
      if (opts.patchStatus) return { status: opts.patchStatus, ok: false, json: {} };
      if (!opts.ignorePatch) event.attendees = body.attendees;
      return { status: 200, ok: true, json: event };
    }
    return { status: 400, ok: false, json: null };
  }
  return { calendar, calls, event: () => event, set: (fn) => { fn(event); } };
}

(async () => {
  console.log('\n--- Do It: their answer, read back ---\n');
  const m = mockCal();
  const res = await R.respond({ flags: ON, event: { id: 'E1' }, answer: 'accepted', now: STAMP }, { calendar: m.calendar });
  check('answered and read back: ok with a proof', res.ok === true && Proof.allowsHandled(res), res);
  check('ProofOfClose is google/calendar with the event id', res.proof && res.proof.system === 'google/calendar' && res.proof.externalId === 'E1' && res.proof.fetchedBack === true && res.proof.verifiedAt === STAMP, res.proof);
  check('their answer on the invite is the close', res.loopClosed === true);
  const patch = m.calls.find((c) => c.method === 'PATCH');
  check('no email from Glance: sendUpdates=none', /sendUpdates=none/.test(patch.path), patch.path);
  check('only their own answer changes; the organizer row is untouched', JSON.stringify(patch.body.attendees[0]) === JSON.stringify(them) && patch.body.attendees[1].responseStatus === 'accepted', patch.body.attendees);
  check('order: GET, PATCH, GET', m.calls.map((c) => c.method).join(',') === 'GET,PATCH,GET');

  const tent = await R.respond({ flags: ON, event: { id: 'E1' }, answer: 'tentative', now: STAMP }, { calendar: mockCal().calendar });
  check('Maybe is an answer too', tent.ok === true && tent.ref.answer === 'tentative');
  const bad = await R.respond({ flags: ON, event: { id: 'E1' }, answer: 'yes', now: STAMP }, { calendar: mockCal().calendar });
  check('an unknown answer is refused', bad.ok === false && bad.reason === 'invalid');

  console.log('\n--- a missing or wrong read-back is not Handled ---\n');
  const cases = [
    ['the token is refused', { getStatus: 403 }, 'not-connected'],
    ['the event is gone', { getStatus: 404 }, 'event-gone'],
    ['the event is cancelled', { event: ev('E1', 'Product demo', '2026-10-22', { status: 'cancelled' }) }, 'event-gone'],
    ['the person organizes it', { event: ev('E1', 'Product demo', '2026-10-22', { organizer: { email: 'sali@example.com', self: true } }) }, 'not-an-invite'],
    ['they already answered on their own', { event: ev('E1', 'Product demo', '2026-10-22', { attendees: [them, me('declined')] }) }, 'already-answered'],
    ['the write fails', { patchStatus: 500 }, 'write-failed'],
    ['the read-back fails', { flakyBack: true }, 'verify_failed'],
    ['the answer does not stick', { ignorePatch: true }, 'verify_failed']
  ];
  for (const [why, opts, reason] of cases) {
    const r = await R.respond({ flags: ON, event: { id: 'E1' }, answer: 'accepted', now: STAMP }, { calendar: mockCal(opts).calendar });
    check(why + ' → ' + reason + ', not Handled', r.ok === false && r.reason === reason && !Proof.allowsHandled(r), r);
  }
  const off = mockCal();
  const r0 = await R.respond({ event: { id: 'E1' }, answer: 'accepted', now: STAMP }, { calendar: off.calendar });
  check('switch off: no Calendar call', r0.reason === 'switch-off' && off.calls.length === 0);

  console.log('\n--- Undo ---\n');
  const u = mockCal();
  const saved = await R.respond({ flags: ON, event: { id: 'E1' }, answer: 'declined', now: STAMP }, { calendar: u.calendar });
  const undone = await R.undo(saved.ref, { calendar: u.calendar });
  check('Undo puts the previous answer back and reads it', undone.ok === true && u.event().attendees[1].responseStatus === 'needsAction', { undone, att: u.event().attendees });
  const edited = mockCal();
  const s2 = await R.respond({ flags: ON, event: { id: 'E1' }, answer: 'accepted', now: STAMP }, { calendar: edited.calendar });
  edited.set((e) => { e.attendees[1].responseStatus = 'tentative'; });
  const u2 = await R.undo(s2.ref, { calendar: edited.calendar });
  check('they changed it themselves: Undo refuses and leaves their answer', u2.ok === false && u2.reason === 'answer-changed' && u2.undoUnavailable === true && edited.event().attendees[1].responseStatus === 'tentative', u2);
  check('Undo refuses what Glance did not write', (await R.undo({ eventId: 'E1', answer: 'accepted', createdByGlance: false }, { calendar: u.calendar })).reason === 'not-ours');

  console.log('\nprecision: offers ' + offered + '/' + positives.length + ' positives, wrong offers ' + wrongOffers + '/' + negatives.length + ' negatives');
  check('precision gate: zero wrong offers on the negative set', wrongOffers === 0);
  check('recall on the positive set is 100%', offered === positives.length);
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
