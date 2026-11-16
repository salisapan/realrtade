'use strict';
// Merge two independent blind labelling passes into "two-pass agreement" labels for the promotion gate
// (glance-ai/oss/finetune/promote_gate.cjs, basis "two-pass-agreement"). Owner's decision 2026-10-11: he does not label by hand.
//
// A case becomes an agreement label only when:
//   - both passes gave the SAME step (draft, task, calendar, file_save or SILENT);
//   - neither pass said CONTEXT or UNSURE (profile-dependent or undecided cases are never gold);
//   - the two passes were made by different sessions (labeledBy differs) and neither is the owner.
// The row is { id, item, lang, step, undatedAsk, agreed:true, passes:2, ownerVerified:false, labeledBy:'agreement:<a>+<b>' }.
// It can never count as owner-verified: `ownerVerified` is always false, and lib.cjs refuses ownerVerified unless labeledBy is `sali`.
// Disagreements are written to <out>.disagree.jsonl for a look (by anyone) and are not gold.
//
// usage: node glance-ai/labeling/merge-passes.cjs --pass1 batch-003.claude-labels.jsonl --pass2 batch-003.pass2-labels.jsonl
//                                                 [--out agreement-gold.jsonl]   (appends new ids; an id already there is kept)
//                                                 [--disagree <file>]  (default <out>.disagree.jsonl; it is overwritten, so a later
//                                                 batch passes its own file, e.g. batch-004.disagree.jsonl)
// Both inputs: JSONL with { item, step, labeledBy }; pass1 also carries { id, lang, undatedAsk }. Nothing leaves the machine.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const HERE = __dirname;
const rel = (p) => (path.isAbsolute(p) ? p : path.join(HERE, p));
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const OUT = rel(get('--out') || 'agreement-gold.jsonl');
const STEPS = new Set(['draft', 'task', 'calendar', 'file_save', 'SILENT']);

function merge(p1, p2) {
  const by2 = Object.fromEntries(p2.map((r) => [r.item, r]));
  const agreed = [], disagree = [], skipped = { context: 0, unsure: 0, missing: 0, sameLabeler: 0 };
  for (const a of p1) {
    const b = by2[a.item];
    if (!b) { skipped.missing++; continue; }
    if (!a.labeledBy || a.labeledBy === b.labeledBy || a.labeledBy === 'sali' || b.labeledBy === 'sali') { skipped.sameLabeler++; continue; }
    if (a.step === 'CONTEXT' || b.step === 'CONTEXT') { skipped.context++; continue; }
    if (a.step === 'UNSURE' || b.step === 'UNSURE') { skipped.unsure++; continue; }
    if (!STEPS.has(a.step) || !STEPS.has(b.step)) { skipped.unsure++; continue; }
    if (a.step !== b.step) { disagree.push({ item: a.item, id: a.id, lang: a.lang, pass1: a.step, pass2: b.step, undatedAsk1: !!a.undatedAsk, undatedAsk2: !!b.undatedAsk }); continue; }
    agreed.push({ id: a.id, item: a.item, lang: a.lang, step: a.step, undatedAsk: !!(a.undatedAsk || b.undatedAsk), agreed: true, passes: 2,
      ownerVerified: false, labeledBy: 'agreement:' + a.labeledBy + '+' + b.labeledBy });
  }
  return { agreed, disagree, skipped };
}

if (require.main === module) {
  if (!get('--pass1') || !get('--pass2')) { console.error('usage: node merge-passes.cjs --pass1 <jsonl> --pass2 <jsonl> [--out agreement-gold.jsonl]'); process.exit(2); }
  const r = merge(read(rel(get('--pass1'))), read(rel(get('--pass2'))));
  const have = new Set(fs.existsSync(OUT) ? read(OUT).map((x) => x.id) : []);
  const fresh = r.agreed.filter((x) => !have.has(x.id));
  if (fresh.length) fs.appendFileSync(OUT, fresh.map((x) => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(get('--disagree') ? rel(get('--disagree')) : OUT.replace(/\.jsonl$/, '') + '.disagree.jsonl', r.disagree.map((x) => JSON.stringify(x)).join('\n') + (r.disagree.length ? '\n' : ''));
  const rate = (r.agreed.length + r.disagree.length) ? r.agreed.length / (r.agreed.length + r.disagree.length) : 0;
  console.log(JSON.stringify({ agreed: r.agreed.length, newlyWritten: fresh.length, disagreed: r.disagree.length, agreementRate: Math.round(rate * 1000) / 1000, skipped: r.skipped,
    byStep: r.agreed.reduce((m, x) => { m[x.step] = (m[x.step] || 0) + 1; return m; }, {}) }, null, 1));
}
module.exports = { merge };
