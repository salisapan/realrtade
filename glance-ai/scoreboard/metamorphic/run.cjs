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
// An edit returns a row whose body AND cleanBody are the edited text (the engine reads cleanBody when present; an edit that only set `body` was a no-op: the first
// version of this file made that mistake and its "0 flips" for the first four edits were void; fixed 2026-11-11).
const mk = (r, text, extra) => Object.assign({}, r, { body: text, cleanBody: text }, extra || {});
const isHe = (r) => /[\u05D0-\u05EA]/.test(bodyOf(r));
const EDITS = {
  'greet+sign': (r) => mk(r, (isHe(r) ? 'היי סאלי,\n\n' : 'Hi Sali,\n\n') + bodyOf(r) + (isHe(r) ? '\n\nתודה, דנה' : '\n\nThanks,\nDana')),
  're-prefix': (r) => mk(r, bodyOf(r), { subject: 'Re: ' + (r.subject || 'update') }),
  'trailing-ws': (r) => mk(r, bodyOf(r) + '\n\n\n' + (isHe(r) ? 'נשלח מהאייפון' : 'Sent from my iPhone')),
  'double-space': (r) => mk(r, bodyOf(r).replace(/ /g, '  ')),
  'double-punct': (r) => mk(r, bodyOf(r).replace(/([.?!])\s*$/, '$1$1')),
  'thanks-line': (r) => mk(r, bodyOf(r) + (isHe(r) ? '\nתודה!' : '\nThanks!')),
  'signature-block': (r) => mk(r, bodyOf(r) + '\n\n--\nDana Cole | Operations | Northwind Ltd\nwww.northwind.example'),
  'quoted-history': (r) => mk(r, bodyOf(r) + '\n\nOn Mon, 5 Oct 2026, Sali wrote:\n> Thanks, will do.\n> Best,\n> Sali'),
  'crlf': (r) => mk(r, bodyOf(r).replace(/\n/g, '\r\n')),
  'nbsp': (r) => mk(r, bodyOf(r).replace(/ /g, '\u00A0')),
  'emoji-tail': (r) => mk(r, bodyOf(r) + ' \u{1F642}')
};
const run = (r) => step(eng.teach(r).label);
const out = { n: sample.length, edits: {} };
for (const [name, f] of Object.entries(EDITS)) {
  let flips = 0, toAct = 0, toSilent = 0, ex = [];
  for (const r of sample) {
    const a = run(mk(r, bodyOf(r))), b = run(f(r)); // the baseline is the same row with its text normalised, so only the edit can flip it
    if (a !== b) { flips++; if (a === 'SILENT') toAct++; else if (b === 'SILENT') toSilent++; if (ex.length < 3) ex.push({ id: r.id, from: a, to: b, text: bodyOf(r).slice(0, 80).replace(/\n/g, ' ') }); }
  }
  out.edits[name] = { flips, silentToAct: toAct, actToSilent: toSilent, rate: +(flips / sample.length).toFixed(3), examples: ex };
}
console.log('| edit | flips / ' + sample.length + ' | silent→act | act→silent |\n|---|---|---|---|');
for (const [n, e] of Object.entries(out.edits)) console.log(`| ${n} | ${e.flips} (${(100 * e.rate).toFixed(1)}%) | ${e.silentToAct} | ${e.actToSilent} |`);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
