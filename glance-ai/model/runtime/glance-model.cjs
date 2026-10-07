'use strict';
// JS inference for the Glance close model (no deps). Loads artifacts/<variant>.weights.json (int8 sparse linear softmax).
// predict(case) -> { label, pShow, pTop, probs }. The model can only ever answer ONE label: 'SILENT' or '<family>|<step>'.
const fs = require('fs'), path = require('path');
const { featuresOf } = require('../train/featurize.cjs');
const { preprocess } = require('../teacher/teacher.cjs');
function load(variant) {
  const p = path.join(__dirname, '..', 'artifacts', variant + '.weights.json');
  const w = JSON.parse(fs.readFileSync(p, 'utf8'));
  const K = w.classes.length;
  const dense = w.classes.map((c) => { const a = new Float32Array(w.dim); c.idx.forEach((i, j) => { a[i] = c.q[j] * c.scale; }); return a; });
  const si = w.classes.findIndex((c) => c.label === 'SILENT');
  function predict(c) {
    const x = featuresOf(Object.assign({}, c, preprocess(c))); const inv = 1 / Math.sqrt(x.length || 1);
    const z = new Float64Array(K);
    for (let k = 0; k < K; k++) { let s = w.classes[k].bias; const a = dense[k]; for (const i of x) s += a[i] * inv; z[k] = s; }
    const mx = Math.max(...z); let sum = 0; const p = Array.from(z, (v) => { const e = Math.exp(v - mx); sum += e; return e; }).map((e) => e / sum);
    let best = -1, bp = -1; for (let k = 0; k < K; k++) if (k !== si && p[k] > bp) { bp = p[k]; best = k; }
    const pShow = 1 - p[si];
    const label = pShow >= w.tau ? w.classes[best].label : 'SILENT';
    return { label, pShow, pTop: bp, top: w.classes[best].label, probs: Object.fromEntries(w.classes.map((c, k) => [c.label, p[k]])) };
  }
  return { predict, tau: w.tau, variant: w.variant, classes: w.classes.map((c) => c.label), meta: { dim: w.dim, C: w.C, trainRows: w.trainRows } };
}
module.exports = { load };
