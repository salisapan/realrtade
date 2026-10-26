'use strict';
// Small L2 logistic regression. Three classes: relevant, not_relevant, unknown.
// Trained on contrast-v0 plus generate-train. contrast-heldout-v0 is never an input.
const { FEATURE_NAMES, vector } = require('./learn-features.cjs');

const CLASSES = ['relevant', 'not_relevant', 'unknown'];

function dot(w, x) {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * x[i];
  return s;
}
function softmax(z) {
  const m = Math.max.apply(null, z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function standardize(X) {
  const D = X[0].length;
  const mean = Array(D).fill(0);
  const sd = Array(D).fill(0);
  for (const row of X) for (let d = 0; d < D; d++) mean[d] += row[d];
  for (let d = 0; d < D; d++) mean[d] /= X.length;
  for (const row of X) for (let d = 0; d < D; d++) sd[d] += (row[d] - mean[d]) ** 2;
  for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d] / X.length) || 1;
  const Z = X.map((row) => row.map((v, d) => (v - mean[d]) / sd[d]));
  return { Z: Z, mean: mean, sd: sd };
}

function applyStd(x, mean, sd) {
  return x.map((v, d) => (v - mean[d]) / (sd[d] || 1));
}

function fitWeights(Z, y, l2) {
  const n = Z.length;
  const D = Z[0].length;
  const C = CLASSES.length;
  const W = Array.from({ length: C }, () => Array(D + 1).fill(0));
  const lr = 0.35;
  for (let ep = 0; ep < 700; ep++) {
    const G = W.map((row) => row.map(() => 0));
    for (let i = 0; i < n; i++) {
      const x = [1].concat(Z[i]);
      const p = softmax(W.map((w) => dot(w, x)));
      for (let c = 0; c < C; c++) {
        const err = p[c] - (y[i] === c ? 1 : 0);
        for (let d = 0; d < x.length; d++) G[c][d] += err * x[d];
      }
    }
    for (let c = 0; c < C; c++) {
      for (let d = 0; d < D + 1; d++) {
        const reg = d === 0 ? 0 : l2 * W[c][d];
        W[c][d] -= lr * (G[c][d] / n + reg);
      }
    }
  }
  return W;
}

function accuracy(Z, y, W) {
  let ok = 0;
  for (let i = 0; i < Z.length; i++) {
    const p = softmax(W.map((w) => dot(w, [1].concat(Z[i]))));
    let best = 0;
    for (let c = 1; c < p.length; c++) if (p[c] > p[best]) best = c;
    if (best === y[i]) ok++;
  }
  return ok / Z.length;
}

function train(samples) {
  const X = samples.map((s) => s.x);
  const y = samples.map((s) => CLASSES.indexOf(s.y));
  const std = standardize(X);
  const valIdx = samples.map((s, i) => (String(s.pairId).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5 === 0 ? i : -1)).filter((i) => i >= 0);
  const tr = [];
  const va = [];
  std.Z.forEach((z, i) => {
    (valIdx.indexOf(i) >= 0 ? va : tr).push({ z: z, y: y[i] });
  });
  if (!va.length) throw new Error('validation split is empty');
  let best = null;
  for (const l2 of [0.01, 0.1, 1, 10]) {
    const W = fitWeights(tr.map((r) => r.z), tr.map((r) => r.y), l2);
    const acc = accuracy(va.map((r) => r.z), va.map((r) => r.y), W);
    if (!best || acc > best.acc) best = { l2: l2, acc: acc, W: W };
  }
  const relevantW = best.W[0].slice(1);
  const ranked = FEATURE_NAMES.map((name, i) => ({ name: name, weight: +relevantW[i].toFixed(4), abs: Math.abs(relevantW[i]) }));
  ranked.sort((a, b) => b.abs - a.abs);
  return {
    classes: CLASSES,
    features: FEATURE_NAMES,
    mean: std.mean,
    sd: std.sd,
    l2: best.l2,
    valRelevanceAccuracy: +best.acc.toFixed(4),
    valN: va.length,
    trainN: tr.length,
    weights: best.W,
    ranked: ranked
  };
}

function predict(model, email, profile) {
  const x = applyStd(vector(email, profile), model.mean, model.sd);
  const p = softmax(model.weights.map((w) => dot(w, [1].concat(x))));
  let best = 0;
  for (let c = 1; c < p.length; c++) if (p[c] > p[best]) best = c;
  return { relevance: CLASSES[best], proba: p };
}

module.exports = { train, predict, CLASSES };
