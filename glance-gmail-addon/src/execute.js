// Create then read back. Delete only when the read still matches.
// `api` is { insert(listId, resource), get(listId, taskId), remove(listId, taskId) }.
// No patch, no send.

var GlanceExecute = (function () {
  function proofLib() {
    if (typeof GlanceProof !== 'undefined') return GlanceProof;
    return require('./proof.js');
  }

  function performCreate(proposal, api) {
    var Proof = proofLib();
    var resource = { title: proposal.title };
    if (proposal.notes) resource.notes = String(proposal.notes).slice(0, 2000);
    if (proposal.due) resource.due = proposal.due + 'T00:00:00.000Z';
    var inserted;
    try { inserted = api.insert(proposal.listId, resource); } catch (err) { return failedWrite_('write', err); }
    if (!inserted || !inserted.id) return { confirmed: false, reason: 'write' };
    var fetched;
    try { fetched = api.get(proposal.listId, inserted.id); } catch (err) { return failedWrite_('fetch', err); }
    var cmp = Proof.compareCreated(inserted, fetched);
    if (!cmp.ok) return { confirmed: false, reason: 'mismatch' };
    return {
      confirmed: true,
      snapshot: Proof.snapshotOf(fetched, proposal.listId),
      view: {
        id: String(fetched.id),
        title: Proof.normTitle(fetched.title),
        due: Proof.normalizeDue(fetched.due)
      }
    };
  }

  function failedWrite_(reason, err) {
    return {
      confirmed: false,
      action: 'unconfirmed',
      reason: reason,
      name: err && err.name ? String(err.name) : '',
      detail: err && err.message ? String(err.message) : ''
    };
  }

  function performUndo(snapshot, api) {
    var Proof = proofLib();
    var current;
    try { current = api.get(snapshot.listId, snapshot.id); } catch (err) { return failedWrite_('fetch', err); }
    var decision = Proof.undoDecision(snapshot, current);
    if (decision.action !== 'delete') return decision;
    try { api.remove(snapshot.listId, snapshot.id); } catch (err) { return failedWrite_('delete', err); }
    return { action: 'deleted' };
  }

  function pad(n) {
    n = Number(n);
    return (n < 10 ? '0' : '') + n;
  }

  function wallClock(dateIso, hour, minute, addMinutes) {
    var parts = dateIso.split('-');
    var dt = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], hour, minute + (addMinutes || 0), 0));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate()) +
      'T' + pad(dt.getUTCHours()) + ':' + pad(dt.getUTCMinutes()) + ':00';
  }

  function nextDate(dateIso) {
    var parts = dateIso.split('-');
    var dt = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + 1));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  // Timed events last 30 minutes, the same default the extension writes.
  // A schedule with no clock is an all-day event. No guests.
  function eventBody(proposal) {
    var summary = String(proposal.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!summary) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposal.dateIso || '')) return null;
    var body = { summary: summary };
    if (proposal.description) body.description = String(proposal.description).slice(0, 8000);
    var timed = Number.isInteger(proposal.hour) && Number.isInteger(proposal.minute);
    if (timed) {
      var zone = proposal.timeZone || 'Etc/UTC';
      body.start = { dateTime: wallClock(proposal.dateIso, proposal.hour, proposal.minute, 0), timeZone: zone };
      body.end = { dateTime: wallClock(proposal.dateIso, proposal.hour, proposal.minute, 30), timeZone: zone };
    } else {
      body.start = { date: proposal.dateIso };
      body.end = { date: nextDate(proposal.dateIso) };
    }
    return body;
  }

  function performCreateEvent(proposal, api) {
    var Proof = proofLib();
    var resource = eventBody(proposal);
    if (!resource) return { confirmed: false, reason: 'write' };
    var calendarId = proposal.calendarId || 'primary';
    var inserted;
    try { inserted = api.insert(calendarId, resource); } catch (err) { return failedWrite_('write', err); }
    if (!inserted || !inserted.id) return { confirmed: false, reason: 'write' };
    var fetched;
    try { fetched = api.get(calendarId, inserted.id); } catch (err) { return failedWrite_('fetch', err); }
    var cmp = Proof.compareEvent(inserted, fetched);
    if (!cmp.ok) return { confirmed: false, reason: 'mismatch' };
    return {
      confirmed: true,
      snapshot: Proof.eventSnapshot(fetched, calendarId),
      view: {
        id: String(fetched.id),
        title: Proof.normTitle(fetched.summary),
        when: Proof.whenOf(fetched)
      }
    };
  }

  function performUndoEvent(snapshot, api) {
    var Proof = proofLib();
    if (!snapshot || !snapshot.contentHash) return { action: 'refuse', which: 'event' };
    var current;
    try { current = api.get(snapshot.calendarId, snapshot.id); } catch (err) { return failedWrite_('fetch', err); }
    var decision = Proof.eventUndoDecision(snapshot, current);
    if (decision.action !== 'delete') return decision.action === 'refuse' ? decision : { action: 'unconfirmed' };
    try { api.remove(snapshot.calendarId, snapshot.id); } catch (err) { return failedWrite_('delete', err); }
    return { action: 'deleted' };
  }

  // Both reads must still match. One edit refuses both deletes.
  function performUndoSchedule(snapshot, apis) {
    var Proof = proofLib();
    if (!snapshot || !snapshot.event || !snapshot.event.contentHash || !snapshot.task) {
      return { action: 'refuse', which: 'event' };
    }
    var eventNow;
    var taskNow;
    try { eventNow = apis.calendar.get(snapshot.event.calendarId, snapshot.event.id); } catch (err) { return failedWrite_('fetch', err); }
    try { taskNow = apis.tasks.get(snapshot.task.listId, snapshot.task.id); } catch (err) { return failedWrite_('fetch', err); }
    var eventDecision = Proof.eventUndoDecision(snapshot.event, eventNow);
    var taskDecision = Proof.undoDecision(snapshot.task, taskNow);
    if (eventDecision.action === 'refuse' || taskDecision.action === 'refuse') {
      return { action: 'refuse', which: eventDecision.action === 'refuse' ? 'event' : 'task' };
    }
    if (eventDecision.action !== 'delete' || taskDecision.action !== 'delete') return { action: 'unconfirmed' };
    try { apis.calendar.remove(snapshot.event.calendarId, snapshot.event.id); } catch (err) { return failedWrite_('delete', err); }
    try { apis.tasks.remove(snapshot.task.listId, snapshot.task.id); } catch (err) { return failedWrite_('delete', err); }
    return { action: 'deleted' };
  }

  return {
    performCreate: performCreate,
    performUndo: performUndo,
    eventBody: eventBody,
    performCreateEvent: performCreateEvent,
    performUndoEvent: performUndoEvent,
    performUndoSchedule: performUndoSchedule
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceExecute;
