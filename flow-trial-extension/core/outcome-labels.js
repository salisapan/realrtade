// Labels the product earns for free from what happens next — portable, no chrome.*, no DOM, no
// network. The most valuable training signal is not a thumbs-up button; it is the person's own
// behaviour, which costs them nothing:
//
//   missed ask      You chased by hand ("Any update?") in a thread where Glance never opened a
//                   loop. So an earlier message of yours WAS an ask and the local engine stayed
//                   silent on it. That earlier sentence is a labelled false negative, the exact
//                   kind the model needs, and it is YOURS: your phrasing, your contacts' domain.
//   missed promise  You later delivered something in a thread with no promise loop: the earlier
//                   sentence that promised it is a labelled false negative too.
//   closure quality Loops Glance closed by itself that you then reopened: its own error rate, which
//                   makes it more careful (stricter) when it is high.
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

  // The same for a promise: you later DELIVERED something (a message with the file, "here it is") in a thread
  // where no promise loop was opened, so an earlier sentence of yours promised it and the engine missed it.
  function pickMissedPromise(text, model) {
    if (!model || !model.ready || !model.ready()) return null;
    const list = sentences(text).filter((s) => (s.match(/\S+/g) || []).length >= MIN_WORDS);
    if (!list.length || list.length > MAX_SENTENCES) return null;
    let best = null;
    for (const s of list) {
      const p = model.predict(s);
      const pr = p.probs && typeof p.probs.PROMISE === 'number' ? p.probs.PROMISE : 0;
      if ((p.act === 'ACK' || p.act === 'ASK') && p.actProb >= 0.97 && pr < 0.01) continue;
      if (!best || pr > best.prob) best = { sentence: s, prob: pr };
    }
    return best && best.prob >= MIN_ASK_PROB ? best : null;
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

  function missedPromiseIn(earlierOwnNewestFirst, silentOn, model) {
    const list = Array.isArray(earlierOwnNewestFirst) ? earlierOwnNewestFirst : [];
    if (!list.length) return null;
    for (const m of list) if (!silentOn(m.text)) return null;
    for (const m of list) {
      const pick = pickMissedPromise(m.text, model);
      if (pick) return { key: m.key || null, sentence: pick.sentence, prob: pick.prob };
    }
    return null;
  }

  // ---- how well is the closing going? ------------------------------------------------------------
  // A loop Glance closed by itself that the person then REOPENED is a closure mistake: the one mistake
  // this product must not make. The rate is a real production quality number, and it feeds back: when
  // closes are being corrected often, Glance stops closing on a reply it understood only by default
  // ("they wrote back, so it is answered") and keeps the loop open instead.
  const STRICT_MIN_CLOSES = 8, STRICT_RATE = 0.25;
  function closureQuality(counts) {
    const c = counts || {};
    const closes = c.autoClosed || 0, reopened = c.reopened || 0;
    return { autoClosed: closes, reopened, errorRate: closes ? Math.round((reopened / closes) * 1000) / 1000 : 0, strict: closes >= STRICT_MIN_CLOSES && reopened / closes >= STRICT_RATE };
  }

  return { pickMissedAsk, missedAskIn, pickMissedPromise, missedPromiseIn, closureQuality, RATE_MISSED, RATE_CONFIRMED, STRICT_MIN_CLOSES, STRICT_RATE };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutcomeLabels };
