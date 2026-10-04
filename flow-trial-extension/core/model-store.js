// Fetches, verifies and keeps an on-device model's files, quietly and politely. Portable: no chrome.*, no DOM. Every capability (network, the
// cache, the state store, the hash, the clock, the pause between chunks) is injected, so the whole download logic runs under plain Node in tests
// and the Chrome binding (src/model-downloader.js) is only plumbing. docs/hybrid-execution-architecture.md.
//
// What it guarantees:
//   - Nothing is downloaded until the person has consented (setConsent(true)). "Quiet" means it does not interrupt; it does NOT mean unseen:
//     the state (progress, paused, failed, ready) is always readable and the popup shows it.
//   - A manifest that is not fully pinned is refused: https only, hosts on an allowlist (also after redirects), every file with a byte size and
//     a SHA-256. A file whose hash does not match is deleted and the download fails; a half-trusted model is never marked ready.
//   - Polite: sequential, one file at a time, a duty cycle (it reads for a fraction of the wall time and sleeps the rest), and it pauses
//     itself when the injected conditions say so (offline, data saver, a slow or metered connection, a busy browser). It resumes by itself.
//   - Resumable at file granularity (the model is sharded; a shard is tens of MB), idempotent: run() can be called any number of times.
//   - It never throws to its caller; every failure becomes a state ({ status:'failed', lastError }) the UI can show.
//
// States: 'idle' -> 'awaiting-consent' -> 'downloading' <-> 'paused' -> 'verifying' -> 'ready' | 'failed' | 'unsupported'.
// `downloaded` means every file is in the cache and verified. `isModelLoaded` is set only by the runtime, via markLoaded(true), after the engine
// has actually initialised from those files; the router reads `isModelLoaded`, never `downloaded`.
const FlowModelStore = (() => {
  const STATE_VERSION = 1;
  const MAX_SHARD_BYTES = 256 * 1024 * 1024;    // a shard is verified in memory, so a file larger than this is not accepted
  const DEFAULT_HOSTS = ['huggingface.co', 'cdn-lfs.huggingface.co', 'cas-bridge.xethub.hf.co', 'raw.githubusercontent.com'];
  const DEFAULTS = { dutyCycle: 0.25, maxAttemptsPerFile: 3, backoffMs: 2000, progressEveryMs: 1000, minBytesPerSecond: 0 };

  function blank(manifest) {
    return { v: STATE_VERSION, status: 'idle', consent: { given: false, at: null }, modelId: manifest && manifest.id || null, revision: manifest && manifest.revision || null,
      bytesDone: 0, bytesTotal: manifest ? manifest.totalBytes : 0, filesDone: 0, filesTotal: manifest ? manifest.files.length : 0,
      downloaded: false, isModelLoaded: false, attempts: 0, lastError: null, pausedReason: null, unsupportedReason: null, startedAt: null, updatedAt: null };
  }

  // A manifest is { id, revision, files: [{ name, url, bytes, sha256 }] }. Returns { ok, reason } and, when ok, nothing else is trusted.
  function checkManifest(m, hosts) {
    const allow = hosts || DEFAULT_HOSTS;
    if (!m || typeof m.id !== 'string' || !m.id || typeof m.revision !== 'string' || !m.revision || !Array.isArray(m.files) || !m.files.length) return { ok: false, reason: 'manifest-invalid' };
    const names = new Set();
    let total = 0;
    for (const f of m.files) {
      if (!f || typeof f.name !== 'string' || !f.name || names.has(f.name)) return { ok: false, reason: 'manifest-invalid' };
      names.add(f.name);
      if (!/^[0-9a-f]{64}$/i.test(String(f.sha256 || ''))) return { ok: false, reason: 'manifest-unpinned' };
      if (!Number.isInteger(f.bytes) || f.bytes <= 0) return { ok: false, reason: 'manifest-invalid' };
      if (f.bytes > MAX_SHARD_BYTES) return { ok: false, reason: 'manifest-shard-too-big' };
      let u;
      try { u = new URL(f.url); } catch (e) { return { ok: false, reason: 'manifest-invalid' }; }
      if (u.protocol !== 'https:' || allow.indexOf(u.hostname) < 0) return { ok: false, reason: 'manifest-host' };
      total += f.bytes;
    }
    return { ok: true, totalBytes: total };
  }

  function create(deps) {
    const d = deps || {};
    const cfg = Object.assign({}, DEFAULTS, d.throttle || {});
    const now = () => (typeof d.now === 'function' ? d.now() : Date.now());
    const sleep = d.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const manifest = d.manifest;
    const mcheck = checkManifest(manifest, d.hosts);
    let state = blank(mcheck.ok ? Object.assign({}, manifest, { totalBytes: mcheck.totalBytes }) : null);
    let running = null;
    let lastSave = 0;
    let loaded = false;

    async function save(force) {
      state.updatedAt = now();
      if (!force && state.updatedAt - lastSave < cfg.progressEveryMs) return;
      lastSave = state.updatedAt;
      try { if (d.kv) await d.kv.set(state); } catch (e) { /* the state is also in memory; a failed write must not stop a download */ }
    }

    async function load() {
      if (loaded) return state;
      loaded = true;
      try {
        const s = d.kv ? await d.kv.get() : null;
        if (s && s.v === STATE_VERSION && mcheck.ok && s.modelId === manifest.id && s.revision === manifest.revision) state = Object.assign(blank(manifest), s, { bytesTotal: mcheck.totalBytes, filesTotal: manifest.files.length });
      } catch (e) { /* start from blank */ }
      if (!mcheck.ok) { state.status = 'failed'; state.lastError = mcheck.reason; }
      return state;
    }

    function fail(reason) { state.status = 'failed'; state.lastError = String(reason).slice(0, 120); state.pausedReason = null; return save(true); }

    async function recount() {
      let bytes = 0, done = 0;
      for (const f of manifest.files) if (d.cache && await d.cache.has(f.name)) { bytes += f.bytes; done++; }
      state.bytesDone = bytes; state.filesDone = done;
      return done === manifest.files.length;
    }

    // Reads the response body in chunks, sleeping so the average read rate is dutyCycle of the line rate, checking the conditions between
    // chunks, and counting bytes. Returns a ReadableStream the cache can store, so the file is never held in memory while it downloads.
    function politeStream(body, file, ctl) {
      const reader = body.getReader();
      let got = 0;
      return new ReadableStream({
        async pull(controller) {
          const c = !state.consent.given ? { ok: false, reason: 'consent-withdrawn' } : (d.conditions ? await d.conditions() : { ok: true });
          if (!c.ok) { ctl.pausedFor = c.reason || 'conditions'; try { await reader.cancel(); } catch (e) { /* closing */ } controller.error(new Error('paused')); return; }
          const t0 = now();
          const { value, done } = await reader.read();
          if (done) { controller.close(); return; }
          got += value.byteLength;
          controller.enqueue(value);
          state.bytesDone = ctl.base + got;
          await save(false);
          const spent = Math.max(now() - t0, 1);
          let pause = Math.round(spent * (1 / cfg.dutyCycle - 1));
          if (cfg.minBytesPerSecond > 0) pause = Math.min(pause, Math.max(0, Math.round(value.byteLength / cfg.minBytesPerSecond * 1000) - spent));
          if (pause > 0) await sleep(pause);
        },
        cancel() { return reader.cancel(); }
      });
    }

    async function hashOf(name) {
      const res = await d.cache.match(name);
      if (!res) return null;
      return d.sha256(await res.arrayBuffer());
    }

    async function getFile(f) {
      const base = state.bytesDone;                                          // bytes of the files already complete
      for (let attempt = 1; attempt <= cfg.maxAttemptsPerFile; attempt++) {
        state.bytesDone = base;
        const ctl = { base, pausedFor: null };
        try {
          const res = await d.fetch(f.url, { redirect: 'follow' });
          if (!res || !res.ok || !res.body) throw new Error('http-' + (res && res.status));
          if (res.url) { const h = new URL(res.url).hostname; if ((d.hosts || DEFAULT_HOSTS).indexOf(h) < 0) throw new Error('redirect-host'); }
          await d.cache.put(f.name, new Response(politeStream(res.body, f, ctl), { status: 200, headers: { 'content-length': String(f.bytes) } }));
          const got = await hashOf(f.name);
          if (String(got).toLowerCase() !== f.sha256.toLowerCase()) { await d.cache.delete(f.name); return { ok: false, fatal: true, reason: 'hash-mismatch:' + f.name }; }
          return { ok: true };
        } catch (e) {
          try { await d.cache.delete(f.name); } catch (e2) { /* nothing to delete */ }
          if (ctl.pausedFor) return { ok: false, paused: ctl.pausedFor };
          const msg = String(e && e.message || e);
          if (msg === 'redirect-host') return { ok: false, fatal: true, reason: 'redirect-host:' + f.name };
          if (attempt === cfg.maxAttemptsPerFile) return { ok: false, reason: msg + ':' + f.name };
          await sleep(cfg.backoffMs * Math.pow(2, attempt - 1));
        }
      }
      return { ok: false, reason: 'unreachable' };
    }

    async function pass() {
      await load();
      if (!mcheck.ok) return state;
      if (state.status === 'unsupported') return state;
      if (!state.consent.given) { state.status = 'awaiting-consent'; await save(true); return state; }
      if (await recount()) { return finish(); }
      const c = d.conditions ? await d.conditions() : { ok: true };
      if (!c.ok) { state.status = 'paused'; state.pausedReason = c.reason || 'conditions'; await save(true); return state; }
      state.status = 'downloading'; state.pausedReason = null; state.lastError = null; state.startedAt = state.startedAt || now(); state.attempts++;
      await save(true);
      for (const f of manifest.files) {
        if (d.cache && await d.cache.has(f.name)) continue;
        const r = await getFile(f);
        if (r.paused) { state.status = 'paused'; state.pausedReason = r.paused; await recount(); await save(true); return state; }
        if (!r.ok) { await recount(); await fail(r.reason); return state; }
        await recount();
        await save(true);
      }
      return finish();
    }

    async function finish() {
      state.status = 'verifying'; await save(true);
      for (const f of manifest.files) {                                    // a final pass over what the cache really holds
        const h = await hashOf(f.name);
        if (String(h).toLowerCase() !== f.sha256.toLowerCase()) { try { await d.cache.delete(f.name); } catch (e) { /* gone */ } await recount(); await fail('hash-mismatch:' + f.name); return state; }
      }
      await recount();
      state.status = 'ready'; state.downloaded = true; state.lastError = null; state.pausedReason = null;
      await save(true);
      return state;
    }

    return {
      load,
      getState: async () => Object.assign({}, await load()),
      // The runtime reports that the engine initialised from the cached files (true) or that it could not (false).
      markLoaded: async (ok) => { await load(); state.isModelLoaded = Boolean(ok) && state.downloaded; await save(true); return Object.assign({}, state); },
      // The browser cannot run it (no WebGPU, too little room): no download is attempted, and the router keeps using the server (with consent).
      markUnsupported: async (reason) => { await load(); state.status = 'unsupported'; state.unsupportedReason = String(reason).slice(0, 80); state.isModelLoaded = false; await save(true); return Object.assign({}, state); },
      setConsent: async (given) => { await load(); state.consent = { given: Boolean(given), at: now() }; if (!given) { state.status = 'idle'; } await save(true); return Object.assign({}, state); },
      // One polite pass; concurrent calls share it. Never throws.
      run() {
        if (running) return running;
        running = pass().catch(async (e) => { await fail('internal:' + String(e && e.message || e)); return state; }).then((s) => { running = null; return Object.assign({}, s); });
        return running;
      },
      verify: async () => { await load(); if (!mcheck.ok) return Object.assign({}, state); return Object.assign({}, await finish()); },
      // Remove everything and forget the consent: "turn it off and free the disk".
      remove: async () => {
        await load();
        for (const f of (manifest && manifest.files) || []) { try { await d.cache.delete(f.name); } catch (e) { /* already gone */ } }
        state = blank(mcheck.ok ? Object.assign({}, manifest, { totalBytes: mcheck.totalBytes }) : null);
        await save(true);
        return Object.assign({}, state);
      }
    };
  }

  return { STATE_VERSION, DEFAULT_HOSTS, DEFAULTS, MAX_SHARD_BYTES, checkManifest, create, blank };
})();

if (typeof module !== 'undefined') module.exports = { FlowModelStore };
