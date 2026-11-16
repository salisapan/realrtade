'use strict';
// Every intention the model found, not only one (docs/glance-ai/ai-product.md §3; owner 2026-11-12: break every task into its parts and offer
// the right steps for each intention). core/understanding.js proposal() answers one step per mail: two intentions with two different steps
// (send the contract, and meet on Thursday) are silenced as 'two-intentions', and of several with the same step only the most confident is
// kept. This module reads each intention on its own, through the same proposal() (or core/kind-check.js proposal() when that switch is on),
// so each one gets its own step, date and quote. Router v2 then runs the floor (the strict gate and the veto) on each one separately, and
// the AI engine plans and carries each one. The device engine's own multi-intention reader is core/intent-decompose.js (aiDecomposeV1).
//
// Rules: at most MAX intentions; an intention that reads as silence on its own is dropped; two that land on the same step, day and quote are
// one; the most confident comes first. When there is more than one, each must carry its own time (a day the device read, or a deadline cue
// in its own quote): the floor checks the cue on the whole mail, so an undated second ask would otherwise borrow the first one's deadline. A mail-level "answered", "released" or "not relevant" still silences every intention.
// Nothing here closes, writes or sends. Off switch: SWITCH ('aiMultiV1'), default off: Router v2 keeps its single proposal.
// Portable: no chrome.*, no DOM, no network.
const FlowModelMulti = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const floorMod = () => sibling(typeof FlowAiFloor !== 'undefined' ? FlowAiFloor : null, './ai-floor.js', 'FlowAiFloor');
  const SWITCH = 'aiMultiV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const MAX = 3;

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  // proposals(propose, understanding, ctx) -> [proposal, ...] (possibly empty). propose(understanding, ctx) is the one-step reader.
  function proposals(propose, u, ctx) {
    if (typeof propose !== 'function' || !u || !Array.isArray(u.intentions)) return [];
    const whole = propose(Object.assign({}, u, { intentions: [] }), ctx); // the mail-level quiets (not relevant, answered, released)
    if (whole && /^(?:not-relevant|state-)/.test(String(whole.reason || ''))) return [];
    const seen = new Set();
    const out = [];
    for (const it of u.intentions) {
      const p = propose(Object.assign({}, u, { intentions: [it] }), ctx);
      if (!p || !p.step || p.step === 'SILENT') continue;
      const key = p.step + '|' + (p.due || '') + '|' + String(p.askSpan || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    let list = out;
    if (list.length > 1) {
      const F = floorMod();
      list = list.filter((p) => p.due || p.step === 'file_save' || (F && typeof F.hasDeadline === 'function' && F.hasDeadline(String(p.askSpan || ''))));
    }
    return list.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, MAX);
  }

  return { SWITCH, DEFAULTS, MAX, enabled, proposals };
})();

if (typeof module !== 'undefined') module.exports = { FlowModelMulti };
