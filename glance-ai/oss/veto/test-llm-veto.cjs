'use strict';
// Unit test for llm-veto.cjs on (a) the hand-written injection/money/past/no-attachment set incl. positive controls,
// (b) every injection / money / past / no-attachment case in the OSS eval and adversarial-v2, (c) collateral on v2 held-out
// reference-SHOW rows (how many real closes each layer would silence). Engine date from shadow-combined/engine-plus.cjs.
const fs = require('fs');
const LV = require('./llm-veto.cjs');
const { analyze } = require('../shadow-combined/engine-plus.cjs');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map(JSON.parse);
const base = { surface: 'gmail', direction: 'inbound', from: { name: 'X', email: 'x@partner.example' }, to: ['ai.local.flow@gmail.com'], cc: [], ownNames: ['Sali', 'Sali Sapan', 'סאלי'] };
const STEP = { task: 'task', calendar: 'calendar', draft: 'draft', file_save: 'file_save', ANY: 'task', SILENT: 'task' };
function verdict(c, card) { const A = analyze(c); return { proposal: LV.proposalVeto(A.P.c, A.P.own, card, A.eng), text: LV.textVeto(A.P.c, A.P.own), card: LV.cardVeto(A.P.c, A.P.own, card, A.eng), A }; }
let pass = 0, fail = 0; const lines = [];
for (const r of read(__dirname + '/injection-cases.jsonl')) {
  const c = Object.assign({}, base, r);
  // the strongest test: what would the LLM most plausibly propose? use the step it would act with (calendar for meeting-ish past, file_save for noatt)
  const st = r.kind === 'noatt' ? 'file_save' : r.kind === 'past' ? (/call|meeting|פגישה|שיחה|נפגשנו/.test(r.body) ? 'calendar' : 'task') : STEP[r.expect];
  const v = verdict(c, { step: st, title: '' });
  const ok = r.expectVeto ? Boolean(v.proposal) && (r.kind === 'control' || v.proposal === r.expectVeto || (r.expectVeto === 'money-movement' && v.proposal === 'payment-fraud') || (r.expectVeto === 'past-date' && /past|calendar-needs/.test(v.proposal))) : !v.proposal;
  ok ? pass++ : fail++;
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(11)} expectVeto=${String(r.expectVeto).padEnd(18)} got=${String(v.proposal).padEnd(30)} (all-cards textVeto=${v.text}) engine=${v.A.P.eng.label} engDate=${v.A.eng.dateIso} :: ${JSON.stringify(r.body.slice(0, 70))}`);
}
console.log(lines.join('\n')); console.log(`hand set: ${pass}/${pass + fail} pass`);
if (fail) process.exit(1);
// (b) and (c) need the regenerated v2 dataset (oss-eval.jsonl, adversarial-v2.jsonl, and the full test split).
// The committed held-out file is eval-data/v2-heldout-test.jsonl. Those extra files are not in git.
const path = require('path');
const { ROOT: AI, EVAL } = require('../../paths.cjs');
const D = process.env.GLANCE_V2_DATASET || path.join(AI, 'model', 'dataset', 'out-v2');
const need = ['oss-eval.jsonl', 'adversarial-v2.jsonl'].map((f) => path.join(D, f));
if (need.some((p) => !fs.existsSync(p))) {
  console.log('SKIP eval/adversarial llm-veto rows: ' + need.filter((p) => !fs.existsSync(p)).join(', ') + ' is not in git. Regenerate with model/dataset/v2.');
  if (process.env.GLANCE_LLM_VETO_COLLATERAL === '1') {
    const testPath = fs.existsSync(path.join(D, 'test.jsonl')) ? path.join(D, 'test.jsonl') : EVAL.v2Test();
    console.log('collateral uses ' + testPath);
    runCollateral(testPath);
  } else {
    console.log('SKIP collateral engine pass over the held-out split (set GLANCE_LLM_VETO_COLLATERAL=1). The Hebrew amount unit test does not need it.');
  }
  process.exit(0);
}
const EVA = Object.fromEntries(read(__dirname + '/../eval/eval.jsonl').map((r) => ['oss-' + r.id, r]));
const evalRows = read(D + '/oss-eval.jsonl').map((r) => Object.assign({}, r, { attachmentCount: (EVA[r.id].attachments || []).length, surface: EVA[r.id].surface || r.surface })).filter((r) => /inj|inject|past|noatt|att0|att2|neg-pay|cond-amt/.test(r.id)).concat(read(D + '/adversarial-v2.jsonl').filter((r) => /inject|past|noatt|att0|att2|neg-pay|neg-he-pay/.test(r.id)));
let blocked = 0; const bl = [];
for (const r of evalRows) {
  const outs = ['task', 'draft', 'calendar', 'file_save'].map((s) => verdict(r, { step: s, title: '' }).proposal);
  const all = outs.every(Boolean); if (all) blocked++;
  bl.push(`${all ? 'BLOCKED' : 'OPEN   '} ${r.id.padEnd(22)} task=${outs[0]} draft=${outs[1]} calendar=${outs[2]} save=${outs[3]} :: ${JSON.stringify(String(r.body).slice(0, 70))}`);
}
console.log('\n' + bl.join('\n')); console.log(`eval injection/past/no-att rows fully blocked for an LLM proposal: ${blocked}/${evalRows.length}`);
// (c) collateral on v2 held-out reference-SHOW rows
function runCollateral(testPath) {
const test = read(testPath).filter((r) => !r.reference.unsure && r.reference.label !== 'SILENT');
const col = { textVeto_allCards: 0, cardVeto_onRefStep: 0, proposalVeto_onRefStep: 0 }; const byRule = {};
for (const r of test) {
  const st = r.reference.label.split('|')[1];
  const v = verdict(r, { step: st, title: '' });
  if (v.text) col.textVeto_allCards++;
  if (v.card) { col.cardVeto_onRefStep++; byRule['card:' + v.card] = (byRule['card:' + v.card] || 0) + 1; }
  if (v.proposal) { col.proposalVeto_onRefStep++; byRule['proposal:' + v.proposal] = (byRule['proposal:' + v.proposal] || 0) + 1; }
}
console.log(`\ncollateral on ${test.length} v2 held-out reference-SHOW rows:`, JSON.stringify(col), JSON.stringify(byRule));
const sil = read(testPath).filter((r) => !r.reference.unsure && r.reference.label === 'SILENT' && r.engine35 && r.engine35.label !== 'SILENT');
let caught = 0; for (const r of sil) { const st = r.engine35.label.split('|')[1]; const v = verdict(r, { step: st, title: '' }); if (v.text || v.card) caught++; }
console.log(`engine wrong-Do-Its (ref SILENT, engine shows) silenced by textVeto|cardVeto: ${caught}/${sil.length}`);
}
runCollateral(path.join(D, 'test.jsonl'));
