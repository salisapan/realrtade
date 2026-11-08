// Move that meeting, proven (close map C2), behind CALENDAR_MOVE_PROOF (off).
// The real recognizer (core/intent.js, family G) reads the move in Hebrew and
// English; the plan moves only the person's own event at the old clock, with no
// other guests; the PATCH is read back by id; Undo refuses after the person's
// own edit. Google Calendar is mocked. Nothing is sent to anyone.
// Run: node test/calendar-move-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowCalendarMove: M } = require('../core/calendar-move.js');
const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'close-families.js', 'intent.js', 'actions.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sandbox, { filename: f });
}
const FlowIntent = vm.runInContext('FlowIntent', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const NOW = new Date('2026-09-17T12:00:00Z');
const NOW_MS = NOW.getTime();
const ON = { CALENDAR_MOVE_PROOF: true };
const classify = (text) => FlowIntent.classify(text, { senderEmail: 'dana@meridian.com', now: NOW, calibration: null });

// ---- 1. recognition: the real engine --------------------------------------------
console.log('\n--- recognition (core/intent.js family G) ---\n');
const positives = [
  ['Can we reschedule the Friday, September 18 at 3pm sync to Thursday, September 24 at 4pm?', '2026-09-18T15:00', '2026-09-24T16:00'],
  ['Let\'s move our call from Friday, September 18 at 10:00 to Monday, September 21 at 11:00.', '2026-09-18T10:00', '2026-09-21T11:00'],
  ['אפשר להזיז את הפגישה מיום שישי ב-10:00 ליום שני ב-11:00?', '2026-09-18T10:00', '2026-09-21T11:00']
];
const moves = [];
for (const [text, from, to] of positives) {
  const it = classify(text);
  const e = it.entities || {};
  const gotFrom = e.fromDateIso && (e.fromDateIso + 'T' + String(e.fromHour).padStart(2, '0') + ':' + String(e.fromMinute || 0).padStart(2, '0'));
  const gotTo = e.dateIso && (e.dateIso + 'T' + String(e.hour).padStart(2, '0') + ':' + String(e.minute || 0).padStart(2, '0'));
  check('move: ' + text.slice(0, 50), it.personalClose === 'calendar-move' && gotFrom === from && gotTo === to, { pc: it.personalClose, gotFrom, gotTo });
  moves.push(it);
}
const negatives = [
  'אפשר לדחות את הפגישה ליום חמישי בשעה 16:00?',
  'Can we meet Thursday at 16:00?',
  'Thursday\'s call is cancelled.',
  'Let\'s find a time next week.',
  'Move Friday, September 18 at 10:00 to Monday, September 21 at 11:00.',
  'נדבר בהמשך השבוע.'
];
for (const text of negatives) {
  const it = classify(text);
  check('not a move: ' + text.slice(0, 50), it.personalClose !== 'calendar-move', it.personalClose);
}

// ---- 2. the plan ------------------------------------------------------------------
console.log('\n--- the plan moves only the person\'s own event ---\n');
const TZ = 'Asia/Jerusalem';
const ev = (extra) => Object.assign({
  id: 'ev1', etag: '"e1"', status: 'confirmed', summary: 'Sync with Dana',
  start: { dateTime: '2026-09-18T15:00:00+03:00', timeZone: TZ },
  end: { dateTime: '2026-09-18T15:45:00+03:00', timeZone: TZ },
  organizer: { email: 'sali@realtrade.co.il', self: true }
}, extra || {});
const intent = moves[0];
const p = (events, extra) => M.plan(Object.assign({ flags: ON, intent, events, now: NOW_MS }, extra || {}));

check('switch off: off', M.plan({ intent, events: [ev()], now: NOW_MS }).action === 'off');
check('switch "true" string: off', M.plan({ flags: { CALENDAR_MOVE_PROOF: 'true' }, intent, events: [ev()], now: NOW_MS }).action === 'off');
const good = p([ev()]);
check('one own event: move', good.action === 'move' && good.eventId === 'ev1', good);
check('keeps the 45 minutes and the zone', good.to && good.to.start.dateTime === '2026-09-24T16:00:00' && good.to.end.dateTime === '2026-09-24T16:45:00' && good.to.start.timeZone === TZ, good.to);
check('English line', /^Move on your calendar: Sync with Dana to 2026-09-24 16:00$/.test(good.line), good.line);
check('Hebrew line', /^הזזת ביומן: /.test(M.plan({ flags: ON, intent: moves[2], events: [ev({ start: { dateTime: '2026-09-18T10:00:00+03:00', timeZone: TZ }, end: { dateTime: '2026-09-18T11:00:00+03:00', timeZone: TZ } })], now: NOW_MS, lang: 'he' }).line));
check('no event at the old clock: silence', p([ev({ start: { dateTime: '2026-09-18T14:00:00+03:00', timeZone: TZ } })]).reason === 'no-event');
check('two events at the old clock: silence', p([ev(), ev({ id: 'ev2', etag: '"e2"' })]).reason === 'several-events');
check('a cancelled event does not count', p([ev(), ev({ id: 'ev2', status: 'cancelled' })]).action === 'move');
check('guests: silence (moving would send them an update)', p([ev({ attendees: [{ email: 'sali@realtrade.co.il', self: true }, { email: 'dana@meridian.com' }] })]).reason === 'has-guests');
check('only me and a room: moves', p([ev({ attendees: [{ email: 'sali@realtrade.co.il', self: true }, { email: 'room@resource.calendar.google.com', resource: true }] })]).action === 'move');
check('someone else organizes it: silence', p([ev({ organizer: { email: 'dana@meridian.com', self: false } })]).reason === 'not-organizer');
check('recurring: silence', p([ev({ recurringEventId: 'series1' })]).reason === 'recurring');
check('no etag: silence', p([ev({ etag: undefined })]).reason === 'no-event-id');
check('into the past: silence', M.plan({ flags: ON, intent, events: [ev()], now: Date.parse('2026-10-01T00:00:00Z') }).reason === 'past');
check('not a move intent: silence', M.plan({ flags: ON, intent: classify('Can we meet Thursday at 16:00?'), events: [ev()], now: NOW_MS }).action === 'silence');
check('one clock only: silence', M.plan({ flags: ON, intent: { personalClose: 'calendar-move', entities: { dateIso: '2026-09-24', hour: 16 } }, events: [ev()], now: NOW_MS }).reason === 'two-clocks-needed');
check('same slot: silence', M.plan({ flags: ON, intent: { personalClose: 'calendar-move', entities: { fromDateIso: '2026-09-18', fromHour: 15, dateIso: '2026-09-18', hour: 15 } }, events: [ev()], now: NOW_MS }).reason === 'same-slot');

// ---- 3. move: PATCH then GET by id --------------------------------------------------
console.log('\n--- move is read back by id ---\n');
function calendar(initial, opts) {
  opts = opts || {};
  const store = { ev: JSON.parse(JSON.stringify(initial)), n: 1 };
  const calls = [];
  const http = async (method, url, body, headers) => {
    calls.push({ method, url, body: body ? JSON.parse(body) : null, headers });
    if (opts.fail && opts.fail(method, calls.length)) return opts.fail(method, calls.length);
    if (method === 'PATCH') {
      if (!store.ev) return { ok: false, status: 404 };
      if (headers['If-Match'] && headers['If-Match'] !== store.ev.etag) return { ok: false, status: 412 };
      const b = JSON.parse(body);
      store.ev.start = Object.assign({}, b.start, { dateTime: b.start.dateTime.slice(0, 19) + '+03:00' });
      store.ev.end = Object.assign({}, b.end, { dateTime: b.end.dateTime.slice(0, 19) + '+03:00' });
      store.ev.etag = '"e' + (++store.n) + '"';
      if (opts.afterPatch) opts.afterPatch(store);
      return { ok: true, status: 200, json: store.ev };
    }
    if (!store.ev) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: JSON.parse(JSON.stringify(store.ev)) };
  };
  return { http, calls, store };
}

(async () => {
  const NOWS = '2026-09-17T12:00:00.000Z';
  const cal = calendar(ev());
  const r = await M.move({ flags: ON, plan: good, now: NOWS }, cal.http);
  check('moved and Handled', r.ok === true && Proof.allowsHandled(r), r);
  check('proof: google/calendar, the event id, fetchedBack', r.proof && r.proof.system === 'google/calendar' && r.proof.externalId === 'ev1' && r.proof.fetchedBack === true);
  check('PATCH carries If-Match and sendUpdates=none', cal.calls[0].method === 'PATCH' && cal.calls[0].headers['If-Match'] === '"e1"' && /sendUpdates=none/.test(cal.calls[0].url));
  check('then GET by id', cal.calls[1].method === 'GET' && /\/events\/ev1$/.test(cal.calls[1].url));
  check('the calendar now holds the new time', cal.store.ev.start.dateTime.startsWith('2026-09-24T16:00'));

  const off = calendar(ev());
  const rOff = await M.move({ plan: good, now: NOWS }, off.http);
  check('switch off: no write, no call', rOff.ok === false && rOff.reason === 'switch-off' && off.calls.length === 0);

  const edited = calendar(ev({ etag: '"person-edited"' }));
  const rEd = await M.move({ flags: ON, plan: good, now: NOWS }, edited.http);
  check('the event changed since the plan: 412, no close', rEd.ok === false && rEd.reason === 'changed-since' && !Proof.allowsHandled(rEd));

  const gone = calendar(null);
  check('event deleted: gone', (await M.move({ flags: ON, plan: good, now: NOWS }, gone.http)).reason === 'gone');

  const auth = calendar(ev(), { fail: () => ({ ok: false, status: 401 }) });
  check('401: not-connected', (await M.move({ flags: ON, plan: good, now: NOWS }, auth.http)).reason === 'not-connected');

  const drift = calendar(ev(), { afterPatch: (s) => { s.ev.start.dateTime = '2026-09-24T17:00:00+03:00'; } });
  const rDrift = await M.move({ flags: ON, plan: good, now: NOWS }, drift.http);
  check('read back a different time: verify_failed, not Handled', rDrift.ok === false && rDrift.why === 'time-differs' && !Proof.allowsHandled(rDrift));

  const guestAdded = calendar(ev(), { afterPatch: (s) => { s.ev.attendees = [{ email: 'dana@meridian.com' }]; } });
  check('a guest appeared: verify_failed', (await M.move({ flags: ON, plan: good, now: NOWS }, guestAdded.http)).why === 'has-guests');

  const thrown = await M.move({ flags: ON, plan: good, now: NOWS }, async () => { throw new Error('net'); });
  check('network error: no close', thrown.ok === false && !Proof.allowsHandled(thrown));
  check('a silence plan never writes', (await M.move({ flags: ON, plan: { action: 'silence' }, now: NOWS }, cal.http)).reason === 'invalid');

  // ---- 4. Undo ------------------------------------------------------------------------
  console.log('\n--- Undo puts the old time back, never over an edit ---\n');
  const u = await M.undo(r.ref, cal.http);
  check('Undo: the old time is back, read back', u.ok === true && cal.store.ev.start.dateTime.startsWith('2026-09-18T15:00') && cal.store.ev.end.dateTime.startsWith('2026-09-18T15:45'), u);

  const cal2 = calendar(ev());
  const r2 = await M.move({ flags: ON, plan: good, now: NOWS }, cal2.http);
  cal2.store.ev.summary = 'Sync with Dana (moved by me)';
  cal2.store.ev.etag = '"person"';
  const u2 = await M.undo(r2.ref, cal2.http);
  check('person edited it since: Undo refuses, nothing written', u2.ok === false && u2.reason === 'changed-since' && u2.undoUnavailable === true && cal2.store.ev.start.dateTime.startsWith('2026-09-24'));

  const cal3 = calendar(ev());
  const r3 = await M.move({ flags: ON, plan: good, now: NOWS }, cal3.http);
  cal3.store.ev = null;
  check('event deleted since: Undo unavailable', (await M.undo(r3.ref, cal3.http)).reason === 'gone');
  check('not ours: refuses', (await M.undo({ eventId: 'ev1' }, cal.http)).reason === 'not-ours');

  console.log('\n' + (failures ? failures + ' FAILED' : 'All calendar-move checks passed.'));
  process.exit(failures ? 1 : 0);
})();
