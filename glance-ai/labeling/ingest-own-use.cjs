'use strict';
// Path A (docs/glance-ai/learning-from-use.md, owner 2026-10-13): the owner's own decisions on his own accounts become labels.
//   node labeling/ingest-own-use.cjs --in <device export .jsonl> [--out flow-trial-extension/test/fixtures/private/own-use-labels.jsonl]
// Input rows (written on the device, masked, handed over by the owner; nothing is uploaded):
//   { id, lang, maskedText, proposedStep: task|calendar|draft|file_save, decision: approve|edit|undo|ignored,
//     proof: { system, externalId, fetchedBack, verifiedAt }, decidedAt }
// Output rows (labeledBy "sali:action", source "own-use"):
//   approve or edit WITH read-back proof -> step = the proposed step (an edit means right in kind, wrong in detail), ownerVerified true
//   approve or edit WITHOUT proof        -> excluded (a decision without the connector's read-back does not qualify)
//   undo                                 -> step UNSURE, ownerVerified false, `negative` = the step that was wrong (a training negative, not gold)
//   ignored                              -> excluded (a weak signal, kept out of labels)
// The masked text stays in the output file, which defaults to a gitignored private directory. Aggregates only go in docs.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const STEPS = ['task', 'calendar', 'draft', 'file_save'];
function convert(rows) {
  const out = [], excluded = {};
  const skip = (why) => { excluded[why] = (excluded[why] || 0) + 1; };
  for (const r of rows) {
    if (!r || !r.id || !r.maskedText || STEPS.indexOf(r.proposedStep) < 0) { skip('malformed'); continue; }
    const base = { id: r.id, lang: r.lang === 'he' ? 'he' : 'en', maskedText: r.maskedText, labeledBy: L.OWN_USE_BY, source: 'own-use', decision: r.decision, decidedAt: r.decidedAt || null };
    if (r.decision === 'approve' || r.decision === 'edit') {
      if (!L.hasReadBackProof(r.proof)) { skip('no-read-back-proof'); continue; }
      out.push(Object.assign(base, { step: r.proposedStep, proof: r.proof, ownerVerified: true, edited: r.decision === 'edit' }));
    } else if (r.decision === 'undo') {
      out.push(Object.assign(base, { step: 'UNSURE', negative: r.proposedStep, ownerVerified: false }));
    } else skip(r.decision === 'ignored' ? 'ignored' : 'unknown-decision');
  }
  return { rows: out, excluded };
}
module.exports = { convert };
if (require.main === module) {
  const a = process.argv.slice(2), get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (!get('--in')) { console.error('usage: node labeling/ingest-own-use.cjs --in export.jsonl [--out file]'); process.exit(2); }
  const rows = fs.readFileSync(get('--in'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const res = convert(rows);
  const out = get('--out', path.join(__dirname, '..', '..', 'flow-trial-extension', 'test', 'fixtures', 'private', 'own-use-labels.jsonl'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, res.rows.map((r) => JSON.stringify(r)).join('\n') + (res.rows.length ? '\n' : ''));
  console.log(JSON.stringify({ out, rows: res.rows.length, ownerVerified: res.rows.filter((r) => r.ownerVerified).length, excluded: res.excluded }));
}
