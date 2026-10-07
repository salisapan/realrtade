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

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
