// Case files for the teacher (plan 2, Phase D on CPU). Writes JSONL rows {id, lang, surface, direction, from, subject, body, attachments} for teacher/label.py.
//   node teacher/make-cases.cjs sample --n 10000 --out labeling/teacher/sample-10k.cases.jsonl   TRAINING rows: synthetic only (never a real-origin sentence), inbound, the train split,
//        stratified round-robin over scenario x language, deterministic; excludes every frozen, hold-out and sealed text and the 320 rows the first teacher pass already labelled.
//        Also writes <out>.meta.jsonl with the reference step of each row (used to find disagreements to escalate).
//   node teacher/make-cases.cjs sealed --out labeling/sealed/batch-009.cases.jsonl   the sealed batch, for the one-time frontier baseline (see sealed/README.md)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const mode = process.argv[2], OUT = arg('out');
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
const caseOf = (r, id) => ({ id, lang: r.lang, surface: r.surface, direction: r.direction, from: r.from, subject: r.subject || '', body: r.cleanBody || r.body, attachments: r.attachmentCount || r.attachments || 0 });
if (mode === 'sealed') {
  const rows = read(path.join(G, 'labeling', 'sealed', 'batch-009.blind.jsonl'));
  fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(caseOf(r, 'b009-' + r.item))).join('\n') + '\n'); console.log(rows.length, 'sealed cases');
} else if (mode === 'sample') {
  const N = +arg('n', 10000);
  const block = new Set();
  for (const r of read(path.join(G, 'labeling', 'frozen-eval.jsonl'))) block.add(norm(r.body));
  for (const r of read(path.join(G, 'labeling', 'sealed', 'batch-009.blind.jsonl'))) block.add(norm(r.body));
  const prior = new Set(read(path.join(G, 'labeling', 'teacher-labels.jsonl')).map((r) => r.id));
  const rows = read(path.join(G, 'model', 'dataset', 'out-v2', 'train.jsonl')).filter((r) => r.direction === 'inbound' && String(r.provenance || '').startsWith('synthetic') && !prior.has(r.id) && !block.has(norm(r.body)) && !block.has(norm(r.cleanBody)));
  const h = (s) => parseInt(crypto.createHash('sha256').update('t10k:' + s).digest('hex').slice(0, 8), 16);
  const by = {}; for (const r of rows.sort((a, b) => h(a.id) - h(b.id))) { const k = r.scenario + '|' + r.lang; (by[k] = by[k] || []).push(r); }
  const keys = Object.keys(by).sort(), pick = [], seen = new Set();
  for (let round = 0; pick.length < N && round < 2000; round++) for (const k of keys) { const r = by[k][round]; if (r && !seen.has(norm(r.cleanBody)) && pick.length < N) { seen.add(norm(r.cleanBody)); pick.push(r); } }
  fs.writeFileSync(OUT, pick.map((r) => JSON.stringify(caseOf(r, r.id))).join('\n') + '\n');
  fs.writeFileSync(OUT.replace(/\.jsonl$/, '') + '.meta.jsonl', pick.map((r) => JSON.stringify({ id: r.id, scenario: r.scenario, lang: r.lang, ref: r.reference ? r.reference.label : null })).join('\n') + '\n');
  console.log(pick.length, 'rows from', rows.length, 'eligible,', keys.length, 'strata');
} else { console.error('usage: make-cases.cjs sample|sealed --out file [--n 10000]'); process.exit(2); }
