'use strict';
// Frontier-baseline harness, step 1 (Phase 0 of docs/glance-ai/model-upgrade-plan.md): writes the prompts, makes NO model call.
// Someone with a key and a spend cap (the owner's decision) runs them elsewhere; step 2 (ingest.cjs) reads the cached outputs and
// the scoreboard scores them on the same cases, by the same gate, as Glance's own models.
//   node scoreboard/baseline/make-prompts.cjs --variant zero|understanding|fewshot --out scoreboard/baseline/prompts-zero.jsonl
//   [--labels labeling/agreement-gold.jsonl]  (default: the cases of every label source the scoreboard reads)
// Text is the masked body of the case exactly as Glance's own model sees it; the label is never in the prompt.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const VARIANT = arg('variant', 'zero'), OUT = arg('out');
if (!OUT) { console.error('usage: make-prompts.cjs --variant zero|understanding|fewshot --out file.jsonl [--labels a.jsonl,b.jsonl]'); process.exit(2); }
const RULES = [
  'You read ONE mail or chat message addressed to the reader (the owner of the inbox). Decide whether it contains an open intention that Glance should offer to close with ONE action.',
  'Silence is correct unless there is an explicit ask or promise with a close that can be carried out. A wrong offer is worse than no offer.',
  'Actions: task (do the work, or a promise to do it), calendar (a meeting or time to hold, needs a date and a time), draft (a reply or sending something back), file_save (save an attached file).',
  'Stay SILENT for: newsletters and notices, confirmations with no ask, approximate or confirmed amounts with no ask, mail where the reader is only on Cc, mail addressed to someone else, asks with no date or deadline.',
  'Dates in the text are the only dates you may use. Do not invent one.'
].join('\n');
const FORMAT = {
  zero: 'Answer with one word: silent, task, calendar, draft or file_save.',
  understanding: 'Answer with JSON only: {"decision":"act"|"silent","family":"task"|"calendar"|"reply"|"file"|null,"ask_span":"<the exact words of the ask, or null>","reason":"<one short sentence>"}.',
  fewshot: 'Examples:\n1. "Can you send me the signed lease by Thursday?" -> draft\n2. "Heads up, the quote landed near 7k, nothing needed from you." -> silent\n3. "I will call the bank tomorrow." -> task\n4. "Can we meet Tuesday at 3?" -> calendar\n5. "Please save the attachment to OneDrive." -> file_save\n6. "Hi all, please approve asap." -> silent\n\nAnswer with one word: silent, task, calendar, draft or file_save.'
}[VARIANT];
if (!FORMAT) { console.error('unknown variant'); process.exit(2); }
const test = Object.fromEntries(read(path.join(G, 'model', 'dataset', 'out-v2', 'test.jsonl')).map((r) => [r.id, r]));
const labelFiles = arg('labels') ? arg('labels').split(',') : fs.readdirSync(path.join(G, 'labeling')).filter((f) => /^(agreement-gold|batch-\d{3}\.claude-labels)\.jsonl$/.test(f)).map((f) => 'labeling/' + f);
const ids = new Set(); labelFiles.forEach((f) => read(path.join(G, f)).forEach((l) => { if (test[l.id]) ids.add(l.id); }));
// Masked, as the lab's own model sees it: no addresses, only the sender's display name, the reader's position (To or Cc) and the text.
const mask = (t) => String(t || '').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>');
const rows = [...ids].sort().map((id) => {
  const r = test[id], a = r.addressee || {};
  const from = r.from && typeof r.from === 'object' ? (r.from.name || '<sender>') : '<sender>';
  return JSON.stringify({ id, variant: VARIANT, system: RULES, user: 'Reader: Sali (' + (a.role === 'cc-only' ? 'on Cc only' : a.role === 'to' ? 'on To' : 'position unknown') + ').\nFrom: ' + from + '\nSubject: ' + mask(r.subject) + '\n\n' + mask(r.cleanBody || r.body) + '\n\n' + FORMAT });
});
fs.writeFileSync(path.resolve(OUT), rows.join('\n') + '\n');
console.log(rows.length + ' prompts (' + VARIANT + ') -> ' + OUT + '. No model was called.');
