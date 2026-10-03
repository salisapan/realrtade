#!/usr/bin/env node
// Simulation: what does learning from OUTCOMES buy? A "missed ask" is a real ask the local engine stayed
// silent on and the person then chased by hand. We replay that on the hand-written sets: every ask in the
// DEV set (intent-gold.json) that the pipeline missed becomes one outcome label (`learn(text, ASK, rate)`),
// then we re-measure on the BLIND and TEACHER-EVAL sets, which were never labelled. Same for a second pass
// (the same kind of miss seen again). Reports precision and recall before/after for several learning rates,
// so the shipped rate is chosen by measurement, not by hope.
//   node scripts/intent/outcome-learning-sim.cjs [--json out]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
const gold = fx('intent-gold.json');
const te = fx('intent-teacher-eval.json');
// Two replays. (1) Labels come from the dev set, measured on blind + the teacher set. (2) A person's own mail
// repeats its phrasing and domain, so labels come from the EVEN rows of the teacher set (their missed asks)
// and measurement is on the ODD rows (more of the same person's mail) plus the blind set.
const streams = {
  fromDev: { labels: gold, evals: { blind: fx('intent-blind.json'), teacherEval: te } },
  fromOwnMail: { labels: te.filter((_, i) => i % 2 === 0), evals: { blind: fx('intent-blind.json'), sameMailHeldOut: te.filter((_, i) => i % 2 === 1) } }
};
function prf(set, cls) {
  let tp = 0, fp = 0, fn = 0;
  for (const g of set) { const r = P.recognize(g.t); const p = r.unsure ? 'X' : r.act; const w = g.act === cls, h = p === cls; if (w && h) tp++; else if (!w && h) fp++; else if (w && !h) fn++; }
  return { p: +(tp / (tp + fp || 1)).toFixed(3), r: +(tp / (tp + fn || 1)).toFixed(3), fp, fn };
}
const out = {};
for (const [name, st] of Object.entries(streams)) {
  const snapshot = () => { const o = {}; for (const [k, set] of Object.entries(st.evals)) o[k] = { ASK: prf(set, 'ASK'), PROMISE: prf(set, 'PROMISE') }; return o; };
  M.setAdaptation({});
  const before = snapshot();
  const missed = st.labels.filter((g) => { if (g.act !== 'ASK') return false; const r = P.recognize(g.t); return r.unsure || r.act !== 'ASK'; });
  const rec = { missedAsksUsedAsLabels: missed.length, before, rates: {} };
  for (const rate of [1, 4, 10, 25]) {
    M.setAdaptation({});
    const row = {};
    for (let pass = 1; pass <= 2; pass++) { missed.forEach((g) => M.learn(g.t, 'act', 'ASK', rate)); row['pass' + pass] = snapshot(); }
    rec.rates[rate] = row;
  }
  out[name] = rec;
}
M.setAdaptation({});
console.log(JSON.stringify(out, null, 1));
const j = process.argv.indexOf('--json'); if (j > -1) fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
