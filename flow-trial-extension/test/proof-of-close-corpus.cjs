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
  check('a row with no verifiedAt is not a receipt',
    FlowProofOfClose.taskReceiptFromLog([writtenRow({ verifiedAt: '' })], 'm1') === null);
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
  check('the extension version is 0.9.29', /"version": "0\.9\.29"/.test(manifest));
}

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
