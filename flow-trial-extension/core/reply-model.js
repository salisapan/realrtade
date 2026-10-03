// Does a reply truly FINISH what was asked? A small on-device classifier. Portable: no chrome.*, no DOM, no network.
//
// core/follow-up.js reads a reply with rules: out-of-office, "got it", "I'll send it Friday", "I paid". When none of them fires it used to
// assume the oldest thing there is: they wrote back, so it is answered. That assumption is where loops are wrongly closed ("I'll look into
// it when I get a chance", half the file, a question back, an unrelated note). This model reads such a reply and says which kind it is,
// so a loop is closed on understanding and not on the mere fact that someone wrote.
//
// It is a hashed word and word-pair multinomial logistic regression (the same family and the same discipline as core/intent-model.js),
// trained at build time (scripts/train-reply-model.cjs) on sentences the build-time teacher wrote, and measured on a held-out set that no
// training run ever sees. It never closes anything alone: callers use it only to KEEP a loop open when it is confident the reply was not an
// answer, or to treat the reply as a real answer (a rule-strength close) when it is confident that it was.
const FlowReplyModel = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const lang = sibling(typeof FlowLang !== 'undefined' ? FlowLang : null, './lang-normalize.js', 'FlowLang');
  const CLASSES = ['ANSWERED', 'INTERIM', 'ACK', 'OTHER', 'HANDBACK', 'DECLINED'];
  let weights = null;

  function hash(s, dim) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % dim; }

  // Word and word-pair features of the normalised sentence, plus a few shape cues. Hashed into `dim` buckets.
  function features(text, dim) {
    const t = String(text == null ? '' : text);
    const toks = lang ? lang.tokenize(t).map((x) => x.w) : t.toLowerCase().split(/\s+/);
    const f = [];
    toks.forEach((w, i) => { f.push('u:' + w); if (i + 1 < toks.length) f.push('b:' + w + '_' + toks[i + 1]); });
    if (toks.length) f.push('first:' + toks[0]);
    if (/\?|؟/.test(t)) f.push('shape:q');
    f.push('len:' + (toks.length <= 3 ? 's' : toks.length <= 8 ? 'm' : 'l'));
    f.push('bias');
    return f.map((x) => hash(x, dim));
  }

  function load(w) { weights = w && w.W && w.dim ? w : null; return Boolean(weights); }
  function ready() { return Boolean(weights); }

  function predict(text) {
    if (!weights) return null;
    const idx = features(text, weights.dim);
    const K = CLASSES.length;
    const z = new Array(K).fill(0);
    for (const i of idx) for (let k = 0; k < K; k++) z[k] += weights.W[k][i] * (weights.scale || 1);
    for (let k = 0; k < K; k++) z[k] = z[k] / (weights.temperature || 1) + (weights.b ? weights.b[k] : 0);
    const m = Math.max.apply(null, z);
    const e = z.map((v) => Math.exp(v - m));
    const s = e.reduce((a, b) => a + b, 0);
    const probs = {};
    let best = 0;
    e.forEach((v, k) => { probs[CLASSES[k]] = v / s; if (v > e[best]) best = k; });
    return { cls: CLASSES[best], p: probs[CLASSES[best]], probs };
  }

  // Where the reply was NOT an answer: INTERIM ("looking into it"), ACK ("thanks") and OTHER (unrelated). Their combined probability is
  // what callers act on, and only ever to KEEP a loop open.
  function notAnAnswer(text) {
    const p = predict(text);
    if (!p) return null;
    return { p: p.probs.INTERIM + p.probs.ACK + p.probs.OTHER, cls: p.cls, probs: p.probs };
  }

  try { load(typeof FlowReplyWeights !== 'undefined' ? FlowReplyWeights : (typeof require !== 'undefined' ? require('./reply-model-weights.js').FlowReplyWeights : null)); } catch (e) { /* no weights: the rules behave as before */ }

  return { CLASSES, features, load, ready, predict, notAnAnswer };
})();

if (typeof module !== 'undefined') module.exports = { FlowReplyModel };
