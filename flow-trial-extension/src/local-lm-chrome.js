// The browser half of core/local-lm.js: Chrome's built-in language model (the Prompt API), when this browser has one.
// Nothing here talks to a server. It never starts a model download: a model that is not already on the device is
// simply "not available", and the product behaves exactly as it did before. (Whether the API is reachable from a
// Gmail content script, and how well it reads Hebrew, differs by Chrome version; core/local-lm.js therefore
// trusts nothing until its self-test passes on the device, per language.)
const FlowLocalLMChrome = (() => {
  const OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

  function api() {
    try {
      if (typeof LanguageModel !== 'undefined' && LanguageModel) return LanguageModel;
      if (typeof self !== 'undefined' && self.LanguageModel) return self.LanguageModel;
    } catch (e) { /* no model API here */ }
    return null;
  }

  // 'available' | 'downloadable' | 'downloading' | 'unavailable'
  async function availability() {
    const a = api();
    if (!a || typeof a.availability !== 'function') return 'unavailable';
    try { return String(await a.availability(OPTS)); } catch (e) { return 'unavailable'; }
  }

  // A session with prompt(text, schema) -> string, or null. Only when the model is already there.
  async function open() {
    const a = api();
    if (!a || (await availability()) !== 'available') return null;
    try {
      const s = await a.create(Object.assign({ temperature: 0, topK: 1 }, OPTS));
      return {
        prompt: (text, schema) => s.prompt(text, schema ? { responseConstraint: schema } : undefined),
        destroy: () => { try { s.destroy(); } catch (e) { /* ignore */ } }
      };
    } catch (e) { return null; }
  }

  return { availability, open };
})();

if (typeof module !== 'undefined') module.exports = { FlowLocalLMChrome };
