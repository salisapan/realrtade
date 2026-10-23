
// Active Outlook draft receipts — uses production storage.js (not a mirror).
// Run: node test/outlook-receipt-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const engine = { module: undefined, console, FlowDisplay: null };
vm.createContext(engine);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/display-copy.js'), 'utf8'), engine, { filename: 'display-copy.js' });
global.FlowDisplay = engine.FlowDisplay;
const { FlowStorage } = require('../src/storage.js');
const getActiveOutlookReceiptsFrom = FlowStorage.getActiveOutlookReceiptsFrom;

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
check('receiptSlotKey draft|other keeps newest draft when two draft rows share messageId', withSlot.length === 1 && withSlot[0].ref === 'd2', withSlot);

const provedTodo = { kind: 'written', messageId: 'm1', connectorId: 'outlookTask', ref: 't1', ts: 100, fetchedBack: true, proof: { fetchedBack: true } };
const todoOnce = getActiveOutlookReceiptsFrom({ log: [provedTodo] });
check('one proved To Do receipt is not duplicated by glanceProofs pass', todoOnce.length === 1 && todoOnce[0].ref === 't1', todoOnce);

const { FlowOutlookStateMigrate: M } = require('../core/outlook-state-migrate.js');
const merged = M.mergeHandledUndone([
  { kind: 'written', messageId: 'm1', connectorId: 'outlookDraft', label: 'Reply draft ready' },
  { kind: 'undone', messageId: 'm1' }
]);
check('merge label is plain removed text', merged.some((e) => e.kind === 'undone' && e.label === 'Reply draft removed. Not sent.'), merged);

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
process.exit(failures ? 1 : 0);
