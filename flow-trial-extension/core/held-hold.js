// A confirmation mail and its reminder tell the same appointment twice. Once a hold was written for a sender and not undone, the same
// day and clock from that sender is not offered again. Pure: it reads the activity log rows, newest first, and writes nothing.
(function (root) {
  'use strict';

  // 'YYYY-MM-DD HH:MM' for the day and clock of a hold, or '' when either is missing.
  function holdAt(entities) {
    const e = entities || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dateIso || '')) || !Number.isInteger(e.hour)) return '';
    const mm = Number.isInteger(e.minute) ? e.minute : 0;
    return e.dateIso + ' ' + String(e.hour).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // Who the mail came from. A business sends its confirmation and its reminder as two threads, so the thread cannot be the key.
  function senderOf(row) {
    return String((row && (row.holdSender || (row.sender && row.sender.email))) || '').trim().toLowerCase();
  }

  // The newest written, not-undone hold row from this sender at this day and clock, or null. ownIds are the open mail's ids: its own
  // hold is the receipt it shows, not a duplicate of itself.
  function find(log, senderEmail, at, ownIds) {
    const own = (ownIds || []).filter(Boolean).map(String);
    const from = String(senderEmail || '').trim().toLowerCase();
    if (!from || !at || !Array.isArray(log)) return null;
    const undone = {};
    for (const e of log) {
      if (!e) continue;
      if (e.kind === 'undone' && e.messageId) { undone[e.messageId] = true; continue; }
      if (e.kind !== 'written' || !e.ref) continue;
      if ((e.holdAt || holdAt(e.intent && e.intent.entities)) !== at) continue;
      if (e.messageId && undone[e.messageId]) continue;
      if (own.length && [e.messageId, e.itemId, e.pathId].some((x) => x && own.indexOf(String(x)) >= 0)) continue; // the open mail's own receipt is not a duplicate
      if (senderOf(e) !== from) continue;
      return e;
    }
    return null;
  }

  const api = { holdAt, find };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlowHeldHold = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
