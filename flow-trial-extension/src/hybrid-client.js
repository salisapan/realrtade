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

  return { run, deps };
})();

if (typeof module !== 'undefined') module.exports = { FlowHybrid };
