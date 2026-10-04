// The dual-tier router for a "Do It" / "Draft It" proposal: the model on this device first, the company server only when it is needed AND allowed.
// Portable: no chrome.*, no DOM, no network of its own; every capability is injected. docs/hybrid-execution-architecture.md.
//
//   Tier 2  on-device model (WebGPU, in the browser's own cache)   asked twice, in different words; must agree; JSON only
//   Tier 1  company server (strong private model)                  only with the person's consent, only MASKED text, JSON only
//   Tier 3  the fallback from 2 to 1: low agreement, a malformed answer, an error or a timeout on the device
//
// Rules this file enforces (they are the product's, not the model's):
//   - A result is a PROPOSAL. Nothing here writes, sends, closes or spends; the caller shows it and the person taps.
//   - Nothing reaches the server unless state.serverConsent is true. No consent means silence plus a reason, never a quiet upload.
//   - Everything sent is masked first (the shield, then identifiers). If a contact detail or an amount survives the mask, or a masked
//     value is found inside the payload, nothing is sent. The token map never leaves this function.
//   - "Confidence" is not what the model says about itself (that is not calibrated). It is measured: how often two differently worded
//     askings give the identical action, times the model's own token probability on the answer when the runtime reports it.
//   - The server's answer has no confidence number; it is accepted only if it is valid JSON of the schema and every placeholder in it is one
//     we issued. A placeholder we never issued means the model invented something: refused.
const FlowExecRouter = (() => {
  const MIN_CONFIDENCE = 0.85;
  const LOCAL_TIMEOUT_MS = 45000;
  const SERVER_TIMEOUT_MS = 20000;

  const EMAIL_LEAK = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const PHONE_LEAK = /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?(?:[-.\s]?\d{2,4}){1,4}|(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/;
  const MONEY_LEAK = /(?:\$|€|£|₪|₹)\s?\d|\b\d[\d.,]*\s?(?:USD|EUR|GBP|ILS|NIS)\b/i;
  const TOKEN = /\[[A-Z][A-Z_]*_[A-Z0-9]+\]/g;

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + '-timeout')), ms); });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
  }

  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }

  // Agreement between the two askings: identical proposal 1, same action but different fields 0.6, anything else 0.
  function agreement(a, b) {
    if (!a || !b) return 0;
    if (canonical(a) === canonical(b)) return 1;
    return a.action && a.action === b.action ? 0.6 : 0;
  }

  // confidence = agreement x the lowest token probability the runtime reported (absent: 1, and the trace says so).
  function confidence(a, b, probs) {
    const known = (probs || []).filter((p) => typeof p === 'number' && p >= 0 && p <= 1);
    const token = known.length ? Math.min.apply(null, known) : 1;
    return { value: Math.round(agreement(a, b) * token * 1000) / 1000, agreement: agreement(a, b), tokenProb: known.length ? token : null };
  }

  function walkStrings(v, fn) {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map((x) => walkStrings(x, fn));
    if (v && typeof v === 'object') { const out = {}; Object.keys(v).forEach((k) => { out[k] = walkStrings(v[k], fn); }); return out; }
    return v;
  }

  function refuse(reason, extra) { return Object.assign({ ok: false, reason, proposal: false }, extra || {}); }

  async function askLocal(request, schema, d, enforce) {
    const prompts = [enforce.instructions(schema, 'A') + '\n\n' + request.prompt, enforce.instructions(schema, 'B') + '\n\n' + request.prompt];
    const parsed = [];
    const probs = [];
    for (const p of prompts) {
      const out = await withTimeout(d.local.run(p, { schema, maxTokens: 400 }), d.timeouts && d.timeouts.local || LOCAL_TIMEOUT_MS, 'local');
      const r = enforce.parse(out && out.text, schema);
      if (!r.ok) return { accepted: false, why: 'local-' + r.reason };
      parsed.push(r.value);
      if (out && typeof out.tokenProb === 'number') probs.push(out.tokenProb);
    }
    const c = confidence(parsed[0], parsed[1], probs);
    const min = typeof d.minConfidence === 'number' ? d.minConfidence : MIN_CONFIDENCE;
    if (c.value < min) return { accepted: false, why: 'local-low-confidence', confidence: c.value };
    return { accepted: true, value: parsed[0], confidence: c.value, detail: c };
  }

  async function askServer(request, schema, d, enforce, masker) {
    const m = masker.maskAll(request.prompt, d.shield);
    const text = m.maskedText;
    if (EMAIL_LEAK.test(text) || PHONE_LEAK.test(text) || MONEY_LEAK.test(text)) return refuse('pii-blocked');
    const payload = { maskedPrompt: text, instructions: enforce.instructions(schema, 'A'), lang: request.lang || null };
    const wire = JSON.stringify(payload);
    for (const raw of Object.values(m.tokenMap)) if (String(raw).length >= 4 && wire.indexOf(String(raw)) >= 0) return refuse('mask-failed');
    let res;
    try { res = await withTimeout(d.server.call(payload), d.timeouts && d.timeouts.server || SERVER_TIMEOUT_MS, 'server'); }
    catch (e) { return refuse('server-error', { detail: String(e && e.message || e).slice(0, 80) }); }
    const parsed = enforce.parse(res && res.text, schema);
    if (!parsed.ok) return refuse('invalid-output', { detail: parsed.reason, issues: parsed.issues });
    let invented = false;
    const restored = walkStrings(parsed.value, (s) => {
      (s.match(TOKEN) || []).forEach((t) => { if (!Object.prototype.hasOwnProperty.call(m.tokenMap, t)) invented = true; });
      return masker.unmask(s, m.tokenMap);
    });
    if (invented) return refuse('unknown-token');
    const again = enforce.validate(restored, schema);       // restoring real values can lengthen a field past its limit
    if (!again.ok) return refuse('invalid-output', { detail: 'after-restore', issues: again.issues.slice(0, 4) });
    return { ok: true, proposal: true, action: restored, tokenCounts: m.counts };
  }

  // route(request, deps) -> { ok:true, proposal:true, tier, action, confidence, trace } | { ok:false, reason, trace }. Never throws.
  //   request: { prompt, schema?, lang? }   prompt is the instruction plus the (unmasked) content; schema defaults to the Glance action schema.
  //   deps:    { state, local, server, shield, enforce, maskIds, minConfidence?, timeouts?, log? }
  //     state:  { isModelLoaded, serverConsent } or a function returning it
  //     local:  { run(prompt, { schema, maxTokens }) -> Promise<{ text, tokenProb? }> } or null
  //     server: { call({ maskedPrompt, instructions, lang }) -> Promise<{ text }> } or null
  async function route(request, deps) {
    const trace = [];
    try {
      const d = deps || {};
      const enforce = d.enforce, masker = d.maskIds;
      if (!enforce || !masker) return refuse('misconfigured', { trace });
      if (!request || typeof request.prompt !== 'string' || !request.prompt.trim()) return refuse('bad-request', { trace });
      const schema = request.schema || enforce.ACTION_SCHEMA;
      const st = (typeof d.state === 'function' ? await d.state() : d.state) || {};
      let triedLocal = false;

      if (st.isModelLoaded === true && d.local) {
        triedLocal = true;
        try {
          const r = await askLocal(request, schema, d, enforce);
          if (r.accepted) { trace.push('local-accepted'); return { ok: true, proposal: true, tier: 'local', action: r.value, confidence: r.confidence, trace }; }
          trace.push(r.why);
        } catch (e) { trace.push('local-error:' + String(e && e.message || e).slice(0, 60)); }
      } else {
        trace.push(st.isModelLoaded === true ? 'local-unavailable' : 'local-not-loaded');
      }

      if (!d.server) return refuse(triedLocal ? 'low-confidence' : 'no-route', { trace });
      if (st.serverConsent !== true) return refuse(triedLocal ? 'low-confidence-needs-consent' : 'needs-consent', { trace });
      const s = await askServer(request, schema, d, enforce, masker);
      if (!s.ok) { trace.push('server-' + s.reason); return Object.assign(s, { trace }); }
      trace.push(triedLocal ? 'server-fallback' : 'server');
      return { ok: true, proposal: true, tier: triedLocal ? 'server-fallback' : 'server', action: s.action, confidence: null, tokenCounts: s.tokenCounts, trace };
    } catch (e) {
      return refuse('internal', { trace });
    }
  }

  return { MIN_CONFIDENCE, route, confidence, agreement, canonical };
})();

if (typeof module !== 'undefined') module.exports = { FlowExecRouter };
