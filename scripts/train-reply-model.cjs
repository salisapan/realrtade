#!/usr/bin/env node
// Trains core/reply-model-weights.js from scripts/reply/replies-train.json and measures it on scripts/reply/replies-eval.json
// (written separately, never trained on). Run: node scripts/train-reply-model.cjs   (after python3 scripts/reply/build.py)
// Method: hashed word and word-pair softmax regression, three seeds averaged, L2, int8 weights. The temperature is fitted on a
// 20% slice of the TRAINING data held out for that, never on the evaluation set.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'flow-trial-extension', 'core', 'reply-model.js')).FlowReplyModel;
const train = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'reply', 'replies-train.json'), 'utf8'));
const evalSet = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'reply', 'replies-eval.json'), 'utf8'));
const evalSet2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'reply', 'replies-eval2.json'), 'utf8'));
const DIM = 4096, K = M.CLASSES.length;
let seedState = 1;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const prep = (rows) => rows.map((r) => ({ f: M.features(r.t, DIM), y: M.CLASSES.indexOf(r.c), r }));
function fit(rows, seed, epochs) {
  seedState = seed;
  const W = Array.from({ length: K }, () => new Float64Array(DIM));
  const data = prep(rows);
  for (let ep = 0; ep < epochs; ep++) {
    const lr = 0.4 / (1 + ep * 0.15);
    shuffle(data);
    for (const d of data) {
      const z = new Array(K).fill(0);
      for (const i of d.f) for (let k = 0; k < K; k++) z[k] += W[k][i];
      const m = Math.max(...z); const e = z.map((v) => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0);
      for (let k = 0; k < K; k++) { const g = e[k] / s - (k === d.y ? 1 : 0); for (const i of d.f) W[k][i] -= lr * (g + 0.0005 * W[k][i]); }
    }
  }
  return W;
}
function avg(Ws) { return Ws[0].map((_, k) => { const o = new Float64Array(DIM); Ws.forEach((W) => { for (let i = 0; i < DIM; i++) o[i] += W[k][i] / Ws.length; }); return o; }); }
function weightsObj(W, temperature) {
  let mx = 0; W.forEach((r) => r.forEach((v) => { mx = Math.max(mx, Math.abs(v)); }));
  const scale = mx / 127 || 1;
  return { dim: DIM, scale, temperature, W: W.map((r) => Array.from(r, (v) => Math.round(v / scale))), b: new Array(K).fill(0) };
}
const logloss = (w, rows) => { M.load(w); let s = 0; rows.forEach((r) => { s += -Math.log(Math.max(1e-9, M.predict(r.t).probs[r.c])); }); return s / rows.length; };

// temperature on a held-out slice of the training data
const shuffled = shuffle(train.slice());
const cut = Math.floor(shuffled.length * 0.8);
const sub = shuffled.slice(0, cut), hold = shuffled.slice(cut);
const Wsub = avg([1, 2, 3].map((s) => fit(sub, s * 101, 30)));
let bestT = 1, bestL = Infinity;
for (const T of [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4]) { const l = logloss(weightsObj(Wsub, T), hold); if (l < bestL) { bestL = l; bestT = T; } }
const Wall = avg([1, 2, 3].map((s) => fit(train, s * 211, 30)));
const out = weightsObj(Wall, bestT);
M.load(out);

function report(name, rows) {
  const conf = {}; let ok = 0;
  rows.forEach((r) => { const p = M.predict(r.t); if (p.cls === r.c) ok++; conf[r.c + '>' + p.cls] = (conf[r.c + '>' + p.cls] || 0) + 1; });
  // the decisions callers make: confident "answer" (>=0.85), confident "not an answer" (INTERIM+ACK+OTHER >= 0.85)
  let ansTP = 0, ansFP = 0, ansN = 0, notTP = 0, notFP = 0, notN = 0, fpList = [];
  rows.forEach((r) => {
    const p = M.predict(r.t);
    const notP = p.probs.INTERIM + p.probs.ACK + p.probs.OTHER;
    const isAns = r.c === 'ANSWERED' || r.c === 'DECLINED';
    if (p.probs.ANSWERED >= 0.85) { ansN++; if (r.c === 'ANSWERED') ansTP++; else { ansFP++; fpList.push(['said answer', r.c, r.t]); } }
    if (notP >= 0.85) { notN++; if (!isAns && r.c !== 'HANDBACK') notTP++; else { notFP++; fpList.push(['said not-answer', r.c, r.t]); } }
  });
  console.log(name, 'n=' + rows.length, 'accuracy', (ok / rows.length).toFixed(3),
    '| confident ANSWERED:', ansN, 'precision', ansN ? (ansTP / ansN).toFixed(3) : '-',
    '| confident NOT-AN-ANSWER:', notN, 'precision', notN ? (notTP / notN).toFixed(3) : '-');
  return { n: rows.length, accuracy: +(ok / rows.length).toFixed(3), answered: { n: ansN, precision: ansN ? +(ansTP / ansN).toFixed(3) : null }, notAnswer: { n: notN, precision: notN ? +(notTP / notN).toFixed(3) : null }, errors: fpList, confusion: conf };
}
console.log('temperature', bestT);
const tr = report('train', train.slice(0, 400));
const ev = report('EVAL (held out; its errors guided the second data bank, so no longer blind)', evalSet);
const ev2 = report('EVAL2 (written after, never looked at while training)', evalSet2);
const byLang = {};
['en', 'he'].forEach((l) => { byLang[l] = report('EVAL ' + l, evalSet.filter((r) => r.lang === l)); });
fs.writeFileSync(path.join(ROOT, 'flow-trial-extension', 'core', 'reply-model-weights.js'),
  '// GENERATED by scripts/train-reply-model.cjs. Do not edit by hand.\nconst FlowReplyWeights = ' + JSON.stringify(out) + ';\n\nif (typeof module !== \'undefined\') module.exports = { FlowReplyWeights };\n');
fs.writeFileSync(path.join(ROOT, 'docs', 'reply-model-metrics.json'), JSON.stringify({ temperature: bestT, trainRows: train.length, eval2: { n: ev2.n, accuracy: ev2.accuracy, answered: ev2.answered, notAnswer: ev2.notAnswer, errors: ev2.errors }, eval: { n: ev.n, accuracy: ev.accuracy, answered: ev.answered, notAnswer: ev.notAnswer, errors: ev.errors, confusion: ev.confusion }, byLanguage: { en: { accuracy: byLang.en.accuracy, answered: byLang.en.answered, notAnswer: byLang.en.notAnswer }, he: { accuracy: byLang.he.accuracy, answered: byLang.he.answered, notAnswer: byLang.he.notAnswer } } }, null, 1));
const sz = fs.statSync(path.join(ROOT, 'flow-trial-extension', 'core', 'reply-model-weights.js')).size;
console.log('wrote core/reply-model-weights.js', Math.round(sz / 1024) + ' KB');
console.log('EVAL2 errors that matter:'); ev2.errors.forEach((e) => console.log('  ', e[0], '| gold', e[1], '|', e[2]));
