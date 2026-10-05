
// Active Outlook draft receipts must survive an older undone for the same messageId.
// Run: node test/outlook-receipt-corpus.cjs
// Mirrors getActiveOutlookReceiptsFrom in src/storage.js (kept in sync by this corpus).
function getActiveOutlookReceiptsFrom(state) {
  const log = (state && state.log) || [];
  const undoTsByMsg = Object.create(null);
  const undoByRef = Object.create(null);
  for (const e of log) {
    if (!e || e.kind !== 'undone' || !e.messageId) continue;
    const ts = e.ts || 0;
    if (undoTsByMsg[e.messageId] == null || ts >= undoTsByMsg[e.messageId]) undoTsByMsg[e.messageId] = ts;
    if (e.ref) undoByRef[e.messageId + '|' + e.ref] = ts;
  }
  const out = [];
  const seen = new Set();
  for (const e of log) {
    if (!e || e.kind !== 'written' || e.connectorId !== 'outlookDraft' || !e.messageId) continue;
    if (e.undone || e.outlookSent || e.outlookReceipt === false) continue;
    const wts = e.ts || 0;
    if (e.ref && undoByRef[e.messageId + '|' + e.ref] != null && undoByRef[e.messageId + '|' + e.ref] >= wts) continue;
    if (undoTsByMsg[e.messageId] != null && undoTsByMsg[e.messageId] >= wts) continue;
    if (seen.has(e.messageId)) continue;
    seen.add(e.messageId);
    out.push(e);
  }
  return out;
}
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const olderUndone = { kind: 'undone', messageId: 'pilot', ts: 100, label: 'old' };
const freshDraft = { kind: 'written', messageId: 'pilot', connectorId: 'outlookDraft', ref: 'd2', ts: 200, outlookReceipt: true, label: 'Reply draft ready in Outlook Drafts. Not sent.' };
const r1 = getActiveOutlookReceiptsFrom({ log: [freshDraft, olderUndone] });
check('newer draft receipt shows despite older undone', r1.length === 1 && r1[0].ref === 'd2', r1);

const undoneSame = { kind: 'undone', messageId: 'pilot', ref: 'd2', ts: 300, label: 'Reply draft removed. Not sent.' };
const r2 = getActiveOutlookReceiptsFrom({ log: [undoneSame, freshDraft, olderUndone] });
check('undone after draft hides receipt', r2.length === 0, r2);

const { FlowOutlookStateMigrate: M } = require('../core/outlook-state-migrate.js');
const merged = M.mergeHandledUndone([
  { kind: 'written', messageId: 'm1', connectorId: 'outlookDraft', label: 'Reply draft ready' },
  { kind: 'undone', messageId: 'm1' }
]);
check('merge label is plain removed text', merged.some((e) => e.kind === 'undone' && e.label === 'Reply draft removed. Not sent.'), merged);

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
process.exit(failures ? 1 : 0);
