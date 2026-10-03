// A pretrained dense word-vector prior for the intent model — portable, no chrome.*, no DOM, no network.
//
// The n-gram model only knows the words it was trained on. A sentence phrased with a word it never saw
// ("ping", "pop in", "heads up") gets no help from its neighbours. Pretrained word vectors carry general
// knowledge of which words are used alike, learned from billions of words of text, so an unseen word can
// borrow from a seen one. The sentence vector here is the average of its words' vectors (unit length), and
// the model gives it its own learned weights next to the n-gram features (core/intent-model.js).
//
// English only: the table is GloVe (public domain), 20,000 words, projected to 32 dimensions and quantised.
// Hebrew sentences get a zero vector and are handled exactly as before. When the data file is absent the
// prior is simply not ready and the model behaves as it did without it.
const FlowDensePrior = (() => {
  const data = typeof FlowDensePriorData !== 'undefined' ? FlowDensePriorData : (typeof require !== 'undefined' ? (() => { try { return require('./dense-prior-data.js').FlowDensePriorData; } catch (e) { return null; } })() : null);
  const SCALE = 3;                         // how loudly the dense part speaks next to the n-grams (chosen by measurement)
  let index = null, vecs = null, dim = 0;

  function init() {
    if (index || !data) return;
    dim = data.dim;
    const words = data.words.split(' ');
    const raw = typeof Buffer !== 'undefined' ? Buffer.from(data.b64, 'base64') : Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
    vecs = new Float32Array(words.length * dim);
    for (let i = 0; i < vecs.length; i++) { const v = raw[i]; vecs[i] = (v > 127 ? v - 256 : v) / data.scale; }
    index = new Map();
    words.forEach((w, i) => index.set(w, i));
  }

  const ready = () => { init(); return Boolean(index); };
  const DIM = () => { init(); return dim; };

  // text -> Float32Array(dim), the unit-length mean of the known words' vectors times SCALE (zeros if none).
  function vector(text) {
    init();
    const out = new Float32Array(dim || 0);
    if (!index) return out;
    const toks = String(text || '').toLowerCase().replace(/['’]/g, '').match(/[a-z]+/g) || [];
    let n = 0;
    for (const t of toks) {
      const i = index.get(t);
      if (i === undefined) continue;
      for (let j = 0; j < dim; j++) out[j] += vecs[i * dim + j];
      n++;
    }
    if (!n) return out;
    let norm = 0;
    for (let j = 0; j < dim; j++) norm += out[j] * out[j];
    norm = Math.sqrt(norm) + 1e-6;
    for (let j = 0; j < dim; j++) out[j] = (out[j] / norm) * SCALE;
    return out;
  }

  return { ready, DIM, vector, SCALE };
})();

if (typeof module !== 'undefined') module.exports = { FlowDensePrior };
