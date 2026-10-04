// The silent environment check that runs BEFORE anything is downloaded: can this browser and machine run the on-device model at all?
// Portable: no chrome.*, no DOM; the navigator and storage objects are injected. docs/hybrid-execution-architecture.md §8a.
//
// It answers with a reason, and the reason decides what happens next:
//   permanent  the machine or browser cannot run it and will not start to (no WebGPU, no adapter, no shader-f16, too little memory or too small
//              a GPU buffer). The caller records one permanent "disabled" flag and the background worker never wakes again: no retries.
//   transient  something the person can change (not enough free disk). Not a retry loop either: it is checked again only when the person asks.
// Nothing here downloads, stores or allocates anything big; it asks the adapter what it supports.
//
// Honest limit: maxBufferSize and navigator.deviceMemory are PROXIES. WebGPU does not report free GPU memory, so a machine that passes can still
// fail when the engine starts; that is handled (the engine failure becomes the same permanent flag), but only after the download. WebLLM publishes
// 3.67 GB of GPU memory for Phi-3-mini 4-bit, and that is the figure these thresholds approximate.
const FlowCapability = (() => {
  const GiB = 1024 * 1024 * 1024;
  const PERMANENT = ['no-webgpu', 'no-gpu-adapter', 'no-shader-f16', 'gpu-buffer-too-small', 'low-memory'];
  const DEFAULT_NEED = { diskBytes: 2.2e9, minBufferBytes: 1 * GiB, minMemoryGB: 4 };

  function isPermanent(reason) { return PERMANENT.indexOf(reason) >= 0; }

  // env: { navigator, storage }. need: { diskBytes?, minBufferBytes?, minMemoryGB? }.
  // -> { ok:true, maxBufferSize, storageFreeBytes } | { ok:false, reason, permanent, ... }. Never throws.
  async function check(env, need) {
    const n = Object.assign({}, DEFAULT_NEED, typeof need === 'number' ? { diskBytes: need } : need || {});
    const nav = env && env.navigator;
    if (!nav || !nav.gpu) return { ok: false, reason: 'no-webgpu', permanent: true };
    let adapter = null;
    try { adapter = await nav.gpu.requestAdapter(); } catch (e) { adapter = null; }
    if (!adapter) return { ok: false, reason: 'no-gpu-adapter', permanent: true };
    const f16 = Boolean(adapter.features && adapter.features.has && adapter.features.has('shader-f16'));
    if (!f16) return { ok: false, reason: 'no-shader-f16', permanent: true };               // the 4-bit f16 build needs it; the larger f32 build is not offered
    const maxBuffer = adapter.limits && adapter.limits.maxBufferSize || 0;
    if (maxBuffer && maxBuffer < n.minBufferBytes) return { ok: false, reason: 'gpu-buffer-too-small', permanent: true, maxBufferSize: maxBuffer };
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < n.minMemoryGB) return { ok: false, reason: 'low-memory', permanent: true, deviceMemory: nav.deviceMemory };
    let free = null;
    try {
      const st = env.storage && env.storage.estimate ? await env.storage.estimate() : null;
      if (st && typeof st.quota === 'number') free = st.quota - (st.usage || 0);
    } catch (e) { free = null; }
    if (free !== null && n.diskBytes && free < n.diskBytes * 1.2) return { ok: false, reason: 'low-storage', permanent: false, storageFreeBytes: free };
    return { ok: true, maxBufferSize: maxBuffer, storageFreeBytes: free };
  }

  return { PERMANENT, DEFAULT_NEED, isPermanent, check };
})();

if (typeof module !== 'undefined') module.exports = { FlowCapability };
