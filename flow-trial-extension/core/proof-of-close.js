// Proof of close. A loop is Handled only after the system that received the
// write is read back. A draft, an attachment, and a calendar hold are not
// this proof. This slice speaks for Google Tasks, Microsoft To Do, and one
// allowlisted page the floating extension already sees (`computer/<host>`),
// and one OneDrive file (`microsoft/onedrive`).
//
// Shape (execution architecture, decision 5):
//   { system, externalId, url?, number?, fetchedBack: true, verifiedAt }
// fetchedBack is the literal true. A missing read is proof_pending or
// verify_failed, and that result is not a trusted close.
//
// For `computer/<host>`, fetchedBack is a DOM re-read: the page URL matches
// the allowlisted action, and the success selector is present. A visible id
// is the externalId when the page has one; otherwise host:path:actionDigest.
// A click is not that read. A screenshot hash may be stored as audit only.
// `computer/local/<app>` is a later gate and is not a proof here.
// A password field or מאשר pauses as proof_pending. Escalation is CoS.
// This path does not ask Sali.
//
// Portable: no chrome.*, no DOM, no network. The service worker performs
// the POST and the GET for Tasks, To Do, and one OneDrive file. A computer close takes an
// injected reader (`query`) so this file never touches a page. The live
// page driver is not wired.
const FlowProofOfClose = (() => {
  const SYSTEM_GOOGLE_TASKS = 'google/tasks';
  const SYSTEM_MICROSOFT_TODO = 'microsoft/todo';
  const SYSTEM_MICROSOFT_ONEDRIVE = 'microsoft/onedrive';
  const SYSTEM_COMPUTER_PREFIX = 'computer/';
  const LOCAL_FILE_PREFIX = 'computer/local/';
  const REASON_PENDING = 'proof_pending';
  const REASON_FAILED = 'verify_failed';
  const COMPUTER_UNDO_HINT = 'Undo clears Handled.';
  const COMPUTER_UNDONE_LINE = 'Undone — that step was reversed on the page.';
  const COMPUTER_ACTIVITY_CLEARED = 'Undone — Activity no longer says Handled.';
  const COMPUTER_UNDO_UNAVAILABLE = 'Undo unavailable.';
  // One host, one deterministic action. Fixture stub: the reader is injected.
  // The live page driver is the next tip. Not a site, and not every site.
  const COMPUTER_ALLOWLIST = [
    {
      host: 'example.com',
      path: '/fixture/glance-close',
      actionId: 'mark-done',
      successSelector: '[data-glance-close="done"]',
      idSelector: '[data-glance-close-id]',
      inverse: {
        actionId: 'mark-open',
        successSelector: '[data-glance-close="open"]'
      }
    }
  ];

  function clean(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  // A proof exists only when the read-back succeeded. Anything else is null,
  // so a caller cannot store a half-proof and later treat it as Handled.
  function isComputerSystem(system) {
    const s = clean(system).toLowerCase();
    if (s.indexOf(SYSTEM_COMPUTER_PREFIX) !== 0) return false;
    if (s.indexOf(LOCAL_FILE_PREFIX) === 0) return false;
    const host = s.slice(SYSTEM_COMPUTER_PREFIX.length);
    if (!host || host === 'local') return false;
    if (host.indexOf('/') !== -1 || host.indexOf(' ') !== -1 || host.indexOf('@') !== -1) return false;
    return true;
  }

  function computerHostAllowlisted(host) {
    const h = clean(host).toLowerCase();
    if (!h) return false;
    for (let i = 0; i < COMPUTER_ALLOWLIST.length; i++) {
      if (COMPUTER_ALLOWLIST[i].host === h) return true;
    }
    return false;
  }

  function computerSystem(host) {
    const h = clean(host).toLowerCase();
    if (!isComputerSystem(SYSTEM_COMPUTER_PREFIX + h)) return '';
    if (!computerHostAllowlisted(h)) return '';
    return SYSTEM_COMPUTER_PREFIX + h;
  }

  function buildProof(input) {
    input = input || {};
    if (input.fetchedBack !== true) return null;
    let system = clean(input.system);
    if (system.toLowerCase().indexOf(SYSTEM_COMPUTER_PREFIX) === 0) {
      system = system.toLowerCase();
      const host = system.slice(SYSTEM_COMPUTER_PREFIX.length);
      if (!isComputerSystem(system) || !computerHostAllowlisted(host)) return null;
    }
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

  function isComputerKind(kind) {
    return kind === 'computerClose';
  }

  function isOnedriveKind(kind) {
    return kind === 'onedriveFile';
  }

  // Writers that must be read back before Handled. Calendar, drafts,
  // and Google Drive are not in this list. One OneDrive file is.
  // A computer close is on this list: Handled only when fetchedBack is true.
  function isProofTaskKind(kind) {
    return isGoogleTaskKind(kind) || isMicrosoftTodoKind(kind) || isOnedriveKind(kind) || isComputerKind(kind);
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
  const TODO_UNDO_FAILED = 'Still there — the To Do task was not removed.';
  const ONEDRIVE_UNDO_HINT = 'Undo removes the OneDrive file.';
  const ONEDRIVE_UNDONE_LINE = 'Undone — the OneDrive file was removed.';
  const ONEDRIVE_UNDO_FAILED = 'Still there — the OneDrive file was not removed.';
  const ONEDRIVE_RESTORE_HINT = 'Undo restores the previous OneDrive file.';
  const ONEDRIVE_RESTORED_LINE = 'Undone — the previous OneDrive file was restored.';

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
    return clean(ref.externalId) || clean(ref.taskId) || clean(ref.fileId) || clean(ref.itemId);
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

  function isOnedriveConnector(row) {
    return !!(row && row.connectorId === 'onedriveFile');
  }

  function isOnedriveRow(row) {
    if (!row) return false;
    if (clean(row.system) === SYSTEM_MICROSOFT_ONEDRIVE) return true;
    return isOnedriveConnector(row);
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
    const computerSystemName = clean(row.system).toLowerCase();
    if (computerSystemName.indexOf(SYSTEM_COMPUTER_PREFIX) === 0) {
      if (row.fetchedBack !== true) return false;
      if (!clean(row.verifiedAt) || Number.isNaN(Date.parse(clean(row.verifiedAt)))) return false;
      if (!isComputerSystem(computerSystemName)) return false;
      return computerHostAllowlisted(computerSystemName.slice(SYSTEM_COMPUTER_PREFIX.length));
    }
    if (clean(row.system) === SYSTEM_GOOGLE_TASKS || clean(row.system) === SYSTEM_MICROSOFT_TODO || clean(row.system) === SYSTEM_MICROSOFT_ONEDRIVE) return true;
    return isGoogleTaskConnector(row) || isMicrosoftTodoConnector(row) || isOnedriveConnector(row);
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
    const names = Array.isArray(query.fileNames) ? query.fileNames.map((n) => clean(n)).filter(Boolean) : [];
    const mids = query.messageIds != null ? query.messageIds : query.messageId;
    const midList = Array.isArray(mids) ? mids : (mids != null && mids !== '' ? [mids] : []);
    for (let i = 0; i < midList.length; i++) addCanon(messageIds, midList[i]);
    const tids = query.threadIds != null ? query.threadIds : query.threadId;
    const tidList = Array.isArray(tids) ? tids : (tids != null && tids !== '' ? [tids] : []);
    for (let j = 0; j < tidList.length; j++) addCanon(threadIds, tidList[j]);
    return { messageIds: messageIds, threadIds: threadIds, fileNames: names };
  }

  function isFileReceiptRow(entry) {
    if (!entry) return false;
    if (entry.connectorId === 'onedriveFile' || entry.connectorId === 'attachmentSave') return true;
    return clean(entry.system) === SYSTEM_MICROSOFT_ONEDRIVE;
  }

  function savedFileName(entry) {
    const written = String((entry && (entry.writtenLine || entry.label)) || '');
    const marked = written.match(/Saved (.+?) to OneDrive/i) || written.match(/^OneDrive · (.+)$/);
    return marked && marked[1] ? marked[1].trim() : '';
  }

  function fileNameAgrees(saved, shown) {
    const rawShown = String(shown || '').trim();
    const truncated = /^[\u2026\u2025]/.test(rawShown) || /^\.{2,}/.test(rawShown) || /[\u2026\u2025]$/.test(rawShown) || /\.{2,}$/.test(rawShown);
    const left = String(saved || '').toLowerCase().replace(/^[\u2026\u2025.]+/, '').replace(/[\u2026\u2025.]+$/, '').trim();
    const right = rawShown.toLowerCase().replace(/^[\u2026\u2025.]+/, '').replace(/[\u2026\u2025.]+$/, '').trim();
    if (!left || !right) return false;
    if (left === right) return true;
    // A chip cuts the name with an ellipsis. A shorter full name is a different file.
    if (!truncated) return false;
    const short = left.length <= right.length ? left : right;
    const long = left.length <= right.length ? right : left;
    if (short.length < 12) return false;
    return long.endsWith(short) || long.startsWith(short);
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

  function rowMatches(entry, messageIds, threadIds, fileNames) {
    const fileRow = isFileReceiptRow(entry);
    const ids = rowMessageIds(entry);
    for (let i = 0; i < ids.length; i++) {
      if (ids[i].indexOf('scan:') === 0 && threadIds.has(ids[i].slice(5))) {
        if (!fileRow) return true;
        continue;
      }
      // A conversation id passed as a message id is the thread, not this file.
      if (messageIds.has(ids[i]) && !(fileRow && threadIds.has(ids[i]))) return true;
    }
    const thread = canonId(entry.threadId) || canonId(entry.outlookConversationId);
    if (!(thread && threadIds.has(thread))) return false;
    if (!fileRow) return true;
    const saved = savedFileName(entry);
    const names = fileNames || [];
    if (!saved || !names.length) return false;
    for (let n = 0; n < names.length; n++) {
      if (fileNameAgrees(saved, names[n])) return true;
    }
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
      if (!entry || !rowMatches(entry, found.messageIds, found.threadIds, found.fileNames)) continue;
      if (entry.kind === 'undone' || entry.kind === 'dismissed') {
        const sameMessage = rowMessageIds(entry).some((id) => found.messageIds.has(id));
        const taskUndo = isGoogleTaskConnector(entry) || isMicrosoftTodoConnector(entry) || isOnedriveConnector(entry) || isComputerRow(entry)
          || clean(entry.system) === SYSTEM_GOOGLE_TASKS || clean(entry.system) === SYSTEM_MICROSOFT_TODO || clean(entry.system) === SYSTEM_MICROSOFT_ONEDRIVE;
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
    if (isComputerSystem(clean(row.system).toLowerCase())) return computerRemountCopy(row, externalId);
    if (isOnedriveRow(row)) return onedriveRemountCopy(row, externalId);
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
      undoFailed: microsoft ? TODO_UNDO_FAILED : 'Still there — the Google Task was not removed.',
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

  function actionDigest(actionId) {
    const s = clean(actionId);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function fallbackExternalId(host, path, actionId) {
    const h = clean(host).toLowerCase();
    const p = clean(path) || '/';
    const digest = actionDigest(actionId);
    if (!h || !digest) return '';
    return h + ':' + p + ':' + digest;
  }

  function clipId(value) {
    const s = clean(value);
    if (!s) return '';
    return s.length > 200 ? s.slice(0, 200) : s;
  }

  function parseHttps(href) {
    const s = clean(href);
    if (s.slice(0, 8) !== 'https://') return null;
    const rest = s.slice(8);
    if (!rest || rest.indexOf('@') !== -1) return null;
    const slash = rest.indexOf('/');
    const hostport = (slash === -1 ? rest : rest.slice(0, slash)).split('?')[0].split('#')[0];
    const host = hostport.split(':')[0].toLowerCase();
    let path = slash === -1 ? '/' : rest.slice(slash);
    const q = path.indexOf('?');
    if (q >= 0) path = path.slice(0, q);
    const hash = path.indexOf('#');
    if (hash >= 0) path = path.slice(0, hash);
    if (!host || host.indexOf(' ') !== -1) return null;
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return { host: host, path: path || '/' };
  }

  function allowlistedAction(host, path, actionId) {
    const h = clean(host).toLowerCase();
    const p = clean(path) || '/';
    const id = clean(actionId);
    for (let i = 0; i < COMPUTER_ALLOWLIST.length; i++) {
      const action = COMPUTER_ALLOWLIST[i];
      if (action.host === h && action.path === p && action.actionId === id) return action;
    }
    return null;
  }

  function copyAllowlist() {
    const out = [];
    for (let i = 0; i < COMPUTER_ALLOWLIST.length; i++) {
      const action = COMPUTER_ALLOWLIST[i];
      const inverse = action.inverse ? {
        actionId: action.inverse.actionId,
        successSelector: action.inverse.successSelector
      } : null;
      out.push({
        host: action.host,
        path: action.path,
        actionId: action.actionId,
        successSelector: action.successSelector,
        idSelector: action.idSelector,
        inverse: inverse
      });
    }
    return out;
  }

  function computerAllowlist() {
    return copyAllowlist();
  }

  // Seam for the next tip. live stays false until a page driver is wired.
  // That driver supplies query(); this module does not navigate or click.
  function computerDriverSeam() {
    return {
      id: 'computer_ui',
      live: false,
      mode: 'scaffold',
      allowlist: copyAllowlist()
    };
  }

  function loginWall(reader) {
    if (!reader || typeof reader !== 'object') return false;
    const wall = reader.wall;
    if (!wall || typeof wall !== 'object') return false;
    if (wall.password === true) return true;
    const label = clean(wall.label);
    if (label === 'מאשר') return true;
    if (/^(sign in|log in|login)$/i.test(label)) return true;
    return false;
  }

  function queryNode(reader, selector) {
    if (!reader || typeof reader.query !== 'function' || !selector) return null;
    try {
      return reader.query(selector);
    } catch (e) {
      return null;
    }
  }

  // DOM re-read. fetchedBack is decided by the caller from ok, never from
  // reader.clicked and never from reader.screenshotHash.
  function verifyComputerDom(reader, action) {
    const audit = reader && reader.screenshotHash ? { screenshotHash: String(reader.screenshotHash) } : null;
    function missRead(reason, escalate) {
      return {
        ok: false,
        fetchedBack: false,
        reason: reason,
        escalate: escalate || null,
        askSali: false,
        audit: audit,
        proof: null
      };
    }
    if (loginWall(reader)) return missRead(REASON_PENDING, 'cos');
    action = action || {};
    const parsed = parseHttps(reader && (reader.href || reader.url));
    if (!reader || typeof reader.query !== 'function' || !parsed) return missRead(REASON_FAILED);
    if (parsed.host !== action.host || parsed.path !== action.path) return missRead(REASON_FAILED);
    const node = queryNode(reader, action.successSelector);
    if (!node || node.found !== true) return missRead(REASON_FAILED);
    let visibleId = '';
    const idNode = queryNode(reader, action.idSelector);
    if (idNode && idNode.found === true) visibleId = clipId(idNode.id || idNode.text);
    const externalId = visibleId || fallbackExternalId(action.host, action.path, action.actionId);
    return {
      ok: true,
      fetchedBack: true,
      reason: null,
      escalate: null,
      askSali: false,
      url: 'https://' + parsed.host + parsed.path,
      visibleId: visibleId,
      externalId: externalId,
      audit: audit,
      proof: null
    };
  }

  function localFileCloseShape(app) {
    const name = clean(app).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!name) return null;
    return {
      system: LOCAL_FILE_PREFIX + name,
      gate: 'local-file',
      deferred: true,
      fetchedBack: false
    };
  }

  function miss(reason, extra) {
    const out = { ok: false, reason: reason, proof: null, askSali: false, escalate: null };
    if (extra) {
      Object.keys(extra).forEach((key) => { out[key] = extra[key]; });
    }
    return out;
  }

  // Pure writer. The reader is injected. Nothing here clicks or navigates.
  function computerClose(input, reader) {
    input = input || {};
    const host = clean(input.host).toLowerCase();
    if (host === 'local' || clean(input.system).toLowerCase().indexOf(LOCAL_FILE_PREFIX) === 0 || input.localFile === true) {
      return miss('local_file_deferred', { shape: localFileCloseShape(input.app || input.localApp), escalate: null });
    }
    const action = allowlistedAction(host, clean(input.path) || '/', clean(input.actionId));
    if (!action) return miss('not_allowlisted');
    const read = verifyComputerDom(reader, action);
    if (!read.ok || read.fetchedBack !== true) {
      return miss(read.reason || REASON_FAILED, { escalate: read.escalate || null, audit: read.audit || null });
    }
    const proof = buildProof({
      system: computerSystem(action.host),
      externalId: read.externalId,
      url: read.url,
      fetchedBack: true,
      verifiedAt: input.verifiedAt
    });
    if (!proof) return miss(REASON_PENDING, { audit: read.audit || null });
    const inverse = action.inverse ? {
      actionId: action.inverse.actionId,
      successSelector: action.inverse.successSelector
    } : null;
    return {
      ok: true,
      where: action.host,
      written: action.host + ' · ' + action.actionId,
      proof: proof,
      ref: {
        externalId: proof.externalId,
        host: action.host,
        path: action.path,
        actionId: action.actionId,
        inverse: inverse
      },
      audit: read.audit || null,
      askSali: false,
      escalate: null
    };
  }

  function isComputerRow(row) {
    if (!row) return false;
    const system = clean(row.system).toLowerCase();
    if (system) {
      if (!isComputerSystem(system)) return false;
      return computerHostAllowlisted(system.slice(SYSTEM_COMPUTER_PREFIX.length));
    }
    return row.connectorId === 'computerClose';
  }

  function inverseOf(row) {
    if (!row) return null;
    const inv = row.inverse || (row.ref && row.ref.inverse);
    if (!inv || typeof inv !== 'object') return null;
    const actionId = clean(inv.actionId);
    if (!actionId) return null;
    const successSelector = clean(inv.successSelector);
    return successSelector ? { actionId: actionId, successSelector: successSelector } : { actionId: actionId };
  }

  function onedriveRemountCopy(row, externalId) {
    const src = row.ref && typeof row.ref === 'object' ? row.ref : {};
    const ref = { fileId: externalId, itemId: externalId, externalId: externalId };
    if (src.created === false) ref.created = false;
    else if (src.created === true) ref.created = true;
    const previous = clean(src.previousVersionId);
    if (previous) ref.previousVersionId = previous;
    const restore = ref.created === false && !!ref.previousVersionId;
    const url = clean(row.url);
    return {
      status: receiptStatusOf(row),
      writtenLine: clip(row.writtenLine, 180) || 'OneDrive',
      processName: clip(row.processName, 80),
      closedLine: clip(row.closedLine, 180),
      undoHint: restore ? ONEDRIVE_RESTORE_HINT : ONEDRIVE_UNDO_HINT,
      undoneLine: restore ? ONEDRIVE_RESTORED_LINE : ONEDRIVE_UNDONE_LINE,
      undoFailed: ONEDRIVE_UNDO_FAILED,
      url: url.slice(0, 8) === 'https://' ? url : '',
      connectorId: 'onedriveFile',
      externalId: externalId,
      system: SYSTEM_MICROSOFT_ONEDRIVE,
      ref: ref
    };
  }

  function computerRemountCopy(row, externalId) {
    const inverse = inverseOf(row);
    const ref = { externalId: externalId };
    if (row.ref && typeof row.ref === 'object') {
      const host = clean(row.ref.host);
      const path = clean(row.ref.path);
      const actionId = clean(row.ref.actionId);
      if (host) ref.host = host;
      if (path) ref.path = path;
      if (actionId) ref.actionId = actionId;
    }
    if (inverse) ref.inverse = inverse;
    const url = clean(row.url);
    return {
      status: receiptStatusOf(row),
      writtenLine: clip(row.writtenLine, 180) || 'On this page',
      processName: clip(row.processName, 80),
      closedLine: clip(row.closedLine, 180),
      undoHint: inverse ? COMPUTER_UNDO_HINT : COMPUTER_UNDO_UNAVAILABLE,
      undoneLine: inverse ? COMPUTER_UNDONE_LINE : COMPUTER_UNDO_UNAVAILABLE,
      undoAvailable: !!inverse,
      url: url.slice(0, 8) === 'https://' ? url : '',
      connectorId: 'computerClose',
      externalId: externalId,
      system: clean(row.system).toLowerCase(),
      ref: ref
    };
  }

  function computerStillWritten(rows, found, externalId) {
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      if (!entry || entry.kind !== 'written' || !isComputerRow(entry)) continue;
      if (rowMatches(entry, found.messageIds, found.threadIds)) return true;
      if (externalId && externalIdOf(entry) === externalId) return true;
    }
    return false;
  }

  // Inverse when the row has one. Otherwise Undo unavailable.
  // Either way the written row is rewritten so it does not stay Handled.
  // A reader, when passed, re-reads the inverse selector. It does not click.
  function applyComputerUndo(log, messageIdOrQuery, ref, reader) {
    const found = queryIds(messageIdOrQuery);
    const externalId = clean(
      (messageIdOrQuery && typeof messageIdOrQuery === 'object' && messageIdOrQuery.externalId) ||
      (ref && (ref.externalId || ref.taskId))
    );
    const rows = Array.isArray(log) ? log.slice() : [];
    if (!found.messageIds.size && !found.threadIds.size && !externalId) {
      return { ok: false, hit: false, available: false, inverse: null, inverseVerified: false, log: rows, stayedHandled: false, askSali: false };
    }
    let hit = false;
    let available = false;
    let inverse = null;
    let inverseVerified = false;
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      if (!entry || entry.kind !== 'written' || !isComputerRow(entry)) continue;
      const idHit = externalId && externalIdOf(entry) === externalId;
      if (!rowMatches(entry, found.messageIds, found.threadIds) && !idHit) continue;
      const rowInverse = inverseOf(entry);
      if (!hit) {
        inverse = rowInverse;
        available = !!rowInverse;
        if (rowInverse && reader && typeof reader.query === 'function' && rowInverse.successSelector) {
          const node = queryNode(reader, rowInverse.successSelector);
          inverseVerified = !!(node && node.found === true);
        }
      }
      const pageReversed = !!(rowInverse && inverseVerified);
      rows[i] = Object.assign({}, entry, {
        kind: 'undone',
        undone: true,
        undoUnavailable: !rowInverse,
        inverse: rowInverse,
        fetchedBack: false,
        url: null,
        ref: null,
        where: null,
        label: pageReversed ? COMPUTER_UNDONE_LINE : (rowInverse ? COMPUTER_ACTIVITY_CLEARED : COMPUTER_UNDO_UNAVAILABLE)
      });
      hit = true;
    }
    return {
      ok: hit,
      hit: hit,
      available: available,
      inverse: inverse,
      inverseVerified: inverseVerified,
      log: rows,
      stayedHandled: computerStillWritten(rows, found, externalId),
      askSali: false
    };
  }

  return {
    SYSTEM_GOOGLE_TASKS: SYSTEM_GOOGLE_TASKS,
    SYSTEM_MICROSOFT_TODO: SYSTEM_MICROSOFT_TODO,
    SYSTEM_MICROSOFT_ONEDRIVE: SYSTEM_MICROSOFT_ONEDRIVE,
    SYSTEM_COMPUTER_PREFIX: SYSTEM_COMPUTER_PREFIX,
    LOCAL_FILE_PREFIX: LOCAL_FILE_PREFIX,
    REASON_PENDING: REASON_PENDING,
    REASON_FAILED: REASON_FAILED,
    COMPUTER_UNDO_HINT: COMPUTER_UNDO_HINT,
    COMPUTER_UNDONE_LINE: COMPUTER_UNDONE_LINE,
    COMPUTER_ACTIVITY_CLEARED: COMPUTER_ACTIVITY_CLEARED,
    COMPUTER_UNDO_UNAVAILABLE: COMPUTER_UNDO_UNAVAILABLE,
    buildProof: buildProof,
    isProof: isProof,
    allowsHandled: allowsHandled,
    isGoogleTaskKind: isGoogleTaskKind,
    isMicrosoftTodoKind: isMicrosoftTodoKind,
    isComputerKind: isComputerKind,
    isOnedriveKind: isOnedriveKind,
    isComputerSystem: isComputerSystem,
    isProofTaskKind: isProofTaskKind,
    stepCountsAsHandled: stepCountsAsHandled,
    shouldRecordTrustedClose: shouldRecordTrustedClose,
    activityFields: activityFields,
    canonId: canonId,
    taskReceiptFromLog: taskReceiptFromLog,
    scanReceiptDecision: scanReceiptDecision,
    remountCopy: remountCopy,
    receiptLogFields: receiptLogFields,
    googleTasksAdapter: googleTasksAdapter,
    actionDigest: actionDigest,
    fallbackExternalId: fallbackExternalId,
    computerAllowlist: computerAllowlist,
    computerDriverSeam: computerDriverSeam,
    computerSystem: computerSystem,
    verifyComputerDom: verifyComputerDom,
    computerClose: computerClose,
    localFileCloseShape: localFileCloseShape,
    applyComputerUndo: applyComputerUndo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowProofOfClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowProofOfClose = FlowProofOfClose;
