'use strict';
// v2.1 JS inference (no deps): gate (binary LR) + chooser (multinomial LR), int8 sparse weights from artifacts/<tag>.*.weights.json
// (or the packed binary from runtime/pack-weights-v21.cjs). Thresholds: tau per label@shape (shape = bare|mail from
// train/featurize-v21.cjs shapeOf), then a chooser confidence floor (abstain when unsure WHICH action).
const fs = require('fs'), path = require('path');
function fromJson(p) {
  const w = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { w, rows: (w.rows || w.classes).map((c) => { const a = new Float32Array(w.dim); c.idx.forEach((i, j) => { a[i] = c.q[j] * c.scale; }); return { label: c.label, bias: c.bias, a }; }) };
}
function load(tag, opt) {
  tag = tag || 'v21'; opt = opt || {};
  const A = path.join(__dirname, '..', 'artifacts');
  const G = opt.gate || fromJson(path.join(A, tag + '.gate.weights.json')), C = opt.chooser || fromJson(path.join(A, tag + '.chooser.weights.json'));
  const dot = (r, x, inv) => { let s = r.bias; for (const i of x) s += r.a[i] * inv; return s; };
  function scores(x) {
    const inv = 1 / Math.sqrt(x.length || 1);
    const pShow = 1 / (1 + Math.exp(-dot(G.rows[0], x, inv)));
    const z = C.rows.map((r) => dot(r, x, inv)); const mx = Math.max(...z); let sum = 0; const e = z.map((v) => { const t = Math.exp(v - mx); sum += t; return t; });
    let k = 0; for (let i = 1; i < z.length; i++) if (z[i] > z[k]) k = i;
    const step = (l) => l.split('|')[1]; let pStep = 0; C.rows.forEach((r, i) => { if (step(r.label) === step(C.rows[k].label)) pStep += e[i] / sum; });
    return { pShow, label: C.rows[k].label, pLabel: e[k] / sum, pStep };
  }
  const T = G.w.tauPerLabel || {};
  const tauFor = (label, shape) => (T[label + '@' + (shape || 'mail')] != null ? T[label + '@' + (shape || 'mail')] : (T[label] != null ? T[label] : G.w.tau));
  const floor = G.w.chooserFloor || { kind: 'none', value: 0 };
  const floorOk = (s) => floor.kind === 'none' || (floor.kind === 'label' ? s.pLabel : s.pStep) >= floor.value;
  return { scores, tauFor, floorOk, floor, tau: G.w.tau, tauPerLabel: T, classes: C.rows.map((r) => r.label), meta: { dim: G.w.dim, trainRows: G.w.trainRows } };
}
module.exports = { load, fromJson };
