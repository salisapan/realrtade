// The content-script side of the hybrid execution path: it gives core/exec-router.js its three capabilities by messaging the service worker,
// and nothing else. Core logic stays here in the page's isolated world (as the rest of Glance's judgment does); the worker owns the licence,
// the offscreen model and the network. Needs core/json-enforce.js, core/mask-ids.js, core/privacyShield.js and core/exec-router.js loaded first.
// NOT in the manifest's content_scripts until the activation steps in docs/hybrid-execution-architecture.md are done.
const FlowHybrid = (() => {
  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, reason: chrome.runtime.lastError ? 'no-worker' : 'empty' }));
      } catch (e) { resolve({ ok: false, reason: 'no-worker' }); }
    });
  }

  function deps() {
    return {
      enforce: FlowJsonEnforce, maskIds: FlowMaskIds, shield: FlowPrivacyShield,
      state: async () => { const s = await send({ type: 'flow:hybrid-status' }); return { isModelLoaded: s.isModelLoaded === true, serverConsent: s.serverConsent === true }; },
      local: { run: async (prompt, opts) => {
        const r = await send({ type: 'flow:hybrid-infer', prompt, opts: { maxTokens: opts && opts.maxTokens } });
        if (!r.ok) throw new Error(r.reason || 'infer-failed');
        return { text: r.text, tokenProb: r.tokenProb };
      } },
      server: { call: async (payload) => {
        const r = await send({ type: 'flow:execute', payload });
        if (!r.ok) throw new Error(r.error || r.reason || 'server');
        return { text: r.text };
      } }
    };
  }

  // request: { prompt, lang? }. Returns the router's result: a PROPOSAL or a reason. Never throws.
  function run(request) { return FlowExecRouter.route(request, deps()); }

  // The dual-tier entry point. payload: { prompt, lang?, schema?, tiers?: { local?: boolean, server?: boolean } }.
  //   - the on-device model first, when it is loaded; asked twice, JSON only, accepted only above the confidence bar (0.85);
  //   - otherwise, or when it errors or is unsure, the MASKED prompt goes to the company server (Mistral Large, Llama-3-70B, Sonnet, Grok-strong,
  //     DeepSeek, in that order, skipping any provider without a key), and only if server fallback is switched on;
  //   - the answer is validated JSON of the schema, with placeholders restored here on the device. It is a PROPOSAL: nothing is written or sent.
  // Returns { ok:true, proposal:true, tier:'local'|'server'|'server-fallback', action, confidence, trace } or { ok:false, reason, trace }. Never throws.
  async function executeTask(payload) {
    try {
      const p = payload || {};
      const t = p.tiers || {};
      const d = deps();
      if (t.local === false) d.local = null;
      if (t.server === false) d.server = null;
      return await FlowExecRouter.route({ prompt: p.prompt, lang: p.lang, schema: p.schema }, d);
    } catch (e) {
      return { ok: false, reason: 'internal', proposal: false, trace: [] };
    }
  }

  return { run, executeTask, deps };
})();

// The name the rest of the extension calls (a top-level function: content scripts share one scope).
async function executeTask(payload) { return FlowHybrid.executeTask(payload); }

if (typeof module !== 'undefined') module.exports = { FlowHybrid, executeTask };
