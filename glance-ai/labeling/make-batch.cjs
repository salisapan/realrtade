'use strict';
// A blind labelling batch from the v2 test split: the generalised make-batch-003.cjs (that file stays as it was, to reproduce batch-003).
// Seeded, one case per template, no case that is already in any batch-*.json of this folder.
// Pools (the model trainer routine: half engine blind spots and shows, half silences, Hebrew and English):
//   blind-spot   reference.unsure: ask-shaped, addressed to the person, the engine silent
//   show         a reference show
//   hard-silence every silent scenario but marketing and repo
//   easy-silence marketing, repo
// Within a pool, scenarios are taken round-robin; a scenario named in --prefer comes up twice per round, so the batch leans toward
// where the previous run's systems disagreed most.
// Writes batch-NNN.json (the full record, with reference and model answers; do NOT open it before labelling) and batch-NNN.blind.jsonl
// (what the labeler sees: no reference, no engine, no model answer).
// usage (from glance-ai): node labeling/make-batch.cjs --batch 4 --size 100 --seed 4 [--prefer a,b,c] [--split he:en per pool, see SPLIT]
//   needs model/dataset/out-v2/test.jsonl (model/V23.md); model answers are read from v23/base and artifacts/v23 when present.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const HERE = __dirname, M = path.join(HERE, '..', 'model');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('batch')), SIZE = Number(arg('size', 100)), SEED = String(arg('seed', N));
if (!N) { console.error('usage: make-batch.cjs --batch N [--size 100] [--seed s] [--prefer scen,...]'); process.exit(2); }
const NNN = String(N).padStart(3, '0');
const PREFER = new Set(String(arg('prefer', '')).split(',').filter(Boolean));
// share of the batch per pool and language; rounded so the total is SIZE
const SPLIT = JSON.parse(arg('split', JSON.stringify({ 'blind-spot': { he: 0.15, en: 0.15 }, show: { he: 0.1, en: 0.1 }, 'hard-silence': { he: 0.2, en: 0.2 }, 'easy-silence': { he: 0.05, en: 0.05 } })));
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const rows = read(path.join(M, 'dataset', 'out-v2', 'test.jsonl'));
const predsOf = (p) => (fs.existsSync(p) ? Object.fromEntries(read(p).map((r) => [r.id, r.pred])) : {});
const V2 = predsOf(path.join(M, 'v23', 'base', 'base.test-preds.jsonl'));
const V23 = predsOf(path.join(M, 'artifacts', 'v23.test-preds.jsonl'));
const used = new Set();
for (const f of fs.readdirSync(HERE).filter((f) => /^batch-\d{3}\.json$/.test(f))) {
  if (f === 'batch-' + NNN + '.json') continue;
  const b = JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));
  (Array.isArray(b) ? b : b.items).forEach((i) => used.add(i.id));
}
const key = (r) => crypto.createHash('sha256').update('b' + SEED + ':' + r.id).digest('hex');
const EASY = new Set(['marketing', 'repo', 'repo-test']);
const OK = {
  'blind-spot': (r) => r.reference.unsure,
  show: (r) => !r.reference.unsure && r.reference.label !== 'SILENT',
  'hard-silence': (r) => !r.reference.unsure && r.reference.label === 'SILENT' && !EASY.has(r.scenario),
  'easy-silence': (r) => !r.reference.unsure && r.reference.label === 'SILENT' && EASY.has(r.scenario)
};
const want = {};
for (const [p, l] of Object.entries(SPLIT)) for (const [lang, s] of Object.entries(l)) want[p + ':' + lang] = Math.round(s * SIZE);
const sorted = rows.filter((r) => !used.has(r.id)).sort((a, b) => (key(a) < key(b) ? -1 : 1));
const tpl = new Set(), picked = [];
for (const p of Object.keys(SPLIT)) for (const lang of ['he', 'en']) {
  const n = want[p + ':' + lang] || 0;
  const byScen = {};
  sorted.filter((r) => r.lang === lang && OK[p](r)).forEach((r) => { (byScen[r.scenario] = byScen[r.scenario] || []).push(r); });
  const base = Object.keys(byScen).sort();
  const scen = base.concat(base.filter((s) => PREFER.has(s)));
  let k = 0, i = 0;
  while (k < n && scen.some((s) => byScen[s].length)) {
    const s = scen[i++ % scen.length]; const r = byScen[s].shift(); if (!r) continue;
    if (tpl.has(r.templateId)) continue; tpl.add(r.templateId);
    picked.push({ pool: p, r }); k++;
  }
}
const items = picked.map(({ pool, r }, i) => ({
  item: i + 1, id: r.id, pool, lang: r.lang, scenario: r.scenario, surface: r.surface, direction: r.direction,
  from: r.from, to: r.to, cc: r.cc, subject: r.subject, body: r.cleanBody || r.body, attachmentCount: r.attachmentCount,
  addressee: r.addressee, reference: r.reference, engine35: r.engine35 && r.engine35.label, v2: V2[r.id] || null, v23: V23[r.id] || null
}));
fs.writeFileSync(path.join(HERE, 'batch-' + NNN + '.json'), JSON.stringify(items, null, 1) + '\n');
fs.writeFileSync(path.join(HERE, 'batch-' + NNN + '.blind.jsonl'), items.map((x) => JSON.stringify({ item: x.item, id: x.id, lang: x.lang, surface: x.surface, direction: x.direction,
  from: x.from && x.from.email, to: x.to, cc: x.cc, subject: x.subject, attachments: x.attachmentCount, body: x.body })).join('\n') + '\n');
const c = {}; items.forEach((x) => { const k = x.pool + ':' + x.lang; c[k] = (c[k] || 0) + 1; });
console.log('batch-' + NNN, items.length, JSON.stringify(c));
