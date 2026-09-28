// Turns the durable local counters storage.js's classificationStats already
// keeps into the one signal the "thousands of patterns first, AI only as a
// last resort" design (core/intent.js + core/judgment.js, with
// content-gmail.js's ensureRemoteClassification as the single remote
// fallback attempt) actually needed and never had: real-usage evidence of
// how often the free local pass is enough, how often the one remote
// fallback attempt rescues what it missed, and how often nothing ever
// fires at all. Every prior improvement to the local corpus (widening
// REQUEST's evidence gate, then COMMITMENT_OF_READER's, then letting
// SCHEDULED_EVENT fire without a stated time) was verified against
// hand-written example sentences — necessary, but not the same thing as
// knowing what real inboxes actually do. This is that missing half.
//
// Pure, no chrome.*, for the same reason every other core/ module is: this
// is exactly the kind of logic a future Flow runtime would need unchanged,
// regardless of what UI or storage backs it (see core/README.md's own
// decision framework for what belongs in this directory).
const FlowClassificationMetrics = (() => {
  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  // `stats` is storage.js's classificationStats shape —
  // { localFired, localMissed, aiFired, aiMissed, recent }. localMissed is
  // always exactly aiFired + aiMissed by construction (every local miss
  // reaches the one remote fallback attempt exactly once — see
  // content-gmail.js's own recordClassificationOutcome call site), kept as
  // separate durable counters rather than derived so nothing here has to
  // re-derive that relationship to read a rate, and so the three counters
  // stay independently inspectable from a background-page console.
  //
  // Every rate returns null, not 0, on zero samples — a 0% rate on no data
  // would be a fabricated fact, the same rule core/pmf-metrics.js's
  // computeClosureRate already follows for exactly the same reason.
  function computeSnapshot(stats) {
    stats = stats || {};
    const localFired = stats.localFired || 0;
    const localMissed = stats.localMissed || 0;
    const aiFired = stats.aiFired || 0;
    const aiMissed = stats.aiMissed || 0;
    const totalScanned = localFired + localMissed;
    return {
      totalScanned,
      localFired,
      localMissed,
      aiFired,
      aiMissed,
      // What share of every message Glance ever classified, the free local
      // pass alone was enough for — the number that answers whether the
      // local-first design is actually earning its keep in real use, not
      // just against hand-written test sentences.
      localCoverageRate: totalScanned ? clamp01(localFired / totalScanned) : null,
      // Of the messages the local pass gave up on, what share the one
      // remote fallback attempt actually rescued.
      aiCatchRate: localMissed ? clamp01(aiFired / localMissed) : null,
      // Of everything Glance ever looked at, what share ended up fully
      // unresolved — neither pass found anything. The true, ground-level
      // recall floor this account is actually experiencing, as opposed to
      // whatever the last hand-written regression corpus happened to cover.
      totalMissRate: totalScanned ? clamp01(aiMissed / totalScanned) : null
    };
  }

  return { computeSnapshot };
})();

if (typeof module !== 'undefined') module.exports = { FlowClassificationMetrics };
