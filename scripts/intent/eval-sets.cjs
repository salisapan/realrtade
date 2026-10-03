#!/usr/bin/env node
// Evaluates the CURRENT shipped weights on every hand-written set and prints one table.
//   node scripts/intent/eval-sets.cjs [--json out.json]
// Sets: dev (odd rows of intent-gold.json), blind (intent-blind.json), teacher-eval (intent-teacher-eval.json,
// held-out domains, written by the teacher model after the training batches). Nothing here learns anything.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const W = require(path.join(ROOT, 'core', 'intent-model-weights.js')).FlowIntentWeights;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const RT = require(path.join(ROOT, 'core', 'request-types.js')).FlowRequestTypes;
M.load(W);
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
const gold = fx('intent-gold.json');
const sets = {
  dev: gold.filter((_, i) => i % 2 === 1),
  blind: fx('intent-blind.json'),
  teacherEval: fs.existsSync(path.join(ROOT, 'test', 'fixtures', 'intent-teacher-eval.json')) ? fx('intent-teacher-eval.json') : [],
  teacherEval2: fs.existsSync(path.join(ROOT, 'test', 'fixtures', 'intent-teacher-eval-2.json')) ? fx('intent-teacher-eval-2.json') : []
};
function prf(set, pred, cls) {
  let tp = 0, fp = 0, fn = 0;
  for (const g of set) { const p = pred(g.t); const w = g.act === cls, h = p === cls; if (w && h) tp++; else if (!w && h) fp++; else if (w && !h) fn++; }
  return { p: tp + fp ? tp / (tp + fp) : 1, r: tp + fn ? tp / (tp + fn) : 0, tp, fp, fn };
}
const lexPred = (t) => (RT.detectRequest(t) ? 'ASK' : RT.detectCommitmentSentence(t) ? 'PROMISE' : 'X');
const pipePred = (t) => { const r = P.recognize(t); return r.unsure ? 'X' : r.act; };
const out = {};
for (const [name, set] of Object.entries(sets)) {
  if (!set.length) continue;
  let ok = 0, okLang = { en: [0, 0], he: [0, 0] }, actionOk = 0, actionN = 0;
  for (const g of set) {
    const p = M.predict(g.t);
    const hit = p.act === g.act; if (hit) ok++;
    const l = g.lang === 'he' ? 'he' : 'en'; okLang[l][1]++; if (hit) okLang[l][0]++;
    if ((g.act === 'ASK' || g.act === 'PROMISE') && g.action) { actionN++; if (p.action === g.action) actionOk++; }
  }
  const r = { n: set.length, modelAccuracy: +(ok / set.length).toFixed(3), en: +(okLang.en[0] / Math.max(1, okLang.en[1])).toFixed(3), he: +(okLang.he[0] / Math.max(1, okLang.he[1])).toFixed(3) };
  if (actionN) r.actionAccuracy = +(actionOk / actionN).toFixed(3);
  for (const cls of ['ASK', 'PROMISE']) {
    const lex = prf(set, lexPred, cls), pipe = prf(set, pipePred, cls);
    r[cls] = { lexicon: { p: +lex.p.toFixed(3), r: +lex.r.toFixed(3) }, pipeline: { p: +pipe.p.toFixed(3), r: +pipe.r.toFixed(3), fp: pipe.fp, fn: pipe.fn } };
  }
  out[name] = r;
}
console.log(JSON.stringify(out, null, 1));
const i = process.argv.indexOf('--json'); if (i > -1) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
