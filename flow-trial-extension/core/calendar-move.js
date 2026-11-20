// Move that meeting, proven (close map row C2). Portable: no chrome.*, no DOM,
// no network. Behind the off switch CALENDAR_MOVE_PROOF (default off).
//
// Recognition is core/close-families.js family G ("Let's push Thursday's call to
// Friday at 11", «נדחה את הפגישה מיום חמישי ב-16:00 ליום שישי ב-11:00"): intent
// personalClose 'calendar-move' with entities fromDateIso/fromHour/fromMinute and
// dateIso/hour/minute. Today src/background.js googleCalendarChange PATCHes the
// one event at the old clock and reports it without a read-back. This module is
// the proven path:
//   - exactly one event at the old clock, else silence;
//   - only the person's own event with no other guests: moving a meeting with
//     guests would send them an update, and Glance never sends; an event someone
//     else organizes is not the person's to move; a recurring series and an
//     all-day event stay silent;
//   - the PATCH carries If-Match (the event's etag) and sendUpdates=none, keeps
//     the event's own length and time zone, and the event is read back by id: the
//     close is Handled only when the new start and end are on the calendar;
//   - Undo puts the old time back only while the event is still exactly what
//     Glance left (same etag); if the person edited it since, Undo refuses.
//
// The host injects http(method, url, body, headers) -> Promise<{ ok, status, json }>
// with the Google token. No src/ file calls this yet.
const FlowCalendarMove = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'CALENDAR_MOVE_PROOF';
  const SWITCH_DEFAULT = false;
  const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events/';
  const SYSTEM = 'google/calendar';

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  const pad = (n) => String(n).padStart(2, '0');
  function isoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; }
  function clock(h, m) {
    const hour = Number(h);
    const minute = m == null || m === '' ? 0 : Number(m);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }
  // The wall clock of an event time, 'YYYY-MM-DDTHH:MM', as the calendar wrote it.
  function wall(t) {
    const s = t && typeof t.dateTime === 'string' ? t.dateTime : '';
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : '';
  }
  function slot(dateIso, c) { return dateIso + 'T' + pad(c.hour) + ':' + pad(c.minute); }
  // Wall-clock arithmetic: the same length, on the target day, with no zone math.
  function addMinutes(wallStr, minutes) {
    const d = new Date(Date.UTC(+wallStr.slice(0, 4), +wallStr.slice(5, 7) - 1, +wallStr.slice(8, 10), +wallStr.slice(11, 13), +wallStr.slice(14, 16)));
    d.setUTCMinutes(d.getUTCMinutes() + minutes);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function minutesBetween(a, b) {
    const ms = Date.parse(b + ':00Z') - Date.parse(a + ':00Z');
    return Number.isFinite(ms) ? Math.round(ms / 60000) : NaN;
  }

  function silence(reason) { return { action: 'silence', reason: reason }; }

  // Guests other than the person and rooms.
  function otherGuests(ev) {
    return (Array.isArray(ev.attendees) ? ev.attendees : []).filter((a) => a && !a.self && !a.resource);
  }

  // The plan: which one event moves where, or silence.
  //   intent  the recognized move (personalClose 'calendar-move')
  //   events  what the host listed at the old clock (events.list, singleEvents, the person's zone)
  //   now     ms, for "not into the past"
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const intent = input.intent || {};
    if (intent.personalClose !== 'calendar-move') return silence('not-a-move');
    const e = intent.entities || intent;
    const fromDate = isoDate(e.fromDateIso);
    const toDate = isoDate(e.dateIso);
    const fromClock = clock(e.fromHour, e.fromMinute);
    const toClock = clock(e.hour, e.minute);
    if (!fromDate || !toDate || !fromClock || !toClock) return silence('two-clocks-needed');
    const from = slot(fromDate, fromClock);
    const to = slot(toDate, toClock);
    if (from === to) return silence('same-slot');
    const now = typeof input.now === 'number' ? input.now : Date.now();
    if (Date.parse(to + ':00') < now) return silence('past');
    const listed = (Array.isArray(input.events) ? input.events : []).filter((ev) => ev && ev.status !== 'cancelled');
    const hits = listed.filter((ev) => wall(ev.start) === from);
    if (!hits.length) return silence(listed.some((ev) => ev && ev.start && ev.start.date) ? 'all-day' : 'no-event');
    if (hits.length > 1) return silence('several-events');
    const ev = hits[0];
    if (!ev.id || !ev.etag) return silence('no-event-id');
    if (ev.recurringEventId || (Array.isArray(ev.recurrence) && ev.recurrence.length)) return silence('recurring');
    // Red team 2026-11-06 (docs/glance-ai/red-team.md): only an ordinary event of the person's own is theirs to move. An event with no
    // organizer said, a guest list the calendar left out (attendeesOmitted: the guests are there, unseen), a flight or booking Gmail put on
    // the calendar (eventType fromGmail), an out-of-office, focus-time or working-location block, a locked event and a private copy of
    // someone else's event all stay silent.
    if (!ev.organizer || ev.organizer.self !== true) return silence(ev.organizer && ev.organizer.self === false ? 'not-organizer' : 'organizer-unknown');
    if (ev.attendeesOmitted === true) return silence('guests-hidden');
    if (ev.eventType && ev.eventType !== 'default') return silence('not-a-plain-event:' + ev.eventType);
    if (ev.locked === true || ev.privateCopy === true) return silence('not-yours-to-move');
    if (otherGuests(ev).length) return silence('has-guests');
    const length = minutesBetween(wall(ev.start), wall(ev.end));
    if (!Number.isFinite(length) || length <= 0) return silence('no-length');
    const tz = (ev.start && ev.start.timeZone) || input.timeZone || null;
    const endTo = addMinutes(to, length);
    const title = String(ev.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const he = intent.lang === 'he' || input.lang === 'he';
    const when = toDate + ' ' + to.slice(11);
    return {
      action: 'move',
      eventId: String(ev.id),
      etag: String(ev.etag),
      title: title,
      from: { start: ev.start, end: ev.end },
      to: {
        start: Object.assign({ dateTime: to + ':00' }, tz ? { timeZone: tz } : {}),
        end: Object.assign({ dateTime: endTo + ':00' }, tz ? { timeZone: tz } : {})
      },
      line: he ? ('הזזת ביומן: ' + (title || 'הפגישה') + ' ל-' + when) : ('Move on your calendar: ' + (title || 'the meeting') + ' to ' + when)
    };
  }

  function miss(reason, extra) { return Object.assign({ ok: false, reason: reason, proof: null }, extra || {}); }

  async function call(http, method, url, body, headers) {
    try {
      const res = await http(method, url, body == null ? null : JSON.stringify(body), headers || {});
      return res || { ok: false, status: 0, json: null };
    } catch (e) {
      return { ok: false, status: 0, json: null };
    }
  }

  function same(t, want) {
    return wall(t) === wall(want) && (!want.timeZone || !t || !t.timeZone || t.timeZone === want.timeZone);
  }

  // PATCH the one event, then GET it by id. Handled only when the new start and
  // end are what the calendar holds.
  async function move(input, http) {
    input = input || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const p = input.plan;
    if (!p || p.action !== 'move' || !p.eventId || !p.etag) return miss('invalid');
    if (typeof http !== 'function') return miss('no-host');
    const url = API + encodeURIComponent(p.eventId);
    const patched = await call(http, 'PATCH', url + '?sendUpdates=none', { start: p.to.start, end: p.to.end }, { 'If-Match': p.etag });
    if (patched.status === 401 || patched.status === 403) return miss('not-connected');
    if (patched.status === 412) return miss('changed-since');
    if (patched.status === 404 || patched.status === 410) return miss('gone');
    if (!patched.ok) return miss('write-failed', { status: patched.status });
    const got = await call(http, 'GET', url, null, {});
    if (got.status === 401 || got.status === 403) return miss('not-connected');
    const ev = got.ok ? got.json : null;
    if (!ev || String(ev.id) !== p.eventId || ev.status === 'cancelled') return miss('verify_failed', { why: 'gone' });
    if (!same(ev.start, p.to.start) || !same(ev.end, p.to.end)) return miss('verify_failed', { why: 'time-differs' });
    if (otherGuests(ev).length) return miss('verify_failed', { why: 'has-guests' });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: p.eventId, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss('proof_pending');
    return {
      ok: true,
      proof: proof,
      written: (p.title || 'Event') + ' · ' + wall(ev.start).replace('T', ' '),
      ref: { eventId: p.eventId, etag: String(ev.etag || ''), previous: p.from, moved: { start: ev.start, end: ev.end }, createdByGlance: true }
    };
  }

  // Undo: the old time back, only while the event is exactly what Glance left.
  async function undo(ref, http) {
    if (!ref || ref.createdByGlance !== true || !ref.eventId || !ref.previous) return { ok: false, reason: 'not-ours' };
    if (typeof http !== 'function') return { ok: false, reason: 'no-host' };
    const url = API + encodeURIComponent(ref.eventId);
    const now = await call(http, 'GET', url, null, {});
    if (now.status === 401 || now.status === 403) return { ok: false, reason: 'not-connected' };
    const ev = now.ok ? now.json : null;
    if (!ev || ev.status === 'cancelled') return { ok: false, reason: 'gone', undoUnavailable: true };
    if (!ref.etag || String(ev.etag || '') !== ref.etag || !same(ev.start, ref.moved.start)) {
      return { ok: false, reason: 'changed-since', undoUnavailable: true };
    }
    const back = await call(http, 'PATCH', url + '?sendUpdates=none', { start: ref.previous.start, end: ref.previous.end }, { 'If-Match': ref.etag });
    if (back.status === 412) return { ok: false, reason: 'changed-since', undoUnavailable: true };
    if (!back.ok) return { ok: false, reason: 'write-failed' };
    const again = await call(http, 'GET', url, null, {});
    const ev2 = again.ok ? again.json : null;
    if (!ev2 || !same(ev2.start, ref.previous.start) || !same(ev2.end, ref.previous.end)) return { ok: false, reason: 'verify_failed' };
    return { ok: true, undone: true };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, enabled, plan, move, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowCalendarMove };
else if (typeof globalThis !== 'undefined') globalThis.FlowCalendarMove = FlowCalendarMove;
