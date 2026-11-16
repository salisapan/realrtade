'use strict';
// The natural multi-clause set (labeling/multi-clause-natural-v0.jsonl): every mail in the lab's data that was WRITTEN with two or more
// ask-shaped sentences (not stitched). 33 mails, 28 decided; gold written by hand before the engine was run on them (one pass, Claude in
// session, NOT owner-verified). Most carry ONE closable intent plus a clause that corrects, cancels, hedges or explains it, so the set mainly
// measures the opposite risk of decomposition: offering something a second clause took back. Only 1 mail has two kinds of close: the lab's
// data has no real multi-intent mail, and this file does not pretend otherwise. Eval only, never a training row.
// usage: node scoreboard/decompose/natural.cjs [--model v33=model/v2x/...extra-preds.jsonl is NOT used: engine only] [--list]
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const E = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const rows = read(path.join(G, 'labeling', 'multi-clause-natural-v0.jsonl')).filter((r) => !r.unsure);
const OWN = ['Sali', 'Sali Sapan', 'סאלי'];
const agg = { whole: { exact: 0, extra: 0, missed: 0, wdi: 0 }, decomposed: { exact: 0, extra: 0, missed: 0, wdi: 0 } };
const list = [];
for (const r of rows) {
  const c = Object.assign({}, r, { ownNames: OWN });
  const t = E.teach(c); const whole = t.show ? [t.primaryStep] : [];
  const d = E.decompose(c); const dec = d.intentions.map((x) => x.anchor);
  const ok = new Set(r.gold.concat(r.alsoOk || []));
  for (const [name, pred, why] of [['whole', whole, t.reason], ['decomposed', dec, d.reason || d.whole.reason]]) {
    const set = new Set(pred), a = agg[name];
    const miss = r.gold.filter((s) => !set.has(s)).length, extra = [...set].filter((s) => !ok.has(s)).length;
    a.missed += miss; a.extra += extra; if (!miss && !extra) a.exact++; if (!r.gold.length && set.size) a.wdi++;
    if (name === 'decomposed') list.push({ id: r.id, gold: r.gold, whole, wholeWhy: t.show ? null : t.reason, dec, ok: !miss && !extra, body: String(r.body).replace(/\s+/g, ' ').slice(0, 140) });
  }
}
const goldN = rows.reduce((s, r) => s + r.gold.length, 0), silentN = rows.filter((r) => !r.gold.length).length;
console.log(`natural multi-clause set: ${rows.length} decided mails, ${goldN} gold intents, ${silentN} with nothing to offer, ${rows.filter((r) => new Set(r.gold).size > 1).length} with two kinds of close`);
console.log('| system | every intent right, nothing extra | intents missed | steps offered that the mail does not carry | offered where gold is silence |'); console.log('|---|---|---|---|---|');
for (const [n, a] of Object.entries(agg)) console.log(`| ${n === 'whole' ? 'engine (whole mail)' : 'decomposed engine'} | ${a.exact}/${rows.length} | ${a.missed}/${goldN} | ${a.extra} | ${a.wdi}/${silentN} |`);
if (process.argv.includes('--list')) for (const x of list) console.log((x.ok ? 'ok  ' : 'DIFF') + ' ' + x.id + ' gold=' + JSON.stringify(x.gold) + ' whole=' + JSON.stringify(x.whole) + (x.wholeWhy ? '(' + x.wholeWhy + ')' : '') + ' dec=' + JSON.stringify(x.dec) + ' | ' + x.body);
