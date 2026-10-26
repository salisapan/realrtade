'use strict';
// The AI engine, one call (docs/glance-ai/ai-product.md §3): the single entry a host (the extension today, Flow later) calls for one mail.
//
//   Tier 0   the device engine's own decision, computed by the host (core/intent.js + core/incoming-judge.js) and passed in as mail.tier0.
//   Router   core/understanding-router.js: hard quiets, per-user relevance (silence only), the device model, Glance cloud (masked, with
//            consent), and the strict gate and veto on every model answer.
//   Plan     core/model-plan.js: a model card becomes the product's own process, drawn by the steps list, with doneWhen.
//   Carry    core/model-plan.js toWatch(): an ask or a promise the model found enters the follow loop until it really closes.
// The engine's own card (tier 0) is returned as the engine built it; this file never replans or changes it.
// Nothing here closes, writes or sends: the host shows the card, and every step runs on the person's click.
//
// Switches: everything rides on the router's aiPrimary (off). With it off read() returns { used:false } and calls nothing, so the host
// keeps today's path byte for byte. aiPlanV1 (off) adds the plan and the watch; aiRelevanceV1 (off) and aiDeviceTier1 (off) are read by
// the router and the device adapter. Portable: no chrome.*, no DOM, no network; every capability is injected.
const FlowAiEngine = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const router = () => sibling(typeof FlowUnderstandingRouter !== 'undefined' ? FlowUnderstandingRouter : null, './understanding-router.js', 'FlowUnderstandingRouter');
  const planner = () => sibling(typeof FlowModelPlan !== 'undefined' ? FlowModelPlan : null, './model-plan.js', 'FlowModelPlan');

  // read(mail, deps, flags) -> { used:false } | { used:true, tier, reason, card:null|{ source, step, proposal?, plan?, rows? }, watch, trace, calls }
  // mail: { text, subject, today, direction, attachmentCount, surface, lang, cloudConsent, tier0:{quiet,step,possible},
  //         threadId, messageId, counterpart, channel, now }
  async function read(mail, deps, flags) {
    const R = router();
    if (!R || !R.enabled(flags)) return { used: false };
    mail = mail || {};
    const r = await R.route({ text: mail.text, today: mail.today, attachmentCount: mail.attachmentCount || 0, direction: mail.direction,
      cloudConsent: mail.cloudConsent === true, tier0: mail.tier0 || {} }, deps || {}, flags);
    const base = { used: true, tier: r.tier, reason: r.reason || null, trace: r.trace, calls: r.calls, watch: null };
    if (!r.step || r.step === 'SILENT') return Object.assign(base, { card: null });
    if (r.tier === 0) return Object.assign(base, { card: { source: 'engine', step: r.step } });
    const card = { source: 'model', step: r.step, proposal: r.proposal, plan: null, rows: [] };
    const P = planner();
    if (P && P.enabled(flags)) {
      const x = P.plan(flags, r.proposal, { text: mail.text, today: mail.today, lang: mail.lang, surface: mail.surface === 'outlook' ? 'outlook' : 'gmail' });
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
