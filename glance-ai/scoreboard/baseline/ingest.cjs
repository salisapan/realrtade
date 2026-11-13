'use strict';
// Frontier-baseline harness, step 2: cached raw outputs -> judge-format predictions the scoreboard reads (--judged name=file).
//   node scoreboard/baseline/ingest.cjs --in outputs.jsonl --out preds.jsonl
// Each input row: {"id": "...", "output": "<the model's text>"}. Accepts the one-word answers and the JSON answer. An answer that
// cannot be read counts as SILENT (a model that cannot follow the format does not get credit) and is reported.
const fs = require('fs');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const FAM = { task: 'task', calendar: 'calendar', draft: 'reply', reply: 'reply', file_save: 'file', file: 'file' };
function parse(text) {
  const t = String(text == null ? '' : text).trim();
  try { const j = JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    if (j && j.decision === 'silent') return { pred: { decision: 'silent' }, ok: true };
    if (j && j.decision === 'act' && FAM[j.family]) return { pred: { decision: 'act', family: FAM[j.family] }, ok: true };
  } catch (e) { /* not JSON */ }
  const w = t.toLowerCase().replace(/[^a-z_]/g, ' ').trim().split(/\s+/)[0];
  if (w === 'silent') return { pred: { decision: 'silent' }, ok: true };
  if (FAM[w]) return { pred: { decision: 'act', family: FAM[w] }, ok: true };
  return { pred: { decision: 'silent' }, ok: false };
}
module.exports = { parse };
if (require.main === module) {
  if (!arg('in') || !arg('out')) { console.error('usage: ingest.cjs --in outputs.jsonl --out preds.jsonl'); process.exit(2); }
  const rows = fs.readFileSync(arg('in'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  let bad = 0; const out = rows.map((r) => { const p = parse(r.output); if (!p.ok) bad++; return JSON.stringify({ id: r.id, pred: p.pred }); });
  fs.writeFileSync(arg('out'), out.join('\n') + '\n');
  console.log(rows.length + ' predictions, ' + bad + ' unreadable (counted as silent)');
}
