// The learning hook every connector emits (docs/glance-ai/learning-from-use.md, docs/glance-ai/connectors-queue.md).
// One outcome event per decision, with NO text, address or title, and what Glance may conclude from those events.
// Portable: no chrome.*, no DOM, no network. Storage is the caller's: this file only builds, sanitises and reads events.
//
// Event: { connector, closeType, stage, latencyMs, destinationSystem, lang, at }
//   stage: offered | approved | edited | ignored | undone | handled | readback_failed
//   Every field is an enum or a bounded token. A free-text field cannot exist: buildEvent() keeps only these keys, and a
//   value that is not a short token is dropped, so a title, an address or a sentence can never ride along.
// Conclusions are pure functions that move how readily Glance OFFERS a destination. They never touch the intent floor, the
// hard quiets, the veto, or the rule that Handled needs fetchedBack.
const FlowConnectorOutcome = (() => {
  const STAGES = ['offered', 'approved', 'edited', 'ignored', 'undone', 'handled', 'readback_failed'];
  const LANGS = ['he', 'en', 'other'];
  const TOKEN = /^[a-z0-9][a-z0-9_./-]{0,39}$/;
  const CAP = 400;

  function token(v) { const s = typeof v === 'string' ? v.trim().toLowerCase() : ''; return TOKEN.test(s) ? s : ''; }

  // Returns the event, or null when it cannot be a clean event. `enabled:false` (the connector's switch is off) emits nothing.
  function buildEvent(input, opts) {
    if (opts && opts.enabled === false) return null;
    const i = input || {};
    const connector = token(i.connector);
    const closeType = token(i.closeType);
    const stage = STAGES.indexOf(i.stage) >= 0 ? i.stage : '';
    if (!connector || !closeType || !stage) return null;
    const at = Number.isFinite(i.at) ? Math.floor(i.at) : null;
    if (at === null) return null;
    const lat = Number.isFinite(i.latencyMs) ? Math.max(0, Math.min(Math.floor(i.latencyMs), 86400000)) : 0;
    return {
      connector: connector,
      closeType: closeType,
      stage: stage,
      latencyMs: lat,
      destinationSystem: token(i.destinationSystem) || connector,
      lang: LANGS.indexOf(i.lang) >= 0 ? i.lang : 'other',
      at: at
    };
  }

  // Newest last, capped. Returns a new list.
  function append(list, event) {
    const out = Array.isArray(list) ? list.slice() : [];
    if (event) out.push(event);
    return out.length > CAP ? out.slice(out.length - CAP) : out;
  }

  function stat(events, connector, closeType) {
    const s = { offered: 0, approved: 0, edited: 0, ignored: 0, undone: 0, handled: 0, readback_failed: 0 };
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (!e || e.connector !== connector) return;
      if (closeType && e.closeType !== closeType) return;
      if (s[e.stage] !== undefined) s[e.stage]++;
    });
    return s;
  }

  // Which destination to offer first for a close type. A proven, kept close counts for; an undo counts against. With too
  // little history (< MIN decisions across the candidates) the caller's order is returned unchanged.
  const MIN_DECISIONS = 3;
  function destinationOrder(events, closeType, candidates) {
    const list = (Array.isArray(candidates) ? candidates : []).slice();
    let total = 0;
    const score = {};
    list.forEach((c) => {
      const s = stat(events, c, closeType);
      total += s.approved + s.edited + s.undone;
      score[c] = (s.handled + 0.5 * s.edited - 2 * s.undone) / (s.approved + s.edited + s.undone + 2);
    });
    if (total < MIN_DECISIONS) return list;
    return list.map((c, i) => ({ c: c, i: i })).sort((a, b) => (score[b.c] - score[a.c]) || (a.i - b.i)).map((x) => x.c);
  }

  // normal -> reduced -> withhold, by how often this person undoes this close type for this connector. Withhold needs
  // enough evidence; one hasty undo never silences a connector.
  function offerLevel(events, connector, closeType) {
    const s = stat(events, connector, closeType);
    const decided = s.approved + s.edited + s.undone;
    if (decided < 4) return 'normal';
    const rate = s.undone / decided;
    if (rate >= 0.6 && decided >= 5) return 'withhold';
    if (rate >= 0.34) return 'reduced';
    return 'normal';
  }

  // A read-back that failed on the last N tries for this vendor means: say "Couldn't confirm", never Handled, and be slower to offer.
  function vendorFailure(events, connector, lastN) {
    const n = lastN || 3;
    const rows = (Array.isArray(events) ? events : []).filter((e) => e && e.connector === connector && (e.stage === 'handled' || e.stage === 'readback_failed'));
    const tail = rows.slice(-n);
    const failed = tail.filter((e) => e.stage === 'readback_failed').length;
    const last = tail.length ? tail[tail.length - 1] : null;
    return { caution: tail.length >= 2 && failed >= 2 && !!last && last.stage === 'readback_failed', recentFailures: failed };
  }

  function medianLatencyMs(events, connector) {
    const v = (Array.isArray(events) ? events : []).filter((e) => e && e.connector === connector && e.stage === 'handled' && e.latencyMs > 0).map((e) => e.latencyMs).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  }

  return { STAGES: STAGES, CAP: CAP, buildEvent: buildEvent, append: append, destinationOrder: destinationOrder, offerLevel: offerLevel, vendorFailure: vendorFailure, medianLatencyMs: medianLatencyMs };
})();

if (typeof module !== 'undefined') module.exports = { FlowConnectorOutcome };
else if (typeof globalThis !== 'undefined') globalThis.FlowConnectorOutcome = FlowConnectorOutcome;
