// Cancel that meeting, proven (close map C3), behind CALENDAR_CANCEL_PROOF (off).
// The real recognizer (core/intent.js, family G) reads the cancel in Hebrew and
// English; the plan cancels only the person's own event at that clock, with no
// other guests; the DELETE is read back by id; Undo restores the same event only
// while it is still Glance's cancelled copy. Google Calendar is mocked.
// Run: node test/calendar-cancel-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { FlowCalendarCancel: C } = require('../core/calendar-cancel.js');
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
const ON = { CALENDAR_CANCEL_PROOF: true };
const classify = (text) => FlowIntent.classify(text, { senderEmail: 'dana@meridian.com', now: NOW, calibration: null });

// ---- 1. recognition: the real engine -------------------------------------------------
console.log('\n--- recognition (core/intent.js family G) ---\n');
const positives = [
  ['The Friday, September 18 at 3pm sync is cancelled.', '2026-09-18T15:00'],
  ['Please cancel the call on Friday, September 18 at 15:00.', '2026-09-18T15:00'],
  ['תבטל את הפגישה ביום שישי בשעה 15:00.', '2026-09-18T15:00'],
  ['לבטל את הפגישה ביום שישי ב-10:00.', '2026-09-18T10:00']
];
const cancels = [];
for (const [text, slot] of positives) {
  const it = classify(text);
  const e = it.entities || {};
  const got = e.dateIso && (e.dateIso + 'T' + String(e.hour).padStart(2, '0') + ':' + String(e.minute || 0).padStart(2, '0'));
  check('cancel: ' + text.slice(0, 50), it.personalClose === 'calendar-cancel' && got === slot, { pc: it.personalClose, got });
  cancels.push(it);
}
const negatives = [
  'Thursday\'s call is cancelled.',
  'Please cancel my subscription.',
  'The Friday 3pm sync went well.',
  'Can we meet Thursday at 16:00?',
  'Can we reschedule the Friday, September 18 at 3pm sync to Thursday, September 24 at 4pm?'
];
for (const text of negatives) {
  check('not a cancel: ' + text.slice(0, 50), classify(text).personalClose !== 'calendar-cancel');
}

// ---- 2. the plan ------------------------------------------------------------------------
console.log('\n--- the plan cancels only the person\'s own event ---\n');
const TZ = 'Asia/Jerusalem';
const ev = (extra) => Object.assign({
  id: 'ev1', etag: '"e1"', status: 'confirmed', summary: 'Sync with Dana',
  start: { dateTime: '2026-09-18T15:00:00+03:00', timeZone: TZ },
  end: { dateTime: '2026-09-18T15:45:00+03:00', timeZone: TZ },
  organizer: { email: 'sali@realtrade.co.il', self: true }
}, extra || {});
const intent = cancels[0];
const p = (events, extra) => C.plan(Object.assign({ flags: ON, intent, events, now: NOW_MS }, extra || {}));
check('switch off: off', C.plan({ intent, events: [ev()], now: NOW_MS }).action === 'off');
check('switch "true": off', C.plan({ flags: { CALENDAR_CANCEL_PROOF: 'true' }, intent, events: [ev()], now: NOW_MS }).action === 'off');
const good = p([ev()]);
check('one own event: cancel', good.action === 'cancel' && good.eventId === 'ev1', good);
check('English line', good.line === 'Cancel on your calendar: Sync with Dana on 2026-09-18 15:00', good.line);
check('Hebrew line', /^ביטול ביומן: /.test(p([ev()], { lang: 'he' }).line));
check('no event at that clock: silence', p([ev({ start: { dateTime: '2026-09-18T14:00:00+03:00' } })]).reason === 'no-event');
check('two events: silence', p([ev(), ev({ id: 'ev2', etag: '"e2"' })]).reason === 'several-events');
check('guests: silence (would send a cancellation)', p([ev({ attendees: [{ email: 'sali@realtrade.co.il', self: true }, { email: 'dana@meridian.com' }] })]).reason === 'has-guests');
check('only me and a room: cancel', p([ev({ attendees: [{ self: true, email: 'sali@realtrade.co.il' }, { email: 'room@resource.calendar.google.com', resource: true }] })]).action === 'cancel');
check('someone else organizes it: silence', p([ev({ organizer: { email: 'dana@meridian.com', self: false } })]).reason === 'not-organizer');
check('recurring: silence', p([ev({ recurringEventId: 's1' })]).reason === 'recurring');
check('past: silence', C.plan({ flags: ON, intent, events: [ev()], now: Date.parse('2026-10-01T00:00:00Z') }).reason === 'past');
check('not a cancel intent: silence', C.plan({ flags: ON, intent: classify('Can we meet Thursday at 16:00?'), events: [ev()], now: NOW_MS }).action === 'silence');
check('no clock: silence', C.plan({ flags: ON, intent: { personalClose: 'calendar-cancel', entities: { dateIso: '2026-09-18' } }, events: [ev()], now: NOW_MS }).reason === 'slot-needed');

// ---- 3. cancel: DELETE then GET by id -------------------------------------------------
console.log('\n--- cancel is read back by id ---\n');
function calendar(initial, opts) {
  opts = opts || {};
  const store = { ev: initial ? JSON.parse(JSON.stringify(initial)) : null, n: 1 };
  const calls = [];
  const http = async (method, url, body, headers) => {
    calls.push({ method, url, body: body ? JSON.parse(body) : null, headers });
    if (opts.fail) { const f = opts.fail(method, calls.length); if (f) return f; }
    if (!store.ev) return { ok: false, status: 404 };
    if (method === 'DELETE') {
      if (headers['If-Match'] && headers['If-Match'] !== store.ev.etag) return { ok: false, status: 412 };
      if (store.ev.status === 'cancelled') return { ok: false, status: 410 };
      store.ev.status = opts.deleteDoesNothing ? 'confirmed' : 'cancelled';
      store.ev.etag = '"e' + (++store.n) + '"';
      return { ok: true, status: 204 };
    }
    if (method === 'PATCH') {
      if (headers['If-Match'] && headers['If-Match'] !== store.ev.etag) return { ok: false, status: 412 };
      Object.assign(store.ev, JSON.parse(body));
      store.ev.etag = '"e' + (++store.n) + '"';
      return { ok: true, status: 200, json: store.ev };
    }
    return { ok: true, status: 200, json: JSON.parse(JSON.stringify(store.ev)) };
  };
  return { http, calls, store };
}

(async () => {
  const NOWS = '2026-09-17T12:00:00.000Z';
  const cal = calendar(ev());
  const r = await C.cancel({ flags: ON, plan: good, now: NOWS }, cal.http);
  check('cancelled and Handled', r.ok === true && Proof.allowsHandled(r), r);
  check('proof google/calendar, the event id, fetchedBack', r.proof.system === 'google/calendar' && r.proof.externalId === 'ev1' && r.proof.fetchedBack === true);
  check('DELETE carries If-Match and sendUpdates=none', cal.calls[0].method === 'DELETE' && cal.calls[0].headers['If-Match'] === '"e1"' && /sendUpdates=none/.test(cal.calls[0].url));
  check('then GET by id', cal.calls[1].method === 'GET' && /\/events\/ev1$/.test(cal.calls[1].url));

  const off = calendar(ev());
  const rOff = await C.cancel({ plan: good, now: NOWS }, off.http);
  check('switch off: no call', rOff.reason === 'switch-off' && off.calls.length === 0);
  check('edited since the plan: 412, no close', (await C.cancel({ flags: ON, plan: good, now: NOWS }, calendar(ev({ etag: '"person"' })).http)).reason === 'changed-since');
  check('already gone: gone', (await C.cancel({ flags: ON, plan: good, now: NOWS }, calendar(null).http)).reason === 'gone');
  check('401: not-connected', (await C.cancel({ flags: ON, plan: good, now: NOWS }, calendar(ev(), { fail: () => ({ ok: false, status: 401 }) }).http)).reason === 'not-connected');
  const still = await C.cancel({ flags: ON, plan: good, now: NOWS }, calendar(ev(), { deleteDoesNothing: true }).http);
  check('still on the calendar after DELETE: verify_failed, not Handled', still.ok === false && still.why === 'still-on-calendar' && !Proof.allowsHandled(still));
  const hard = calendar(ev(), { fail: (m, n) => (m === 'GET' ? { ok: false, status: 404 } : null) });
  const rHard = await C.cancel({ flags: ON, plan: good, now: NOWS }, hard.http);
  check('GET 404 after DELETE: Handled, Undo unavailable', rHard.ok === true && rHard.ref.restorable === false);
  check('network error: no close', (await C.cancel({ flags: ON, plan: good, now: NOWS }, async () => { throw new Error('x'); })).ok === false);
  check('a silence plan never writes', (await C.cancel({ flags: ON, plan: { action: 'silence' }, now: NOWS }, cal.http)).reason === 'invalid');

  // ---- 4. Undo ---------------------------------------------------------------------------
  console.log('\n--- Undo restores the same event, never over a change ---\n');
  const u = await C.undo(r.ref, cal.http);
  check('Undo: the event is back, read back', u.ok === true && cal.store.ev.status === 'confirmed', u);
  const cal2 = calendar(ev());
  const r2 = await C.cancel({ flags: ON, plan: good, now: NOWS }, cal2.http);
  cal2.store.ev.status = 'confirmed';
  cal2.store.ev.etag = '"person-restored"';
  const u2 = await C.undo(r2.ref, cal2.http);
  check('person restored it since: Undo refuses', u2.ok === false && u2.reason === 'changed-since' && u2.undoUnavailable === true);
  check('not restorable: Undo unavailable', (await C.undo(rHard.ref, hard.http)).reason === 'not-restorable');
  check('not ours: refuses', (await C.undo({ eventId: 'ev1' }, cal.http)).reason === 'not-ours');

  console.log('\n' + (failures ? failures + ' FAILED' : 'All calendar-cancel checks passed.'));
  process.exit(failures ? 1 : 0);
})();
