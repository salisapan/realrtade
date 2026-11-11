'use strict';
// Metamorphic red team (W2.4 of docs/glance-ai/model-upgrade-plan.md): meaning-preserving edits that must NOT change the decision.
//   node glance-ai/scoreboard/metamorphic/run.cjs [--n 400] [--json out.json]
// For a sample of test-split rows the tip engine already settles (same step with no wrapper), apply an edit and count flips:
//   greet+sign   wrap in "Hi Sali," ... "Thanks,\nDana" (EN) / «היי סאלי,» ... «תודה, דנה» (HE)
//   re-prefix    subject "Re: " (a reply in a thread)
//   trailing-ws  trailing blank lines and a mobile signature line ("Sent from my iPhone" / «נשלח מהאייפון»)
//   case-punct   the same text with extra spaces and a doubled final punctuation
// A flip is a candidate defect: either the engine reads wrapper words as content, or it needs them. Candidates are NOT labels.
// Needs the engine environment of glance-ai/model/V23.md.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const eng = require(path.join(G, 'model', 'teacher', 'engine.cjs')).makeEngine('tip');
const step = (l) => (!l || l === 'SILENT' ? 'SILENT' : String(l).split('|').pop());
const N = +arg('n', 400);
const rows = read(path.join(G, 'model', 'dataset', 'out-v2', 'test.jsonl')).filter((r) => r.direction === 'inbound' && r.surface !== 'outlook');
// deterministic sample: every k-th row
const k = Math.max(1, Math.floor(rows.length / N)); const sample = rows.filter((_, i) => i % k === 0).slice(0, N);
const bodyOf = (r) => r.cleanBody || r.body || '';
const EDITS = {
  'greet+sign': (r) => { const he = /[א-ת]/.test(bodyOf(r)); return Object.assign({}, r, { body: (he ? 'היי סאלי,\n\n' : 'Hi Sali,\n\n') + bodyOf(r) + (he ? '\n\nתודה, דנה' : '\n\nThanks,\nDana') }); },
  're-prefix': (r) => Object.assign({}, r, { subject: 'Re: ' + (r.subject || 'update'), body: bodyOf(r) }),
  'trailing-ws': (r) => { const he = /[א-ת]/.test(bodyOf(r)); return Object.assign({}, r, { body: bodyOf(r) + '\n\n\n' + (he ? 'נשלח מהאייפון' : 'Sent from my iPhone') }); },
  'case-punct': (r) => Object.assign({}, r, { body: bodyOf(r).replace(/ /g, '  ').replace(/([.?!])\s*$/, '$1$1') })
};
const run = (r) => step(eng.teach(Object.assign({}, r, { body: bodyOf(r), cleanBody: bodyOf(r) })).label);
const out = { n: sample.length, edits: {} };
for (const [name, f] of Object.entries(EDITS)) {
  let flips = 0, toAct = 0, toSilent = 0, ex = [];
  for (const r of sample) {
    const a = run(r), b = run(f(r));
    if (a !== b) { flips++; if (a === 'SILENT') toAct++; else if (b === 'SILENT') toSilent++; if (ex.length < 3) ex.push({ id: r.id, from: a, to: b, text: bodyOf(r).slice(0, 80).replace(/\n/g, ' ') }); }
  }
  out.edits[name] = { flips, silentToAct: toAct, actToSilent: toSilent, rate: +(flips / sample.length).toFixed(3), examples: ex };
}
console.log('| edit | flips / ' + sample.length + ' | silent→act | act→silent |\n|---|---|---|---|');
for (const [n, e] of Object.entries(out.edits)) console.log(`| ${n} | ${e.flips} (${(100 * e.rate).toFixed(1)}%) | ${e.silentToAct} | ${e.actToSilent} |`);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
