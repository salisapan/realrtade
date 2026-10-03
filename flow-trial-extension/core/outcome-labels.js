// Labels the product earns for free from what happens next — portable, no chrome.*, no DOM, no
// network. The most valuable training signal is not a thumbs-up button; it is the person's own
// behaviour, which costs them nothing:
//
//   missed ask      You chased by hand ("Any update?") in a thread where Glance never opened a
//                   loop. So an earlier message of yours WAS an ask and the local engine stayed
//                   silent on it. That earlier sentence is a labelled false negative, the exact
//                   kind the model needs, and it is YOURS: your phrasing, your contacts' domain.
//   confirmed ask   A loop the model alone proposed got a real reply: the proposal was right.
//   confirmed promise  Same for a promise the model alone proposed and you then kept.
//
// What is stored is never the sentence: only the on-device model's feature indexes move (see
// core/intent-model.js learn()), clipped, capped. This file only decides WHICH sentence deserves
// which label, so it can be tested without a browser.
const FlowOutcomeLabels = (() => {
  const MAX_SENTENCES = 8;     // a long message is a letter, not a request: no label
  const MIN_ASK_PROB = 0.05;   // at least a little ask-like to the model; pure chatter earns nothing
  const MIN_WORDS = 4;
  const RATE_MISSED = 4;       // measured in scripts/intent/outcome-learning-sim.cjs: saturates here
  const RATE_CONFIRMED = 1.5;  // a gentler nudge: the model already got these right

  function sentences(text) {
    return String(text || '').replace(/\r/g, '').split(/(?<=[.!?؟])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  }

  // Which sentence of an earlier own message of yours was the ask the engine missed?
  //   text: that message; model: the on-device model (needs predict()). Returns
  //   { sentence, probAsk } or null (nothing in it looks like an ask: do not label).
  function pickMissedAsk(text, model) {
    if (!model || !model.ready || !model.ready()) return null;
    const list = sentences(text).filter((s) => (s.match(/\S+/g) || []).length >= MIN_WORDS);
    if (!list.length || list.length > MAX_SENTENCES) return null;
    let best = null;
    for (const s of list) {
      const p = model.predict(s);
      const ask = p.probs && typeof p.probs.ASK === 'number' ? p.probs.ASK : 0;
      // A sentence the model is sure is thanks or a statement is not the ask.
      if ((p.act === 'ACK' || p.act === 'INFORM') && p.actProb >= 0.97 && ask < 0.01) continue;
      if (!best || ask > best.probAsk) best = { sentence: s, probAsk: ask };
    }
    return best && best.probAsk >= MIN_ASK_PROB ? best : null;
  }

  // The thread: own earlier messages, newest first, each as { text }. The newest ones are the chase.
  // `silentOn(text)` says whether the engine stayed silent on that message. The ask that was missed
  // is in the nearest earlier message of yours that the engine was silent on, and ONLY if no
  // earlier message of yours was recognised (then the loop exists or was declined, nothing was missed).
  function missedAskIn(earlierOwnNewestFirst, silentOn, model) {
    const list = Array.isArray(earlierOwnNewestFirst) ? earlierOwnNewestFirst : [];
    if (!list.length) return null;
    for (const m of list) if (!silentOn(m.text)) return null;
    for (const m of list) {
      const pick = pickMissedAsk(m.text, model);
      if (pick) return Object.assign({ key: m.key || null }, pick);
    }
    return null;
  }

  return { pickMissedAsk, missedAskIn, RATE_MISSED, RATE_CONFIRMED };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutcomeLabels };
