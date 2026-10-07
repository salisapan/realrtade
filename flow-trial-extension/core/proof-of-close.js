// Proof of close. A loop is Handled only after the system that received the
// write is read back. A draft, an attachment, and a calendar hold are not
// this proof. This slice speaks for Google Tasks only.
//
// Shape (execution architecture, decision 5):
//   { system, externalId, url?, number?, fetchedBack: true, verifiedAt }
// fetchedBack is the literal true. A missing read is proof_pending or
// verify_failed, and that result is not a trusted close.
//
// Portable: no chrome.*, no DOM, no network. The service worker performs
// the POST and the GET. This file only builds the proof and gates Handled.
const FlowProofOfClose = (() => {
  const SYSTEM_GOOGLE_TASKS = 'google/tasks';
  const REASON_PENDING = 'proof_pending';
  const REASON_FAILED = 'verify_failed';

  function clean(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  // A proof exists only when the read-back succeeded. Anything else is null,
  // so a caller cannot store a half-proof and later treat it as Handled.
  function buildProof(input) {
    input = input || {};
    if (input.fetchedBack !== true) return null;
    const system = clean(input.system);
    const externalId = clean(input.externalId);
    const verifiedAt = clean(input.verifiedAt);
    if (!system || !externalId || !verifiedAt) return null;
    if (Number.isNaN(Date.parse(verifiedAt))) return null;
    const proof = { system: system, externalId: externalId, fetchedBack: true, verifiedAt: verifiedAt };
    const url = clean(input.url);
    if (url) proof.url = url;
    if (input.number !== undefined && input.number !== null && input.number !== '') proof.number = input.number;
    return proof;
  }

  function isProof(proof) {
    return !!buildProof(proof);
  }

  // Handled for a writer that returns a proof. ok without fetchedBack is not
  // enough. Writers that have not adopted this shape are not judged here.
  function allowsHandled(result) {
    if (!result || result.ok !== true) return false;
    return isProof(result.proof);
  }

  function isGoogleTaskKind(kind) {
    return kind === 'googleTask' || kind === 'googleTasks';
  }

  // One step of a Do It. Google Tasks counts only with a proof. Every other
  // kind keeps the write it already had: this slice does not verify them.
  function stepCountsAsHandled(result) {
    if (!result || !result.response || result.response.ok !== true || result.response.skipped) return false;
    const kind = result.action && result.action.kind;
    if (isGoogleTaskKind(kind)) return allowsHandled(result.response);
    return true;
  }

  // Trusted close: every step in this attempt counts as handled. A verify
  // miss on the task makes the whole attempt not a trusted close.
  function shouldRecordTrustedClose(results) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      if (!stepCountsAsHandled(list[i])) return false;
    }
    return true;
  }

  // Activity row fields for a real proof. A miss stores nothing here.
  function activityFields(proof) {
    if (!isProof(proof)) return null;
    return { system: proof.system, externalId: proof.externalId, verifiedAt: proof.verifiedAt };
  }

  const STATUS_HANDLED = 'Handled.';
  const STATUS_HANDLED_HE = 'טופל.';
  const STATUS_PARTIAL = 'Partly handled.';
  const UNDO_HINT = 'Undo removes the Google Task.';
  const UNDONE_LINE = 'Undone — the Google Task was removed.';

  function clip(value, max) {
    const s = clean(value).replace(/\s+/g, ' ');
    if (!s) return '';
    return s.length > max ? s.slice(0, max) : s;
  }

  function externalIdOf(row) {
    if (!row) return '';
    const top = clean(row.externalId);
    if (top) return top;
    const ref = row.ref;
    if (!ref || typeof ref !== 'object') return '';
    return clean(ref.externalId) || clean(ref.taskId);
  }

  // A written Activity row that is still a trusted Google Task close.
  // fetchedBack true is the proof. A 0.9.28 row stored only system,
  // externalId, and verifiedAt — those three are written only after a
  // real read-back, so they count the same. fetchedBack false does not.
  function isTaskReceiptRow(row) {
    if (!row || row.kind !== 'written') return false;
    if (clean(row.system) !== SYSTEM_GOOGLE_TASKS) return false;
    if (!externalIdOf(row)) return false;
    const verifiedAt = clean(row.verifiedAt);
    if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) return false;
    if (row.fetchedBack === false) return false;
    return true;
  }

  // Newest log entry wins. The log is stored newest first. A later undo
  // or dismiss means the banner stays down. A later shown line does not
  // hide a proved task — that is the reload bug this picker exists for.
  function taskReceiptFromLog(log, messageId) {
    if (typeof messageId !== 'string' || !messageId) return null;
    const rows = Array.isArray(log) ? log : [];
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      if (!entry || entry.messageId !== messageId) continue;
      if (entry.kind === 'undone' || entry.kind === 'dismissed') return null;
      if (entry.kind !== 'written') continue;
      if (isTaskReceiptRow(entry)) return entry;
    }
    return null;
  }

  function receiptStatusOf(row) {
    if (!row) return STATUS_HANDLED;
    if (row.receiptStatus === STATUS_HANDLED || row.receiptStatus === STATUS_HANDLED_HE || row.receiptStatus === STATUS_PARTIAL) {
      return row.receiptStatus;
    }
    return STATUS_HANDLED;
  }

  // What the on-thread banner says when Gmail has rebuilt the message node.
  // Null when this row is not a trusted task close.
  function remountCopy(row) {
    if (!isTaskReceiptRow(row)) return null;
    const externalId = externalIdOf(row);
    const ref = { taskId: externalId, externalId: externalId };
    const listId = row.ref && typeof row.ref === 'object' ? clean(row.ref.taskListId) : '';
    if (listId) ref.taskListId = listId;
    const connector = (row.connectorId === 'googleTask' || row.connectorId === 'googleTasks') ? row.connectorId : 'googleTask';
    const url = clean(row.url);
    return {
      status: receiptStatusOf(row),
      writtenLine: clip(row.writtenLine, 180) || 'Google Task',
      processName: clip(row.processName, 80),
      closedLine: clip(row.closedLine, 180),
      undoHint: UNDO_HINT,
      undoneLine: UNDONE_LINE,
      url: url.slice(0, 8) === 'https://' ? url : '',
      connectorId: connector,
      externalId: externalId,
      ref: ref
    };
  }

  // Fields added to the written Activity row so a later scan can rebuild
  // the same banner. A miss stores nothing. activityFields stays the
  // short proof triple; this adds fetchedBack and the lines on the chip.
  function receiptLogFields(proof, display) {
    const fields = activityFields(proof);
    if (!fields) return null;
    const record = {
      system: fields.system,
      externalId: fields.externalId,
      verifiedAt: fields.verifiedAt,
      fetchedBack: true
    };
    display = display || {};
    const writtenLine = clip(display.writtenLine, 180);
    const processName = clip(display.processName, 80);
    const closedLine = clip(display.closedLine, 180);
    if (writtenLine) record.writtenLine = writtenLine;
    if (processName) record.processName = processName;
    if (closedLine) record.closedLine = closedLine;
    if (display.status === STATUS_HANDLED || display.status === STATUS_HANDLED_HE || display.status === STATUS_PARTIAL) {
      record.receiptStatus = display.status;
    }
    return record;
  }

  // Shape only. The live Google Tasks path is the service worker writer,
  // which POSTs, GETs, and undoes by externalId. Later adapters can share
  // this capabilities list. This stub does not call a network.
  function googleTasksAdapter() {
    return {
      id: 'google_tasks',
      capabilities: { preview: false, execute: true, verify: true, undo: true }
    };
  }

  return {
    SYSTEM_GOOGLE_TASKS: SYSTEM_GOOGLE_TASKS,
    REASON_PENDING: REASON_PENDING,
    REASON_FAILED: REASON_FAILED,
    buildProof: buildProof,
    isProof: isProof,
    allowsHandled: allowsHandled,
    isGoogleTaskKind: isGoogleTaskKind,
    stepCountsAsHandled: stepCountsAsHandled,
    shouldRecordTrustedClose: shouldRecordTrustedClose,
    activityFields: activityFields,
    taskReceiptFromLog: taskReceiptFromLog,
    remountCopy: remountCopy,
    receiptLogFields: receiptLogFields,
    googleTasksAdapter: googleTasksAdapter
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowProofOfClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowProofOfClose = FlowProofOfClose;
