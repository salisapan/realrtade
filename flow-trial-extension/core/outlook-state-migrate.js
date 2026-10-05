// Pure migration for Outlook draft leftovers from builds before 0.9.5.
// No chrome.*, no network. storage.js persists; popup / outlook call it once.
//
// 0.9.3 Undo left a HANDLED written row + a separate UNDONE row, and counted
// the draft undo as false-Do-It / Still Open false-close. This fold merges
// the pair into one Undone row and recomputes stats under the draftOnly rule
// (prepared draft undo is not a false close).
const FlowOutlookStateMigrate = (() => {
  const MIGRATE_VERSION = 2;

  function isOutlookDraftRow(e) {
    if (!e) return false;
    if (e.connectorId === 'outlookDraft') return true;
    if (e.app === 'outlook' && (e.outlookReceipt || e.outlookReopen)) return true;
    return false;
  }

  function draftUndoMessageIds(log) {
    const written = Object.create(null);
    const undone = Object.create(null);
    for (const e of log || []) {
      if (!e || !e.messageId) continue;
      if (e.kind === 'written' && isOutlookDraftRow(e)) written[e.messageId] = true;
      // 0.9.3 appended bare { kind: 'undone', messageId } with no app/connectorId.
      if (e.kind === 'undone') undone[e.messageId] = true;
    }
    const ids = new Set();
    Object.keys(written).forEach((id) => {
      if (undone[id]) ids.add(id);
    });
    // Also outlook-tagged undos with no surviving written twin.
    for (const e of log || []) {
      if (e && e.kind === 'undone' && e.messageId && (isOutlookDraftRow(e) || e.outlookReopen || e.app === 'outlook')) {
        ids.add(e.messageId);
      }
    }
    return ids;
  }

  // One Undone row per draft-undone messageId; drop leftover HANDLED twins.
  function mergeHandledUndone(log) {
    const list = log || [];
    const draftUndoneIds = draftUndoMessageIds(list);
    if (!draftUndoneIds.size) return list.slice();

    const emittedUndone = Object.create(null);
    const out = [];
    for (const e of list) {
      if (!e || !e.messageId) { out.push(e); continue; }
      if (!draftUndoneIds.has(e.messageId)) { out.push(e); continue; }

      if (e.kind === 'written' && isOutlookDraftRow(e)) {
        if (emittedUndone[e.messageId]) continue;
        emittedUndone[e.messageId] = true;
        out.push(Object.assign({}, e, {
          kind: 'undone',
          label: (e.label || 'Reply draft ready in Outlook Drafts. Not sent.') + ' (undone)',
          undone: true,
          outlookReopen: true,
          url: null,
          ref: null,
          connectorId: 'outlookDraft',
          app: 'outlook'
        }));
        continue;
      }

      if (e.kind === 'undone') {
        if (emittedUndone[e.messageId]) continue;
        emittedUndone[e.messageId] = true;
        out.push(Object.assign({}, e, {
          undone: true,
          outlookReopen: true,
          url: null,
          ref: e.ref || null,
          connectorId: e.connectorId || 'outlookDraft',
          app: e.app || 'outlook'
        }));
        continue;
      }

      out.push(e);
    }
    return out;
  }

  function scrubFalseClose(closeQuality, stillOpenMetrics, draftUndoIds) {
    let changed = false;
    let cq = closeQuality && typeof closeQuality === 'object' ? Object.assign({}, closeQuality) : null;
    let so = stillOpenMetrics && typeof stillOpenMetrics === 'object' ? Object.assign({}, stillOpenMetrics) : null;

    if (cq && Array.isArray(cq.falseDoItIds)) {
      const before = cq.falseDoItIds.slice();
      cq.falseDoItIds = before.filter((id) => !draftUndoIds.has(id));
      const removed = before.length - cq.falseDoItIds.length;
      if (removed > 0) {
        cq.falseDoIt = Math.max(0, (cq.falseDoIt || 0) - removed);
        cq.recent = (cq.recent || []).filter((r) => !(r && r.kind === 'falseDoIt' && draftUndoIds.has(r.id)));
        changed = true;
      }
    }

    if (so && Array.isArray(so.falseCloseIds)) {
      const before = so.falseCloseIds.slice();
      so.falseCloseIds = before.filter((id) => !draftUndoIds.has(id));
      const removed = before.length - so.falseCloseIds.length;
      if (removed > 0) {
        so.falseClose = Math.max(0, (so.falseClose || 0) - removed);
        so.recent = (so.recent || []).filter((r) => !(r && r.kind === 'falseClose' && draftUndoIds.has(r.id)));
        changed = true;
      }
      so.undoIds = (so.undoIds || []).slice();
      draftUndoIds.forEach((id) => {
        if (so.undoIds.indexOf(id) === -1) {
          so.undoIds = [id].concat(so.undoIds).slice(0, 300);
          so.undo = (so.undo || 0) + 1;
          changed = true;
        }
      });
    }

    return { closeQuality: cq, stillOpenMetrics: so, changed };
  }

  function migrate(state) {
    const s = state || {};
    if ((s.outlookMigrateVersion || 0) >= MIGRATE_VERSION) {
      return { state: s, changed: false, migrated: false, draftUndoIds: [] };
    }
    const log0 = s.log || [];
    const log = mergeHandledUndone(log0);
    const draftIds = draftUndoMessageIds(log0);
    draftUndoMessageIds(log).forEach((id) => draftIds.add(id));

    const scrub = scrubFalseClose(s.closeQuality, s.stillOpenMetrics, draftIds);
    const resolved0 = s.resolvedMessageIds || [];
    const resolved = resolved0.filter((id) => !draftIds.has(id));

    const next = Object.assign({}, s, {
      log: log,
      resolvedMessageIds: resolved,
      outlookMigrateVersion: MIGRATE_VERSION
    });
    if (scrub.closeQuality) next.closeQuality = scrub.closeQuality;
    if (scrub.stillOpenMetrics) next.stillOpenMetrics = scrub.stillOpenMetrics;

    return {
      state: next,
      changed: true,
      migrated: true,
      draftUndoIds: Array.from(draftIds)
    };
  }

  return { MIGRATE_VERSION, migrate, mergeHandledUndone, draftUndoMessageIds, scrubFalseClose, isOutlookDraftRow };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookStateMigrate };
