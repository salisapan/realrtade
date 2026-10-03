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
  const QUESTION_MIN = 0.9;    // a question with no nameable action is an ask for a reply only when the model is this sure

  // The request a model-proposed ask stands for: a known verb wins; otherwise
  // the model's own action head, if it is clear about it.
  function topicRequest(m, s) {
    const hits = types.lexHits(s);
    let a = hits.actions[0] || (m.action && m.action !== 'none' && m.actionProb >= ACTION_MIN ? m.action : null);
    // A question the model is very sure is an ask, with no particular action in it ("Has the container
    // cleared customs yet?", "What is the status of my ticket?"), is a request for an answer.
    if (!a && m.act === 'ASK' && m.actProb >= QUESTION_MIN && /[?؟]/.test(s)) a = 'reply';
    if (!a) return null;
    const act = types.ACTIONS.find((x) => x.id === a);
    if (!act) return null;
    const obj = hits.objects[0] || null;
    return { type: a + (obj ? ':' + obj : ''), action: a, object: obj, label: act.noun + (obj ? ' · ' + obj : ''), days: act.days, viaModel: true };
  }

  // ---- structure must permit what the model proposes ---------------------------------
  // The model alone may propose an ask or a promise only when the sentence is SHAPED like one.
  // A timetable ("The bus leaves at 7:40") or a report of someone else's future ("the deposit will
  // be returned in thirty days") is not addressed to anyone and promises nothing in the first
  // person, however confident a statistical model is. Deterministic, language-aware, cheap.
  const ASK_SHAPE_EN = /\?|\b(?:you|your|yours|u|ya|pls|please|kindly|need|needs|needed|waiting|awaiting|let me know|tell me)\b|\b(?:could|would|can|shall|will)\s+(?:we|someone|anyone|somebody|anybody|they)\b/i;
  const ASK_START_EN = /^(?:send|share|forward|provide|attach|upload|return|submit|resend|sign|approve|confirm|verify|check|review|look|read|pay|wire|transfer|settle|book|schedule|pick|choose|decide|reply|respond|update|fix|prepare|draft|write|complete|finish|fill|get|give|make|take|tell|let|come|join|register|rsvp|advise|clarify|remember|don't forget)\b/i;
  const ASK_SHAPE_HE = /\?|(?:תוכל|תוכלי|תוכלו|אפשר|נא |בבקשה|אנא|אשמח|צריך|צריכה|צריכים|ממתין|ממתינה|מחכה|מחכים|שלך|שלכם|אתה|אתם|לך |לכם|תגיד|תעדכנו|תעדכן)/;
  const ASK_START_HE = /^ת(?!ו[א-ת]*ר\b)[א-ת]{2,}|^(?:נא|אנא|בבקשה|שלח|שלחו|חזור|אשר|חתום|בדוק|עדכן|הצטרף|הגש|העבר|תן|תני)(?:\s|$)/;
  const PROMISE_PERSON_EN = /\b(?:i|we|our|us|me|my)\b|['’]ll\b/i;
  const PROMISE_FUTURE_EN = /\b(?:will|shall|going to|gonna|let me|count me|on it|expect|sending|approving|can get|can send)\b|['’]ll\b/i;
  const PROMISE_START_EN = /^(?:will|sending|approving|on it|consider it|screenshot coming|expect)\b/i;
  const PROMISE_SHAPE_HE = /(?:^|\s)[אנ][א-ת]{2,}(?=\s|$)|(?:^|\s)תקבל|(?:^|\s)תשמע/;
  const NEGATED = /\b(?:not|never|no longer|won't|will not|can't|cannot|couldn't|unable|wouldn't)\b|n't\b|(?:^|\s)לא(?:\s|$)|אין(?:\s|$)/i;
  function shapedAsk(s) {
    const he = /[֐-׿]/.test(s);
    return he ? (ASK_SHAPE_HE.test(s) || ASK_START_HE.test(s.trim())) : (ASK_SHAPE_EN.test(s) || ASK_START_EN.test(s.trim()));
  }
  function shapedPromise(s) {
    const he = /[֐-׿]/.test(s);
    if (NEGATED.test(s)) return false;
    return he ? PROMISE_SHAPE_HE.test(s) : (PROMISE_START_EN.test(s.trim()) || (PROMISE_PERSON_EN.test(s) && PROMISE_FUTURE_EN.test(s)));
  }

  // One sentence -> { act, confidence, tier, topic, unsure, request, commitment, why, evidence }
  function recognize(sentence, ctx) {
    const out = recognizeCore(sentence, ctx);
    out.evidence = evidenceOf(sentence, out);
    return out;
  }

  function recognizeCore(sentence, ctx) {
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
    // A whole short chaser ("Any update?", "Signed yet?", "?מה הסטטוס"): its shape is
    // the evidence. A greeting in front of it does not change what it is.
    const short = types.detectShortAsk ? types.detectShortAsk(s.replace(/^\s*(?:hi|hello|hey|היי|שלום)[^\n,!?]{0,20}[,!:]\s*/i, '')) : null;
    if (short && !lexCom && !(m && (m.act === 'INFORM' || m.act === 'ACK') && m.actProb >= VETO_MIN)) {
      out.act = 'ASK'; out.request = short; out.unsure = false; out.tier = 'lexicon-short'; out.confidence = 0.8; out.why = 'short chaser';
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
    if (m.act === 'ASK' && m.actProb >= MODEL_MIN && !hedged && shapedAsk(s)) {
      const req = topicRequest(m, s);
      if (req) {
        out.act = 'ASK'; out.request = req; out.unsure = false; out.tier = 'model'; out.confidence = m.actProb; out.why = 'model: ask, action ' + req.action;
        return out;
      }
    }
    if (m.act === 'PROMISE' && m.actProb >= MODEL_MIN && !hedged && shapedPromise(s)) {
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

  // What the verdict rests on, as plain data. STRONG signals are things a person
  // would point to ("it names a payment, an amount and a date"); WEAK ones are
  // statistical or hedged. This is for explaining a decision and for measuring it;
  // it never overrules the verdict above.
  const MONEY = /(?:[$€£₪]\s?\d|\d[\d,.]*\s?(?:usd|eur|gbp|ils|nis|dollars?|euros?|₪|ש"ח|שקל(?:ים)?)\b)/i;
  const DATE = /\b(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|end of (?:the )?(?:day|week|month)|by \d{1,2}[/.]\d{1,2}|\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))|(?:היום|מחר|מחרתיים|עד (?:יום|סוף|ה)|ביום (?:ראשון|שני|שלישי|רביעי|חמישי|שישי)|\d{1,2}[/.]\d{1,2})/i;
  function evidenceOf(sentence, out) {
    const s = String(sentence == null ? '' : sentence);
    const strong = [], weak = [];
    if (!s.trim()) return { strong, weak, strength: 'none' };
    const hits = types ? types.lexHits(s) : { actions: [], objects: [], framed: false, committed: false, hedged: false };
    if (hits.framed) strong.push('frame');
    if (hits.committed && out.act === 'PROMISE') strong.push('first-person');
    if (hits.actions[0]) strong.push('action:' + hits.actions[0]);
    if (hits.objects[0]) strong.push('object:' + hits.objects[0]);
    if (MONEY.test(s)) strong.push('amount');
    if (DATE.test(s)) strong.push('date');
    if (/\b(?:you|your|yours)\b|(?:אתה|את|אתם|שלך|שלכם|תוכל|תוכלו)/i.test(s)) strong.push('addressed-to-them');
    if (out.tier === 'lexicon-short') strong.push('short-form');
    if (/[?؟]\s*$/.test(s)) weak.push('question-mark');
    if (hits.hedged) weak.push('hedged');
    if (out.tier === 'model' || out.tier === 'lexicon+model') weak.push('model:' + Math.round((out.confidence || 0) * 100) / 100);
    if (out.tier === 'model-veto') weak.push('model-veto');
    // Politeness is not actionability: a courtesy or a statement carries no strong signal of its own.
    const act = out.act === 'ASK' || out.act === 'PROMISE';
    const strength = !act ? 'none' : strong.length >= 4 ? 'strong' : strong.length >= 2 ? 'medium' : 'weak';
    return { strong, weak, strength };
  }

  // One message -> the verdict the statistics use. Counts only.
  function verdictOf(text) {
    const an = analyze(text);
    const hit = an.find((a) => (a.act === 'ASK' || a.act === 'PROMISE') && !a.unsure);
    if (hit) return { kind: 'localHit', tier: hit.tier, strength: hit.evidence.strength };
    const maybe = an.find((a) => a.unsure && (a.act === 'ASK' || a.act === 'PROMISE'));
    if (maybe) return { kind: 'residual', tier: maybe.tier || 'model', strength: 'weak' };
    return { kind: 'localSilence', tier: 'none', strength: 'none' };
  }

  // A whole message: the sentences that ask or promise, in order.
  function sentences(text) {
    return String(text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  }
  function analyze(text, ctx) {
    return sentences(text).map((s) => Object.assign({ sentence: s }, recognize(s, ctx)));
  }

  return { recognize, analyze, sentences, verdictOf, evidenceOf, VETO_MIN, MODEL_MIN };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntentPipeline };
