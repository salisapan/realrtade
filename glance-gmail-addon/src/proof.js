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

  return {
    normTitle: normTitle,
    normalizeDue: normalizeDue,
    snapshotOf: snapshotOf,
    compareCreated: compareCreated,
    unchanged: unchanged,
    undoDecision: undoDecision
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceProof;
