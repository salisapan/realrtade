// Proof of close. Handled only when the write was read back.
// A verify miss is proof_pending or verify_failed, never Handled.
// Run: node test/proof-of-close-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'proof-of-close.js'), 'utf8'), sandbox, { filename: 'proof-of-close.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'quiet-metrics.js'), 'utf8'), sandbox, { filename: 'quiet-metrics.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'receipt-copy.js'), 'utf8'), sandbox, { filename: 'receipt-copy.js' });
const FlowProofOfClose = vm.runInContext('FlowProofOfClose', sandbox);
const FlowReceipt = vm.runInContext('FlowReceipt', sandbox);
const FlowQuietMetrics = vm.runInContext('FlowQuietMetrics', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const VERIFIED = '2026-10-07T12:00:00.000Z';

function proof(extra) {
  return FlowProofOfClose.buildProof(Object.assign({
    system: FlowProofOfClose.SYSTEM_GOOGLE_TASKS,
    externalId: 'task_1',
    url: 'https://tasks.google.com/embed/list/LIST_A?pli=1',
    fetchedBack: true,
    verifiedAt: VERIFIED
  }, extra || {}));
}

console.log('\n--- proof shape ---\n');
{
  const built = proof();
  check('a read-back builds system, externalId, fetchedBack, verifiedAt',
    built && built.system === 'google/tasks' && built.externalId === 'task_1' && built.fetchedBack === true && built.verifiedAt === VERIFIED && built.url.indexOf('tasks.google.com') !== -1,
    built);
  check('fetchedBack false is not a proof', FlowProofOfClose.buildProof({ system: 'google/tasks', externalId: 'task_1', fetchedBack: false, verifiedAt: VERIFIED }) === null);
  check('a missing id is not a proof', FlowProofOfClose.buildProof({ system: 'google/tasks', externalId: '  ', fetchedBack: true, verifiedAt: VERIFIED }) === null);
  check('a bad timestamp is not a proof', FlowProofOfClose.buildProof({ system: 'google/tasks', externalId: 'task_1', fetchedBack: true, verifiedAt: 'yesterday' }) === null);
  check('number is kept when the system has one',
    FlowProofOfClose.buildProof({ system: 'green_invoice', externalId: 'doc_1', number: 305, fetchedBack: true, verifiedAt: VERIFIED }).number === 305);
  const adapter = FlowProofOfClose.googleTasksAdapter();
  check('the tasks adapter can execute, verify, and undo',
    adapter.id === 'google_tasks' && adapter.capabilities.verify === true && adapter.capabilities.undo === true && adapter.capabilities.execute === true && adapter.capabilities.preview === false,
    adapter);
}

console.log('\n--- verify miss is not Handled ---\n');
{
  const pending = { ok: false, reason: FlowProofOfClose.REASON_PENDING, proof: null };
  const failed = { ok: false, reason: FlowProofOfClose.REASON_FAILED, ref: { externalId: 'task_x', taskId: 'task_x' }, proof: null };
  const lied = { ok: true, proof: { system: 'google/tasks', externalId: 'task_x', fetchedBack: false, verifiedAt: VERIFIED } };
  check('proof_pending does not allow Handled', FlowProofOfClose.allowsHandled(pending) === false, pending);
  check('verify_failed does not allow Handled', FlowProofOfClose.allowsHandled(failed) === false, failed);
  check('ok with fetchedBack false does not allow Handled', FlowProofOfClose.allowsHandled(lied) === false, lied);
  const missCopy = FlowReceipt.confirmation({
    succeeded: 1, total: 1, priorCloses: 0, requireProof: true, proofs: [], verifyStatus: 'verify_failed'
  });
  check('a verify miss receipt is not Handled and not a full close',
    missCopy.full === false && missCopy.status !== 'Handled.' && missCopy.status !== 'טופל.' && missCopy.earlyLine === null && missCopy.verifyStatus === 'verify_failed',
    missCopy);
  const pendingCopy = FlowReceipt.confirmation({
    succeeded: 0, total: 1, requireProof: true, proofs: [], verifyStatus: 'proof_pending'
  });
  check('proof_pending has no Handled line', pendingCopy.status === null && pendingCopy.verifyStatus === 'proof_pending', pendingCopy);
  const taskMiss = [{ action: { kind: 'googleTask' }, response: failed }];
  check('a missed task step is not a trusted close', FlowProofOfClose.shouldRecordTrustedClose(taskMiss) === false);
  check('a missed task stores no activity proof', FlowProofOfClose.activityFields(failed.proof) === null);
  let quiet = FlowQuietMetrics.emptyState();
  if (FlowProofOfClose.allowsHandled(failed)) {
    quiet = FlowQuietMetrics.noteHandled(quiet, { messageId: 'm-miss', ts: Date.parse(VERIFIED) });
  }
  const snap = FlowQuietMetrics.snapshot(quiet, Date.parse(VERIFIED));
  check('a verify miss is not counted as a trusted close', snap.trusted.trusted === 0 && snap.trusted.handled === 0, snap.trusted);
}

console.log('\n--- POST + GET ok is Handled ---\n');
{
  const built = proof();
  const write = { ok: true, where: 'Google Tasks', proof: built, ref: { taskListId: 'LIST_A', taskId: built.externalId, externalId: built.externalId } };
  check('a fetched-back task allows Handled', FlowProofOfClose.allowsHandled(write) === true, write);
  const copy = FlowReceipt.confirmation({
    succeeded: 1, total: 1, priorCloses: 5, requireProof: true, proofs: [built]
  });
  check('the receipt says Handled when fetchedBack is true', copy.status === 'Handled.' && copy.full === true && copy.undoLabel === 'Undo', copy);
  const he = FlowReceipt.confirmation({
    succeeded: 1, total: 1, priorCloses: 5, lang: 'he', requireProof: true, proofs: [built]
  });
  check('the Hebrew receipt says טופל when fetchedBack is true', he.status === 'טופל.' && he.full === true, he);
  const fields = FlowProofOfClose.activityFields(built);
  check('activity stores system, externalId, and verifiedAt',
    fields && fields.system === 'google/tasks' && fields.externalId === 'task_1' && fields.verifiedAt === VERIFIED && fields.fetchedBack === undefined,
    fields);
  const results = [{ action: { kind: 'googleTask' }, response: write }];
  check('that step is a trusted close', FlowProofOfClose.shouldRecordTrustedClose(results) === true);
  check('undo still addresses the external id', write.ref.externalId === built.externalId);
  const calendar = [{ action: { kind: 'calendar' }, response: { ok: true, ref: { eventId: 'ev_1' } } }];
  check('a calendar write without this proof is unchanged', FlowProofOfClose.shouldRecordTrustedClose(calendar) === true && FlowProofOfClose.stepCountsAsHandled(calendar[0]) === true);
  const mixed = calendar.concat(results);
  check('calendar plus a proved task is a trusted close', FlowProofOfClose.shouldRecordTrustedClose(mixed) === true);
  const mixedMiss = calendar.concat([{ action: { kind: 'googleTask' }, response: { ok: false, reason: 'verify_failed' } }]);
  check('calendar plus a verify miss is not a trusted close', FlowProofOfClose.shouldRecordTrustedClose(mixedMiss) === false);
  const partial = FlowReceipt.confirmation({
    succeeded: 1, total: 2, priorCloses: 0, requireProof: true, proofs: []
  });
  check('a partial chain does not say Handled', partial.status === 'Partly handled.' && partial.full === false, partial);
}

console.log('\n--- Handled survives a thread reload ---\n');
{
  function writtenRow(extra) {
    return Object.assign({
      kind: 'written',
      messageId: 'm1',
      label: 'Gate 0.9.28 ProofOfClose task',
      where: 'Google Tasks',
      url: 'https://tasks.google.com/embed/list/LIST_A?pli=1',
      connectorId: 'googleTask',
      ref: { taskListId: 'LIST_A', taskId: 'task_1', externalId: 'task_1' },
      system: 'google/tasks',
      externalId: 'task_1',
      verifiedAt: VERIFIED
    }, extra || {});
  }

  const legacy = writtenRow();
  check('a 0.9.28 Activity row (no fetchedBack field) is still the receipt',
    FlowProofOfClose.taskReceiptFromLog([legacy], 'm1') === legacy);
  const proved = writtenRow({ fetchedBack: true, writtenLine: 'Google Task · due Oct 9', processName: 'Log It', closedLine: 'Logged and tracked.', receiptStatus: 'Handled.' });
  check('fetchedBack true is the receipt',
    FlowProofOfClose.taskReceiptFromLog([proved], 'm1') === proved);
  check('a newer undo hides the banner',
    FlowProofOfClose.taskReceiptFromLog([{ kind: 'undone', messageId: 'm1' }, proved], 'm1') === null);
  check('a newer dismiss hides the banner',
    FlowProofOfClose.taskReceiptFromLog([{ kind: 'dismissed', messageId: 'm1' }, proved], 'm1') === null);
  check('a later shown line does not hide the receipt',
    FlowProofOfClose.taskReceiptFromLog([{ kind: 'shown', messageId: 'm1', process: { id: 'log' } }, proved], 'm1') === proved);
  check('an older undo does not hide a newer write',
    FlowProofOfClose.taskReceiptFromLog([proved, { kind: 'undone', messageId: 'm1' }], 'm1') === proved);
  check('another message does not supply this receipt',
    FlowProofOfClose.taskReceiptFromLog([writtenRow({ messageId: 'other' })], 'm1') === null);
  check('a calendar write is not this remount',
    FlowProofOfClose.taskReceiptFromLog([{ kind: 'written', messageId: 'm1', connectorId: 'calendar', ref: { eventId: 'ev' } }], 'm1') === null);
  check('fetchedBack false is not a receipt',
    FlowProofOfClose.taskReceiptFromLog([writtenRow({ fetchedBack: false })], 'm1') === null);
  check('a row with no external id is not a receipt',
    FlowProofOfClose.taskReceiptFromLog([writtenRow({ externalId: '', ref: {} })], 'm1') === null);
  check('a google task write with an id still remounts when verifiedAt was not stored',
    FlowProofOfClose.taskReceiptFromLog([writtenRow({ verifiedAt: '', system: '' })], 'm1') !== null);
  check('a row with no task id and no google task connector is not a receipt',
    FlowProofOfClose.taskReceiptFromLog([writtenRow({ verifiedAt: '', system: '', externalId: '', ref: {}, connectorId: 'calendar' })], 'm1') === null);
  check('an empty log does not remount', FlowProofOfClose.taskReceiptFromLog([], 'm1') === null);
  check('a missing log does not remount', FlowProofOfClose.taskReceiptFromLog(null, 'm1') === null);

  const copy = FlowProofOfClose.remountCopy(proved);
  check('the remounted banner says Handled, names the task, and keeps Undo',
    copy && copy.status === 'Handled.' && copy.writtenLine === 'Google Task · due Oct 9' &&
    copy.processName === 'Log It' && copy.closedLine === 'Logged and tracked.' &&
    copy.undoHint === FlowReceipt.undoHint(['Google Tasks']) &&
    copy.undoneLine === FlowReceipt.undoneLine(['Google Tasks']) &&
    copy.connectorId === 'googleTask' && copy.externalId === 'task_1' &&
    copy.ref.externalId === 'task_1' && copy.ref.taskId === 'task_1' && copy.ref.taskListId === 'LIST_A' &&
    copy.url.indexOf('tasks.google.com') !== -1,
    copy);
  const legacyCopy = FlowProofOfClose.remountCopy(legacy);
  check('a row without the written line still says Handled and Undo',
    legacyCopy && legacyCopy.status === 'Handled.' && legacyCopy.writtenLine === 'Google Task' &&
    legacyCopy.undoHint === 'Undo removes the Google Task.' && legacyCopy.processName === '' && legacyCopy.closedLine === '',
    legacyCopy);
  check('undo and dismiss are not a banner',
    FlowProofOfClose.remountCopy({ kind: 'undone', messageId: 'm1', system: 'google/tasks', externalId: 'task_1', verifiedAt: VERIFIED }) === null);

  const logged = FlowProofOfClose.receiptLogFields(proof(), {
    writtenLine: 'Google Task · due Oct 9',
    processName: 'Log It',
    closedLine: 'Logged and tracked.',
    status: 'Handled.'
  });
  check('a proved write stores fetchedBack and the banner lines',
    logged && logged.fetchedBack === true && logged.system === 'google/tasks' && logged.externalId === 'task_1' &&
    logged.verifiedAt === VERIFIED && logged.writtenLine === 'Google Task · due Oct 9' &&
    logged.processName === 'Log It' && logged.closedLine === 'Logged and tracked.' && logged.receiptStatus === 'Handled.',
    logged);
  const roundTrip = Object.assign({ kind: 'written', messageId: 'm1', where: 'Google Tasks', connectorId: 'googleTask', ref: { taskListId: 'LIST_A', taskId: 'task_1', externalId: 'task_1' }, url: 'https://tasks.google.com/embed/list/LIST_A?pli=1' }, logged);
  check('that stored row remounts after a reload',
    FlowProofOfClose.taskReceiptFromLog([roundTrip], 'm1') === roundTrip &&
    FlowProofOfClose.remountCopy(roundTrip).writtenLine === 'Google Task · due Oct 9');
  check('a verify miss stores no remount fields',
    FlowProofOfClose.receiptLogFields(null, { writtenLine: 'Google Task', status: 'Handled.' }) === null);
  const he = FlowProofOfClose.remountCopy(writtenRow({ receiptStatus: 'טופל.', fetchedBack: true }));
  check('a Hebrew receipt stays טופל after reload', he && he.status === 'טופל.', he);
  check('a non-https link is not put back on the thread',
    FlowProofOfClose.remountCopy(writtenRow({ url: 'javascript:alert(1)', fetchedBack: true })).url === '');

  const gmail = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-gmail.js'), 'utf8');
  const pickAt = gmail.indexOf('FlowProofOfClose.taskReceiptFromLog');
  const stopAt = gmail.indexOf('hasTerminalOutcomeFrom(settled, messageId)');
  check('the Gmail scan remounts a proved task before it treats the message as finished',
    pickAt > 0 && stopAt > pickAt);
  check('the remounted banner is built from the stored receipt',
    gmail.indexOf('FlowProofOfClose.remountCopy') > 0 && gmail.indexOf('function mountProvedTaskReceipt') > 0);
  check('a proved write stores the banner lines on the Activity row',
    gmail.indexOf('FlowProofOfClose.receiptLogFields') > 0);
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8');
  check('the extension version is 0.9.55', /"version": "0\.9\.55"/.test(manifest));

  // Live 0.9.29: Do It stored a hash of the message text. After reload that
  // hash changed (the clock line in the row changed) and the scan treated
  // the written row as terminal, so the thread had no banner. Activity
  // still showed HANDLED. The scan must mount, not stay silent.
  const oldHash = 'h111';
  const newHash = 'h222';
  const threadId = 'thread_9';
  const legacyId = '18f3abc';
  const stored = writtenRow({
    messageId: oldHash,
    threadId: threadId,
    legacyMessageId: legacyId,
    fetchedBack: true,
    writtenLine: 'Google Task · due Oct 10'
  });
  const reloadQuery = { messageIds: [newHash, legacyId], threadIds: [threadId] };
  check('a changed text-hash still finds the receipt by legacy id and thread id',
    FlowProofOfClose.taskReceiptFromLog([stored], reloadQuery) === stored);
  check('slash and underscore are the same message id',
    FlowProofOfClose.canonId('18f3/ABC') === FlowProofOfClose.canonId('18f3_abc'));
  const terminalNoHost = FlowProofOfClose.scanReceiptDecision({
    log: [stored],
    messageIds: [newHash, legacy],
    threadIds: [threadId],
    hasHost: false,
    terminal: true
  });
  check('terminal outcome with no chip mounts the proved task, it does not stay silent',
    terminalNoHost === 'mount', terminalNoHost);
  const hashOnly = FlowProofOfClose.scanReceiptDecision({
    log: [writtenRow({ messageId: oldHash, threadId: threadId })],
    messageIds: [newHash],
    threadIds: [threadId],
    hasHost: false,
    terminal: true
  });
  check('thread id alone remounts when the reload hash does not match the stored hash',
    hashOnly === 'mount', hashOnly);
  const bareTask = {
    kind: 'written', messageId: oldHash, connectorId: 'googleTask', threadId: threadId,
    where: 'Google Tasks', ref: { taskListId: 'LIST_A', taskId: 'task_9', externalId: 'task_9' }
  };
  check('a written google task with a ref remounts even without the proof triple',
    FlowProofOfClose.scanReceiptDecision({
      log: [bareTask], messageIds: [newHash], threadIds: [threadId], hasHost: false, terminal: true
    }) === 'mount');
  check('a newer undo on that thread does not remount',
    FlowProofOfClose.scanReceiptDecision({
      log: [{ kind: 'undone', messageId: oldHash, threadId: threadId, connectorId: 'googleTask', undone: true }, stored],
      messageIds: [newHash], threadIds: [threadId], hasHost: false, terminal: true
    }) === 'silent');
  check('no receipt and a terminal row stays silent',
    FlowProofOfClose.scanReceiptDecision({
      log: [{ kind: 'written', messageId: 'other', connectorId: 'calendar', ref: { eventId: 'ev' } }],
      messageIds: [newHash], threadIds: ['other-thread'], hasHost: false, terminal: true
    }) === 'silent');
  check('a host already on the thread is left alone',
    FlowProofOfClose.scanReceiptDecision({
      log: [stored], messageIds: [newHash], threadIds: [threadId], hasHost: true, terminal: true
    }) === 'keep');

  const ownAt = gmail.indexOf('if (!ownEmail) return');
  const earlyAt = gmail.indexOf('remountProvedTaskReceipts');
  check('remount runs before the scan can return for a missing own-email or a quiet classification',
    earlyAt > 0 && ownAt > earlyAt, { earlyAt: earlyAt, ownAt: ownAt });
  check('a successful task undo rewrites the HANDLED row instead of leaving it',
    gmail.indexOf('markGoogleTaskUndone') > 0 &&
    fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8').indexOf('markGoogleTaskUndone') > 0);
}

console.log('\n--- Microsoft To Do ---\n');
{
  const todo = FlowProofOfClose.buildProof({
    system: FlowProofOfClose.SYSTEM_MICROSOFT_TODO,
    externalId: 'todo_1',
    fetchedBack: true,
    verifiedAt: VERIFIED
  });
  check('a To Do read-back is system microsoft/todo',
    todo && todo.system === 'microsoft/todo' && todo.externalId === 'todo_1' && todo.fetchedBack === true, todo);
  check('a To Do step without fetchedBack is not Handled',
    FlowProofOfClose.stepCountsAsHandled({
      action: { kind: 'outlookTask' },
      response: { ok: true, proof: null }
    }) === false);
  check('a To Do step with fetchedBack is Handled',
    FlowProofOfClose.stepCountsAsHandled({
      action: { kind: 'outlookTask' },
      response: { ok: true, proof: todo }
    }) === true);
  const oldItem = 'AAMkOLD';
  const conv = 'conv/9';
  const storedTodo = {
    kind: 'written',
    messageId: oldItem,
    threadId: conv,
    outlookConversationId: conv,
    itemId: oldItem,
    pathId: 'path_9',
    connectorId: 'outlookTask',
    system: 'microsoft/todo',
    externalId: 'todo_1',
    verifiedAt: VERIFIED,
    fetchedBack: true,
    ref: { taskListId: 'LIST_T', taskId: 'todo_1', externalId: 'todo_1' },
    writtenLine: 'To Do · due Oct 10',
    processName: 'Log It',
    closedLine: 'Logged and tracked.',
    receiptStatus: 'Handled.'
  };
  const reload = { messageIds: ['AAMkNEW', 'path_9', conv], threadIds: [conv] };
  check('an Outlook reload finds the To Do receipt by conversation id, not the old item id',
    FlowProofOfClose.taskReceiptFromLog([storedTodo], reload) === storedTodo);
  const storedFile = {
    kind: 'written',
    messageId: 'AQMkAlpha',
    threadId: conv,
    outlookConversationId: conv,
    connectorId: 'onedriveFile',
    system: 'microsoft/onedrive',
    externalId: 'drive_1',
    verifiedAt: VERIFIED,
    fetchedBack: true,
    writtenLine: 'Saved statement-q3-alpha.pdf to OneDrive',
    receiptStatus: 'Handled.'
  };
  const betaFile = { messageIds: ['AQMkBeta', conv], threadIds: [conv], fileNames: ['statement-q3-beta.pdf'] };
  const alphaFile = { messageIds: ['AQMkAlpha', conv], threadIds: [conv], fileNames: ['…t-q3-alpha.pdf'] };
  const convFile = { messageIds: [conv], threadIds: [conv], fileNames: ['…t-q3-alpha.pdf'] };
  check('a file receipt does not remount on a sibling in the same conversation',
    FlowProofOfClose.taskReceiptFromLog([storedFile], betaFile) === null);
  check('a file receipt remounts on its own message id',
    FlowProofOfClose.taskReceiptFromLog([storedFile], alphaFile) === storedFile);
  check('a file receipt remounts on the conversation when the open file name agrees',
    FlowProofOfClose.taskReceiptFromLog([storedFile], convFile) === storedFile);
  const otherName = {
    kind: 'written', messageId: 'AQMkOther', threadId: conv, outlookConversationId: conv,
    connectorId: 'onedriveFile', system: 'microsoft/onedrive', externalId: 'drive_2',
    verifiedAt: VERIFIED, fetchedBack: true, writtenLine: 'Saved agreement-signed.pdf to OneDrive'
  };
  const graphSaved = {
    kind: 'written', messageId: conv, itemId: 'AQMkAlpha', graphMessageId: 'AQMkAlpha',
    threadId: conv, outlookConversationId: conv, connectorId: 'attachmentSave',
    system: 'microsoft/onedrive', externalId: 'drive_graph',
    verifiedAt: VERIFIED, fetchedBack: true, writtenLine: 'Saved statement-q3-alpha.pdf to OneDrive'
  };
  check('the Graph message id remounts a proved save when the chip name was not read',
    FlowProofOfClose.taskReceiptFromLog([graphSaved], { messageIds: ['AQMkAlpha'], threadIds: [conv], fileNames: [] }) === graphSaved);
  check('a sibling Graph id does not remount that proved save',
    FlowProofOfClose.taskReceiptFromLog([graphSaved], { messageIds: ['AQMkBeta'], threadIds: [conv], fileNames: ['statement-q3-beta.pdf'] }) === null);
  const alphaSaved = Object.assign({}, graphSaved, { subject: 'Q3 fund statement' });
  check('a proved save for this mail and filename remounts when the pane id is stale',
    FlowProofOfClose.savedFileReceipt([alphaSaved], {
      messageIds: ['AQQkStale'], fileNames: ['statement-q3-alpha.pdf'], subject: 'Q3 fund statement'
    }) === alphaSaved);
  check('the same proved save does not remount for beta.pdf',
    FlowProofOfClose.savedFileReceipt([alphaSaved], {
      messageIds: ['AQQkStale'], fileNames: ['statement-q3-beta.pdf'], subject: 'Q3 fund statement'
    }) === null);
  const undoneSave = Object.assign({}, alphaSaved, { kind: 'undone', undone: true });
  check('undo of that file offers Save again',
    FlowProofOfClose.savedFileReceipt([undoneSave], {
      messageIds: [conv], fileNames: ['statement-q3-alpha.pdf'], subject: 'Q3 fund statement'
    }) === null);
  check('a shorter full filename does not remount the longer file',
    FlowProofOfClose.taskReceiptFromLog([otherName], { messageIds: [conv], threadIds: [conv], fileNames: ['northwind-agreement-signed.pdf'] }) === null);
  check('terminal with no chip mounts the To Do receipt',
    FlowProofOfClose.scanReceiptDecision({
      log: [storedTodo], messageIds: ['AAMkNEW'], threadIds: [conv], hasHost: false, terminal: true
    }) === 'mount');
  const copy = FlowProofOfClose.remountCopy(storedTodo);
  check('the To Do banner says Handled and Undo removes the To Do task',
    copy && copy.status === 'Handled.' && copy.connectorId === 'outlookTask' &&
    copy.undoHint === 'Undo removes the To Do task.' && copy.undoneLine === 'Undone — the To Do task was removed.' &&
    copy.externalId === 'todo_1' && copy.ref.taskListId === 'LIST_T',
    copy);
  check('a newer To Do undo does not remount',
    FlowProofOfClose.taskReceiptFromLog([
      { kind: 'undone', messageId: oldItem, threadId: conv, connectorId: 'outlookTask', system: 'microsoft/todo', undone: true },
      storedTodo
    ], reload) === null);
  check('fetchedBack false is not a To Do receipt',
    FlowProofOfClose.remountCopy(Object.assign({}, storedTodo, { fetchedBack: false })) === null);
  const he = FlowProofOfClose.remountCopy(Object.assign({}, storedTodo, { receiptStatus: 'טופל.' }));
  check('a Hebrew To Do receipt stays טופל', he && he.status === 'טופל.', he);

  const outlook = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  const remountAt = outlook.indexOf('remountProvedTodoReceipt');
  const terminalAt = outlook.indexOf('hasTerminalOutcome');
  check('the Outlook scan remounts a proved To Do task before it can treat the thread as finished',
    remountAt > 0 && terminalAt > remountAt, { remountAt: remountAt, terminalAt: terminalAt });
  check('the Outlook lookup uses the item, the path, and the conversation, not a text hash',
    outlook.indexOf('messageIds: [pane.itemId, pane.pathId, pane.conversationId]') > 0 &&
    outlook.indexOf('taskReceiptFromLog') > 0);
  check('a task-only Do It calls the To Do writer and a draft Do It stays a draft',
    outlook.indexOf("connectorId: 'outlookTask'") > 0 && outlook.indexOf("payload.connectorId = 'outlookDraft'") > 0);
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  const storage = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage.js'), 'utf8');
  check('Undo rewrites the To Do Activity row so it does not stay HANDLED',
    storage.indexOf('markMicrosoftTodoUndone') > 0 && popup.indexOf('markMicrosoftTodoUndone') > 0 &&
    outlook.indexOf('markMicrosoftTodoUndone') > 0);
  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('the To Do writer is registered and follow-up chase is not that writer',
    bg.indexOf('outlookTask: outlookTaskWrite') > 0 && bg.indexOf("system: Proof.SYSTEM_MICROSOFT_TODO") > 0);
  const follow = bg.indexOf('async function followTaskCreate');
  const followEnd = bg.indexOf('async function followTaskComplete');
  check('the waiting-on chase does not write Microsoft To Do',
    follow > 0 && followEnd > follow && bg.slice(follow, followEnd).indexOf('/me/todo/') === -1);
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
