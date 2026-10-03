#!/usr/bin/env node
// Evaluates the shipped engine on a set of REAL sentences from the owner's own sent mail.
//   node scripts/intent/human-eval.cjs [--json out.json] [--errors]
// The sentences live in flow-trial-extension/test/fixtures/private/human-eval.tsv (gitignored: masked, but still the
// owner's mail, so it never goes to git). Row format: ACT<TAB>clear|borderline<TAB>lang<TAB>sentence.
// The text is human-written; the LABELS were assigned by a model and have not been checked by the owner. Only the
// aggregate numbers (printed, or written with --json) are safe to quote or commit; --errors prints sentences locally.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const FILE = path.join(ROOT, 'test', 'fixtures', 'private', process.argv.includes('--blind') ? 'human-blind.tsv' : 'human-eval.tsv');
if (!fs.existsSync(FILE)) { console.log('no private human-eval set on this machine; nothing to measure'); process.exit(0); }
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const W = require(path.join(ROOT, 'core', 'intent-model-weights.js')).FlowIntentWeights;
const P = require(path.join(ROOT, 'core', 'intent-pipeline.js')).FlowIntentPipeline;
const RT = require(path.join(ROOT, 'core', 'request-types.js')).FlowRequestTypes;
M.load(W);
const rows = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => { const [act, conf, lang, t] = l.split('\t'); return { act, conf, lang, t }; });
const wilson = (k, n) => { if (!n) return [0, 1]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), a = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [+((c - a) / d).toFixed(2), +((c + a) / d).toFixed(2)]; };
const pipePred = (t) => { const r = P.recognize(t); return r.unsure ? 'X' : r.act; };
const lexPred = (t) => (RT.detectRequest(t) ? 'ASK' : RT.detectCommitmentSentence(t) ? 'PROMISE' : 'X');
function prf(set, pred, cls) {
  let tp = 0, fp = 0, fn = 0; const errs = [];
  for (const g of set) { const p = pred(g.t), w = g.act === cls, h = p === cls; if (w && h) tp++; else if (!w && h) { fp++; errs.push(['FP', g.t]); } else if (w && !h) { fn++; errs.push(['FN', g.t]); } }
  return { n: tp + fn, tp, fp, fn, precision: tp + fp ? +(tp / (tp + fp)).toFixed(3) : null, recall: tp + fn ? +(tp / (tp + fn)).toFixed(3) : null, recallCI95: wilson(tp, tp + fn), precisionCI95: wilson(tp, tp + fp), errs };
}
const out = { sentences: rows.length, byAct: {}, subsets: {} };
for (const r of rows) out.byAct[r.act] = (out.byAct[r.act] || 0) + 1;
const subsets = { all: rows, clearOnly: rows.filter((r) => r.conf === 'clear'), hebrew: rows.filter((r) => r.lang === 'he'), english: rows.filter((r) => r.lang === 'en') };
const showErrors = process.argv.includes('--errors');
for (const [name, set] of Object.entries(subsets)) {
  out.subsets[name] = { n: set.length };
  for (const cls of ['ASK', 'PROMISE']) {
    const lex = prf(set, lexPred, cls), pipe = prf(set, pipePred, cls);
    out.subsets[name][cls] = { lexicon: { p: lex.precision, r: lex.recall }, pipeline: { tp: pipe.tp, fp: pipe.fp, fn: pipe.fn, precision: pipe.precision, recall: pipe.recall, precisionCI95: pipe.precisionCI95, recallCI95: pipe.recallCI95 } };
    if (showErrors && name === 'all') for (const [k, t] of pipe.errs) console.log(cls, k, '|', t);
  }
}
console.log(JSON.stringify(out, null, 1));
const i = process.argv.indexOf('--json'); if (i > -1) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
