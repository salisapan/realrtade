// A small statistical intent model that runs entirely on the device — portable,
// no chrome.*, no DOM, no network. Pure JavaScript, no dependencies.
//
// What it is: two softmax (multinomial logistic regression) classifiers over
// the same hashed feature vector.
//   ACT    what the sentence DOES:  ASK (wants the reader to do something),
//          PROMISE (the writer commits to do something), INFORM, ACK
//   ACTION what it is about:        pay, sign, approve, confirm, schedule, decide,
//          review, join, complete, send, reply (or none). `topic` is derived from it.
// Features come from core/lang-normalize.js (stems, Hebrew prefix/suffix
// forms, placeholders, negation) plus the hand-written lexicons in
// core/request-types.js, which are fed in as evidence rather than used as
// gates. That is the point: vocabulary a person wrote helps, but a sentence
// phrased in a way nobody listed can still be recognised from its shape and
// its parts.
//
// The weights are trained offline by scripts/train-intent-model.cjs and shipped
// in core/intent-model-weights.js. Nothing is downloaded and nothing leaves the
// device at run time. On-device adaptation (`learn`) nudges the answer from the
// person's own confirmations and dismissals and is stored locally.
//
// It always reports how sure it is, and says so when it is not. "Unsure" is a
// first-class answer: callers stay silent on it (docs/local-first-principle.md).
const FlowIntentModel = (() => {
  const ACTS = ['ASK', 'PROMISE', 'INFORM', 'ACK'];
  const TOPICS = ['money', 'meeting', 'document', 'decision', 'work', 'info', 'other'];
  // The action a request or promise is about, so the model can name what is being
  // asked even when the sentence uses a verb nobody listed ("take another pass" -> review).
  const ACTIONS = ['none', 'pay', 'sign', 'approve', 'confirm', 'schedule', 'decide', 'review', 'join', 'complete', 'send', 'reply'];
  // What the action is about, derived from the action head (there is no separate topic head).
  const TOPIC_OF = { pay: 'money', schedule: 'meeting', join: 'meeting', send: 'document', sign: 'document', approve: 'decision', decide: 'decision', confirm: 'decision', complete: 'work', review: 'work', reply: 'info' };
  const FEATURE_VERSION = 4;

  const lang = typeof FlowLang !== 'undefined' ? FlowLang : (typeof require !== 'undefined' ? require('./lang-normalize.js').FlowLang : null);
  const densePrior = typeof FlowDensePrior !== 'undefined' ? FlowDensePrior : (typeof require !== 'undefined' ? (() => { try { return require('./dense-prior.js').FlowDensePrior; } catch (e) { return null; } })() : null);
  const types = typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : (typeof require !== 'undefined' ? require('./request-types.js').FlowRequestTypes : null);

  let weights = null;       // { version, dim, temp, act:{...}, action:{...} }
  let adapt = { act: {}, topic: {}, action: {} }; // sparse per-device deltas: { head: { 'class|idx': delta } }
  let community = null;     // optional published community delta { 'class|idx': delta } for the act head (core/community.js); null = none

  // ---- hashing ---------------------------------------------------------------
  function hash(str, dim) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % dim;
  }

  const FIRST_MODALS = new Set(['could', 'can', 'would', 'will', 'shall', 'may', 'might', 'should', 'do', 'did', 'does', 'have', 'has', 'are', 'is', 'am', 'was', 'were']);

  // sentence -> sorted unique list of feature indexes (a sparse binary vector).
  function features(text, dim) {
    const D = dim || (weights && weights.dim) || 16384;
    const toks = lang ? lang.tokenize(text) : [];
    const f = [];
    const add = (s) => f.push(hash(s, D));
    const words = toks.filter((t) => t.w[0] !== '<' || t.w === '<money>' || t.w === '<weekday>' || t.w === '<date>' || t.w === '<time>' || t.w === '<month>' || t.w === '<num>');
    const surface = words.map((t) => (t.neg ? 'NOT_' : '') + t.w);

    for (let i = 0; i < surface.length && i < 60; i++) {
      add('w:' + surface[i]);
      for (const alt of words[i] && words[i].forms || []) add('w:' + alt);
      if (i + 1 < surface.length) add('b:' + surface[i] + '_' + surface[i + 1]);
      if (i + 2 < surface.length) add('t:' + surface[i] + '_' + surface[i + 1] + '_' + surface[i + 2]);
    }
    // Character n-grams of the raw words: robust to typos, Hebrew inflection, unseen words.
    for (const t of toks) {
      if (t.w[0] === '<' || !t.raw || t.raw.length < 3) continue;
      const r = '^' + t.raw + '$';
      for (let n = 3; n <= 5; n++) for (let i = 0; i + n <= r.length; i++) add('c' + n + ':' + r.slice(i, i + n));
    }
    // Shape: where the sentence starts and ends tells a request from a statement.
    const first = surface[0] || '', second = surface[1] || '';
    add('f1:' + first); add('f2:' + first + '_' + second);
    add('l1:' + (surface[surface.length - 1] || ''));
    const q = toks.some((t) => t.w === '<q>');
    if (q) add('SHAPE:question');
    if (toks.length && toks[toks.length - 1].w === '<q>') add('SHAPE:endsq');
    if (FIRST_MODALS.has(first) && q) add('SHAPE:modalq');
    if (surface.length <= 3) add('SHAPE:short');
    else if (surface.length <= 8) add('SHAPE:medium'); else add('SHAPE:long');
    const has = (w) => surface.indexOf(w) !== -1;
    if (has('i') || has('we') || has('my') || has('our') || has('אני') || has('אנחנו')) add('SHAPE:firstperson');
    if (has('you') || has('your') || has('את') || has('אתה') || has('אתמ') || has('שלכמ') || has('שלך')) add('SHAPE:secondperson');
    if (has('please') || has('kindly') || has('בבקשה') || has('נא')) add('SHAPE:please');
    if (has('thank') || has('thanks') || has('תודה')) add('SHAPE:thanks');
    if (has('will') && (has('i') || has('we'))) add('SHAPE:iwill');
    if (surface.some((w) => /^NOT_/.test(w))) add('SHAPE:negation');

    // The hand-written lexicons as evidence.
    if (types && types.lexHits) {
      const h = types.lexHits(text);
      h.actions.forEach((a) => add('LEX_ACT:' + a));
      h.objects.forEach((o) => add('LEX_OBJ:' + o));
      if (h.framed) add('LEX:framed');
      if (h.committed) add('LEX:committed');
      if (h.hedged) add('LEX:hedged');
      h.actions.slice(0, 1).forEach((a) => h.objects.slice(0, 1).forEach((o) => add('LEX_PAIR:' + a + '_' + o)));
      if (h.framed && h.actions.length) add('LEX:framed_action');
      if (h.committed && h.actions.length) add('LEX:committed_action');
    }
    add('BIAS');
    return Array.from(new Set(f)).sort((a, b) => a - b);
  }

  // ---- inference ---------------------------------------------------------------
  function decode(head) {
    // head: { scale:[...], b64: base64 of int8 [class][dim], bias:[...] } -> Float32Array[class][dim]
    if (head._dense) return head._dense;
    const raw = typeof Buffer !== 'undefined' ? Buffer.from(head.b64, 'base64') : Uint8Array.from(atob(head.b64), (c) => c.charCodeAt(0));
    const classes = head.scale.length, dim = weights.dim;
    const dense = [];
    for (let c = 0; c < classes; c++) {
      const row = new Float32Array(dim);
      for (let i = 0; i < dim; i++) { const v = raw[c * dim + i]; row[i] = ((v > 127 ? v - 256 : v)) * head.scale[c]; }
      dense.push(row);
    }
    head._dense = dense;
    return dense;
  }

  function softmax(z, temp) {
    const t = temp || 1;
    const m = Math.max.apply(null, z);
    const e = z.map((x) => Math.exp((x - m) / t));
    const sum = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / sum);
  }

  // dv: the pretrained dense sentence vector (core/dense-prior.js), or null. Its weights are learned
  // next to the n-gram weights; absent (older weights, no vector table) it contributes nothing.
  function scoreHead(headName, idxs, labels, dv) {
    const head = weights[headName];
    const dense = decode(head);
    const delta = adapt[headName] || {};
    const comm = headName === 'act' && community ? community : null;
    const dw = dv && weights.dense && weights.dense[headName];
    const z = labels.map((_, c) => {
      let s = head.bias[c] || 0;
      for (const i of idxs) s += dense[c][i] + (delta[c + '|' + i] || 0) + (comm ? (comm[c + '|' + i] || 0) : 0);
      if (dw && dw[c]) for (let j = 0; j < dv.length; j++) s += dw[c][j] * dv[j];
      return s;
    });
    return softmax(z, weights.temp || 1);
  }

  function load(w) { weights = w; return Boolean(w); }
  function ready() { return Boolean(weights); }

  // text -> { act, actProb, probs:{ACT:p}, topic, topicProb, action, actionProb, unsure, n }
  function predict(text, opts) {
    if (!weights) return null;
    const idxs = features(text, weights.dim);
    if (!lang || lang.tokenize(text).filter((t) => t.w[0] !== '<' || t.w === '<money>').length < 1) return { act: 'INFORM', actProb: 0, probs: {}, topic: 'other', topicProb: 0, action: null, actionProb: 0, unsure: true, n: idxs.length };
    const dv = weights.dense && densePrior && densePrior.ready() ? densePrior.vector(text) : null;
    const pa = scoreHead('act', idxs, ACTS, dv);
    const pc = weights.action ? scoreHead('action', idxs, ACTIONS, dv) : null;
    let ci = 0;
    if (pc) pc.forEach((p, i) => { if (p > pc[ci]) ci = i; });
    let ai = 0;
    pa.forEach((p, i) => { if (p > pa[ai]) ai = i; });
    const probs = {}; ACTS.forEach((a, i) => { probs[a] = pa[i]; });
    const minConf = (opts && opts.minConfidence) || 0.6;
    return { act: ACTS[ai], actProb: pa[ai], probs, topic: pc ? (TOPIC_OF[ACTIONS[ci]] || 'other') : 'other', topicProb: pc ? pc[ci] : 0, action: pc ? ACTIONS[ci] : null, actionProb: pc ? pc[ci] : 0, unsure: pa[ai] < minConf, n: idxs.length };
  }

  // ---- on-device adaptation ------------------------------------------------------
  // One online gradient step of the softmax loss toward `label`, stored as sparse
  // deltas. `lr` is how far ONE full correction may move the logits (spread across
  // the sentence's features), so a few mistaken clicks cannot flip a clear case.
  // Returns the updated adaptation object for the caller to persist.
  const MAX_DELTA = 0.5;
  const MAX_ENTRIES = 4000;
  function learn(text, headName, label, lr) {
    if (!weights) return adapt;
    const labels = headName === 'action' ? ACTIONS : ACTS;
    const target = labels.indexOf(label);
    if (target < 0) return adapt;
    const idxs = features(text, weights.dim);
    const dv = weights.dense && densePrior && densePrior.ready() ? densePrior.vector(text) : null;
    const p = scoreHead(headName, idxs, labels, dv);
    const step = (typeof lr === 'number' ? lr : 1) / Math.max(1, idxs.length);
    const d = adapt[headName] || (adapt[headName] = {});
    for (let c = 0; c < labels.length; c++) {
      const g = (c === target ? 1 : 0) - p[c];
      if (Math.abs(g) < 0.02) continue;
      for (const i of idxs) {
        const k = c + '|' + i;
        const v = (d[k] || 0) + step * g;
        d[k] = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, v));
      }
    }
    const keys = Object.keys(d);
    if (keys.length > MAX_ENTRIES) keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => { delete d[k]; });
    return adapt;
  }
  // The community layer: a signed, validated, published delta shared by many devices (core/community.js).
  function setCommunity(entries) { community = entries && typeof entries === 'object' ? entries : null; }
  function getCommunity() { return community; }
  // Is this feature bucket common in the PUBLIC training text? Only common buckets may ever be shared.
  function isCommon(idx) {
    if (!weights || !weights.common) return false;
    if (!weights._commonBits) weights._commonBits = typeof Buffer !== 'undefined' ? Buffer.from(weights.common, 'base64') : Uint8Array.from(atob(weights.common), (c) => c.charCodeAt(0));
    return Boolean(weights._commonBits[idx >> 3] & (1 << (idx & 7)));
  }
  function setAdaptation(a) { adapt = { act: (a && a.act) || {}, topic: (a && a.topic) || {}, action: (a && a.action) || {} }; }
  function getAdaptation() { return adapt; }

  // Weights shipped with the extension load themselves.
  try {
    if (typeof FlowIntentWeights !== 'undefined') load(FlowIntentWeights);
    else if (typeof require !== 'undefined') load(require('./intent-model-weights.js').FlowIntentWeights);
  } catch (e) { /* no weights yet: the model reports not ready and callers stay silent */ }

  return { ACTS, TOPICS, ACTIONS, FEATURE_VERSION, features, predict, load, ready, learn, setAdaptation, getAdaptation, setCommunity, getCommunity, isCommon, hash, softmax };
})();

if (typeof module !== 'undefined') module.exports = { FlowIntentModel };
