'use strict';
// v2 JS inference (no deps): gate (binary LR) + chooser (multinomial LR), int8 sparse weights from artifacts/v2.*.weights.json.
const fs = require('fs'), path = require('path');
function loadLinear(p) {
  const w = JSON.parse(fs.readFileSync(p, 'utf8'));
  const rows = (w.rows || w.classes).map((c) => { const a = new Float32Array(w.dim); c.idx.forEach((i, j) => { a[i] = c.q[j] * c.scale; }); return { label: c.label, bias: c.bias, a }; });
  return { w, rows };
}
function load(tag) {
  tag = tag || 'v2';
  const A = path.join(__dirname, '..', 'artifacts');
  const G = loadLinear(path.join(A, tag + '.gate.weights.json')), C = loadLinear(path.join(A, tag + '.chooser.weights.json'));
  const dot = (r, x, inv) => { let s = r.bias; for (const i of x) s += r.a[i] * inv; return s; };
  function scores(x) {
    const inv = 1 / Math.sqrt(x.length || 1);
    const pShow = 1 / (1 + Math.exp(-dot(G.rows[0], x, inv)));
    const z = C.rows.map((r) => dot(r, x, inv)); const mx = Math.max(...z); let sum = 0; const e = z.map((v) => { const t = Math.exp(v - mx); sum += t; return t; });
    let k = 0; for (let i = 1; i < z.length; i++) if (z[i] > z[k]) k = i;
    return { pShow, label: C.rows[k].label, pLabel: e[k] / sum };
  }
  const tauFor = (label) => (G.w.tauPerLabel && G.w.tauPerLabel[label] != null ? G.w.tauPerLabel[label] : G.w.tau);
  return { scores, tauFor, tau: G.w.tau, tauPerLabel: G.w.tauPerLabel, classes: C.rows.map((r) => r.label), meta: { dim: G.w.dim, trainRows: G.w.trainRows } };
}
module.exports = { load };
