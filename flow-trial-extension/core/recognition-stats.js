// How much of the recognising was done by our own code — portable, no chrome.*,
// no DOM, no network. Counts only, never text.
//
// docs/local-first-principle.md says an external model is a last resort. A rule
// like that needs a number, or it decays into a slogan. Every decision Glance
// takes about a message is filed in one of four buckets:
//
//   localHit      our own code found a loop to open or a reply to act on
//   localSilence  our own code was confident nothing needed doing
//   residual      it looked like it might matter and local code could not say:
//                 the long tail, the ONLY class an external model could ever see
//   remote        decided by an external model (0 while REMOTE_CLASSIFY is off)
//
// localShare = (localHit + localSilence) / total. residualShare is what a
// fallback would have to cover; today that share simply stays silent.
const FlowRecognitionStats = (() => {
  const KINDS = ['localHit', 'localSilence', 'residual', 'remote'];

  function empty() {
    return { localHit: 0, localSilence: 0, residual: 0, remote: 0, byTier: {}, since: null };
  }

  // analysis: FlowIntentPipeline.analyze(text) -> sentence verdicts.
  // opened: did a loop get opened from this message (by any local rule)?
  // Returns { kind, tier }.
  function decide(analysis, opened) {
    const list = Array.isArray(analysis) ? analysis : [];
    if (opened) {
      const hit = list.find((a) => (a.act === 'ASK' || a.act === 'PROMISE') && !a.unsure);
      return { kind: 'localHit', tier: hit ? hit.tier : 'lexicon' };
    }
    const maybe = list.find((a) => a.unsure && (a.act === 'ASK' || a.act === 'PROMISE'));
    if (maybe) return { kind: 'residual', tier: maybe.tier || 'model' };
    return { kind: 'localSilence', tier: 'none' };
  }

  // A reply's meaning: a named rule fired (hit) or nothing did and the old
  // assumption was applied (residual).
  function decideReply(reply) {
    if (!reply) return null;
    return reply.basis === 'default' ? { kind: 'residual', tier: 'reply-default' } : { kind: 'localHit', tier: 'reply-rule' };
  }

  function add(stats, d) {
    const s = stats && typeof stats === 'object' ? stats : empty();
    if (!d || KINDS.indexOf(d.kind) < 0) return s;
    s[d.kind] = (s[d.kind] || 0) + 1;
    s.byTier = s.byTier || {};
    if (d.tier) s.byTier[d.tier] = (s.byTier[d.tier] || 0) + 1;
    if (!s.since) s.since = Date.now();
    return s;
  }

  function rates(stats) {
    const s = stats || empty();
    const total = KINDS.reduce((n, k) => n + (s[k] || 0), 0);
    const share = (n) => (total ? Math.round((n / total) * 1000) / 1000 : 0);
    return {
      total,
      localShare: share((s.localHit || 0) + (s.localSilence || 0)),
      hitShare: share(s.localHit || 0),
      residualShare: share(s.residual || 0),
      remoteShare: share(s.remote || 0)
    };
  }

  return { KINDS, empty, decide, decideReply, add, rates };
})();

if (typeof module !== 'undefined') module.exports = { FlowRecognitionStats };
