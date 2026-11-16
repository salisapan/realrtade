'use strict';
// Does the clause pass turn a silent mail into an offer? Over lab TRAINING rows with a teacher label (v3.3 audit; NOT owner-verified; generated
// mail, one intention per mail by construction), count the mails where the whole-mail engine is silent and the decomposed engine offers:
// on a gold-silent mail that is a NEW wrong Do It, on a gold-act mail a newly found close (right or wrong step). Never frozen, validation or
// sealed text. usage: node scoreboard/decompose/safety.cjs [--list N]
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const E = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const stepOf = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const lab = {}; for (const s of ['train', 'val']) for (const f of read(path.join(G, 'model', 'train', 'features-v33', s + '.jsonl'))) if (f.teacher === true && !f.unsure) lab[f.id] = stepOf(f.y);
const st = { silent: 0, act: 0, newWrongDoIt: 0, newFoundRight: 0, newFoundWrongStep: 0, extraSecond: 0, byReason: {}, byScenario: {} }; const ex = [];
for (const r of read(path.join(G, 'model', 'dataset', 'out-v2', 'train.jsonl'))) {
  const gold = lab[r.id]; if (!gold) continue;
  if (gold === 'SILENT') st.silent++; else st.act++;
  const t = E.teach(r); const d = E.decompose(r);
  const dec = d.intentions.map((x) => x.anchor);
  if (!t.show && dec.length) {
    if (gold === 'SILENT') { st.newWrongDoIt++; st.byReason[t.reason] = (st.byReason[t.reason] || 0) + 1; st.byScenario[r.scenario] = (st.byScenario[r.scenario] || 0) + 1; ex.push(r.scenario + ' | ' + t.reason + ' -> ' + dec.join('+') + ' | ' + String(r.cleanBody || r.body).replace(/\s+/g, ' ').slice(0, 170)); }
    else if (dec.includes(gold)) st.newFoundRight++; else st.newFoundWrongStep++;
  }
  if (t.show && dec.length > 1) st.extraSecond++;
}
console.log(JSON.stringify(st)); for (const e of ex.slice(0, Number(arg('list', 0)))) console.log(e);
