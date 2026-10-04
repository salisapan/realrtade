// Runs in src/offscreen.html. Owns the download (core/model-store.js), the engine (src/hybrid-runtime.js) and nothing else: no judgment,
// no masking, no network call except the pinned model files. It talks to the service worker only with chrome.runtime messages, and keeps
// its own small state in localStorage because an offscreen document has no chrome.storage.
// Messages in:  hybrid:start { modelKey? }  hybrid:infer { prompt, opts }  hybrid:consent { given }  hybrid:remove
// Messages out: hybrid:state { state }   (after every step the service worker mirrors it for the popup and the router)
(() => {
  const KV_KEY = 'glance.hybrid.model.state';
  // Literal paths on purpose: scripts/package_trial_extension.py finds the files an install needs by reading the string arguments of chrome.runtime.getURL calls.
  // Only Phi-3-mini is bundled (the 8B library would take the package over the +12 MB budget).
  const MANIFEST_URL = { 'phi-3-mini': chrome.runtime.getURL('core/model-manifests/Phi-3-mini-4k-instruct-q4f16_1-MLC.json') };
  const LIB_URL = { 'phi-3-mini': chrome.runtime.getURL('vendor/Phi-3-mini-4k-instruct-q4f16_1-MLC-webgpu.wasm') };
  const RUNTIME_URL = chrome.runtime.getURL('vendor/web-llm.js');
  const R = FlowHybridRuntime, S = FlowModelStore, J = FlowJsonEnforce;
  let store = null, engine = null, modelKey = null, starting = null;

  const kv = {
    get: async () => { try { return JSON.parse(localStorage.getItem(KV_KEY) || 'null'); } catch (e) { return null; } },
    set: async (s) => { try { localStorage.setItem(KV_KEY, JSON.stringify(s)); } catch (e) { /* quota */ } }
  };
  const cacheAdapter = {
    open: () => caches.open('webllm/model'),                       // WebLLM's own cache scope: files stored here under their URL are found by the engine
    has: async (k) => Boolean(await (await caches.open('webllm/model')).match(k)),
    match: async (k) => (await caches.open('webllm/model')).match(k),
    put: async (k, r) => (await caches.open('webllm/model')).put(k, r),
    delete: async (k) => (await caches.open('webllm/model')).delete(k)
  };
  const sha256 = async (buf) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');

  async function publish(state) { try { await chrome.runtime.sendMessage({ type: 'hybrid:state', state }); } catch (e) { /* the worker is asleep; it re-reads on wake */ } }

  async function manifestFor(key) {
    if (!MANIFEST_URL[key]) throw new Error('model-not-bundled');
    const res = await fetch(MANIFEST_URL[key]);
    if (!res.ok) throw new Error('manifest-missing');
    return res.json();
  }

  async function ensureStore(key) {
    if (store && modelKey === key) return store;
    modelKey = key;
    const manifest = await manifestFor(key);
    store = S.create({ manifest, fetch: (u, o) => fetch(u, o), cache: cacheAdapter, kv, sha256, conditions: async () => S.networkConditions(navigator), throttle: { dutyCycle: 0.25 } });
    return store;
  }

  async function start(preferred) {
    const caps = await R.capabilities({ navigator, storage: navigator.storage }, 2.2e9);
    if (!caps.ok && caps.permanent) { const s0 = await (await ensureStore('phi-3-mini')).markUnsupported(caps.reason); await publish(s0); return s0; }
    if (!caps.ok) { const s1 = Object.assign({}, await (await ensureStore('phi-3-mini')).getState(), { status: 'paused', pausedReason: caps.reason }); await publish(s1); return s1; }   // not enough disk: waits, the person can free space
    const key = R.pick(preferred, caps, navigator);
    const st = await ensureStore(key);
    let s = await st.run();
    await publish(s);
    if (s.status !== 'ready' && !s.downloaded) return s;
    if (!engine) {
      const manifest = await manifestFor(key);
      const r = await R.start({ modelKey: key, manifest, libUrl: LIB_URL[key], importer: () => import(RUNTIME_URL),
        onProgress: () => {} });
      if (!r.ok) { s = await st.markUnsupported(r.reason); await publish(s); return s; }
      engine = r.engine;
    }
    s = await st.markLoaded(true);
    await publish(s);
    return s;
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('hybrid:') !== 0 || (sender && sender.id && sender.id !== chrome.runtime.id)) return false;
    (async () => {
      try {
        if (msg.type === 'hybrid:probe') {
          // Capability and size only: nothing is downloaded and nothing is stored.
          const caps = await R.capabilities({ navigator, storage: navigator.storage }, 2.2e9);
          if (!caps.ok) { reply({ ok: true, eligible: false, reason: caps.reason, permanent: caps.permanent === true }); return; }
          const key = R.pick(msg.modelKey, caps, navigator);
          const m = await manifestFor(key);
          reply({ ok: true, eligible: true, model: key, label: R.CATALOG[key].label, downloadBytes: m.files.reduce((n, f) => n + f.bytes, 0), network: S.networkConditions(navigator) });
          return;
        }
        if (msg.type === 'hybrid:consent') { const st = await ensureStore(modelKey || 'phi-3-mini'); reply({ ok: true, state: await st.setConsent(msg.given === true) }); return; }
        if (msg.type === 'hybrid:start') { starting = starting || start(msg.modelKey).finally(() => { starting = null; }); reply({ ok: true, state: await starting }); return; }
        if (msg.type === 'hybrid:infer') {
          if (!engine) { reply({ ok: false, reason: 'not-loaded' }); return; }
          const out = await R.infer(engine, msg.prompt, { schema: J.toJsonSchema(J.ACTION_SCHEMA), maxTokens: msg.opts && msg.opts.maxTokens });
          reply({ ok: true, text: out.text, tokenProb: out.tokenProb });
          return;
        }
        if (msg.type === 'hybrid:remove') { engine = null; const st = await ensureStore(modelKey || 'phi-3-mini'); const s = await st.remove(); await publish(s); reply({ ok: true, state: s }); return; }
        reply({ ok: false, reason: 'unknown-message' });
      } catch (e) { reply({ ok: false, reason: String(e && e.message || e).slice(0, 80) }); }
    })();
    return true;
  });
})();
