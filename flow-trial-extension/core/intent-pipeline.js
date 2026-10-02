// The tiered local recognition pipeline — portable, no chrome.*, no DOM, no
// network. This is where "our own code recognises first" becomes one decision.
//
//   Tier 0  structure + lexicon   core/request-types.js   frame + action + object, exact and fast
//   Tier 1  learned local model   core/intent-model.js    generalises to phrasings nobody listed
//   Tier 2  external model        NOT used by default. Never asked first, never
//                                 required for a feature to work, never allowed
//                                 to close or write anything alone.
//
// The two local tiers do not just vote; they check each other:
//   - the lexicon proposes a request, and the model can VETO it when it is
//     nearly certain the sentence is only a statement or a courtesy;
//   - the model proposes a request the lexicon has no frame for, and is accepted
//     only when it is confident AND can name the action (from a known verb or
//     from its own action head). That is the recall the word lists could not reach.
// When neither tier is sure, the answer is `unsure`, and callers stay silent.
const FlowIntentPipeline = (() => {
  const model = typeof FlowIntentModel !== 'undefined' ? FlowIntentModel : (typeof require !== 'undefined' ? require('./intent-model.js').FlowIntentModel : null);
  const types = typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : (typeof require !== 'undefined' ? require('./request-types.js').FlowRequestTypes : null);

  const VETO_MIN = 0.995;      // the lexicon (frame + action) is very precise, so only a near-certain model may overrule it
  const MODEL_MIN = 0.75;      // model confidence needed to propose on its own
  const ACTION_MIN = 0.5;      // how sure the model's action head must be to name the action itself
  const UNSURE_BELOW = 0.6;

  // The request a model-proposed ask stands for: a known verb wins; otherwise
  // the model's own action head, if it is clear about it.
  function topicRequest(m, s) {
    const hits = types.lexHits(s);
    const a = hits.actions[0] || (m.action && m.action !== 'none' && m.actionProb >= ACTION_MIN ? m.action : null);
    if (!a) return null;
    const act = types.ACTIONS.find((x) => x.id === a);
    if (!act) return null;
    const obj = hits.objects[0] || null;
    return { type: a + (obj ? ':' + obj : ''), action: a, object: obj, label: act.noun + (obj ? ' · ' + obj : ''), days: act.days, viaModel: true };
  }

  // One sentence -> { act, confidence, tier, topic, unsure, request, commitment, why }
  function recognize(sentence, ctx) {
    const s = String(sentence == null ? '' : sentence).trim();
    const out = { act: 'INFORM', confidence: 0, tier: 'none', topic: 'other', unsure: true, request: null, commitment: null, why: '' };
    if (!s || !types) return out;
    const lexReq = types.detectRequest(s);
    const lexCom = types.detectCommitmentSentence(s);
    const m = model && model.ready() ? model.predict(s, ctx) : null;
    if (m) out.topic = m.topic;

    // ---- a request ------------------------------------------------------------
    if (lexReq) {
      if (m && (m.act === 'INFORM' || m.act === 'ACK') && m.actProb >= VETO_MIN) {
        out.act = m.act; out.confidence = m.actProb; out.tier = 'model-veto'; out.unsure = false; out.why = 'lexicon saw a request; model says it is ' + m.act.toLowerCase();
        return out;
      }
      out.act = 'ASK'; out.request = lexReq; out.unsure = false; out.tier = m && m.act === 'ASK' ? 'lexicon+model' : 'lexicon';
      out.confidence = m && m.act === 'ASK' ? Math.max(0.85, m.actProb) : 0.8; out.why = 'frame + action';
      return out;
    }
    if (lexCom && !(m && (m.act === 'INFORM' || m.act === 'ACK') && m.actProb >= VETO_MIN)) {
      out.act = 'PROMISE'; out.commitment = lexCom; out.unsure = false; out.tier = m && m.act === 'PROMISE' ? 'lexicon+model' : 'lexicon';
      out.confidence = m && m.act === 'PROMISE' ? Math.max(0.85, m.actProb) : 0.8; out.why = 'first-person commitment + action';
      return out;
    }
    if (!m) return out;

    // ---- the model alone: the sentence is phrased in a way no frame lists ----------
    const hedged = types.lexHits(s).hedged;
    if (m.act === 'ASK' && m.actProb >= MODEL_MIN && !hedged) {
      const req = topicRequest(m, s);
      if (req) {
        out.act = 'ASK'; out.request = req; out.unsure = false; out.tier = 'model'; out.confidence = m.actProb; out.why = 'model: ask, action ' + req.action;
        return out;
      }
    }
    if (m.act === 'PROMISE' && m.actProb >= MODEL_MIN && !hedged) {
      const hits = types.lexHits(s);
      const a = hits.actions[0] || (m.action && m.action !== 'none' && m.actionProb >= ACTION_MIN ? m.action : null);
      if (a) {
        out.act = 'PROMISE'; out.commitment = { type: 'owe:' + a + (hits.objects[0] ? ':' + hits.objects[0] : ''), action: a, object: hits.objects[0] || null, viaModel: true };
        out.unsure = false; out.tier = 'model'; out.confidence = m.actProb; out.why = 'model: promise';
        return out;
      }
    }
    out.act = m.act; out.confidence = m.actProb; out.tier = 'model';
    out.unsure = m.actProb < UNSURE_BELOW || m.act === 'ASK' || m.act === 'PROMISE'; // an ASK/PROMISE we did not accept is not acted on
    out.why = 'model: ' + m.act.toLowerCase();
    return out;
  }

  // A whole message: the sentences that ask or promise, in order.
  function sentences(text) {
    return String(text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  }
  function analyze(text, ctx) {
    return sentences(text).map((s) => Object.assign({ sentence: s }, recognize(s, ctx)));
  }

  return { recognize, analyze, sentences, VETO_MIN, MODEL_MIN };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntentPipeline };
