// The silent environment check that runs BEFORE anything is downloaded: can this browser and machine run the on-device model at all?
// Portable: no chrome.*, no DOM; the navigator and storage objects are injected. docs/hybrid-execution-architecture.md §8a.
//
// It answers with a reason, and the reason decides what happens next:
//   permanent  the machine or browser cannot run it and will not start to (no WebGPU, no adapter, a software adapter, no shader-f16, too little memory or
//              GPU buffer). The caller records one permanent "disabled" flag and the background worker never wakes again: no retries.
//   transient  something the person can change (not enough free disk). Not a retry loop either: it is checked again only when the person asks.
// Nothing here downloads, stores or allocates anything big; it asks the adapter what it supports.
//
// DIAGNOSTICS. Every check also returns `diagnostics` (the adapter's vendor, architecture, device and description when the browser exposes them, the
// adapter's features and the limits that matter, device memory, logical cores, platform, free storage) and a `trace`: one line per step with what it saw
// and why it passed or failed. If env.log is given each line is also written there, so a live device session can read exactly why a machine falls back to
// server-backed mode. This is for the person's own console and extension storage only: nothing in this file, and no path in the extension, sends it
// anywhere (the router's wire payload is the masked prompt and a language code, and a test pins that).
//
// Honest limit: maxBufferSize and navigator.deviceMemory are PROXIES. WebGPU does not report free GPU memory, so a machine that passes can still fail when
// the engine starts; that is handled (the engine failure becomes the same permanent flag), but only after the download. WebLLM publishes 3.67 GB of GPU
// memory for Phi-3-mini 4-bit, and these thresholds approximate it.
const FlowCapability = (() => {
  const GiB = 1024 * 1024 * 1024;
  const PERMANENT = ['no-webgpu', 'no-gpu-adapter', 'software-adapter', 'no-shader-f16', 'gpu-buffer-too-small', 'low-memory'];
  const DEFAULT_NEED = { diskBytes: 2.2e9, minBufferBytes: 1 * GiB, minMemoryGB: 4 };
  const LIMIT_NAMES = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupSizeX'];
  const TAG = '[glance:hybrid:gpu]';

  function isPermanent(reason) { return PERMANENT.indexOf(reason) >= 0; }

  const text = (v) => (v === undefined || v === null || v === '' ? null : String(v).replace(/[^\x20-\x7E]/g, '?').slice(0, 80));

  // What the browser says about the adapter. adapter.info (Chrome 121+) first, the older requestAdapterInfo() as a fallback; either may be missing or
  // blocked (browsers hide parts of it), and a missing field is reported as null, never guessed.
  async function adapterInfo(adapter) {
    let info = null;
    try { info = adapter.info || null; } catch (e) { info = null; }
    if (!info && typeof adapter.requestAdapterInfo === 'function') { try { info = await adapter.requestAdapterInfo(); } catch (e) { info = null; } }
    info = info || {};
    const fallback = info.isFallbackAdapter === true || adapter.isFallbackAdapter === true;
    return { vendor: text(info.vendor), architecture: text(info.architecture), device: text(info.device), description: text(info.description), isFallbackAdapter: fallback, infoAvailable: Boolean(adapter.info || info.vendor || info.architecture || info.device || info.description) };
  }

  function adapterFeatures(adapter) {
    try { return Array.from(adapter.features || []).map(text).filter(Boolean).slice(0, 40).sort(); } catch (e) { return []; }
  }

  function adapterLimits(adapter) {
    const out = {};
    for (const k of LIMIT_NAMES) { try { const v = adapter.limits && adapter.limits[k]; if (typeof v === 'number') out[k] = v; } catch (e) { /* hidden */ } }
    return out;
  }

  // env: { navigator, storage, log? }. need: { diskBytes?, minBufferBytes?, minMemoryGB? }.
  // -> { ok:true, maxBufferSize, storageFreeBytes, diagnostics, trace } | { ok:false, reason, permanent, diagnostics, trace, ... }. Never throws.
  async function check(env, need) {
    const n = Object.assign({}, DEFAULT_NEED, typeof need === 'number' ? { diskBytes: need } : need || {});
    const nav = env && env.navigator;
    const trace = [];
    const diagnostics = { adapter: null, features: [], limits: {}, device: { deviceMemoryGB: null, hardwareConcurrency: null, platform: null }, storage: { freeBytes: null }, needs: n };
    const note = (step, ok, detail) => {
      const line = TAG + ' ' + step + ': ' + (ok ? 'ok' : 'FAIL') + (detail ? ' (' + detail + ')' : '');
      trace.push(line);
      try { if (env && typeof env.log === 'function') env.log(line); } catch (e) { /* a logger must not break the check */ }
    };
    const fail = (reason, extra) => ({ ok: false, reason, permanent: isPermanent(reason), diagnostics, trace, ...(extra || {}) });

    try {
      if (nav) {
        diagnostics.device.deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
        diagnostics.device.hardwareConcurrency = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
        diagnostics.device.platform = text(nav.userAgentData && nav.userAgentData.platform || nav.platform);
      }
      note('device', true, 'memory ' + (diagnostics.device.deviceMemoryGB === null ? 'not reported' : diagnostics.device.deviceMemoryGB + ' GB') + ', cores ' + (diagnostics.device.hardwareConcurrency === null ? 'not reported' : diagnostics.device.hardwareConcurrency) + ', platform ' + (diagnostics.device.platform || 'not reported'));

      if (!nav || !nav.gpu) { note('webgpu', false, 'navigator.gpu is not exposed: this browser, profile or policy has no WebGPU'); return fail('no-webgpu'); }
      note('webgpu', true, 'navigator.gpu is exposed');

      let adapter = null, adapterError = null;
      try { adapter = await nav.gpu.requestAdapter(); } catch (e) { adapter = null; adapterError = text(e && e.message); }
      if (!adapter) { note('adapter', false, adapterError ? 'requestAdapter threw: ' + adapterError : 'requestAdapter returned null: no usable GPU (driver blocklist, disabled hardware acceleration or no GPU)'); return fail('no-gpu-adapter'); }

      diagnostics.adapter = await adapterInfo(adapter);
      diagnostics.features = adapterFeatures(adapter);
      diagnostics.limits = adapterLimits(adapter);
      const a = diagnostics.adapter;
      note('adapter', true, [a.vendor && 'vendor ' + a.vendor, a.architecture && 'architecture ' + a.architecture, a.device && 'device ' + a.device, a.description && a.description].filter(Boolean).join(', ') || 'the browser did not expose adapter details');
      note('features', true, diagnostics.features.length + ' features; shader-f16 ' + (diagnostics.features.indexOf('shader-f16') >= 0 ? 'present' : 'ABSENT'));
      note('limits', true, Object.keys(diagnostics.limits).map((k) => k + '=' + diagnostics.limits[k]).join(', ') || 'none reported');

      if (a.isFallbackAdapter) { note('hardware', false, 'the adapter is a software fallback (no real GPU): the model would be unusably slow'); return fail('software-adapter'); }
      note('hardware', true, 'a hardware adapter');

      const f16 = Boolean(adapter.features && adapter.features.has && adapter.features.has('shader-f16'));
      if (!f16) { note('shader-f16', false, 'the 4-bit f16 build needs it; the larger f32 build is not offered'); return fail('no-shader-f16'); }
      note('shader-f16', true, null);

      const maxBuffer = diagnostics.limits.maxBufferSize || 0;
      if (maxBuffer && maxBuffer < n.minBufferBytes) { note('gpu-buffer', false, 'maxBufferSize ' + maxBuffer + ' is under the ' + n.minBufferBytes + ' needed'); return fail('gpu-buffer-too-small', { maxBufferSize: maxBuffer }); }
      note('gpu-buffer', true, 'maxBufferSize ' + (maxBuffer || 'not reported'));

      if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < n.minMemoryGB) { note('memory', false, nav.deviceMemory + ' GB reported, ' + n.minMemoryGB + ' GB needed'); return fail('low-memory', { deviceMemory: nav.deviceMemory }); }
      note('memory', true, null);

      let free = null;
      try {
        const st = env.storage && env.storage.estimate ? await env.storage.estimate() : null;
        if (st && typeof st.quota === 'number') free = st.quota - (st.usage || 0);
      } catch (e) { free = null; }
      diagnostics.storage.freeBytes = free;
      if (free !== null && n.diskBytes && free < n.diskBytes * 1.2) { note('storage', false, free + ' bytes free, ' + Math.round(n.diskBytes * 1.2) + ' needed (not permanent: free space and check again)'); return fail('low-storage', { storageFreeBytes: free }); }
      note('storage', true, free === null ? 'free space not reported' : free + ' bytes free');

      note('verdict', true, 'this machine can run the on-device model');
      return { ok: true, maxBufferSize: maxBuffer, storageFreeBytes: free, diagnostics, trace };
    } catch (e) {
      note('internal', false, text(e && e.message));
      return fail('no-gpu-adapter');                         // an unexpected failure is treated as "cannot run", never as a throw
    }
  }

  return { PERMANENT, DEFAULT_NEED, TAG, isPermanent, check };
})();

if (typeof module !== 'undefined') module.exports = { FlowCapability };
