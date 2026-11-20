// Outlook (and any host that loads the ledger after the storage adapter)
// wires the same local store. The adapter script may already have run.
(function () {
  if (typeof FlowClosedIntentLedger === 'undefined' || typeof glanceLocalAdapter !== 'function') return;
  try { FlowClosedIntentLedger.setStorageAdapter(glanceLocalAdapter()); } catch (e) { /* recording stays off */ }
})();
