#!/usr/bin/env node
// Dumps hashed feature indices and labels for the neural experiment (scripts/intent/nn/train.py).
//   node scripts/intent/dump-features.cjs <outDir>
// train = generated grammar data (seed 11) + the teacher sentences repeated with augmentation; eval = the four hand-written sets.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'flow-trial-extension');
const M = require(path.join(ROOT, 'core', 'intent-model.js')).FlowIntentModel;
const { makeGenerator } = require('./generate.cjs');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const DIM = 16384, REP = 10;
const ACTS = M.ACTS, ACTIONS = M.ACTIONS;
let rs = 99991; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
function augment(t, he, k) {
  if (k === 0) return t;
  const v = [() => t.replace(/[.!]+$/, ''), () => t.toLowerCase().replace(/[,.!]+/g, ''), () => (he ? 'היי, ' : 'Hi, ') + t.charAt(0).toLowerCase() + t.slice(1), () => t.replace(/[’']/g, ''), () => (he ? 'שלום, ' : 'Hello, ') + t, () => t.replace(/\s+/g, ' ').replace(/,/g, '')];
  return v[Math.floor(rnd() * v.length)]();
}
function pack(rows) {
  return { idx: rows.map((r) => M.features(r.t, DIM)), act: rows.map((r) => ACTS.indexOf(r.act)), action: rows.map((r) => Math.max(0, ACTIONS.indexOf(r.action || 'none'))), lang: rows.map((r) => r.lang || 'en'), text: rows.map((r) => r.t) };
}
const train = makeGenerator(11).dataset(16000, 12000).map((d) => ({ t: d.t, act: d.act, action: d.action, src: 'grammar' }));
const teacher = JSON.parse(fs.readFileSync(path.join(__dirname, 'teacher-train.json'), 'utf8'));
for (const r of teacher) for (let k = 0; k < REP; k++) train.push({ t: augment(r.t, r.lang === 'he', k), act: r.act, action: r.action, src: 'teacher' });
fs.writeFileSync(path.join(out, 'train.json'), JSON.stringify(Object.assign(pack(train), { src: train.map((r) => r.src) })));
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
const gold = fx('intent-gold.json');
const sets = { dev: gold.filter((_, i) => i % 2 === 1), blind: fx('intent-blind.json'), te: fx('intent-teacher-eval.json'), te2: fx('intent-teacher-eval-2.json') };
for (const [k, v] of Object.entries(sets)) fs.writeFileSync(path.join(out, k + '.json'), JSON.stringify(pack(v)));
console.log('dumped', train.length, 'train;', Object.entries(sets).map(([k, v]) => k + ' ' + v.length).join(', '));
