// ProofOfClose for one Google Task, and the Undo gate.
// A match is id + title + due on the object just read back.
// Undo deletes only when title, due, etag, and updated are still the
// values from that read. Any difference is a user edit: do not delete.

var GlanceProof = (function () {
  function normTitle(value) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    try { text = text.normalize('NFC'); } catch (err) { /* already a string */ }
    return text;
  }

  function normalizeDue(value) {
    if (value == null || value === '') return null;
    var match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  function snapshotOf(task, listId) {
    return {
      listId: String(listId || ''),
      id: String(task.id),
      title: normTitle(task.title),
      due: normalizeDue(task.due),
      etag: task.etag ? String(task.etag) : '',
      updated: task.updated ? String(task.updated) : ''
    };
  }

  // Compare the create response with the following GET.
  function compareCreated(created, fetched) {
    if (!created || !fetched) return { ok: false, reason: 'mismatch' };
    if (fetched.deleted) return { ok: false, reason: 'mismatch' };
    if (!created.id || String(fetched.id) !== String(created.id)) return { ok: false, reason: 'mismatch' };
    if (normTitle(fetched.title) !== normTitle(created.title)) return { ok: false, reason: 'mismatch' };
    if (normalizeDue(fetched.due) !== normalizeDue(created.due)) return { ok: false, reason: 'mismatch' };
    return { ok: true, snapshot: null };
  }

  function unchanged(snapshot, current) {
    if (!snapshot || !current || current.deleted) return false;
    if (String(current.id) !== String(snapshot.id)) return false;
    if (normTitle(current.title) !== snapshot.title) return false;
    if (normalizeDue(current.due) !== snapshot.due) return false;
    var etag = current.etag ? String(current.etag) : '';
    if (snapshot.etag && etag && snapshot.etag !== etag) return false;
    var updated = current.updated ? String(current.updated) : '';
    if (snapshot.updated && updated && snapshot.updated !== updated) return false;
    return true;
  }

  function undoDecision(snapshot, current) {
    if (!current) return { action: 'missing' };
    if (current.deleted) return { action: 'missing' };
    if (!unchanged(snapshot, current)) return { action: 'refuse' };
    return { action: 'delete' };
  }

  // The fields a later edit would change. Formatting that Google adds
  // around a dateTime (seconds, an offset) is not an edit.
  function canonicalEvent(event) {
    function when(point) {
      if (!point) return '';
      if (point.date) return 'd:' + String(point.date).slice(0, 10);
      if (point.dateTime) return 't:' + String(point.dateTime).slice(0, 16);
      return '';
    }
    var attendees = [];
    var list = (event && event.attendees) || [];
    for (var i = 0; i < list.length; i++) {
      var email = list[i] && list[i].email ? String(list[i].email).toLowerCase() : '';
      if (email) attendees.push(email);
    }
    attendees.sort();
    return {
      summary: normTitle(event && event.summary),
      start: when(event && event.start),
      end: when(event && event.end),
      description: normTitle(event && event.description),
      location: normTitle(event && event.location),
      attendees: attendees.join(',')
    };
  }

  function contentHash(event) {
    var body = JSON.stringify(canonicalEvent(event));
    var hash = 5381;
    for (var i = 0; i < body.length; i++) {
      hash = ((hash << 5) + hash + body.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
  }

  function whenOf(event) {
    var start = canonicalEvent(event).start;
    if (start.indexOf('t:') === 0) return start.slice(2).replace('T', ' ');
    if (start.indexOf('d:') === 0) return start.slice(2);
    return '';
  }

  function compareEvent(created, fetched) {
    if (!created || !fetched) return { ok: false, reason: 'mismatch' };
    if (fetched.status === 'cancelled') return { ok: false, reason: 'mismatch' };
    if (!created.id || String(fetched.id) !== String(created.id)) return { ok: false, reason: 'mismatch' };
    var left = canonicalEvent(created);
    var right = canonicalEvent(fetched);
    if (left.summary !== right.summary) return { ok: false, reason: 'mismatch' };
    if (left.start !== right.start || left.end !== right.end) return { ok: false, reason: 'mismatch' };
    if (left.description !== right.description) return { ok: false, reason: 'mismatch' };
    if (left.location !== right.location) return { ok: false, reason: 'mismatch' };
    if (left.attendees !== right.attendees) return { ok: false, reason: 'mismatch' };
    return { ok: true };
  }

  function eventSnapshot(event, calendarId) {
    var canonical = canonicalEvent(event);
    return {
      calendarId: String(calendarId || 'primary'),
      id: String(event.id),
      contentHash: contentHash(event),
      summary: canonical.summary,
      start: canonical.start,
      end: canonical.end
    };
  }

  // No stored hash is not a license to delete. An edit is a different hash.
  function eventUndoDecision(snapshot, current) {
    if (!snapshot || !snapshot.contentHash) return { action: 'refuse', which: 'event' };
    if (!current || current.status === 'cancelled') return { action: 'missing' };
    if (String(current.id) !== String(snapshot.id)) return { action: 'refuse', which: 'event' };
    if (contentHash(current) !== snapshot.contentHash) return { action: 'refuse', which: 'event' };
    return { action: 'delete' };
  }

  return {
    normTitle: normTitle,
    normalizeDue: normalizeDue,
    snapshotOf: snapshotOf,
    compareCreated: compareCreated,
    unchanged: unchanged,
    undoDecision: undoDecision,
    canonicalEvent: canonicalEvent,
    contentHash: contentHash,
    whenOf: whenOf,
    compareEvent: compareEvent,
    eventSnapshot: eventSnapshot,
    eventUndoDecision: eventUndoDecision
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceProof;
