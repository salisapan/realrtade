'use strict';
// The AI engine, one call (docs/glance-ai/ai-product.md §3): the single entry a host (the extension today, Flow later) calls for one mail.
//
//   Tier 0   the device engine's own decision, computed by the host (core/intent.js + core/incoming-judge.js) and passed in as mail.tier0.
//   Router   core/understanding-router.js: hard quiets, per-user relevance (silence only), the device model, Glance cloud (masked, with
//            consent), and the strict gate and veto on every model answer.
//   Plan     core/model-plan.js: a model card becomes the product's own process, drawn by the steps list, with doneWhen.
//   Carry    core/model-plan.js toWatch(): an ask or a promise the model found enters the follow loop until it really closes.
//   Floor    core/ai-floor.js: the strict gate and veto on every model answer, used when the host injects none.
// The engine's own card (tier 0) is returned as the engine built it; this file never replans or changes it.
// Nothing here closes, writes or sends: the host shows the card, and every step runs on the person's click.
//
// Switches: everything rides on the router's aiPrimary (off). aiKindCheckV1 (off) adds core/kind-check.js on each model answer.
// aiTier0GuardV1 (off) runs core/tier0-guard.js on the mail first: an injection or fraud-shaped money gets no card at all.
// aiCloudWorthV1 (off) runs core/cloud-worth.js first: a mail with no sign of something to do is not read by any model.
// aiTier0QuietV1 (off) runs core/tier0-quiet.js on the engine's own card: a hedge, an undecided sender or a met deadline stays quiet. With it off read() returns { used:false } and calls nothing, so the host
// keeps today's path byte for byte. aiPlanV1 (off) adds the plan and the watch; aiRelevanceV1 (off) and aiDeviceTier1 (off) are read by
// the router and the device adapter. Portable: no chrome.*, no DOM, no network; every capability is injected.
const FlowAiEngine = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const router = () => sibling(typeof FlowUnderstandingRouter !== 'undefined' ? FlowUnderstandingRouter : null, './understanding-router.js', 'FlowUnderstandingRouter');
  const planner = () => sibling(typeof FlowModelPlan !== 'undefined' ? FlowModelPlan : null, './model-plan.js', 'FlowModelPlan');
  const guard = () => sibling(typeof FlowTier0Guard !== 'undefined' ? FlowTier0Guard : null, './tier0-guard.js', 'FlowTier0Guard');
  const worthy = () => sibling(typeof FlowCloudWorth !== 'undefined' ? FlowCloudWorth : null, './cloud-worth.js', 'FlowCloudWorth');
  const quiet = () => sibling(typeof FlowTier0Quiet !== 'undefined' ? FlowTier0Quiet : null, './tier0-quiet.js', 'FlowTier0Quiet');
  const kinds = () => sibling(typeof FlowKindCheck !== 'undefined' ? FlowKindCheck : null, './kind-check.js', 'FlowKindCheck');
  const floor = () => sibling(typeof FlowAiFloor !== 'undefined' ? FlowAiFloor : null, './ai-floor.js', 'FlowAiFloor');

  // The surfaces a plan knows (core/model-plan.js); anything else is planned as Gmail.
  const SURFACES = { gmail: true, outlook: true, whatsapp: true, messenger: true, instagram: true, teams: true };

  // A host that injects no gate or veto gets the production floor (core/ai-floor.js) bound to this mail. A host gate or veto wins.
  // With no floor available either, Router v2 counts the missing gate as silence.
  function withFloor(deps, mail) {
    if (typeof deps.gate === 'function' && typeof deps.veto === 'function') return deps;
    const F = floor();
    if (!F) return deps;
    const f = F.floorFor({ text: mail.text, body: mail.body, subject: mail.subject, surface: mail.surface, direction: mail.direction,
      attachmentCount: mail.attachmentCount || 0, today: mail.today });
    return Object.assign({}, deps, { gate: typeof deps.gate === 'function' ? deps.gate : f.gate, veto: typeof deps.veto === 'function' ? deps.veto : f.veto });
  }

  // aiKindCheckV1 (off): each model answer passes core/kind-check.js before the router validates it (who owes what, from the model's own quotes).
  function withKindCheck(deps, flags) {
    const K = kinds();
    if (!K || !K.enabled(flags)) return deps;
    return Object.assign({}, deps, { tier1: K.wrap(flags, deps.tier1), tier2: K.wrap(flags, deps.tier2) });
  }

  // read(mail, deps, flags) -> { used:false } | { used:true, tier, reason, card:null|{ source, step, proposal?, plan?, rows? }, watch, trace, calls }
  // mail: { text, subject, today, direction, attachmentCount, surface, lang, cloudConsent, tier0:{quiet,step,possible},
  //         threadId, messageId, counterpart, channel, now }
  async function read(mail, deps, flags) {
    const R = router();
    if (!R || !R.enabled(flags)) return { used: false };
    mail = mail || {};
    const G = guard();
    if (G && G.enabled(flags)) {
      // aiTier0GuardV1 (off): an injection or fraud-shaped money silences every card, the engine's own included, before any model call.
      const why = G.check({ text: mail.text, body: mail.body, subject: mail.subject });
      if (why) return { used: true, tier: 0, reason: why, card: null, watch: null, trace: ['guard:' + why.replace(/^guard:/, '')], calls: { tier1: 0, tier2: 0 } };
    }
    deps = withKindCheck(withFloor(deps || {}, mail), flags);
    // aiCloudWorthV1 (off): the engine is silent and the mail carries no sign of something to do -> no model is asked at all.
    const W = worthy();
    const t0 = mail.tier0 || {};
    if (W && W.enabled(flags) && t0.possible && (!t0.step || t0.step === 'SILENT') && !W.worth({ text: mail.text, subject: mail.subject, attachmentCount: mail.attachmentCount })) {
      return { used: true, tier: 0, reason: 'no-signal', card: null, watch: null, trace: ['tier0:no-signal'], calls: { tier1: 0, tier2: 0 } };
    }
    const r = await R.route({ text: mail.text, today: mail.today, attachmentCount: mail.attachmentCount || 0, direction: mail.direction,
      cloudConsent: mail.cloudConsent === true, tier0: mail.tier0 || {} }, deps, flags);
    const base = { used: true, tier: r.tier, reason: r.reason || null, trace: r.trace, calls: r.calls, watch: null };
    if (!r.step || r.step === 'SILENT') return Object.assign(base, { card: null });
    if (r.tier === 0) {
      // aiTier0QuietV1 (off): the engine's own card stays quiet on a hedge, an undecided sender, or a deadline already met.
      const Q = quiet();
      const why = Q && Q.enabled(flags) ? Q.check({ text: mail.text, subject: mail.subject }, r.step) : null;
      if (why) return Object.assign(base, { card: null, reason: why });
      return Object.assign(base, { card: { source: 'engine', step: r.step } });
    }
    const card = { source: 'model', step: r.step, proposal: r.proposal, plan: null, rows: [] };
    const P = planner();
    if (P && P.enabled(flags)) {
      const x = P.plan(flags, r.proposal, { text: mail.text, today: mail.today, lang: mail.lang, surface: SURFACES[mail.surface] ? mail.surface : 'gmail' });
      if (x.plan) {
        card.plan = x.plan; card.rows = x.rows;
        base.watch = P.toWatch(x.plan, r.proposal, { threadId: mail.threadId, messageId: mail.messageId, subject: mail.subject, counterpart: mail.counterpart, channel: mail.channel || mail.surface },
          typeof mail.now === 'number' ? mail.now : Date.now());
      } else if (x.reason === 'file-save-is-suggest-save') {
        card.suggestSave = true; // the host hands it to core/suggest-save.js, which decides on the real attachment list
      } else {
        // A model card the product cannot plan is not shown: silence beats a card with no way to close it.
        return Object.assign(base, { card: null, reason: 'plan:' + x.reason });
      }
    }
    return Object.assign(base, { card });
  }

  return { read };
})();

if (typeof module !== 'undefined') module.exports = { FlowAiEngine };
