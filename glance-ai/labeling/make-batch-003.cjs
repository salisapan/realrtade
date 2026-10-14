'use strict';
// Batch-003: 200 synthetic cases from the v2 test split for an independent label pass, then the owner's check on disagreements only.
// Stratified, seeded, one case per template, none from batch-001 or batch-002:
//   60 engine blind spots (reference.unsure: ask-shaped, addressed to the person, the engine silent), 40 Hebrew / 20 English
//   60 reference shows, 30 / 30
//   70 harder silences (every silent scenario but marketing and repo, round-robin: hedge, negation, past, cancelled, FYI, own promise, ...), 35 / 35
//   10 easy silences (marketing, repo), 5 / 5
// Writes batch-003.json (the full record, with reference and model answers) and batch-003.blind.jsonl (what a labeler sees: no
// reference, no engine, no model answer, so the labels are independent of them).
// usage (from glance-ai): node labeling/make-batch-003.cjs   (needs model/dataset/out-v2/test.jsonl; see model/V23.md)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const HERE = __dirname, M = path.join(HERE, '..', 'model');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const rows = read(path.join(M, 'dataset', 'out-v2', 'test.jsonl'));
const predsOf = (p) => (fs.existsSync(p) ? Object.fromEntries(read(p).map((r) => [r.id, r.pred])) : {});
const V2 = predsOf(path.join(M, 'v23', 'base', 'base.test-preds.jsonl'));
const V23 = predsOf(path.join(M, 'artifacts', 'v23.test-preds.jsonl'));
const used = new Set();
for (const f of ['batch-001.json', 'batch-002.json']) { const b = JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')); (Array.isArray(b) ? b : b.items).forEach((i) => used.add(i.id)); }
const key = (r) => crypto.createHash('sha256').update('b003:' + r.id).digest('hex');
const HARD = new Set(['hedge', 'negation', 'past', 'cancelled', 'conditional', 'third_party', 'fyi', 'own_commitment_self', 'injection', 'quoted_forward', 'ack', 'ooo']);
const EASY = new Set(['marketing', 'repo', 'repo-test']);
const pools = [
  { name: 'blind-spot', n: { he: 40, en: 20 }, ok: (r) => r.reference.unsure },
  { name: 'show', n: { he: 30, en: 30 }, ok: (r) => !r.reference.unsure && r.reference.label !== 'SILENT' },
  { name: 'hard-silence', n: { he: 35, en: 35 }, ok: (r) => !r.reference.unsure && r.reference.label === 'SILENT' && !EASY.has(r.scenario) },
  { name: 'easy-silence', n: { he: 5, en: 5 }, ok: (r) => !r.reference.unsure && r.reference.label === 'SILENT' && EASY.has(r.scenario) }
];
const sorted = rows.filter((r) => !used.has(r.id)).sort((a, b) => (key(a) < key(b) ? -1 : 1));
const tpl = new Set(), picked = [];
for (const p of pools) for (const lang of ['he', 'en']) {
  let k = 0;
  // round-robin over scenarios so one scenario cannot fill a pool
  const byScen = {};
  sorted.filter((r) => r.lang === lang && p.ok(r)).forEach((r) => { (byScen[r.scenario] = byScen[r.scenario] || []).push(r); });
  const scen = Object.keys(byScen).sort();
  let i = 0;
  while (k < p.n[lang] && scen.some((s) => byScen[s].length)) {
    const s = scen[i++ % scen.length]; const r = byScen[s].shift(); if (!r) continue;
    if (tpl.has(r.templateId)) continue; tpl.add(r.templateId);
    picked.push({ pool: p.name, r }); k++;
  }
}
const items = picked.map(({ pool, r }, i) => ({
  item: i + 1, id: r.id, pool, lang: r.lang, scenario: r.scenario, surface: r.surface, direction: r.direction,
  from: r.from, to: r.to, cc: r.cc, subject: r.subject, body: r.cleanBody || r.body, attachmentCount: r.attachmentCount,
  addressee: r.addressee, reference: r.reference, engine35: r.engine35 && r.engine35.label, v2: V2[r.id] || null, v23: V23[r.id] || null
}));
fs.writeFileSync(path.join(HERE, 'batch-003.json'), JSON.stringify(items, null, 1) + '\n');
fs.writeFileSync(path.join(HERE, 'batch-003.blind.jsonl'), items.map((x) => JSON.stringify({ item: x.item, id: x.id, lang: x.lang, surface: x.surface, direction: x.direction,
  from: x.from && x.from.email, to: x.to, cc: x.cc, subject: x.subject, attachments: x.attachmentCount, body: x.body })).join('\n') + '\n');
const c = {}; items.forEach((x) => { const k = x.pool + ':' + x.lang; c[k] = (c[k] || 0) + 1; });
console.log(items.length, JSON.stringify(c));
