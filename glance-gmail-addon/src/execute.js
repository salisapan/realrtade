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
    try { inserted = api.insert(proposal.listId, resource); } catch (err) { return { confirmed: false, reason: 'write' }; }
    if (!inserted || !inserted.id) return { confirmed: false, reason: 'write' };
    var fetched;
    try { fetched = api.get(proposal.listId, inserted.id); } catch (err) { return { confirmed: false, reason: 'fetch' }; }
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

  function performUndo(snapshot, api) {
    var Proof = proofLib();
    var current;
    try { current = api.get(snapshot.listId, snapshot.id); } catch (err) { return { action: 'unconfirmed' }; }
    var decision = Proof.undoDecision(snapshot, current);
    if (decision.action !== 'delete') return decision;
    try { api.remove(snapshot.listId, snapshot.id); } catch (err) { return { action: 'unconfirmed' }; }
    return { action: 'deleted' };
  }

  return { performCreate: performCreate, performUndo: performUndo };
})();

if (typeof module !== 'undefined') module.exports = GlanceExecute;
