// The two-stage judgment pipeline described in the spec (cheap filter, then
// an expensive call on the few candidates that pass) — collapsed here into
// one stub function because Phase 1 has no model wired up yet.
//
// FlowJudgment.evaluate(text, domainId) is the ONLY function the content
// script calls. Its contract will not change when the real model is wired
// in: given the visible text of one email and the user's chosen domain, it
// returns either `null` (no action — the common case) or
// `{ label, confidence }` where `label` is ready-to-render Hebrew text for
// the Do It chip.
//
// Swapping the stub for the real thing later means rewriting the inside of
// this function only — background.js will call an API endpoint instead of
// running the regex table, but the shape returned stays identical, so
// nothing in content-gmail.js has to change.

const FlowJudgment = (() => {
  function evaluate(text, domainId) {
    const domain = FLOW_DOMAINS.find((d) => d.id === domainId) || FLOW_DOMAINS[0];
    for (const trigger of domain.demoTriggers) {
      const m = text.match(trigger.pattern);
      if (m) {
        return {
          label: trigger.buildAction(m),
          confidence: 'demo', // real pipeline will return a 0–1 score
          domain: domain.id
        };
      }
    }
    return null;
  }

  return { evaluate };
})();
