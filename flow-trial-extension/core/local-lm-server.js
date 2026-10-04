// A language model the person runs ON THEIR OWN COMPUTER (Ollama, LM Studio, or anything that speaks the same two HTTP dialects), as
// another source for the session core/local-lm.js already knows how to use. Portable: no chrome.*, no DOM; fetch is injected.
//
//   Tier 2 in core/local-lm.js asks a `session` with one method, prompt(text, schema) -> string. Chrome's built-in model is one
//   source of that session (src/local-lm-chrome.js). This file is the other: an HTTP server on this machine.
//
// What it may and may not do (docs/local-model-server.md):
//   - LOOPBACK ONLY. The address must be 127.0.0.1, localhost or ::1. Any other host is refused in normalizeConfig AND again right
//     before every request, so a mistyped or malicious setting can never send text off this computer.
//   - It is the same tier as the browser's model: it only PROPOSES, is asked twice with differently worded instructions that must
//     agree, and is switched on for a language only after core/local-lm.js's precision self-test passes against THIS model. A model that
//     is not good enough at Hebrew stays off for Hebrew.
//   - It never closes, writes or sends anything, and nothing is downloaded or installed by Glance.
//   - It needs no key and costs no credits; it does need the person to have installed and started the server and pulled a model.
const FlowLocalLMServer = (() => {
  const PROVIDERS = {
    ollama: { id: 'ollama', label: 'Ollama', base: 'http://127.0.0.1:11434', chat: '/api/chat', models: '/api/tags' },
    lmstudio: { id: 'lmstudio', label: 'LM Studio', base: 'http://127.0.0.1:1234', chat: '/v1/chat/completions', models: '/v1/models' }
  };
  const DEFAULT_TIMEOUT_MS = 20000;
  const MAX_PROMPT_CHARS = 4000;

  // Only this computer. No credentials in the address, no other host, no look-alike ("127.0.0.1.evil.com", "localhost.evil.com").
  function isLoopbackUrl(url) {
    let u;
    try { u = new URL(String(url)); } catch (e) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
  }

  // cfg: { provider, baseUrl?, model } -> { provider, baseUrl, model } or null. A model name is required (the server must be told which).
  function normalizeConfig(cfg) {
    const c = cfg || {};
    const p = PROVIDERS[c.provider];
    if (!p) return null;
    const base = String(c.baseUrl || p.base).trim().replace(/\/+$/, '');
    const model = String(c.model || '').trim().slice(0, 120);
    if (!model || !isLoopbackUrl(base)) return null;
    return { provider: p.id, baseUrl: base, model };
  }

  // The request for one prompt, per dialect. temperature 0: the same sentence must get the same answer.
  function chatRequest(cfg, text, schema) {
    const p = PROVIDERS[cfg.provider];
    const content = String(text).slice(0, MAX_PROMPT_CHARS);
    if (p.id === 'ollama') {
      const body = { model: cfg.model, messages: [{ role: 'user', content }], stream: false, options: { temperature: 0 } };
      if (schema) body.format = schema;
      return { url: cfg.baseUrl + p.chat, body };
    }
    const body = { model: cfg.model, messages: [{ role: 'user', content }], temperature: 0, stream: false };
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'glance', strict: true, schema } };
    return { url: cfg.baseUrl + p.chat, body };
  }

  // The model's text from a response body, or null.
  function replyText(provider, json) {
    if (!json || typeof json !== 'object') return null;
    if (provider === 'ollama') return json.message && typeof json.message.content === 'string' ? json.message.content : null;
    const c = json.choices && json.choices[0];
    return c && c.message && typeof c.message.content === 'string' ? c.message.content : null;
  }

  function modelNames(provider, json) {
    if (!json || typeof json !== 'object') return [];
    const list = provider === 'ollama' ? json.models : json.data;
    return (Array.isArray(list) ? list : []).map((m) => String((m && (m.name || m.id || m.model)) || '')).filter(Boolean).slice(0, 60);
  }

  // Why a call failed, in words the person can act on.
  function failure(status, err) {
    if (status === 403) return { ok: false, reason: 'origin', hint: 'The server refused this extension. For Ollama, allow it with OLLAMA_ORIGINS=chrome-extension://* and restart Ollama.' };
    if (status === 404) return { ok: false, reason: 'not-found', hint: 'The server does not know that model or address. Check the model name.' };
    if (status) return { ok: false, reason: 'http-' + status, hint: 'The server answered with an error (' + status + ').' };
    if (err && err.name === 'AbortError') return { ok: false, reason: 'timeout', hint: 'The model took too long to answer.' };
    return { ok: false, reason: 'unreachable', hint: 'Nothing is listening at that address. Start the server first.' };
  }

  async function post(url, body, deps) {
    const f = deps && deps.fetch;
    if (typeof f !== 'function' || !isLoopbackUrl(url)) return { ok: false, reason: 'refused', hint: 'Only a server on this computer is allowed.' };
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), (deps && deps.timeoutMs) || DEFAULT_TIMEOUT_MS) : null;
    try {
      const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      if (!res.ok) return failure(res.status);
      return { ok: true, json: await res.json() };
    } catch (e) { return failure(0, e); } finally { if (timer) clearTimeout(timer); }
  }

  // A session core/local-lm.js can use: prompt(text, schema) -> string. A failure THROWS, which core/local-lm.js treats as silence.
  function session(cfg, deps) {
    const c = normalizeConfig(cfg);
    if (!c) return null;
    return {
      prompt: async (text, schema) => {
        const req = chatRequest(c, text, schema);
        const r = await post(req.url, req.body, deps);
        if (!r.ok) throw new Error(r.reason);
        const out = replyText(c.provider, r.json);
        if (out === null) throw new Error('bad-response');
        return out;
      },
      destroy: () => {}
    };
  }

  // The models the server has, for the picker. { ok, models } or { ok:false, reason, hint }.
  async function listModels(cfg, deps) {
    const p = PROVIDERS[cfg && cfg.provider];
    if (!p) return { ok: false, reason: 'bad-config', hint: 'Choose Ollama or LM Studio.' };
    const base = String((cfg && cfg.baseUrl) || p.base).trim().replace(/\/+$/, '');
    const f = deps && deps.fetch;
    if (typeof f !== 'function' || !isLoopbackUrl(base)) return { ok: false, reason: 'refused', hint: 'Only a server on this computer is allowed.' };
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 5000) : null;
    try {
      const res = await f(base + p.models, { method: 'GET', signal: ctl ? ctl.signal : undefined });
      if (!res.ok) return failure(res.status);
      return { ok: true, models: modelNames(p.id, await res.json()) };
    } catch (e) { return failure(0, e); } finally { if (timer) clearTimeout(timer); }
  }

  // The permission pattern to request for a config (Chrome match patterns ignore the port).
  function originPattern(cfg) {
    const c = normalizeConfig(Object.assign({ model: 'x' }, cfg));
    if (!c) return null;
    const u = new URL(c.baseUrl);
    return u.protocol + '//' + (u.hostname === '[::1]' ? '[::1]' : u.hostname) + '/*';
  }

  // A stored result is trusted only while it is recent and for the SAME model and address: changing either means testing again.
  function statusFits(saved, cfg) {
    const c = normalizeConfig(cfg);
    return Boolean(saved && c && saved.model === c.model && saved.baseUrl === c.baseUrl && saved.provider === c.provider);
  }

  return { PROVIDERS, DEFAULT_TIMEOUT_MS, isLoopbackUrl, normalizeConfig, chatRequest, replyText, modelNames, failure, session, listModels, originPattern, statusFits };
})();

if (typeof module !== 'undefined') module.exports = { FlowLocalLMServer };
