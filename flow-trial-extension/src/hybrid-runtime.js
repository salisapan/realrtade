// The on-device model runtime: capability check, engine start and one inference, on WebGPU through WebLLM. Classic script, loaded by
// src/offscreen.html (a page, because a service worker is killed when idle and would lose the model from memory).
// docs/hybrid-execution-architecture.md. NOT loaded by anything until the activation steps in that document are done.
//
// Stated plainly: the WebLLM calls below follow its published API (@mlc-ai/web-llm 0.2.85: CreateMLCEngine, chat.completions.create with
// response_format and logprobs) and fail closed, but they have NOT been run against a real GPU in this repository's tests. The tests exercise
// the capability logic, the refusal to run a remotely hosted WASM, the configuration, and the reading of logprobs with a fake engine.
const FlowHybridRuntime = (() => {
  // The two models the owner named for the browser. ids are WebLLM's prebuilt ids; vramMB is WebLLM's own published requirement.
  // `bundled` says whether this model's WASM library is a file of the package. Only Phi-3-mini ships: the 8B library would take the package over
  // the +12 MB budget the owner set (2026-10-04). The 8B entry stays so its manifest is not lost, and pick() never returns it while it is not bundled.
  const CATALOG = {
    'phi-3-mini': { id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC', vramMB: 3672, label: 'Phi-3 mini 4k Instruct (4-bit)', bundled: true },
    'llama-3-8b': { id: 'Llama-3-8B-Instruct-q4f16_1-MLC', vramMB: 5001, label: 'Llama 3 8B Instruct (4-bit)', bundled: false }
  };
  const GiB = 1024 * 1024 * 1024;

  // The silent check lives in core/capability.js (FlowCapability); this is the same call under the runtime's name.
  const capabilities = (env, need) => FlowCapability.check(env, need);

  // Which model this machine may run. The larger one needs a buffer limit and device memory that most business laptops do not report; the
  // default is the smaller one. The adapter does not expose VRAM, so maxBufferSize and navigator.deviceMemory are proxies, and they say so.
  function pick(preferred, caps, nav) {
    const mem = nav && typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0;
    if (preferred === 'llama-3-8b' && CATALOG['llama-3-8b'].bundled && caps && caps.maxBufferSize >= 4 * GiB - 1 && mem >= 8) return 'llama-3-8b';
    return 'phi-3-mini';
  }

  // The model's WASM library is CODE. A remotely hosted code file is not allowed in a Chrome extension, so it must be a file of the package.
  function libIsBundled(url) { return typeof url === 'string' && /^chrome-extension:\/\//.test(url); }

  // opts: { modelKey, manifest, libUrl, importer, onProgress }. importer: () => import('./vendor/web-llm.js').
  async function start(opts) {
    const o = opts || {};
    const entry = CATALOG[o.modelKey];
    if (!entry || !o.manifest) return { ok: false, reason: 'bad-config' };
    if (!libIsBundled(o.libUrl)) return { ok: false, reason: 'model-lib-not-bundled' };
    if (typeof o.importer !== 'function') return { ok: false, reason: 'runtime-missing' };
    let mod;
    try { mod = await o.importer(); } catch (e) { return { ok: false, reason: 'runtime-missing' }; }
    if (!mod || typeof mod.CreateMLCEngine !== 'function') return { ok: false, reason: 'runtime-missing' };
    const base = 'https://huggingface.co/mlc-ai/' + entry.id + '/resolve/' + o.manifest.revision + '/';      // the pinned commit, so the cached files are the verified ones
    const appConfig = {
      model_list: [{ model: base, model_id: entry.id, model_lib: o.libUrl, vram_required_MB: entry.vramMB, low_resource_required: false, overrides: { context_window_size: 4096 } }],
      cacheBackend: 'cache'
    };
    try {
      const engine = await mod.CreateMLCEngine(entry.id, { appConfig, initProgressCallback: o.onProgress });
      return { ok: true, engine, entry };
    } catch (e) {
      return { ok: false, reason: 'engine-failed:' + String(e && e.message || e).slice(0, 80) };
    }
  }

  // One inference, greedy, constrained to the JSON schema, with the lowest token probability reported back (the router's confidence input).
  async function infer(engine, prompt, opts) {
    const o = opts || {};
    const res = await engine.chat.completions.create({
      messages: [{ role: 'user', content: String(prompt) }],
      temperature: 0, max_tokens: o.maxTokens || 400, logprobs: true, top_logprobs: 1,
      response_format: o.schema ? { type: 'json_object', schema: JSON.stringify(o.schema) } : { type: 'json_object' }
    });
    const choice = res && res.choices && res.choices[0];
    const text = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
    const toks = choice && choice.logprobs && Array.isArray(choice.logprobs.content) ? choice.logprobs.content : [];
    const lps = toks.map((t) => t && t.logprob).filter((x) => typeof x === 'number' && isFinite(x));
    return { text, tokenProb: lps.length ? Math.round(Math.exp(Math.min.apply(null, lps)) * 1000) / 1000 : undefined };
  }

  return { CATALOG, capabilities, pick, libIsBundled, start, infer };
})();

if (typeof module !== 'undefined') module.exports = { FlowHybridRuntime };
