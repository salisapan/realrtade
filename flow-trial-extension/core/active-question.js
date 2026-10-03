// One question, only when it is worth asking. Portable: no chrome.*, no DOM, no network.
//
// When the engine is torn about a sentence of YOUR OWN message ("is that an ask I am waiting on?"), the cheapest
// way to settle it is to ask you, once. The answer does two things at the same time: it opens (or declines) the
// loop, and it is a label for the on-device model (core/intent-model.js learn()). The question is chosen by how
// undecided the engine is: the sentence whose probability is closest to a coin flip is the one an answer teaches
// the most about (binary entropy). Everything else stays silent, as always.
//
// Cost of the question is the product's enemy (docs/design-principles.md: friction), so it is rationed hard:
//   - at most one question waiting, at most one a day, at most three a week;
//   - two skips in a row pause questions for two weeks;
//   - a question that nobody answered expires after a week;
//   - nothing is asked about a sentence the engine already tracks, or one it is sure is thanks or a statement.
// The sentence is shown from this device's own storage (like a loop's text); it is never sent anywhere.
const FlowActiveQuestion = (() => {
  const DAY = 24 * 3600 * 1000;
  const MIN_WORDS = 5;
  const MAX_WORDS = 40;
  const MIN_P = 0.25;          // below this the engine is fairly sure it is NOT an ask
  const MIN_SCORE = 0.6;       // binary entropy in bits: p between about 0.15 and 0.85
  const PER_DAY = 1;
  const PER_WEEK = 3;
  const EXPIRE_MS = 7 * DAY;
  const PAUSE_MS = 14 * DAY;
  const SKIPS_TO_PAUSE = 2;
  const MAX_SHOWN = 140;
  const RATE_YES = 4;          // an owner's direct answer is the strongest label there is (same as a missed ask)
  const RATE_NO = 1.5;

  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }
  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }
  function clip(t, n) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function entropy(p) { if (!(p > 0) || !(p < 1)) return 0; return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)); }
  function sentences(text) { return String(text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean); }

  function emptyState() { return { pending: null, asked: [], skips: 0, pausedUntil: null, answered: 0 }; }
  function norm(state) { return Object.assign(emptyState(), state || {}); }

  // The sentences of your newest message the engine could not decide on, best first.
  // deps: { model, pipeline }. A sentence the pipeline already accepts is not a question.
  function candidates(text, deps) {
    const out = [];
    const d = deps || {};
    if (!d.model || !d.pipeline || (d.model.ready && !d.model.ready())) return out;
    sentences(text).forEach((s) => {
      const n = words(s);
      if (n < MIN_WORDS || n > MAX_WORDS) return;
      const r = d.pipeline.recognize(s);
      if (!r.unsure && (r.act === 'ASK' || r.act === 'PROMISE')) return;      // already a loop
      const m = d.model.predict(s);
      if ((m.act === 'ACK' || m.act === 'INFORM') && m.actProb >= 0.9) return;  // sure it is thanks or a statement
      const pa = m.probs && m.probs.ASK || 0, pp = m.probs && m.probs.PROMISE || 0;
      const kind = pa >= pp ? 'ask' : 'promise';
      const p = Math.max(pa, pp);
      if (p < MIN_P) return;
      const score = entropy(p);
      if (score < MIN_SCORE) return;
      out.push({ sentence: clip(s, MAX_SHOWN), kind, p: Math.round(p * 1000) / 1000, score: Math.round(score * 1000) / 1000, lang: hasHebrew(s) ? 'he' : 'en' });
    });
    return out.sort((a, b) => b.score - a.score);
  }

  function active(state, now) {
    const s = norm(state);
    if (s.pending && now - s.pending.createdAt > EXPIRE_MS) return Object.assign({}, s, { pending: null });
    return s;
  }

  function mayAsk(state, now) {
    const s = active(state, now);
    if (s.pending) return false;
    if (s.pausedUntil && now < s.pausedUntil) return false;
    const recent = s.asked.filter((t) => now - t < 7 * DAY);
    if (recent.length >= PER_WEEK) return false;
    if (recent.some((t) => now - t < DAY) && PER_DAY <= recent.filter((t) => now - t < DAY).length) return false;
    return true;
  }

  // Keep the best candidate waiting. `where` is the thread it came from: { threadId, messageId, subject, counterpart, threadUrl }.
  // A waiting question is replaced only if it has expired; nothing is asked yet, the popup asks.
  function offer(state, cands, where, now) {
    const s = active(state, now);
    if (!cands || !cands.length || !mayAsk(s, now)) return s;
    const c = cands[0];
    const w = where || {};
    if (!w.threadId) return s;
    return Object.assign({}, s, { pending: Object.assign({}, c, { threadId: String(w.threadId), messageId: w.messageId ? String(w.messageId) : null, subject: clip(w.subject || '', 120), counterpart: { name: (w.counterpart && w.counterpart.name) || null, email: (w.counterpart && w.counterpart.email) || null }, threadUrl: w.threadUrl || null, createdAt: now }) });
  }

  // The wording shown with the sentence. Plain, about the loop, no cleverness.
  function questionText(pending) {
    const he = pending && pending.lang === 'he';
    if (pending && pending.kind === 'promise') return he ? 'האם הבטחת את זה?' : 'Did you just promise this?';
    return he ? 'האם אתה מחכה לתשובה על זה?' : 'Are you waiting on a reply to this?';
  }

  // answer: 'yes' | 'no' | 'skip'. Returns the new state and what to do with it:
  //   { state, teach: { label, rate } | null, openLoop: boolean }
  function answer(state, ans, now) {
    const s = active(state, now);
    const p = s.pending;
    if (!p) return { state: s, teach: null, openLoop: false };
    const next = Object.assign({}, s, { pending: null });
    if (ans === 'skip') {
      next.skips = (s.skips || 0) + 1;
      next.asked = s.asked.concat([now]).slice(-12);
      if (next.skips >= SKIPS_TO_PAUSE) { next.pausedUntil = now + PAUSE_MS; next.skips = 0; }
      return { state: next, teach: null, openLoop: false };
    }
    next.skips = 0;
    next.answered = (s.answered || 0) + 1;
    next.asked = s.asked.concat([now]).slice(-12);
    if (ans === 'yes') return { state: next, teach: { label: p.kind === 'promise' ? 'PROMISE' : 'ASK', rate: RATE_YES }, openLoop: true };
    return { state: next, teach: { label: 'INFORM', rate: RATE_NO }, openLoop: false };
  }

  // The `ask` object core/follow-up.js buildWatch() takes, for a loop the owner just confirmed.
  // chaseIso comes from the caller (FlowFollowUp.chaseDate / personalChase), so this file stays standalone.
  function askFor(pending, chaseIso) {
    const mine = pending.kind === 'promise';
    return { kind: 'reply', what: clip(pending.sentence, 140), amount: null, deadlineIso: null, chaseIso, lang: pending.lang || 'en',
      subtype: mine ? 'owe:reply' : 'reply', subtypeLabel: mine ? null : 'a reply', tier: 'model', file: null, direction: mine ? 'mine' : 'theirs' };
  }

  return { MIN_P, MIN_SCORE, PER_DAY, PER_WEEK, EXPIRE_MS, PAUSE_MS, RATE_YES, RATE_NO, emptyState, candidates, mayAsk, offer, questionText, answer, askFor, entropy, active };
})();

if (typeof module !== 'undefined') module.exports = { FlowActiveQuestion };
