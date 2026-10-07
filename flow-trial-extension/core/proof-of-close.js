// Proof of close. A loop is Handled only after the system that received the
// write is read back. A draft, an attachment, and a calendar hold are not
// this proof. This slice speaks for Google Tasks and Microsoft To Do.
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
  const SYSTEM_MICROSOFT_TODO = 'microsoft/todo';
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

  function isMicrosoftTodoKind(kind) {
    return kind === 'outlookTask' || kind === 'microsoftTodo';
  }

  // Task writers that must be read back before Handled. Calendar, drafts,
  // and Drive are not in this list.
  function isProofTaskKind(kind) {
    return isGoogleTaskKind(kind) || isMicrosoftTodoKind(kind);
  }

  // One step of a Do It. A task counts only with a proof. Every other
  // kind keeps the write it already had: this slice does not verify them.
  function stepCountsAsHandled(result) {
    if (!result || !result.response || result.response.ok !== true || result.response.skipped) return false;
    const kind = result.action && result.action.kind;
    if (isProofTaskKind(kind)) return allowsHandled(result.response);
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
  const TODO_UNDO_HINT = 'Undo removes the To Do task.';
  const TODO_UNDONE_LINE = 'Undone — the To Do task was removed.';

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

  // Gmail legacy ids and Outlook ids are the same id in more than one
  // spelling. A hash of the message text is not stable across a reload.
  function canonId(id) {
    if (typeof id !== 'string' && typeof id !== 'number') return '';
    const s = String(id).trim().toLowerCase().replace(/\//g, '_');
    return s;
  }

  function isGoogleTaskConnector(row) {
    const kind = row && row.connectorId;
    return kind === 'googleTask' || kind === 'googleTasks';
  }

  function isMicrosoftTodoConnector(row) {
    const kind = row && row.connectorId;
    return kind === 'outlookTask' || kind === 'microsoftTodo';
  }

  function isMicrosoftTodoRow(row) {
    if (!row) return false;
    if (clean(row.system) === SYSTEM_MICROSOFT_TODO) return true;
    return isMicrosoftTodoConnector(row);
  }

  // A written Activity row that is still a trusted task close.
  // fetchedBack true is the proof. The 0.9.28 triple (system, externalId,
  // verifiedAt) counts the same. A task write that stored ref but
  // not that triple still counts: the receipt already said Handled, and
  // a verify miss never appends a written row. fetchedBack false does not.
  function isTaskReceiptRow(row) {
    if (!row || row.kind !== 'written') return false;
    if (row.fetchedBack === false) return false;
    if (!externalIdOf(row)) return false;
    if (clean(row.system) === SYSTEM_GOOGLE_TASKS || clean(row.system) === SYSTEM_MICROSOFT_TODO) return true;
    return isGoogleTaskConnector(row) || isMicrosoftTodoConnector(row);
  }

  function addCanon(set, id) {
    const c = canonId(id);
    if (c) set.add(c);
  }

  // A string is one message id (existing callers). An object also carries
  // every id the open thread can see: legacy message id, the text hash,
  // and the thread id. Any one match is enough.
  function queryIds(messageIdOrQuery) {
    const messageIds = new Set();
    const threadIds = new Set();
    if (typeof messageIdOrQuery === 'string' || typeof messageIdOrQuery === 'number') {
      addCanon(messageIds, messageIdOrQuery);
      return { messageIds: messageIds, threadIds: threadIds };
    }
    const query = messageIdOrQuery || {};
    const mids = query.messageIds != null ? query.messageIds : query.messageId;
    const midList = Array.isArray(mids) ? mids : (mids != null && mids !== '' ? [mids] : []);
    for (let i = 0; i < midList.length; i++) addCanon(messageIds, midList[i]);
    const tids = query.threadIds != null ? query.threadIds : query.threadId;
    const tidList = Array.isArray(tids) ? tids : (tids != null && tids !== '' ? [tids] : []);
    for (let j = 0; j < tidList.length; j++) addCanon(threadIds, tidList[j]);
    return { messageIds: messageIds, threadIds: threadIds };
  }

  function rowMessageIds(entry) {
    const ids = [];
    if (!entry) return ids;
    [entry.messageId, entry.legacyMessageId, entry.gmailMessageId, entry.outlookIncomingId, entry.itemId, entry.pathId].forEach((id) => {
      const c = canonId(id);
      if (c) ids.push(c);
    });
    return ids;
  }

  function rowMatches(entry, messageIds, threadIds) {
    const ids = rowMessageIds(entry);
    for (let i = 0; i < ids.length; i++) {
      if (messageIds.has(ids[i])) return true;
      if (ids[i].indexOf('scan:') === 0 && threadIds.has(ids[i].slice(5))) return true;
    }
    const thread = canonId(entry.threadId) || canonId(entry.outlookConversationId);
    if (thread && threadIds.has(thread)) return true;
    return false;
  }

  // Newest log entry wins. The log is stored newest first. A later undo
  // or dismiss of this task means the banner stays down. A later shown
  // line does not hide a proved task. A different hash after reload still
  // matches the legacy message id or the thread id stored on the row.
  function taskReceiptFromLog(log, messageIdOrQuery) {
    const found = queryIds(messageIdOrQuery);
    if (!found.messageIds.size && !found.threadIds.size) return null;
    const rows = Array.isArray(log) ? log : [];
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      if (!entry || !rowMatches(entry, found.messageIds, found.threadIds)) continue;
      if (entry.kind === 'undone' || entry.kind === 'dismissed') {
        const sameMessage = rowMessageIds(entry).some((id) => found.messageIds.has(id));
        const taskUndo = isGoogleTaskConnector(entry) || isMicrosoftTodoConnector(entry)
          || clean(entry.system) === SYSTEM_GOOGLE_TASKS || clean(entry.system) === SYSTEM_MICROSOFT_TODO;
        if (sameMessage || taskUndo) return null;
        continue;
      }
      if (entry.kind !== 'written') continue;
      if (isTaskReceiptRow(entry)) return entry;
    }
    return null;
  }

  // What the Gmail scan should do once the thread node has been rebuilt.
  // hasTerminalOutcome true is not a reason to leave the thread with no
  // chip: a proved task receipt mounts. No host and no receipt stays quiet.
  function scanReceiptDecision(input) {
    input = input || {};
    if (input.hasHost) return 'keep';
    const row = taskReceiptFromLog(input.log, {
      messageIds: input.messageIds,
      threadIds: input.threadIds
    });
    if (row) return 'mount';
    if (input.terminal) return 'silent';
    return 'judge';
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
    const microsoft = isMicrosoftTodoRow(row);
    const connector = microsoft
      ? ((row.connectorId === 'outlookTask' || row.connectorId === 'microsoftTodo') ? row.connectorId : 'outlookTask')
      : ((row.connectorId === 'googleTask' || row.connectorId === 'googleTasks') ? row.connectorId : 'googleTask');
    const url = clean(row.url);
    return {
      status: receiptStatusOf(row),
      writtenLine: clip(row.writtenLine, 180) || (microsoft ? 'To Do' : 'Google Task'),
      processName: clip(row.processName, 80),
      closedLine: clip(row.closedLine, 180),
      undoHint: microsoft ? TODO_UNDO_HINT : UNDO_HINT,
      undoneLine: microsoft ? TODO_UNDONE_LINE : UNDONE_LINE,
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
    SYSTEM_MICROSOFT_TODO: SYSTEM_MICROSOFT_TODO,
    REASON_PENDING: REASON_PENDING,
    REASON_FAILED: REASON_FAILED,
    buildProof: buildProof,
    isProof: isProof,
    allowsHandled: allowsHandled,
    isGoogleTaskKind: isGoogleTaskKind,
    isMicrosoftTodoKind: isMicrosoftTodoKind,
    isProofTaskKind: isProofTaskKind,
    stepCountsAsHandled: stepCountsAsHandled,
    shouldRecordTrustedClose: shouldRecordTrustedClose,
    activityFields: activityFields,
    canonId: canonId,
    taskReceiptFromLog: taskReceiptFromLog,
    scanReceiptDecision: scanReceiptDecision,
    remountCopy: remountCopy,
    receiptLogFields: receiptLogFields,
    googleTasksAdapter: googleTasksAdapter
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowProofOfClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowProofOfClose = FlowProofOfClose;
