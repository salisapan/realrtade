// Glance cloud inference for the personal model. Off until the CTO wires the action.
// Embeddings and Hebrew NER run on Glance's own host. This file does not fetch weights,
// does not call a third-party model API, and does not keep the span after the call.
// Portable: no chrome.*, no document, no window.
const FlowPersonalInference = (() => {
  // TODO(CTO): implement action `personal-infer` on the existing glance-assist function.
  // Do not add a host, a scope, or a deploy from this repo. Leave this false until that action
  // is stateless, TLS-only, and drops the raw span after the response.
  const ENABLED = false;
  const HOST = 'https://theflow-ai.com/.netlify/functions/glance-assist';
  const MODELS = {
    embed: {
      id: 'Qwen/Qwen3-Embedding-0.6B',
      revision: '97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3',
      sha256: '0437e45c94563b09e13cb7a64478fc406947a93cb34a7e05870fc8dcd48e23fd',
      license: 'Apache-2.0'
    },
    embedOffline: {
      id: 'intfloat/multilingual-e5-small',
      revision: '614241f622f53c4eeff9890bdc4f31cfecc418b3',
      sha256: '1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477',
      license: 'MIT'
    },
    ner: {
      id: 'dicta-il/dictabert-joint',
      revision: '7b1256fc0846e22d1af431eae299e2dcecee2778',
      sha256: 'c59db02c002b69fd3c072c310e3ba578d036386477248d1c8576d896cc06aa1c',
      license: 'CC-BY-4.0'
    }
  };
  const SPAN_MAX = 400;
  const SPAN_COUNT = 8;

  function phoneLib() {
    if (typeof globalThis !== 'undefined' && globalThis.libphonenumber && globalThis.libphonenumber.parsePhoneNumberFromString) {
      return globalThis.libphonenumber;
    }
    try {
      if (typeof require === 'function') return require('libphonenumber-js/min');
    } catch (e) { /* the min build is not on this path */ }
    return null;
  }

  function phones(text, lib) {
    const api = lib || phoneLib();
    const found = [];
    const raw = String(text || '');
    const matches = raw.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    matches.slice(0, 8).forEach((chunk) => {
      if (api && typeof api.parsePhoneNumberFromString === 'function') {
        const parsed = api.parsePhoneNumberFromString(chunk.trim());
        if (parsed && parsed.isValid && parsed.isValid()) found.push(parsed.number);
        return;
      }
      const digits = chunk.replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) found.push('+' + digits);
    });
    return found;
  }

  function spansOf(input) {
    const list = Array.isArray(input) ? input : [input];
    return list.map((item) => String(item || '').replace(/\s+/g, ' ').trim().slice(0, SPAN_MAX)).filter(Boolean).slice(0, SPAN_COUNT);
  }

  function hostOk(url) {
    return url === HOST;
  }

  function fallback(task, text) {
    return {
      ok: true,
      source: 'on-device',
      task: task,
      retained: false,
      phones: phones(text),
      labels: [],
      vector: null
    };
  }

  function infer(opts) {
    const o = opts || {};
    const task = o.task === 'ner' ? 'ner' : 'embed';
    const text = Array.isArray(o.spans) ? o.spans.join('\n') : String(o.text || '');
    if (o.consent !== true) return { ok: false, reason: 'consent', source: 'on-device', retained: false };
    if (o.online === false || typeof o.post !== 'function' || (ENABLED !== true && o.force !== true)) return fallback(task, text);
    const url = o.url || HOST;
    if (!hostOk(url)) return { ok: false, reason: 'host', source: 'on-device', retained: false };
    const spans = spansOf(o.spans || o.text);
    const model = MODELS[task];
    let response = null;
    try {
      response = o.post({
        url: url,
        tls: true,
        retain: false,
        train: false,
        body: { action: 'personal-infer', task: task, model: model.id, sha256: model.sha256, spans: spans }
      });
    } catch (e) {
      return fallback(task, text);
    }
    return {
      ok: true,
      source: 'glance-cloud',
      task: task,
      retained: false,
      model: model.id,
      sha256: model.sha256,
      result: response && response.result ? response.result : null,
      phones: phones(text)
    };
  }

  function promptBlock(lines) {
    const body = (Array.isArray(lines) ? lines : []).filter((line) => {
      const s = String(line || '');
      return s && s.toLowerCase().indexOf('ignore previous') < 0 && s.indexOf('<glance-memory>') < 0;
    }).join('\n');
    return '<glance-memory>\n' + body + '\n</glance-memory>';
  }

  return {
    ENABLED: ENABLED,
    HOST: HOST,
    MODELS: MODELS,
    phones: phones,
    infer: infer,
    fallback: fallback,
    promptBlock: promptBlock,
    hostOk: hostOk
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowPersonalInference };
else if (typeof globalThis !== 'undefined') globalThis.FlowPersonalInference = FlowPersonalInference;
