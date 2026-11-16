'use strict';
// node glance-ai/scoreboard/contrast/run.cjs [--json out.json] : runs the contrast pairs through the tip rules engine (this repository) and, with
// --models, reports nothing for models (a model needs the pair rows exported through the dataset pipeline; see README). Needs the engine environment of
// glance-ai/model/V23.md. A pair PASSES only when both rows get the expected step. Rows marked unsureConvention are reported but not counted against the engine.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const eng = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const PAIRS = require('./pairs-v1.cjs');
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const row = (r) => ({ from: r.self ? { name: 'Sali', email: 'ai.local.flow@gmail.com' } : { name: 'Dana Cole', email: 'dana@northwind.com' }, to: r.cc ? ['colleague@northwind.com'] : ['ai.local.flow@gmail.com'], cc: r.cc ? ['ai.local.flow@gmail.com'] : [], ownNames: ['Sali', 'סאלי'],
  subject: r.self ? '' : 'Quick question', body: r.body, cleanBody: r.body, attachmentCount: r.attachmentCount || 0, direction: r.self ? 'self' : 'inbound', surface: 'gmail', lang: r.lang });
const res = PAIRS.map((p) => {
  const got = ['a', 'b'].map((k) => step(eng.teach(row(p[k])).label));
  const ok = ['a', 'b'].map((k, i) => got[i] === p[k].step);
  return { id: p.id, fact: p.fact, conv: p.conv, expected: [p.a.step, p.b.step], got, passA: ok[0], passB: ok[1], pass: ok[0] && ok[1], soft: Boolean(p.b.unsureConvention) };
});
const pass = res.filter((r) => r.pass).length;
console.log('| pair | fact | expected | engine | |\n|---|---|---|---|---|');
for (const r of res) console.log(`| ${r.id} | ${r.fact} | ${r.expected.join(' / ')} | ${r.got.join(' / ')} | ${r.pass ? 'PASS' : r.soft ? 'differs (soft)' : 'FAIL'} |`);
console.log(`\n${pass}/${res.length} pairs pass (both rows right). Hard failures: ${res.filter((r) => !r.pass && !r.soft).length}.`);
if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(res, null, 1));
