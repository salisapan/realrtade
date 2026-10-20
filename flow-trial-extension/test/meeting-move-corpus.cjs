// Close map C2: one named event moves to a new clock, then a read-back.
// Switch MEETING_MOVE defaults off. Guests stay untouched. Nothing is sent.
// Run: node test/meeting-move-corpus.cjs
'use strict';
const { FlowMeetingMove: M } = require('../core/meeting-move.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'close-families.js', 'intent.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ON = { MEETING_MOVE: true };
const NOW = new Date(2026, 9, 14, 12, 0, 0);

function ev(extra) {
  return Object.assign({
    id: 'ev_move_1',
    summary: 'Quote call',
    start: { dateTime: '2026-10-15T16:00:00+03:00', timeZone: 'Asia/Jerusalem' },
    end: { dateTime: '2026-10-15T16:30:00+03:00', timeZone: 'Asia/Jerusalem' },
    attendees: [],
    organizer: { self: true }
  }, extra || {});
}
const base = (text, extra) => Object.assign({ flags: ON, text: text, now: NOW, events: [ev()], timeZone: 'Asia/Jerusalem' }, extra || {});

function mockCal(opts) {
  opts = opts || {};
  const calls = [];
  let event = opts.event === undefined ? ev() : opts.event;
  async function calendar(method, path, body) {
    calls.push({ method: method, path: path, body: body || null });
    if (opts.fail === method) return { status: opts.status || 500, ok: false, json: null };
    if (method === 'GET') {
      if (opts.getStatus) return { status: opts.getStatus, ok: false, json: null };
      if (!event) return { status: 404, ok: false, json: {} };
      if (opts.getBefore && calls.filter((c) => c.method === 'GET').length === 1) return { status: 200, ok: true, json: opts.getBefore(event) };
      return { status: 200, ok: true, json: event };
    }
    if (method === 'PATCH') {
      if (opts.patchStatus) return { status: opts.patchStatus, ok: false, json: {} };
      if (!event) return { status: 404, ok: false, json: {} };
      const first = calls.filter((c) => c.method === 'PATCH').length === 1;
      event = Object.assign({}, event, { start: body.start, end: body.end });
      if (opts.afterPatch && first) event = opts.afterPatch(event);
      return { status: 200, ok: true, json: { id: event.id } };
    }
    return { status: 400, ok: false, json: null };
  }
  return { calendar: calendar, calls: calls, live: () => event };
}

console.log('\n--- one named event, one new clock ---\n');
const positives = [
  { text: "Let's push Thursday's call to Friday at 11:00.", from: '2026-10-15', to: '2026-10-16', hour: 11, minute: 0, fromHour: null, lang: 'en' },
  { text: 'Can we reschedule the Thursday meeting at 16:00 to Friday at 11:00?', from: '2026-10-15', to: '2026-10-16', hour: 11, minute: 0, fromHour: 16, lang: 'en' },
  { text: 'Please move the call on Thursday to 17:30.', from: '2026-10-15', to: '2026-10-15', hour: 17, minute: 30, fromHour: null, lang: 'en' },
  { text: "Let's postpone Thursday's call to Friday at 3pm.", from: '2026-10-15', to: '2026-10-16', hour: 15, minute: 0, fromHour: null, lang: 'en' },
  { text: 'תזיזו את הפגישה מיום חמישי בשעה 16:00 ליום שישי בשעה 11:00', from: '2026-10-15', to: '2026-10-16', hour: 11, minute: 0, fromHour: 16, lang: 'he' },
  { text: 'אפשר לדחות את הפגישה של יום חמישי ליום שישי בשעה 11:00?', from: '2026-10-15', to: '2026-10-16', hour: 11, minute: 0, fromHour: null, lang: 'he' },
  { text: 'Can we reschedule the meeting on Thursday at 16:00 to tomorrow at 10:00? Let me know.', from: '2026-10-15', to: '2026-10-15', hour: 10, minute: 0, fromHour: 16, lang: 'en' },
  { text: 'Could we push the sync on Thursday at 16:00 to Monday at 09:30, and confirm?', from: '2026-10-15', to: '2026-10-19', hour: 9, minute: 30, fromHour: 16, lang: 'en' }
];
let offered = 0;
for (const p of positives) {
  const card = M.card(base(p.text));
  const ok = card.action === 'offer' && card.approval === 'Do It' && card.sends === false &&
    card.ask.from.dateIso === p.from && card.ask.from.hour === p.fromHour &&
    card.ask.to.dateIso === p.to && card.ask.to.hour === p.hour && card.ask.to.minute === p.minute &&
    card.ask.lang === p.lang && card.event.id === 'ev_move_1' &&
    card.steps.length === 2 && card.steps[1].proof === 'google/calendar' &&
    card.steps.every((s) => s.kind === 'calendar');
  if (ok) offered++;
  check('card offers one move: ' + p.text, ok, card);
}
const enCard = M.card(base(positives[1].text));
check('the English line names both clocks', enCard.line === 'Move "Quote call" from 2026-10-15 16:00 to 2026-10-16 11:00?', enCard.line);
const heCard = M.card(base(positives[4].text));
check('the Hebrew line names both clocks', heCard.line === 'להזיז את "Quote call" מ-2026-10-15 16:00 ל-2026-10-16 11:00?', heCard.line);
const body = M.patchBody(ev(), M.card(base(positives[0].text)).ask, 'UTC');
check('the PATCH touches start and end only, with the event\'s own zone and length',
  Object.keys(body).sort().join() === 'end,start' && body.start.dateTime === '2026-10-16T11:00:00' &&
    body.end.dateTime === '2026-10-16T11:30:00' && body.start.timeZone === 'Asia/Jerusalem', body);

console.log('\n--- silence ---\n');
const negatives = [
  { why: 'empty', text: '' },
  { why: 'null', text: null },
  { why: 'no new clock', text: "Let's push Thursday's call to Friday." },
  { why: 'bare hour, no half of the day', text: 'Can we reschedule the Thursday meeting at 16:00 to Friday at 4?' },
  { why: 'no source day', text: 'Can we push the call to Friday at 11:00?' },
  { why: 'no target', text: 'Can we reschedule Thursday at 16:00?' },
  { why: 'two target clocks', text: 'Can we move the call on Thursday at 16:00 to Friday at 11:00 or at 12:00?' },
  { why: 'no change', text: 'Can we reschedule the call on Thursday at 16:00 to Thursday at 16:00?' },
  { why: 'past slot', text: 'Can we move the call on Thursday at 16:00 to today at 09:00?' },
  { why: 'cancel', text: "Thursday's call at 16:00 is cancelled." },
  { why: 'cancel and move', text: 'Cancel Thursday\'s call and reschedule it to Friday at 11:00.' },
  { why: 'negation', text: "Don't reschedule Thursday's call to Friday at 11:00." },
  { why: 'negation (he)', text: 'אל תזיזו את הפגישה מיום חמישי ליום שישי בשעה 11:00' },
  { why: 'hedge', text: "Maybe we should push Thursday's call to Friday at 11:00." },
  { why: 'status question', text: 'Did we reschedule Thursday\'s call to Friday at 11:00?' },
  { why: 'already moved', text: "Thursday's call was already rescheduled to Friday at 11:00." },
  { why: 'we moved it', text: 'We moved the call on Thursday to Friday at 11:00.' },
  { why: 'invite', text: "Reschedule Thursday's call to Friday at 11:00 and send Dana an invite." },
  { why: 'third party', text: "Ask Dana if we can push Thursday's call to Friday at 11:00." },
  { why: 'thanks', text: "Thanks, please reschedule Thursday's call to Friday at 11:00." },
  { why: 'find a time', text: 'Find us a time to reschedule the call.' },
  { why: 'a plain hold, not a move', text: 'Can we meet Friday at 11:00?' },
  { why: 'a promise, not a move', text: 'אחזור אליך ביום חמישי בשעה 16:00' },
  { why: 'calendar not read', text: positives[0].text, events: null },
  { why: 'no event that day', text: positives[0].text, events: [ev({ start: { dateTime: '2026-10-17T16:00:00+03:00' }, end: { dateTime: '2026-10-17T16:30:00+03:00' } })] },
  { why: 'no event at that clock', text: positives[1].text, events: [ev({ start: { dateTime: '2026-10-15T14:00:00+03:00' }, end: { dateTime: '2026-10-15T14:30:00+03:00' } })] },
  { why: 'two events at that clock', text: positives[1].text, events: [ev(), ev({ id: 'ev_other', summary: 'Other' })] },
  { why: 'two meetings that day, no clock named', text: positives[0].text, events: [ev(), ev({ id: 'ev_other', summary: 'Team sync', start: { dateTime: '2026-10-15T09:00:00+03:00' }, end: { dateTime: '2026-10-15T09:30:00+03:00' } })] },
  { why: 'the only event that day is not a meeting', text: positives[0].text, events: [ev({ summary: 'Dentist' })] },
  { why: 'the event has a guest', text: positives[1].text, events: [ev({ attendees: [{ email: 'dana@example.com' }] })] },
  { why: 'recurring series (instance)', text: positives[1].text, events: [ev({ recurringEventId: 'series_1' })] },
  { why: 'recurring series (master)', text: positives[1].text, events: [ev({ recurrence: ['RRULE:FREQ=WEEKLY'] })] },
  { why: 'someone else organizes it', text: positives[1].text, events: [ev({ organizer: { self: false, email: 'boss@example.com' } })] },
  { why: 'cancelled event', text: positives[1].text, events: [ev({ status: 'cancelled' })] },
  { why: 'all-day event', text: positives[0].text, events: [ev({ start: { date: '2026-10-15' }, end: { date: '2026-10-16' } })] },
  { why: 'the new slot already has an event', text: positives[1].text, events: [ev(), ev({ id: 'ev_busy', summary: 'Busy', start: { dateTime: '2026-10-16T11:00:00+03:00' }, end: { dateTime: '2026-10-16T11:30:00+03:00' } })] }
];
let wrongOffers = 0;
for (const n of negatives) {
  const card = M.card(base(n.text, n.events === undefined ? {} : { events: n.events }));
  if (card.action === 'offer') wrongOffers++;
  check('silent: ' + n.why, card.action === 'silence', card); if (process.env.WHY) console.log('  ->', n.why, '=>', card.reason);
}

console.log('\n--- the switch and the approve ---\n');
check('the switch defaults off', M.SWITCH === 'MEETING_MOVE' && M.SWITCH_DEFAULT === false && M.enabled() === false && M.enabled({ MEETING_MOVE: 1 }) === false);
check('switch off is not a card', M.card(base(positives[0].text, { flags: {} })).action === 'off');
const offeredCard = M.card(base(positives[0].text));
check('approve needs an explicit yes', M.approve(offeredCard, false).approved === false && M.approve(null, true).approved === false);
check('approve yes keeps the event', M.approve(offeredCard, true).approved === true && M.approve(offeredCard, true).event.id === 'ev_move_1');

console.log('\n--- execute reads the event back ---\n');
(async () => {
  const declined = mockCal();
  const no = await M.execute(base(positives[0].text, { approved: false }), { calendar: declined.calendar });
  check('no approve, no write', no.ok === false && no.reason === 'not-approved' && declined.calls.length === 0, no);

  const off = mockCal();
  const offRes = await M.execute(base(positives[0].text, { flags: {}, approved: true }), { calendar: off.calendar });
  check('switch off, no write', offRes.ok === false && offRes.reason === 'switch-off' && off.calls.length === 0, offRes);

  let proved = 0;
  for (const p of positives) {
    const io = mockCal();
    const yes = M.approve(M.card(base(p.text)), true);
    const res = await M.execute(base(p.text, { approved: yes.approved }), { calendar: io.calendar });
    const patch = io.calls.find((c) => c.method === 'PATCH');
    const wantStart = p.to + 'T' + String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0') + ':00';
    const ok = res.ok === true && Proof.allowsHandled(res) && res.proof.fetchedBack === true &&
      res.proof.system === 'google/calendar' && res.proof.externalId === 'ev_move_1' &&
      res.proof.verifiedAt === NOW.toISOString() &&
      io.calls.map((c) => c.method).join() === 'GET,PATCH,GET' &&
      io.calls.every((c) => c.path.indexOf('sendUpdates=none') !== -1) &&
      patch.body.start.dateTime === wantStart && Object.keys(patch.body).sort().join() === 'end,start' &&
      !io.calls.some((c) => /\/messages|gmail\.|mail\.send/i.test(c.path)) &&
      io.live().summary === 'Quote call' && io.live().attendees.length === 0;
    if (ok) proved++;
    check('proved move: ' + p.text, ok, res.ok ? res.proof : res);
  }

  const auth = mockCal({ getStatus: 401 });
  const authRes = await M.execute(base(positives[0].text, { approved: true }), { calendar: auth.calendar });
  check('401 is not Handled and nothing is written', authRes.ok === false && authRes.reason === 'not-connected' && authRes.proof == null && !auth.calls.some((c) => c.method === 'PATCH'), authRes);

  const patch403 = mockCal({ patchStatus: 403 });
  const patch403Res = await M.execute(base(positives[0].text, { approved: true }), { calendar: patch403.calendar });
  check('a refused PATCH is not Handled', patch403Res.ok === false && patch403Res.reason === 'not-connected' && patch403Res.proof == null, patch403Res);

  const edited = mockCal({ getBefore: (e) => Object.assign({}, e, { summary: 'Edited since the card' }) });
  const editedRes = await M.execute(base(positives[0].text, { approved: true }), { calendar: edited.calendar });
  check('an event edited since the card is not moved', editedRes.ok === false && editedRes.reason === 'changed' && !edited.calls.some((c) => c.method === 'PATCH'), editedRes);

  const guestsNow = mockCal({ getBefore: (e) => Object.assign({}, e, { attendees: [{ email: 'dana@example.com' }] }) });
  const guestsRes = await M.execute(base(positives[0].text, { approved: true }), { calendar: guestsNow.calendar });
  check('a guest added since the card is not moved', guestsRes.ok === false && guestsRes.reason === 'changed' && !guestsNow.calls.some((c) => c.method === 'PATCH'), guestsRes);

  const mismatch = mockCal({ afterPatch: (e) => Object.assign({}, e, { start: { dateTime: '2026-10-16T12:00:00+03:00', timeZone: 'Asia/Jerusalem' } }) });
  const bad = await M.execute(base(positives[0].text, { approved: true }), { calendar: mismatch.calendar });
  check('a different clock is not Handled and the old time is put back', bad.ok === false && bad.reason === 'verify_failed' && bad.proof == null &&
    mismatch.live().start.dateTime === '2026-10-15T16:00:00+03:00', { bad: bad, live: mismatch.live() });

  const unread = mockCal({ getStatus: 500 });
  const unreadRes = await M.execute(base(positives[0].text, { approved: true }), { calendar: unread.calendar });
  check('a failed read is not Handled and writes nothing', unreadRes.ok === false && unreadRes.reason === 'verify_failed' && !unread.calls.some((c) => c.method === 'PATCH'), unread.calls.map((c) => c.method));

  console.log('\n--- undo ---\n');
  const held = mockCal();
  const moved = await M.execute(base(positives[0].text, { approved: true }), { calendar: held.calendar });
  const undone = await M.undo({ flags: ON, ref: moved.ref, now: NOW }, { calendar: held.calendar });
  check('undo puts the old time back', undone.ok === true && undone.restored === true && held.live().start.dateTime === '2026-10-15T16:00:00+03:00' && held.live().end.dateTime === '2026-10-15T16:30:00+03:00' && moved.proof.fetchedBack === true, undone);

  const again = mockCal();
  const movedTwice = await M.execute(base(positives[0].text, { approved: true }), { calendar: again.calendar });
  const live = again.live();
  live.summary = 'Someone else edited this';
  const before = again.calls.length;
  const left = await M.undo({ flags: ON, ref: movedTwice.ref, now: NOW }, { calendar: again.calendar });
  check('an edited event is left alone', left.ok === false && left.reason === 'edited' && again.live().summary === 'Someone else edited this' && !again.calls.slice(before).some((c) => c.method === 'PATCH'), left);

  const shifted = mockCal();
  const movedThree = await M.execute(base(positives[0].text, { approved: true }), { calendar: shifted.calendar });
  shifted.live().start = { dateTime: '2026-10-18T09:00:00+03:00', timeZone: 'Asia/Jerusalem' };
  const shiftedRes = await M.undo({ flags: ON, ref: movedThree.ref, now: NOW }, { calendar: shifted.calendar });
  check('an event the person moved again is left alone', shiftedRes.ok === false && shiftedRes.reason === 'edited' && shifted.live().start.dateTime.indexOf('2026-10-18') === 0, shiftedRes);

  const gone = mockCal({ event: null });
  const goneRes = await M.undo({ flags: ON, ref: moved.ref, now: NOW }, { calendar: gone.calendar });
  check('an event that is gone is not invented back', goneRes.ok === false && goneRes.reason === 'already-gone' && !gone.calls.some((c) => c.method === 'PATCH'), goneRes);

  const offUndo = mockCal();
  const offU = await M.undo({ flags: {}, ref: moved.ref, now: NOW }, { calendar: offUndo.calendar });
  check('undo stays off with the switch', offU.reason === 'switch-off' && offUndo.calls.length === 0, offU);

  console.log('\n--- what the engine did before (no read-back, no switch) ---\n');
  let engineMoves = 0;
  for (const p of positives) {
    const intent = FlowIntent.classify(p.text, { senderEmail: 'dana@meridian.com', now: NOW, calibration: null });
    if (intent.personalClose === 'calendar-move' && FlowIntent.shouldShowChip(intent)) engineMoves++;
  }
  console.log('BASELINE engine offers a move=' + engineMoves + '/' + positives.length + ' with fetchedBack=0/' + positives.length);
  check('the new close covers at least as many clear moves as the engine did', offered >= engineMoves, { offered: offered, engineMoves: engineMoves });

  console.log('\nCOUNTS offers=' + offered + '/' + positives.length + ' silence=' + (negatives.length - wrongOffers) + '/' + negatives.length + ' proved=' + proved + ' wrongOffers=' + wrongOffers);
  console.log('TOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
