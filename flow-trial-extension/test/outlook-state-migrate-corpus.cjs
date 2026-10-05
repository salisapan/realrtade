// Outlook 0.9.5 migration: merge HANDLED+UNDONE, scrub false-close for draft undos.
// Run: node test/outlook-state-migrate-corpus.cjs
const { FlowOutlookStateMigrate: M } = require('../core/outlook-state-migrate.js');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

console.log('\n--- merge HANDLED + UNDONE ---\n');
{
  const log = [
    { kind: 'written', messageId: 'm1', connectorId: 'outlookDraft', label: 'Reply draft ready in Outlook Drafts. Not sent.', ref: 'd1', url: 'https://outlook/d1', app: 'outlook', ts: 2 },
    { kind: 'undone', messageId: 'm1', label: 'Reply draft ready…', app: 'outlook', ts: 1 },
    { kind: 'shown', messageId: 'm1', process: { id: 'x' }, app: 'outlook', ts: 3 }
  ];
  const merged = M.mergeHandledUndone(log);
  const written = merged.filter((e) => e.kind === 'written' && e.messageId === 'm1');
  const undone = merged.filter((e) => e.kind === 'undone' && e.messageId === 'm1');
  check('one undone, no leftover handled for same draft', written.length === 0 && undone.length === 1, merged);
  check('undone has outlookReopen', undone[0] && undone[0].outlookReopen === true, undone[0]);
}

console.log('\n--- scrub false-close for draft undos ---\n');
{
  const state = {
    outlookMigrateVersion: 0,
    log: [
      { kind: 'written', messageId: 'm1', connectorId: 'outlookDraft', app: 'outlook', ref: 'd1' },
      { kind: 'undone', messageId: 'm1', app: 'outlook' }
    ],
    resolvedMessageIds: ['m1', 'other'],
    closeQuality: { success: 0, return: 0, falseDoIt: 1, falseDoItIds: ['m1'], successIds: [], recent: [{ kind: 'falseDoIt', id: 'm1' }], lastDoItDay: null },
    stillOpenMetrics: { shown: 1, doIt: 1, undo: 0, falseClose: 1, notifyDismiss: 0, shownIds: ['m1'], doItIds: ['m1'], undoIds: [], falseCloseIds: ['m1'], recent: [{ kind: 'falseClose', id: 'm1' }] }
  };
  const r = M.migrate(state);
  check('migrated once', r.migrated === true && r.state.outlookMigrateVersion === M.MIGRATE_VERSION);
  check('falseDoIt cleared for draft undo', r.state.closeQuality.falseDoIt === 0 && r.state.closeQuality.falseDoItIds.length === 0, r.state.closeQuality);
  check('stillOpen falseClose cleared; undo recorded', r.state.stillOpenMetrics.falseClose === 0 && r.state.stillOpenMetrics.undo >= 1 && r.state.stillOpenMetrics.undoIds.indexOf('m1') !== -1, r.state.stillOpenMetrics);
  check('messageId removed from resolved so loop can reopen', r.state.resolvedMessageIds.indexOf('m1') === -1, r.state.resolvedMessageIds);
  const again = M.migrate(r.state);
  check('second migrate is no-op', again.migrated === false && again.changed === false);
}


console.log('\n--- bare 0.9.3 undone (no app tag) ---\n');
{
  const state = {
    outlookMigrateVersion: 0,
    log: [
      { kind: 'written', messageId: 'pilot', connectorId: 'outlookDraft', label: 'Reply draft ready in Outlook Drafts. Not sent.', ref: 'd1', url: 'https://x', app: 'outlook', ts: 2 },
      { kind: 'undone', messageId: 'pilot', label: 'Reply draft ready in Outlook Drafts. Not sent.', ts: 1 }
    ],
    resolvedMessageIds: ['pilot'],
    closeQuality: { success: 0, return: 0, falseDoIt: 1, falseDoItIds: ['pilot'], successIds: [], recent: [{ kind: 'falseDoIt', id: 'pilot', reason: 'undo' }], lastDoItDay: null },
    stillOpenMetrics: { shown: 1, doIt: 1, undo: 0, falseClose: 1, notifyDismiss: 0, shownIds: ['pilot'], doItIds: ['pilot'], undoIds: [], falseCloseIds: ['pilot'], recent: [] }
  };
  const r = M.migrate(state);
  const written = (r.state.log || []).filter((e) => e.kind === 'written' && e.messageId === 'pilot');
  const undone = (r.state.log || []).filter((e) => e.kind === 'undone' && e.messageId === 'pilot');
  check('bare undone merges away HANDLED twin', written.length === 0 && undone.length === 1, r.state.log);
  check('false-close 100% scrubbed', r.state.closeQuality.falseDoIt === 0, r.state.closeQuality);
  check('pilot not resolved after migrate', r.state.resolvedMessageIds.indexOf('pilot') === -1, r.state.resolvedMessageIds);
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
process.exit(failures ? 1 : 0);
