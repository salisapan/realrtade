// A language model that runs on THIS device, as the third recognition tier. Portable: no chrome.*, no DOM, no network.
// The browser binding (src/local-lm-chrome.js) hands in a `session` with one method, prompt(text, schema) -> string.
//
//   Tier 0  lexicon           core/request-types.js
//   Tier 1  learned model     core/intent-model.js
//   Tier 2  THIS FILE         a small language model on the device, for wording nothing above could place
//   (no external model is involved at any tier: docs/local-first-principle.md)
//
// What it may do, and what it may not:
//   - It only ever PROPOSES. A proposal becomes a loop the same way every other proposal does: the person taps
//     "Stay on it". It never closes, writes or sends anything alone.
//   - It is asked only about a sentence the two tiers above left silent, that is not clearly thanks or a statement,
//     that has the shape of an ask or a promise, and that is long enough to mean something.
//   - It is asked twice with differently worded instructions and must give the same answer both times, with the
//     right party doing the thing (an ask is for THEM, a promise is by YOU). A disagreement is silence.
//   - It may point at a date or an amount in the sentence; code then re-reads that span with the same parsers
//     the rest of the product uses. A span that is not literally in the sentence is dropped, so an invented
//     date or amount cannot become a deadline or a payment.
//   - It is switched on for a device and a language only after it passes a precision self-test THERE
//     (selfTest below). No test result, or a failed one, means it never runs.
// The result of every call is checked field by field against a closed vocabulary; the raw text is never used.
const FlowLocalLM = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extractMod = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');

  const ACTS = ['ASK', 'PROMISE', 'INFORM', 'ACK'];
  const ACTIONS = ['pay', 'sign', 'approve', 'confirm', 'schedule', 'decide', 'review', 'join', 'complete', 'send', 'reply', 'none'];
  const WHO = ['you', 'me', 'other', 'none'];
  const MIN_WORDS = 5;
  const MAX_WORDS = 40;
  const SPAN_MAX = 40;
  const TEST_MIN_PRECISION = 0.97;   // the same bar the on-device model is held to
  const TEST_MIN_POSITIVES = 12;     // fewer proposed positives than this and the test proves nothing
  const TEST_MIN_RECALL = 0.4;       // below this it would almost never help, so it stays off
  const TEST_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

  const SCHEMA = {
    type: 'object',
    properties: {
      act: { type: 'string', enum: ACTS },
      action: { type: 'string', enum: ACTIONS },
      who: { type: 'string', enum: WHO },
      when: { type: ['string', 'null'] },
      amount: { type: ['string', 'null'] }
    },
    required: ['act', 'action', 'who', 'when', 'amount'],
    additionalProperties: false
  };

  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }
  function hasHebrew(t) { return /[֐-׿]/.test(String(t || '')); }
  function langOf(t) { return hasHebrew(t) ? 'he' : 'en'; }

  // Two differently worded sets of instructions. The answers must match.
  const DEFS_A = 'Classify ONE sentence from an email written by the person who is sending it.\n' +
    'Return JSON with keys act, action, who, when, amount.\n' +
    'act = ASK when the writer asks the reader to do something or to answer (a request or a question that needs an answer).\n' +
    'act = PROMISE when the writer commits to doing something themselves.\n' +
    'act = INFORM for a statement of fact or news. act = ACK for thanks, a greeting or a courtesy.\n' +
    'action = what must be done: pay, sign, approve, confirm, schedule, decide, review, join, complete, send, reply, or none.\n' +
    'who = who has to do it: you (the reader), me (the writer), other, or none.\n' +
    'when = the date or time words exactly as written in the sentence, or null. amount = the money exactly as written, or null.\n' +
    'Answer with JSON only.';
  const DEFS_B = 'You read one sentence from an email and say what it does. Think of the sender and the recipient.\n' +
    'If the sender needs the recipient to act or reply, act is ASK. If the sender says they themselves will act, act is PROMISE. ' +
    'If it only reports something, act is INFORM. If it is only thanks or politeness, act is ACK.\n' +
    'Name the action (pay, sign, approve, confirm, schedule, decide, review, join, complete, send, reply, none), and who must do it ' +
    '(you = the recipient, me = the sender, other, none). Copy any date or amount words exactly as written, otherwise null.\n' +
    'Reply with JSON only, no other text.';

  function promptFor(sentence, variant) {
    const s = String(sentence).replace(/\s+/g, ' ').trim().slice(0, 400);
    return (variant === 'B' ? DEFS_B : DEFS_A) + '\n\nSentence: ' + JSON.stringify(s);
  }

  // The same askings split into the fixed instructions and the one line that carries the sentence, for a caller that sends them in different roles
  // (the server's deeper read: the instructions are its own, the sentence is the only thing that came from outside).
  function partsFor(sentence, variant) {
    const s = String(sentence).replace(/\s+/g, ' ').trim().slice(0, 400);
    return { system: variant === 'B' ? DEFS_B : DEFS_A, user: 'Sentence: ' + JSON.stringify(s) };
  }

  // Strict reading of the model's reply. Anything outside the vocabulary is a null, never a guess.
  function parse(raw) {
    let o = null;
    try { o = JSON.parse(String(raw)); } catch (e) { const m = /\{[\s\S]*\}/.exec(String(raw || '')); if (m) { try { o = JSON.parse(m[0]); } catch (e2) { o = null; } } }
    if (!o || typeof o !== 'object') return null;
    if (ACTS.indexOf(o.act) < 0 || ACTIONS.indexOf(o.action) < 0 || WHO.indexOf(o.who) < 0) return null;
    const span = (v) => (typeof v === 'string' && v.trim() && v.trim().length <= SPAN_MAX ? v.trim() : null);
    return { act: o.act, action: o.action, who: o.who, when: span(o.when), amount: span(o.amount) };
  }

  // The span must be literally in the sentence (any case, whitespace-insensitive), or it is dropped.
  function verifySpan(sentence, span) {
    if (!span) return null;
    const flat = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
    return flat(sentence).indexOf(flat(span)) >= 0 ? span : null;
  }

  // Two readings of one sentence (from two differently worded askings) -> the agreed reading, or null. Shared by the on-device session below and by the
  // server's deeper read (core/ai-ladder.js), so the same rule decides in both places: same act, same action, the right party doing the thing.
  function agree(a, b, sentence) {
    if (!a || !b || a.act !== b.act) return null;
    if ((a.act === 'ASK' || a.act === 'PROMISE') && a.action !== b.action) return null;
    if (a.act === 'ASK' && (a.who !== 'you' || b.who !== 'you')) return null;
    if (a.act === 'PROMISE' && (a.who !== 'me' || b.who !== 'me')) return null;
    return { act: a.act, action: a.action, who: a.who, when: verifySpan(sentence, a.when) || verifySpan(sentence, b.when), amount: verifySpan(sentence, a.amount) || verifySpan(sentence, b.amount) };
  }

  // One sentence, two askings. Returns the agreed reading or null.
  async function classify(session, sentence) {
    if (!session || typeof session.prompt !== 'function') return null;
    let a, b;
    try {
      a = parse(await session.prompt(promptFor(sentence, 'A'), SCHEMA));
      if (!a) return null;
      b = parse(await session.prompt(promptFor(sentence, 'B'), SCHEMA));
    } catch (e) { return null; }
    return agree(a, b, sentence);
  }

  // May the model be asked about this sentence at all? deps: { pipeline, model, status }.
  // status: the stored self-test result for this device, { en:{ok}, he:{ok}, checkedAt }.
  function eligible(sentence, deps) {
    const d = deps || {};
    const n = words(sentence);
    if (n < MIN_WORDS || n > MAX_WORDS) return false;
    const lang = langOf(sentence);
    if (!d.status || !d.status[lang] || d.status[lang].ok !== true) return false;
    if (typeof d.status.checkedAt !== 'number' || (typeof d.now === 'number' ? d.now : Date.now()) - d.status.checkedAt > TEST_MAX_AGE_MS) return false;
    const r = d.pipeline ? d.pipeline.recognize(sentence) : null;
    if (!r || !r.unsure) return false;                              // the tiers above already decided
    if (d.model && d.model.ready && d.model.ready()) {
      const m = d.model.predict(sentence);
      if ((m.act === 'ACK' || m.act === 'INFORM') && m.actProb >= 0.9) return false;   // sure it is thanks or a statement
    }
    return true;
  }

  // Ask the device model about a sentence the other tiers left silent. Returns a proposal in the shape
  // core/follow-up.js builds loops from, or null. deps: { session, pipeline, model, status, extract, now }.
  async function propose(sentence, deps) {
    const d = deps || {};
    if (!eligible(sentence, d)) return null;
    const pipeline = d.pipeline;
    const read = await classify(d.session, sentence);
    if (!read || (read.act !== 'ASK' && read.act !== 'PROMISE')) return null;
    if (read.action === 'none') return null;                         // nothing nameable: stay silent, as the tiers above do
    const shaped = read.act === 'ASK' ? pipeline.shapedAsk(sentence) : pipeline.shapedPromise(sentence);
    if (!shaped) return null;                                        // the same structural gate the learned model needs
    const ex = d.extract || extractMod;
    const now = typeof d.now === 'number' ? d.now : Date.now();
    // Code re-reads the spans the model pointed at; the model never supplies a value, only a place.
    const date = ex && ex.parseDate ? (ex.parseDate(sentence, new Date(now)) || (read.when ? ex.parseDate(read.when, new Date(now)) : null)) : null;
    const money = ex && ex.parseMoney ? (ex.parseMoney(sentence) || (read.amount ? ex.parseMoney(read.amount) : null)) : null;
    return {
      act: read.act, action: read.action, tier: 'lm',
      deadlineIso: date && date.iso ? date.iso : null,
      amount: money ? { value: money.value, currency: money.currency || null, raw: money.raw } : null,
      sentence: String(sentence).trim()
    };
  }

  // ---- the self-test: no result, or a failed one, means the model never runs on this device -------------
  // audit: [{ t, act, lang }] (core/local-lm-audit.js). Precision is measured on what it WOULD propose.
  async function selfTest(session, audit, opts) {
    const o = opts || {};
    const res = { checkedAt: typeof o.now === 'number' ? o.now : Date.now(), en: { ok: false }, he: { ok: false } };
    if (!session) return res;
    for (const lang of ['en', 'he']) {
      const rows = (audit || []).filter((r) => (r.lang || langOf(r.t)) === lang);
      let tp = 0, fp = 0, fn = 0;
      for (const r of rows) {
        if (typeof o.onProgress === 'function') { try { o.onProgress(lang, tp + fp + fn, rows.length); } catch (e) { /* progress is cosmetic */ } }
        const read = await classify(session, r.t);
        const proposed = read && (read.act === 'ASK' || read.act === 'PROMISE') && read.action !== 'none';
        const gold = r.act === 'ASK' || r.act === 'PROMISE';
        if (proposed && gold && read.act === r.act) tp++;
        else if (proposed) fp++;
        else if (gold) fn++;
      }
      const proposedN = tp + fp;
      const precision = proposedN ? tp / proposedN : null;
      const recall = tp + fn ? tp / (tp + fn) : null;
      res[lang] = { ok: precision !== null && precision >= TEST_MIN_PRECISION && proposedN >= TEST_MIN_POSITIVES && recall !== null && recall >= TEST_MIN_RECALL, n: rows.length, tp, fp, fn,
        precision: precision === null ? null : Math.round(precision * 1000) / 1000, recall: recall === null ? null : Math.round(recall * 1000) / 1000 };
    }
    return res;
  }

  function stale(status, now) { return !status || typeof status.checkedAt !== 'number' || (typeof now === 'number' ? now : Date.now()) - status.checkedAt > TEST_MAX_AGE_MS; }

  return { ACTS, ACTIONS, WHO, SCHEMA, TEST_MIN_PRECISION, TEST_MIN_POSITIVES, TEST_MIN_RECALL, TEST_MAX_AGE_MS, promptFor, partsFor, parse, verifySpan, agree, classify, eligible, propose, selfTest, stale };
})();

if (typeof module !== 'undefined') module.exports = { FlowLocalLM };
