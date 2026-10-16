// Handled for the Google lane. A lane write counts only with ProofOfClose
// fetchedBack. A compose fill is a preview and is not a trusted close.
// Other kinds delegate to FlowProofOfClose, so a calendar write without
// this proof stays on the rule that module already has.
// Portable: no chrome.*, no DOM, no network.
const FlowGoogleProof = (() => {
  const LANE = {
    googleHold: true,
    googleLaneTask: true,
    googleDriveSave: true,
    googleDoc: true,
    googleSheetAppend: true
  };

  function proofApi() {
    return typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
  }

  function stepCountsAsHandled(result) {
    if (!result || !result.response || result.response.ok !== true || result.response.skipped) return false;
    const kind = result.action && result.action.kind;
    const res = result.response;
    if (kind === 'gmailCompose' || res.preview === true || res.closes === false) return false;
    const Proof = proofApi();
    if (LANE[kind]) return !!(Proof && typeof Proof.allowsHandled === 'function' && Proof.allowsHandled(res));
    if (Proof && typeof Proof.stepCountsAsHandled === 'function') return Proof.stepCountsAsHandled(result);
    return false;
  }

  function shouldRecordTrustedClose(results) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      if (!stepCountsAsHandled(list[i])) return false;
    }
    return true;
  }

  return {
    LANE: LANE,
    stepCountsAsHandled: stepCountsAsHandled,
    shouldRecordTrustedClose: shouldRecordTrustedClose
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowGoogleProof };
else if (typeof globalThis !== 'undefined') globalThis.FlowGoogleProof = FlowGoogleProof;
