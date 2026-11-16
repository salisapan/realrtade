'use strict';
// What the product's recognition UNION (readers first, then the judge, every Labs switch on) does with the 701 frozen-eval rows, by KIND, next to the two-pass
// label (Claude's agreement, not owner-verified). It answers two questions the 4-step scoreboard cannot: (1) how often each kind route fires on mail-shaped text,
// and (2) whether a kind-specific reader fires on rows whose label says the person had nothing to close (a candidate wrong Do It). Lab only; frozen rows are
// never trained on. usage: node scoreboard/capabilities/frozen-kinds.cjs [--list]
const fs = require('fs'), path = require('path');
const { recognize } = require('./union.cjs');
const rows = fs.readFileSync(path.join(__dirname, '..', '..', 'labeling', 'frozen-eval.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const agreed = (r) => (r.pass1 === r.pass2 ? r.pass1 : 'split');
const route = {}, byScn = {}, flag = [];
for (const r of rows) {
  const surface = r.surface === 'outlook' ? 'outlook' : 'gmail';
  const text = (r.subject ? r.subject + '. ' : '') + r.body;
  const over = { surface, sender: r.from, to: r.to, cc: r.cc || [], subject: r.subject || '', attachmentCount: r.attachmentCount || 0, hasThreadAttachment: (r.attachmentCount || 0) > 0, direction: r.direction || 'inbound', inbound: (r.direction || 'inbound') !== 'outbound' };
  const rec = recognize(over, r.body), lab = agreed(r);
  const k = rec.family + '/' + rec.via;
  const o = route[k] = route[k] || { n: 0, lab: {} };
  o.n++; o.lab[lab] = (o.lab[lab] || 0) + 1;
  const s = byScn[r.scenario] = byScn[r.scenario] || { n: 0, fam: {} };
  s.n++; s.fam[rec.family] = (s.fam[rec.family] || 0) + 1;
  if (rec.via === 'reader' && (lab === 'SILENT' || lab === 'none' || lab === 'split')) flag.push([r.id, r.scenario, rec.family, lab, r.body.slice(0, 100).replace(/\n/g, ' ')]);
}
console.log('rows', rows.length, '\n\nroute (family/via): n | two-pass label of those rows');
for (const [k, v] of Object.entries(route).sort((a, b) => b[1].n - a[1].n)) console.log(k.padEnd(24), String(v.n).padStart(4), JSON.stringify(v.lab));
console.log('\nreader fired where the label says nothing to close (candidate wrong Do It):', flag.length);
if (process.argv.includes('--list')) { for (const f of flag) console.log(f.join(' | ')); console.log('\nscenario: engine families'); for (const [k, v] of Object.entries(byScn).sort()) console.log(k.padEnd(28), v.n, JSON.stringify(v.fam)); }
