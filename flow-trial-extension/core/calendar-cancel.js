// Cancel that meeting, proven (close map row C3). Portable: no chrome.*, no DOM,
// no network. Behind the off switch CALENDAR_CANCEL_PROOF (default off).
//
// Recognition is core/close-families.js family G: a cancel that names the slot
// («הפגישה ביום חמישי ב-16:00 מבוטלת», "The Thursday 4pm call is cancelled") gives
// intent personalClose 'calendar-cancel' with entities dateIso/hour/minute. Today
// src/background.js googleCalendarChange DELETEs the one event at that clock and
// reports it without a read-back. This module is the proven path:
//   - exactly one event at that clock, else silence;
//   - only the person's own event with no other guests: cancelling a meeting
//     with guests would send them a cancellation, and Glance never sends; an
//     event someone else organizes, a recurring series and an all-day event stay
//     silent;
//   - DELETE with If-Match (the event's etag) and sendUpdates=none, then GET by id:
//     Handled only when the calendar shows it cancelled (status 'cancelled', or
//     404/410);
//   - Undo restores the same event (PATCH status 'confirmed'), only while it is
//     still the cancelled copy Glance left (same etag); if anything changed since,
//     Undo refuses.
//
// The host injects http(method, url, body, headers) -> Promise<{ ok, status, json }>
// with the Google token. No src/ file calls this yet.
const FlowCalendarCancel = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'CALENDAR_CANCEL_PROOF';
  const SWITCH_DEFAULT = false;
  const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events/';
  const SYSTEM = 'google/calendar';

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  const pad = (n) => String(n).padStart(2, '0');
  function wall(t) {
    const s = t && typeof t.dateTime === 'string' ? t.dateTime : '';
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : '';
  }
  function otherGuests(ev) {
    return (Array.isArray(ev.attendees) ? ev.attendees : []).filter((a) => a && !a.self && !a.resource);
  }
  function silence(reason) { return { action: 'silence', reason: reason }; }

  // The plan: which one event is cancelled, or silence.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const intent = input.intent || {};
    if (intent.personalClose !== 'calendar-cancel') return silence('not-a-cancel');
    const e = intent.entities || intent;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(e.dateIso || '')) ? String(e.dateIso) : '';
    const hour = Number(e.hour);
    const minute = e.minute == null || e.minute === '' ? 0 : Number(e.minute);
    if (!date || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return silence('slot-needed');
    const slot = date + 'T' + pad(hour) + ':' + pad(minute);
    const now = typeof input.now === 'number' ? input.now : Date.now();
    if (Date.parse(slot + ':00') < now) return silence('past');
    const listed = (Array.isArray(input.events) ? input.events : []).filter((ev) => ev && ev.status !== 'cancelled');
    const hits = listed.filter((ev) => wall(ev.start) === slot);
    if (!hits.length) return silence(listed.some((ev) => ev && ev.start && ev.start.date) ? 'all-day' : 'no-event');
    if (hits.length > 1) return silence('several-events');
    const ev = hits[0];
    if (!ev.id || !ev.etag) return silence('no-event-id');
    if (ev.recurringEventId || (Array.isArray(ev.recurrence) && ev.recurrence.length)) return silence('recurring');
    if (ev.organizer && ev.organizer.self === false) return silence('not-organizer');
    if (otherGuests(ev).length) return silence('has-guests');
    const title = String(ev.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const he = intent.lang === 'he' || input.lang === 'he';
    const when = date + ' ' + slot.slice(11);
    return {
      action: 'cancel',
      eventId: String(ev.id),
      etag: String(ev.etag),
      title: title,
      slot: slot,
      line: he ? ('ביטול ביומן: ' + (title || 'הפגישה') + ' ב-' + when) : ('Cancel on your calendar: ' + (title || 'the meeting') + ' on ' + when)
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

  // DELETE the one event, then GET it by id: Handled only when it reads as cancelled.
  async function cancel(input, http) {
    input = input || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const p = input.plan;
    if (!p || p.action !== 'cancel' || !p.eventId || !p.etag) return miss('invalid');
    if (typeof http !== 'function') return miss('no-host');
    const url = API + encodeURIComponent(p.eventId);
    const del = await call(http, 'DELETE', url + '?sendUpdates=none', null, { 'If-Match': p.etag });
    if (del.status === 401 || del.status === 403) return miss('not-connected');
    if (del.status === 412) return miss('changed-since');
    if (del.status === 404 || del.status === 410) return miss('gone');
    if (!del.ok) return miss('write-failed', { status: del.status });
    const got = await call(http, 'GET', url, null, {});
    if (got.status === 401 || got.status === 403) return miss('not-connected');
    const gone = got.status === 404 || got.status === 410;
    const ev = got.ok ? got.json : null;
    if (!gone && !(ev && String(ev.id) === p.eventId && ev.status === 'cancelled')) return miss('verify_failed', { why: 'still-on-calendar' });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: p.eventId, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss('proof_pending');
    return {
      ok: true,
      proof: proof,
      written: (p.title || 'Event') + ' · off ' + p.slot.replace('T', ' '),
      ref: { eventId: p.eventId, etag: ev && ev.etag ? String(ev.etag) : '', restorable: Boolean(ev), slot: p.slot, createdByGlance: true }
    };
  }

  // Undo: the same event back, only while it is still the cancelled copy Glance left.
  async function undo(ref, http) {
    if (!ref || ref.createdByGlance !== true || !ref.eventId) return { ok: false, reason: 'not-ours' };
    if (typeof http !== 'function') return { ok: false, reason: 'no-host' };
    if (!ref.restorable || !ref.etag) return { ok: false, reason: 'not-restorable', undoUnavailable: true };
    const url = API + encodeURIComponent(ref.eventId);
    const now = await call(http, 'GET', url, null, {});
    if (now.status === 401 || now.status === 403) return { ok: false, reason: 'not-connected' };
    const ev = now.ok ? now.json : null;
    if (!ev) return { ok: false, reason: 'gone', undoUnavailable: true };
    if (ev.status !== 'cancelled' || String(ev.etag || '') !== ref.etag) return { ok: false, reason: 'changed-since', undoUnavailable: true };
    const back = await call(http, 'PATCH', url + '?sendUpdates=none', { status: 'confirmed' }, { 'If-Match': ref.etag });
    if (back.status === 412) return { ok: false, reason: 'changed-since', undoUnavailable: true };
    if (!back.ok) return { ok: false, reason: 'write-failed' };
    const again = await call(http, 'GET', url, null, {});
    const ev2 = again.ok ? again.json : null;
    if (!ev2 || ev2.status !== 'confirmed' || wall(ev2.start) !== ref.slot) return { ok: false, reason: 'verify_failed' };
    return { ok: true, undone: true };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, enabled, plan, cancel, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowCalendarCancel };
else if (typeof globalThis !== 'undefined') globalThis.FlowCalendarCancel = FlowCalendarCancel;
