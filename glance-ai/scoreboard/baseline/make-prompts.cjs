'use strict';
// Frontier-baseline harness, step 1 (Phase 0 of docs/glance-ai/model-upgrade-plan.md): writes the prompts, makes NO model call.
// Someone with a key and a spend cap (the owner's decision) runs them elsewhere; step 2 (ingest.cjs) reads the cached outputs and
// the scoreboard scores them on the same cases, by the same gate, as Glance's own models.
//   node scoreboard/baseline/make-prompts.cjs --variant zero|understanding|fewshot --out scoreboard/baseline/prompts-zero.jsonl
// Text is the masked body of the case exactly as Glance's own model sees it; the label is never in the prompt.
const fs = require('fs'), path = require('path');
const G = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const VARIANT = arg('variant', 'zero'), OUT = arg('out');
if (!OUT) { console.error('usage: make-prompts.cjs --variant zero|understanding|fewshot --out file.jsonl [--labels a.jsonl,b.jsonl]'); process.exit(2); }
// The system prompt is the labelling rules themselves (labeling/pass-rules.md, the conventions of docs/glance-ai/model-conventions.md): the baseline is given the
// SAME instruction the label passes had, which is as favourable to the baseline as a prompt can be. (The first baseline used a shorter prompt that still said an
// undated ask stays silent, which was the convention before the owner decided C-4.)
const RULES = fs.readFileSync(path.join(G, 'labeling', 'pass-rules.md'), 'utf8').replace(/\n+Output format:[\s\S]*$/, '').trim();
const FORMAT = {
  zero: 'Answer with one word: silent, task, calendar, draft or file_save.',
  understanding: 'Answer with JSON only: {"decision":"act"|"silent","family":"task"|"calendar"|"reply"|"file"|null,"ask_span":"<the exact words of the ask, or null>","reason":"<one short sentence>"}.',
  fewshot: 'Examples:\n1. "Can you send me the signed lease by Thursday?" -> draft\n2. "Heads up, the quote landed near 7k, nothing needed from you." -> silent\n3. "I will call the bank tomorrow." -> task\n4. "Can we meet Tuesday at 3?" -> calendar\n5. "Please save the attachment to OneDrive." -> file_save\n6. "Hi all, please approve asap." -> silent\n\nAnswer with one word: silent, task, calendar, draft or file_save.'
}[VARIANT];
if (!FORMAT) { console.error('unknown variant'); process.exit(2); }
// The cases are the FROZEN label set (labeling/frozen-eval.jsonl, joined by text; see scoreboard/run.cjs), never the dataset's positional ids.
const frozen = fs.readFileSync(path.join(G, 'labeling', 'frozen-eval.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
// Masked, as the lab's own model sees it: no addresses, only the sender's local name, the reader's position (To or Cc) and the text.
const mask = (t) => String(t || '').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>');
const OWNS = /ai\.local\.flow@gmail\.com|glance\.salisapan@outlook\.com/i;
const ONLY = (() => { const i = process.argv.indexOf('--batches'); return i > 0 ? new Set(process.argv[i + 1].split(',')) : null; })();
const rows = frozen.filter((r) => !ONLY || ONLY.has(r.batch)).map((r) => {
  const onCc = (r.cc || []).some((x) => OWNS.test(x)) && !(r.to || []).some((x) => OWNS.test(x));
  const f = r.from && typeof r.from === 'object' ? (r.from.name || String(r.from.email || '').split('@')[0]) : String(r.from || '').split('@')[0];
  const from = String(f || '').replace(/[._]/g, ' ') || '<sender>';
  return JSON.stringify({ id: r.id, variant: VARIANT, system: RULES, user: 'Reader: Sali (' + (onCc ? 'on Cc only' : 'on To') + ').\nFrom: ' + from + '\nSubject: ' + mask(r.subject) + '\n\n' + mask(r.body) + '\n\n' + FORMAT });
});
fs.writeFileSync(path.resolve(OUT), rows.join('\n') + '\n');
console.log(rows.length + ' prompts (' + VARIANT + ') -> ' + OUT + '. No model was called.');
