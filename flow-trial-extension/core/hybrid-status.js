// The lightweight state manager the extension popup reads: turns the worker's raw status (consents, the mirrored download state, the permanent
// flags) into one plain line for the person: a mode, a label, a detail, a progress number and which buttons make sense. Pure: no chrome.*, no DOM.
// docs/hybrid-execution-architecture.md §8a.
//
// Modes: 'hidden' (the feature is not enabled in this build), 'local-ready' ("Ready for local processing"), 'preparing' (downloading or starting),
// 'paused' (waiting for a better connection or for room on the disk), 'server-backed' ("Server-backed mode"), 'local-only' (no server fallback).
const FlowHybridStatus = (() => {
  const REASONS = {
    'no-webgpu': 'this browser does not offer WebGPU',
    'no-gpu-adapter': 'no graphics adapter is available for the model',
    'no-shader-f16': 'the graphics card lacks a feature the model needs',
    'gpu-buffer-too-small': 'the graphics card is too small for the model',
    'low-memory': 'this computer has too little memory for the model',
    'low-storage': 'there is not enough free disk space',
    'offline': 'the computer is offline',
    'data-saver': 'data saver is on',
    'metered': 'the connection is metered',
    'slow-network': 'the connection is slow',
    'consent-withdrawn': 'the model was turned off'
  };

  function reasonText(code) {
    const c = String(code || '');
    if (REASONS[c]) return REASONS[c];
    if (/^engine-failed/.test(c)) return 'the model could not start on this computer';
    if (/^model-lib-not-bundled|^runtime-missing/.test(c)) return 'the model runtime is not part of this install';
    if (/^hash-mismatch|^manifest-|^redirect-host/.test(c)) return 'the downloaded files did not verify';
    return c ? 'it did not work on this computer' : '';
  }

  function gb(bytes) { return (Math.round(bytes / 1e8) / 10).toFixed(1) + ' GB'; }

  // raw: the answer to 'flow:hybrid-status': { enabled, consent:{localModel,server}, flags:{disabled,attempts}, state, isModelLoaded, serverConsent }
  function describe(raw) {
    const r = raw || {};
    if (!r.enabled) return { mode: 'hidden', visible: false, label: '', detail: '', progress: null, canEnable: false, canRetry: false, canRemove: false, serverBacked: false };
    const k = r.consent || {};
    const f = r.flags || {};
    const s = r.state || null;
    const server = r.serverConsent === true;
    const base = { visible: true, progress: null, canEnable: false, canRetry: false, canRemove: false, serverBacked: server };

    if (f.disabled) {
      const gaveUp = f.disabled.kind === 'gave-up';
      return Object.assign(base, {
        mode: server ? 'server-backed' : 'local-only', label: server ? 'Server-backed mode' : 'On-device model unavailable',
        detail: gaveUp ? 'The on-device model could not be downloaded after 3 tries, so Glance uses our server instead.' : 'The on-device model cannot run here (' + reasonText(f.disabled.reason) + '), so Glance uses our server instead.',
        canRetry: true
      });
    }
    if (r.isModelLoaded) return Object.assign(base, { mode: 'local-ready', label: 'Ready for local processing', detail: 'The on-device model is ready. Our server is asked only when it is unsure' + (server ? '.' : ', and that is switched off.'), canRemove: true });
    if (k.localModel && s) {
      if (s.status === 'downloading' || s.status === 'verifying') {
        const p = s.bytesTotal ? Math.min(1, s.bytesDone / s.bytesTotal) : null;
        return Object.assign(base, { mode: 'preparing', label: 'Preparing the on-device model', progress: p, detail: (s.bytesTotal ? gb(s.bytesDone) + ' of ' + gb(s.bytesTotal) + '. ' : '') + (server ? 'Until it is ready Glance uses our server.' : ''), canRemove: true });
      }
      if (s.status === 'paused') return Object.assign(base, { mode: 'paused', label: 'On-device model paused', progress: s.bytesTotal ? Math.min(1, s.bytesDone / s.bytesTotal) : null, detail: 'Waiting: ' + reasonText(s.pausedReason) + '.' + (server ? ' Glance uses our server meanwhile.' : ''), canRemove: true });
      if (s.status === 'ready') return Object.assign(base, { mode: 'preparing', label: 'Starting the on-device model', detail: 'The files are verified; starting the model.', canRemove: true });
      if (s.status === 'failed') return Object.assign(base, { mode: 'preparing', label: 'On-device model: trying again later', detail: 'It did not finish (' + reasonText(s.lastError) + '). Glance will retry' + ((f.attempts || 0) ? ' (attempt ' + (f.attempts + 1) + ' of 3)' : '') + ' and uses our server meanwhile.', canRemove: true });
    }
    if (k.localModel) return Object.assign(base, { mode: 'preparing', label: 'Checking this computer', detail: 'Checking whether the on-device model can run here.', canRemove: true });
    return Object.assign(base, server
      ? { mode: 'server-backed', label: 'Server-backed mode', detail: 'The on-device model is off. When Glance needs more than its own rules, masked text goes to our server.', canEnable: true }
      : { mode: 'local-only', label: 'Local rules only', detail: 'The on-device model and the server fallback are both off.', canEnable: true });
  }

  return { REASONS, reasonText, describe };
})();

if (typeof module !== 'undefined') module.exports = { FlowHybridStatus };
