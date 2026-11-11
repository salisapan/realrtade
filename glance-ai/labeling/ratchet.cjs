'use strict';
// Regression ratchet (W6 of docs/glance-ai/model-upgrade-plan.md): every wrong Do It found by a blind label set becomes a frozen row here; the file only grows.
//   node labeling/ratchet.cjs            report: which rows the engine (this repository's tip, plus the lab veto) still acts on, and fail if a row marked `fixed` acts again
//   node labeling/ratchet.cjs --add      append the engine's current wrong Do Its on the label sources (agreement, single-pass) that are not yet in the file
// Rows: { id, gold: "SILENT", found: <date>, status: "open"|"fixed", convention: "C-n"|null, note }. Needs the engine environment of glance-ai/model/V23.md.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'regression-wrong-doits.jsonl');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const test = Object.fromEntries(read(path.join(G, 'model', 'dataset', 'out-v2', 'all.jsonl')).map((r) => [r.id, r]));
const eng = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const acts = (id) => { const r = test[id]; return r ? step(eng.teach(Object.assign({}, r, { body: r.cleanBody || r.body })).label) : null; };
const rows = fs.existsSync(FILE) ? read(FILE) : [];
if (process.argv.includes('--add')) {
  const have = new Set(rows.map((r) => r.id));
  const overlay = new Set(read(path.join(__dirname, 'owner-convention-overlay.jsonl')).map((r) => r.id));
  const src = fs.readdirSync(__dirname).filter((f) => /^(agreement-gold|batch-\d{3}\.claude-labels)\.jsonl$/.test(f));
  let added = 0;
  for (const f of src) for (const l of read(path.join(__dirname, f))) {
    if (l.step !== 'SILENT' || have.has(l.id) || overlay.has(l.id) || !test[l.id]) continue;
    const s = acts(l.id); if (!s || s === 'SILENT') continue;
    rows.push({ id: l.id, gold: 'SILENT', engineActs: s, found: new Date().toISOString().slice(0, 10), status: 'open', convention: null, note: (test[l.id].cleanBody || '').slice(0, 90).replace(/\n/g, ' ') });
    have.add(l.id); added++;
  }
  fs.writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); console.log('added', added, 'rows; total', rows.length);
}
let open = 0, fixed = 0, regressed = 0, nowFixed = 0;
for (const r of rows) {
  const s = acts(r.id), still = s && s !== 'SILENT';
  if (r.status === 'fixed') { fixed++; if (still) { regressed++; console.log('REGRESSED: ' + r.id + ' acts again (' + s + ') | ' + r.note); } }
  else { open++; if (!still) { nowFixed++; console.log('now silent, mark fixed: ' + r.id); } }
}
console.log(JSON.stringify({ total: rows.length, open, fixed, regressed, openNowSilent: nowFixed }));
process.exit(regressed ? 1 : 0);
