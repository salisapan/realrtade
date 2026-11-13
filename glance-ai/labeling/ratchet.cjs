'use strict';
// Regression ratchet (W6 of docs/glance-ai/model-upgrade-plan.md), text-bound: every wrong Do It the engine makes on the FROZEN label set
// (labeling/frozen-eval.jsonl, rows keyed bNNN-item and carrying their own text) becomes a frozen row here; the file only grows.
//   node labeling/ratchet.cjs            report: which rows the engine (this repository's tip) still acts on, and fail if a row marked `fixed` acts again
//   node labeling/ratchet.cjs --add      append the engine's current wrong Do Its (agreed or single-pass gold SILENT, not decided by the overlay) not yet in the file
// Rows: { id, gold: "SILENT", engineActs, found, status: "open"|"fixed", convention, note }. The engine's step is recomputed from the stored text
// (`text` field), so a generator rebuild cannot move it. Needs the engine environment of glance-ai/model/V23.md.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'regression-wrong-doits.jsonl');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const frozen = Object.fromEntries(read(path.join(__dirname, 'frozen-eval.jsonl')).map((r) => [r.id, r]));
const eng = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const acts = (r) => step(eng.teach(Object.assign({}, r, { cleanBody: r.body, ownNames: ['Sali', 'Sali Sapan', 'סאלי'] })).label);
const rows = fs.existsSync(FILE) ? read(FILE) : [];
if (process.argv.includes('--add')) {
  const have = new Set(rows.map((r) => r.id));
  const overlay = new Set(read(path.join(__dirname, 'owner-convention-overlay.jsonl')).map((r) => r.id));
  let added = 0;
  for (const r of Object.values(frozen)) {
    const gold = r.agreed || r.pass1; if (gold !== 'SILENT' || have.has(r.id) || overlay.has(r.id)) continue;
    const s = acts(r); if (s === 'SILENT') continue;
    rows.push({ id: r.id, gold: 'SILENT', engineActs: s, found: new Date().toISOString().slice(0, 10), status: 'open', convention: null, note: r.body.slice(0, 90).replace(/\n/g, ' ') });
    have.add(r.id); added++;
  }
  fs.writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); console.log('added', added, 'rows; total', rows.length);
}
let open = 0, fixed = 0, regressed = 0, nowSilent = 0;
for (const r of rows) {
  const f = frozen[r.id]; if (!f) { console.log('row not in the frozen set: ' + r.id); continue; }
  const s = acts(f), still = s !== 'SILENT';
  if (r.status === 'fixed') { fixed++; if (still) { regressed++; console.log('REGRESSED: ' + r.id + ' acts again (' + s + ') | ' + r.note); } }
  else { open++; if (!still) { nowSilent++; console.log('now silent, mark fixed: ' + r.id); } }
}
console.log(JSON.stringify({ total: rows.length, open, fixed, regressed, openNowSilent: nowSilent }));
process.exit(regressed ? 1 : 0);
