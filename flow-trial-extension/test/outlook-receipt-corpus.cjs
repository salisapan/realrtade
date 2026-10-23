
// Active Outlook draft receipts must survive an older undone for the same messageId.
// Run: node test/outlook-receipt-corpus.cjs
// Mirrors getActiveOutlookReceiptsFrom in src/storage.js (kept in sync by this corpus).
function getActiveOutlookReceiptsFrom(state, opts) {
  const bareSlot = opts && opts.bareSlotKey === true;
  const log = (state && state.log) || [];
  const undoTsByMsg = Object.create(null);
  const undoByRef = Object.create(null);
  for (const e of log) {
    if (!e || e.kind !== 'undone' || !e.messageId) continue;
    const ts = e.ts || 0;
    if (undoTsByMsg[e.messageId] == null || ts >= undoTsByMsg[e.messageId]) undoTsByMsg[e.messageId] = ts;
    if (e.ref) undoByRef[e.messageId + '|' + e.ref] = ts;
  }
  const bestBySlot = Object.create(null);
  const seen = new Set();
  const out = [];
  function receiptSlotKey(entry) {
    if (!entry || !entry.messageId) return '';
    if (bareSlot) return entry.messageId;
    const slot = entry.connectorId === 'outlookDraft' ? 'draft' : 'other';
    return entry.messageId + '|' + slot;
  }
  const panelReceipt = (e) => e && e.kind === 'written' && e.connectorId === 'outlookDraft' && e.messageId && !e.undone && e.outlookReceipt !== false && !e.outlookSent;
  for (const e of log) {
    if (!panelReceipt(e)) continue;
    const wts = e.ts || 0;
    if (e.ref && undoByRef[e.messageId + '|' + e.ref] != null && undoByRef[e.messageId + '|' + e.ref] >= wts) continue;
    if (undoTsByMsg[e.messageId] != null && undoTsByMsg[e.messageId] >= wts) continue;
    const slot = receiptSlotKey(e);
    if (!slot) continue;
    if (bareSlot) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      out.push(e);
      continue;
    }
    const prev = bestBySlot[slot];
    if (!prev || wts >= (prev.ts || 0)) bestBySlot[slot] = e;
  }
  if (!bareSlot) return Object.keys(bestBySlot).map((k) => bestBySlot[k]);
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

const d1 = { kind: 'written', messageId: 'mix', connectorId: 'outlookDraft', ref: 'd1', ts: 100, outlookReceipt: true };
const d2same = { kind: 'written', messageId: 'mix', connectorId: 'outlookDraft', ref: 'd2', ts: 200, outlookReceipt: true };
const withSlot = getActiveOutlookReceiptsFrom({ log: [d1, d2same] });
const bareKey = getActiveOutlookReceiptsFrom({ log: [d1, d2same] }, { bareSlotKey: true });
check('receiptSlotKey draft|other keeps newest draft when two draft rows share messageId', withSlot.length === 1 && withSlot[0].ref === 'd2', withSlot);
check('bare messageId slot key hides a second draft on the same message (mutation must fail)', bareKey.length === 1 && bareKey[0].ref === 'd1', bareKey);

const { FlowOutlookStateMigrate: M } = require('../core/outlook-state-migrate.js');
const merged = M.mergeHandledUndone([
  { kind: 'written', messageId: 'm1', connectorId: 'outlookDraft', label: 'Reply draft ready' },
  { kind: 'undone', messageId: 'm1' }
]);
check('merge label is plain removed text', merged.some((e) => e.kind === 'undone' && e.label === 'Reply draft removed. Not sent.'), merged);

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
process.exit(failures ? 1 : 0);
