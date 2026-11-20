'use strict';
// Silver KIND labels from the engine, for free (2026-11-14): the product's recognition union (kind readers first, then the judge, every Labs switch on) run over the
// synthetic training pool (model/dataset/out-v2/train.jsonl, never the frozen, validation or sealed sets), tallied by the kind each row routes to and by the pool's
// own scenario. It shows which kinds the pool already carries at the readers' precision and which have no positive at all, so a kind head knows what to generate.
// Nothing is written to the dataset. usage: node scoreboard/capabilities/silver-kinds.cjs [--limit N] [--out kinds-silver.json]
const fs = require('fs'), path = require('path'), readline = require('readline');
const { recognize } = require('./union.cjs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('limit', 0));
const file = path.join(__dirname, '..', '..', 'model', 'dataset', 'out-v2', 'train.jsonl');
const route = {}, byScn = {}; let n = 0;
const rl = readline.createInterface({ input: fs.createReadStream(file) });
rl.on('line', (l) => {
  if (!l || (LIMIT && n >= LIMIT)) return;
  const r = JSON.parse(l); n++;
  const surface = r.surface === 'outlook' ? 'outlook' : 'gmail';
  const rec = recognize({ surface, sender: r.from, to: r.to, cc: r.cc || [], subject: r.subject || '', attachmentCount: r.attachmentCount || 0, hasThreadAttachment: (r.attachmentCount || 0) > 0 }, r.body);
  const k = rec.family; route[k] = (route[k] || 0) + 1;
  const s = byScn[r.scenario] = byScn[r.scenario] || { n: 0, fam: {} }; s.n++; s.fam[k] = (s.fam[k] || 0) + 1;
});
rl.on('close', () => {
  console.log('rows', n); console.log(Object.entries(route).sort((a, b) => b[1] - a[1]).map(([k, v]) => k.padEnd(14) + v).join('\n'));
  console.log('\nscenario -> engine kind'); for (const [k, v] of Object.entries(byScn).sort()) console.log(k.padEnd(26), String(v.n).padStart(5), JSON.stringify(v.fam));
  if (arg('out', '')) fs.writeFileSync(arg('out', ''), JSON.stringify({ rows: n, route, byScn }, null, 1) + '\n');
});
