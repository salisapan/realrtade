'use strict';
// Inputs for glance-ai/oss/finetune/promote_gate.cjs from blind label sets and v2-family test predictions.
// Writes <out>/cases.jsonl (id, lang, gold.step; CONTEXT and UNSURE become AMBIGUOUS, which the gate leaves out) and, per model,
// <out>/<name>.alone.jsonl and <out>/<name>.product.jsonl (judge format; product = the rules engine of this repository + the lab
// veto first, the model only where the engine is silent, as in score-batches.cjs).
// usage (from glance-ai): node labeling/gate-inputs.cjs --out <dir> --labels labeling/batch-004.claude-labels.jsonl[,more]
//                         --models v23=model/artifacts/v23.test-preds.jsonl,v24=...
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out'); fs.mkdirSync(OUT, { recursive: true });
const labels = {}; String(arg('labels')).split(',').forEach((f) => read(path.join(G, f)).forEach((l) => { labels[l.id] = l; }));
const test = Object.fromEntries(read(path.join(G, 'model', 'dataset', 'out-v2', 'test.jsonl')).map((r) => [r.id, r]));
const eng = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const step = (label) => (!label || label === 'SILENT' ? 'SILENT' : String(label).split('|').pop());
const FAM = { task: 'task', calendar: 'calendar', draft: 'reply', file_save: 'file' };
const judge = (s) => (s === 'SILENT' ? { decision: 'silent' } : { decision: 'act', family: FAM[s] });
const ids = Object.keys(labels).filter((id) => test[id]);
fs.writeFileSync(path.join(OUT, 'cases.jsonl'), ids.map((id) => {
  const s = labels[id].step; return JSON.stringify({ id, lang: labels[id].lang, gold: { step: s === 'CONTEXT' || s === 'UNSURE' ? 'AMBIGUOUS' : s } });
}).join('\n') + '\n');
const tip = {}; ids.forEach((id) => { const r = test[id]; tip[id] = step(eng.teach(Object.assign({}, r, { body: r.cleanBody || r.body })).label); });
for (const [name, p] of String(arg('models')).split(',').map((x) => x.split('='))) {
  const P = Object.fromEntries(read(path.join(G, p)).map((r) => [r.id, r]));
  const alone = [], prod = [];
  for (const id of ids) {
    const x = P[id]; const m = step(x ? x.pred : 'SILENT');
    const e = x && (x.vb || x.vp) ? 'SILENT' : tip[id];
    alone.push(JSON.stringify({ id, pred: judge(m) })); prod.push(JSON.stringify({ id, pred: judge(e !== 'SILENT' ? e : m) }));
  }
  fs.writeFileSync(path.join(OUT, name + '.alone.jsonl'), alone.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, name + '.product.jsonl'), prod.join('\n') + '\n');
}
console.log(ids.length, 'cases');
