'use strict';
// What is still wrong on the frozen set (two-pass agreement labels, NOT owner-verified), product order with the decomposed engine and one
// model: every miss, wrong Do It and wrong action by type. Diagnosis only (declared in model/V23.md when a change is chosen from it).
// usage: node scoreboard/decompose/errors.cjs [--model v33=model/v2x/fz-v33/v33.extra-preds.jsonl] [--batches 007,008] [--list miss|wdi|wa]
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const E = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const D = require(path.join(G, '..', 'flow-trial-extension', 'core', 'intent-decompose.js')).FlowIntentDecompose;
const HQ = require(path.join(G, 'model', 'runtime', 'hard-quiets.cjs')); const HARD = HQ.A;
const ONLY = arg('batches') ? new Set(arg('batches').split(',')) : null;
const overlay = new Set(read(path.join(G, 'labeling', 'owner-convention-overlay.jsonl')).map((r) => r.id));
const STEPS = new Set(['SILENT', 'task', 'calendar', 'draft', 'file_save']);
const frozen = read(path.join(G, 'labeling', 'frozen-eval.jsonl')).filter((r) => (!ONLY || ONLY.has(r.batch)) && !overlay.has(r.id) && r.agreed && STEPS.has(r.agreed));
const [mName, mFile] = arg('model', 'v33=model/v2x/fz-v33/v33.extra-preds.jsonl').split('=');
const M = Object.fromEntries(read(path.join(G, mFile)).map((r) => [r.id, r]));
const stepOf = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const out = { n: frozen.length, engineMiss: { n: 0, oneClause: 0, byReason: {}, byGold: {}, byLang: {} }, miss: { n: 0, type: {}, byGold: {}, byLang: {}, oneClause: 0 }, wdi: { n: 0, by: {}, byReason: {} }, wa: { n: 0, by: {}, pairs: {} } };
const lists = { miss: [], wdi: [], wa: [] };
for (const r of frozen) {
  const x = M[r.id]; const c = Object.assign({}, r, { ownNames: ['Sali', 'Sali Sapan', 'סאלי'] });
  const d = E.decompose(c); const eng = x && (x.vb || x.vp) ? 'SILENT' : (d.intentions[0] ? d.intentions[0].anchor : 'SILENT');
  const hard = HARD.has(r.tipReason); const model = x ? stepOf(x.pred) : 'SILENT';
  const pred = eng !== 'SILENT' ? eng : (hard ? 'SILENT' : model); const who = eng !== 'SILENT' ? 'engine' : 'model';
  const nClauses = D.clauses(String(r.body || '')).clauses.length; const txt = r.lang + ' | ' + r.tipReason + ' | ' + String(r.body).replace(/\s+/g, ' ').slice(0, 150);
  if (r.agreed !== 'SILENT' && eng === 'SILENT') { const e = out.engineMiss; e.n++; if (nClauses <= 1) e.oneClause++; bump(e.byReason, r.tipReason); bump(e.byGold, r.agreed); bump(e.byLang, r.lang); }
  if (r.agreed !== 'SILENT' && pred === 'SILENT') {
    const m = out.miss; m.n++; if (nClauses <= 1) m.oneClause++; bump(m.byGold, r.agreed); bump(m.byLang, r.lang);
    // the type of the miss: a rules-engine hold the model may not override, a hold the lab veto adds, or recognition (nobody saw it)
    const type = hard ? 'engine hard quiet (' + r.tipReason + ')' : (x && (x.vb || x.vp) ? (r.tip !== 'SILENT' ? 'lab veto removed the engine\'s own offer (' + (x.vb || x.vp) + ')' : 'lab veto holds the model (' + (x.vb || x.vp) + '), engine silent (' + r.tipReason + ')') : (r.tipReason === 'intent-null' ? 'recognition: engine found no intent, model silent' : 'engine hold (' + r.tipReason + '), model silent'));
    bump(m.type, type); lists.miss.push(r.agreed + ' | ' + type + ' | ' + txt);
  }
  if (r.agreed === 'SILENT' && pred !== 'SILENT') { out.wdi.n++; bump(out.wdi.by, who); bump(out.wdi.byReason, who === 'engine' ? 'engine shows ' + pred : 'model over ' + r.tipReason); lists.wdi.push(pred + ' by ' + who + ' | ' + txt); }
  if (r.agreed !== 'SILENT' && pred !== 'SILENT' && pred !== r.agreed) { out.wa.n++; bump(out.wa.by, who); bump(out.wa.pairs, who + ': ' + r.agreed + ' -> ' + pred); lists.wa.push(r.agreed + ' -> ' + pred + ' by ' + who + ' | ' + txt); }
}
console.log(JSON.stringify(out, null, 1));
if (arg('list')) console.log(lists[arg('list')].join('\n'));
