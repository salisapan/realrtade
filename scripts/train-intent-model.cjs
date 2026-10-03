#!/usr/bin/env node
// Trains the on-device intent model and writes core/intent-model-weights.js.
//
//   node scripts/train-intent-model.cjs [--en 16000] [--he 12000] [--seed 11] [--models 4] [--rep 10] [--no-teacher]
//
// Training data is generated (scripts/intent/generate.cjs) plus, unless --no-teacher, the teacher-authored
// sentences in scripts/intent/teacher-train.json (written by hand by a large model, not from the grammar),
// each repeated --rep times with light augmentation (case, punctuation, a greeting). The hand-written
// evaluation sets (flow-trial-extension/test/fixtures/) are never used to learn
// weights. The EVEN rows of the dev set (intent-gold.json) set one number, the
// softmax temperature (how much to trust the model's own confidence); its ODD
// rows and the whole blind set (intent-blind.json) are the honest evaluation.
// Results go to docs/intent-model-metrics.json.
const fs = require('fs');
const path = require('path');
const { makeGenerator } = require('./intent/generate.cjs');
const ROOT = path.join(__dirname, '..', 'flow-trial-extension');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const DP = (() => { try { return require(path.join(ROOT, 'core', 'dense-prior.js')).FlowDensePrior; } catch (e) { return null; } })();
// The pretrained English prior is OPT-IN (--dense): measured at +0.8 points in the shipped pipeline, not worth 1 MB (docs/ai-engine-upgrade.md).
const USE_DENSE = Boolean(DP && DP.ready()) && process.argv.includes('--dense');
const DD = USE_DENSE ? DP.DIM() : 0;

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const N_EN = arg('en', 16000), N_HE = arg('he', 12000), SEED = arg('seed', 11), EPOCHS = arg('epochs', 10);
const MODELS = arg('models', 4);
const DIM = 16384;
const REP = arg('rep', 10);
const TEACHER_FILE = path.join(__dirname, 'intent', 'teacher-train.json');
const USE_TEACHER = !process.argv.includes('--no-teacher') && fs.existsSync(TEACHER_FILE);
const TEACHER = USE_TEACHER ? JSON.parse(fs.readFileSync(TEACHER_FILE, 'utf8')) : [];

// Light, label-preserving variations so a repeated sentence is not seen identically every time.
function augment(row, k, rnd) {
  const t = row.t;
  if (k === 0) return t;
  const he = row.lang === 'he';
  const variants = [
    () => t.replace(/[.!]+$/, ''),
    () => t.toLowerCase().replace(/[,.!]+/g, ''),
    () => (he ? 'היי, ' : 'Hi, ') + t.charAt(0).toLowerCase() + t.slice(1),
    () => t.replace(/[\u2019']/g, ''),
    () => (he ? 'שלום, ' : 'Hello, ') + t,
    () => t.replace(/\s+/g, ' ').replace(/,/g, '')
  ];
  return variants[Math.floor(rnd() * variants.length)]();
}
const ACTS = M.ACTS, ACTIONS = M.ACTIONS;

let data, idx, ya, yc, dvec;
function prepare(seed) {
  data = makeGenerator(seed).dataset(N_EN, N_HE);
  let rs = seed * 7919 + 3;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  for (const row of TEACHER) for (let k = 0; k < REP; k++) data.push({ t: augment(row, k, rnd), act: row.act, action: row.action });
  idx = data.map((d) => M.features(d.t, DIM));
  dvec = USE_DENSE ? data.map((d) => DP.vector(d.t)) : null;
  ya = data.map((d) => ACTS.indexOf(d.act));
  yc = data.map((d) => Math.max(0, ACTIONS.indexOf(d.action || 'none')));
}

function trainHead(y, K, label, seedOffset) {
  const W = []; for (let c = 0; c < K; c++) W.push(new Float32Array(DIM));
  const G = []; for (let c = 0; c < K; c++) G.push(new Float32Array(DIM).fill(1e-6));
  const b = new Float32Array(K);
  const Wd = []; const Gd = [];
  for (let c = 0; c < K; c++) { Wd.push(new Float32Array(DD)); Gd.push(new Float32Array(DD).fill(1e-6)); }
  const lr = 0.35, l2 = 2e-6;
  const order = data.map((_, i) => i);
  let seed = (SEED + (seedOffset || 0)) * 977;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let ep = 0; ep < EPOCHS; ep++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    let loss = 0, correct = 0;
    for (const n of order) {
      const f = idx[n];
      const z = new Array(K);
      const dv = USE_DENSE ? dvec[n] : null;
      for (let c = 0; c < K; c++) { let s = b[c]; for (const k of f) s += W[c][k]; if (dv) for (let j = 0; j < DD; j++) s += Wd[c][j] * dv[j]; z[c] = s; }
      const p = M.softmax(z, 1);
      loss -= Math.log(Math.max(p[y[n]], 1e-9));
      let best = 0; for (let c = 1; c < K; c++) if (p[c] > p[best]) best = c;
      if (best === y[n]) correct++;
      for (let c = 0; c < K; c++) {
        const g = p[c] - (c === y[n] ? 1 : 0);
        if (Math.abs(g) < 1e-4) continue;
        b[c] -= 0.05 * g;
        if (dv) for (let j = 0; j < DD; j++) { const gj = g * dv[j]; Gd[c][j] += gj * gj; Wd[c][j] -= lr * gj / Math.sqrt(Gd[c][j]); }
        for (const k of f) {
          const gg = g + l2 * W[c][k];
          G[c][k] += gg * gg;
          W[c][k] -= lr * gg / Math.sqrt(G[c][k]);
        }
      }
    }
    if (ep === EPOCHS - 1) console.log(label, 'final epoch loss', (loss / order.length).toFixed(4), 'train acc', (correct / order.length).toFixed(4));
  }
  return { W, b, Wd };
}

function quantize(head) {
  const K = head.W.length;
  const buf = Buffer.alloc(K * DIM);
  const scale = [];
  for (let c = 0; c < K; c++) {
    let m = 0; for (let i = 0; i < DIM; i++) m = Math.max(m, Math.abs(head.W[c][i]));
    const s = m / 127 || 1; scale.push(Number(s.toFixed(6)));
    for (let i = 0; i < DIM; i++) { let v = Math.round(head.W[c][i] / s); v = Math.max(-127, Math.min(127, v)); buf[c * DIM + i] = v < 0 ? v + 256 : v; }
  }
  return { scale, bias: Array.from(head.b).map((x) => Number(x.toFixed(4))), b64: buf.toString('base64') };
}

// A bag of models: each trained on its own generated dataset (different seed),
// weights averaged. Averaging cuts the run-to-run variance of any single fit.
function average(list) {
  const K = list[0].W.length, out = { W: [], b: new Float32Array(K), Wd: [] };
  for (let c = 0; c < K; c++) {
    const row = new Float32Array(DIM);
    for (const m of list) for (let i = 0; i < DIM; i++) row[i] += m.W[c][i] / list.length;
    out.W.push(row);
    for (const m of list) out.b[c] += m.b[c] / list.length;
    const dr = new Float32Array(DD);
    for (const m of list) for (let j = 0; j < DD; j++) dr[j] += m.Wd[c][j] / list.length;
    out.Wd.push(dr);
  }
  return out;
}
const acts = [], actions = [];
for (let k = 0; k < MODELS; k++) {
  console.log('--- model', k + 1, 'of', MODELS, '(seed', SEED + k * 101, ') ---');
  prepare(SEED + k * 101);
  acts.push(trainHead(ya, ACTS.length, 'act', k * 13));
  actions.push(trainHead(yc, ACTIONS.length, 'action', k * 13));
}
const act = average(acts), action = average(actions);
const denseOut = (h) => h.Wd.map((row) => Array.from(row, (x) => Number(x.toFixed(4))));
const weights = { version: M.FEATURE_VERSION, dim: DIM, temp: 1, trainedOn: { seed: SEED, models: MODELS, en: N_EN, he: N_HE, epochs: EPOCHS, teacher: TEACHER.length, teacherRep: USE_TEACHER ? REP : 0, dense: USE_DENSE }, act: quantize(act), action: quantize(action) };
if (USE_DENSE) weights.dense = { dim: DD, scale: DP.SCALE, source: 'core/dense-prior.js', act: denseOut(act), action: denseOut(action) };

// ---- evaluation on the hand-written sets (never trained on) --------------------
M.load(weights);
const gold = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'intent-gold.json'), 'utf8'));
const blind = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'intent-blind.json'), 'utf8'));
const calib = gold.filter((_, i) => i % 2 === 0), evalSet = gold.filter((_, i) => i % 2 === 1);

function nll(set, temp) {
  weights.temp = temp; M.load(weights);
  let s = 0;
  for (const g of set) { const p = M.predict(g.t); s -= Math.log(Math.max((p.probs[g.act] || 1e-6), 1e-6)); }
  return s / set.length;
}
let bestT = 1, bestL = Infinity;
for (let t = 0.6; t <= 4.01; t += 0.1) { const l = nll(calib, t); if (l < bestL) { bestL = l; bestT = t; } }
weights.temp = Number(bestT.toFixed(2)); M.load(weights);
console.log('temperature', weights.temp);

function evaluate(set) {
  const conf = {}; ACTS.forEach((a) => { conf[a] = {}; ACTS.forEach((b) => { conf[a][b] = 0; }); });
  let ok = 0;
  const wrong = [];
  for (const g of set) {
    const p = M.predict(g.t);
    conf[g.act][p.act]++;
    if (p.act === g.act) ok++; else wrong.push({ t: g.t, want: g.act, got: p.act, p: Number(p.actProb.toFixed(2)) });
  }
  const per = {};
  ACTS.forEach((a) => {
    const tp = conf[a][a]; const fp = ACTS.reduce((n, b) => n + (b === a ? 0 : conf[b][a]), 0); const fn = ACTS.reduce((n, b) => n + (b === a ? 0 : conf[a][b]), 0);
    per[a] = { precision: tp + fp ? Number((tp / (tp + fp)).toFixed(3)) : null, recall: tp + fn ? Number((tp / (tp + fn)).toFixed(3)) : null, n: tp + fn };
  });
  return { n: set.length, accuracy: Number((ok / set.length).toFixed(3)), per, confusion: conf, wrong: wrong.slice(0, 40) };
}

// The tiered pipeline against the word lists alone, on both hand-written sets.
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const RT = require(path.join(ROOT, 'core', 'request-types.js')).FlowRequestTypes;
function prf(set, pred) {
  const r = { ASK: [0, 0, 0], PROMISE: [0, 0, 0] };
  for (const g of set) { const p = pred(g.t); for (const a of ['ASK', 'PROMISE']) { const w = g.act === a, h = p === a; if (w && h) r[a][0]++; else if (!w && h) r[a][1]++; else if (w && !h) r[a][2]++; } }
  const o = {}; for (const a of ['ASK', 'PROMISE']) { const [tp, fp, fn] = r[a]; o[a] = { precision: Number((tp / (tp + fp || 1)).toFixed(3)), recall: Number((tp / (tp + fn || 1)).toFixed(3)), tp, fp, fn }; }
  return o;
}
const lexPred = (t) => (RT.detectRequest(t) ? 'ASK' : RT.detectCommitmentSentence(t) ? 'PROMISE' : 'X');
const pipePred = (t) => { const r = P.recognize(t); return r.unsure ? 'X' : r.act; };
const comparison = { devSet: { n: gold.length, lexicon: prf(gold, lexPred), pipeline: prf(gold, pipePred) }, blindSet: { n: blind.length, lexicon: prf(blind, lexPred), pipeline: prf(blind, pipePred) } };
// The number the local-first rule needs: of the real asks and promises, how many our own
// code solved, how many it left to the long tail (the only class an external model could
// ever see; today they stay silent), and how many wrong cards it raised. Remote share is 0:
// no external model is consulted.
function localShare(c) {
  const out = {};
  ['ASK', 'PROMISE'].forEach((k) => {
    const x = c.pipeline[k]; const real = x.tp + x.fn;
    out[k] = { real, solvedLocally: x.tp, solvedShare: real ? Math.round((x.tp / real) * 1000) / 1000 : 0, residual: x.fn, residualShare: real ? Math.round((x.fn / real) * 1000) / 1000 : 0, wrongCards: x.fp, remoteShare: 0 };
  });
  return out;
}
comparison.devSet.localShare = localShare(comparison.devSet);
comparison.blindSet.localShare = localShare(comparison.blindSet);
console.log('blind set  lexicon', JSON.stringify(comparison.blindSet.lexicon), '\n           pipeline', JSON.stringify(comparison.blindSet.pipeline));
const TE_FILE = path.join(ROOT, 'test', 'fixtures', 'intent-teacher-eval.json');
const teacherEvalSet = fs.existsSync(TE_FILE) ? JSON.parse(fs.readFileSync(TE_FILE, 'utf8')) : [];
if (teacherEvalSet.length) { comparison.teacherEvalSet = { n: teacherEvalSet.length, lexicon: prf(teacherEvalSet, lexPred), pipeline: prf(teacherEvalSet, pipePred) }; comparison.teacherEvalSet.localShare = localShare(comparison.teacherEvalSet); }
const report = { comparison, generatedAt: new Date().toISOString().slice(0, 10), config: weights.trainedOn, temperature: weights.temp, devHeldOut: evaluate(evalSet), dev: evaluate(gold), blind: evaluate(blind), teacherEval: teacherEvalSet.length ? evaluate(teacherEvalSet) : null };
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'intent-model-metrics.json'), JSON.stringify(report, null, 1));
console.log('held-out dev accuracy', report.devHeldOut.accuracy, '| blind act accuracy', report.blind.accuracy);

const out = '// GENERATED by scripts/train-intent-model.cjs. Do not edit by hand.\n' +
  '// Weights for core/intent-model.js: int8, per-class scale. Trained on generated data only.\n' +
  'const FlowIntentWeights = ' + JSON.stringify(weights, (k, v) => (k[0] === '_' ? undefined : v)) + ';\n' +
  "if (typeof module !== 'undefined') module.exports = { FlowIntentWeights };\n";
fs.writeFileSync(path.join(ROOT, 'core', 'intent-model-weights.js'), out);
console.log('wrote core/intent-model-weights.js', (out.length / 1024).toFixed(0) + ' KB');
