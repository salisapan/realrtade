'use strict';
// Router v2 (docs/glance-ai/ai-product.md §3, milestone M2): who reads a mail, in order, and what stands between a model and the screen.
//
//   Tier 0  the device rules, always first, $0: a hard quiet ends it; a clear engine decision ends it; no possible intention ends it.
//   Tier 1  the device model, when the host has one: its Understanding is validated (core/understanding.js) and proposed.
//   Tier 2  Glance cloud model, only with consent, only MASKED text: the same validation, the placeholders restored on the device.
//   Floor   every model proposal passes the host's strict gate and veto (injected). A model answer is a proposal: nothing here closes,
//           writes, sends or spends; the card is shown only after the floor, and acting on it is the person's click.
//
// Off switch: SWITCH ('aiPrimary', the spec's AI_PRIMARY), default off. While it is off route() returns { used:false } without calling
// anything, and the host keeps today's path byte for byte. Nothing in the extension calls this file yet. Portable: no chrome.*, no DOM,
// no network of its own; the model calls, the mask, the gate and the veto are all injected.
const FlowUnderstandingRouter = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const U = sibling(typeof FlowUnderstanding !== 'undefined' ? FlowUnderstanding : null, './understanding.js', 'FlowUnderstanding');
  const ER = sibling(typeof FlowExecRouter !== 'undefined' ? FlowExecRouter : null, './exec-router.js', 'FlowExecRouter');

  const SWITCH = 'aiPrimary';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const TIMEOUT_MS = 20000;

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  function withTimeout(value, ms) {
    let timer;
    const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
    return Promise.race([Promise.resolve(value), t]).finally(() => clearTimeout(timer));
  }

  // Ask one tier; any throw, timeout or malformed answer is an unusable answer, never a crash.
  async function ask(fn, text, ms) {
    try { return { ok: true, answer: await withTimeout(fn(text), ms) }; } catch (e) { return { ok: false, reason: /timeout/.test(String(e && e.message)) ? 'timeout' : 'error' }; }
  }

  // A tier's answer is worth more tiers only when it said nothing usable: invalid, or no grounded intention and no view on relevance.
  function usable(v) {
    if (!v || !v.ok) return false;
    const u = v.understanding;
    return u.intentions.length > 0 || u.relevant === 'no' || u.state === 'answered' || u.state === 'released';
  }

  // The floor: the host's strict gate and veto on every model proposal. Missing gate or veto is silence, not a pass.
  function floor(p, input, deps) {
    if (typeof deps.gate !== 'function' || typeof deps.veto !== 'function') return { pass: false, reason: 'floor:missing' };
    let g, v;
    try { g = deps.gate(p, input) || { pass: false, reason: 'gate:no-answer' }; } catch (e) { return { pass: false, reason: 'gate:error' }; }
    if (!g.pass) return { pass: false, reason: g.reason || 'gate' };
    try { v = deps.veto(p, input); } catch (e) { return { pass: false, reason: 'veto:error' }; }
    if (v) return { pass: false, reason: 'veto:' + v };
    return { pass: true, step: g.step || p.step };
  }

  // route(input, deps, flags) -> Promise<{ used:false } | { used:true, step, tier, proposal?, reason?, calls:{tier1,tier2}, trace }>
  // input: { text, today, attachmentCount, direction, cloudConsent, tier0: { quiet, step, possible } }
  //   tier0.quiet: a hard-quiet reason or null. tier0.step: the engine's own decision ('SILENT' or a step, after its own vetoes).
  //   tier0.possible: whether the text has a possible intention the engine did not settle.
  // deps: { tier1(text), tier2(maskedText), mask(text) -> { ok, text, unmask(span) }, gate(proposal, input), veto(proposal, input), timeoutMs }
  async function route(input, deps, flags) {
    if (!enabled(flags)) return { used: false };
    input = input || {}; deps = deps || {};
    const t0 = input.tier0 || {};
    const trace = [];
    const calls = { tier1: false, tier2: false };
    const out = (step, tier, extra) => Object.assign({ used: true, step, tier, calls, trace }, extra || {});
    const ms = typeof deps.timeoutMs === 'number' ? deps.timeoutMs : TIMEOUT_MS;
    const vopts = { today: input.today };
    const pctx = { attachmentCount: input.attachmentCount || 0 };

    // Tier 0: the device rules keep the last word on quiets, and the clear half never reaches a model.
    if (input.direction && input.direction !== 'inbound') { trace.push('tier0:not-inbound'); return out(t0.step || 'SILENT', 0, { reason: 'not-inbound' }); }
    if (t0.quiet) { trace.push('tier0:quiet'); return out('SILENT', 0, { reason: 'quiet:' + t0.quiet }); }
    if (t0.step && t0.step !== 'SILENT') { trace.push('tier0:engine'); return out(t0.step, 0, { reason: 'engine' }); }
    if (!t0.possible) { trace.push('tier0:nothing'); return out('SILENT', 0, { reason: 'no-possible-intention' }); }
    if (!U) return out('SILENT', 0, { reason: 'no-validator' });

    const decide = (v, tier) => {
      if (!v.ok) return out('SILENT', tier, { reason: 'invalid:' + v.reason, drops: v.drops });
      const p = U.proposal(v.understanding, pctx);
      if (p.step === 'SILENT') return out('SILENT', tier, { reason: 'model:' + p.reason, understanding: v.understanding, drops: v.drops });
      const f = floor(p, input, deps);
      if (!f.pass) return out('SILENT', tier, { reason: f.reason, proposal: p, understanding: v.understanding, drops: v.drops });
      return out(f.step, tier, { proposal: Object.assign({}, p, { step: f.step }), understanding: v.understanding, drops: v.drops });
    };

    // Tier 1: the device model, when there is one.
    if (typeof deps.tier1 === 'function') {
      calls.tier1 = true;
      const a = await ask(deps.tier1, String(input.text || ''), ms);
      const v = a.ok ? U.validate(a.answer, input.text, vopts) : { ok: false, reason: a.reason, drops: [] };
      trace.push('tier1:' + (a.ok ? (v.ok ? 'answered' : 'invalid') : a.reason));
      if (usable(v)) return decide(v, 1);
    }

    // Tier 2: Glance cloud, only with consent, only masked, and only if nothing sensitive survived the mask.
    if (typeof deps.tier2 !== 'function') { trace.push('tier2:absent'); return out('SILENT', calls.tier1 ? 1 : 0, { reason: 'no-model' }); }
    if (input.cloudConsent !== true) { trace.push('tier2:no-consent'); return out('SILENT', calls.tier1 ? 1 : 0, { reason: 'no-consent' }); }
    if (typeof deps.mask !== 'function') { trace.push('tier2:no-mask'); return out('SILENT', 2, { reason: 'mask-unavailable' }); }
    let m;
    try { m = deps.mask(String(input.text || '')); } catch (e) { m = null; }
    if (!m || !m.ok || typeof m.text !== 'string' || !m.text.trim()) { trace.push('tier2:mask-failed'); return out('SILENT', 2, { reason: 'mask-failed' }); }
    if (ER && typeof ER.leaks === 'function' && ER.leaks(m.text)) { trace.push('tier2:pii-blocked'); return out('SILENT', 2, { reason: 'pii-blocked' }); }
    calls.tier2 = true;
    const a = await ask(deps.tier2, m.text, ms);
    const v = a.ok ? U.validate(a.answer, m.text, Object.assign({ unmask: typeof m.unmask === 'function' ? m.unmask : undefined }, vopts)) : { ok: false, reason: a.reason, drops: [] };
    trace.push('tier2:' + (a.ok ? (v.ok ? 'answered' : 'invalid') : a.reason));
    return decide(v, 2);
  }

  return { SWITCH, DEFAULTS, TIMEOUT_MS, enabled, route };
})();

if (typeof module !== 'undefined') module.exports = { FlowUnderstandingRouter };
