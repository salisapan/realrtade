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
    googleTasksAdapter: googleTasksAdapter
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowProofOfClose };
else if (typeof globalThis !== 'undefined') globalThis.FlowProofOfClose = FlowProofOfClose;
