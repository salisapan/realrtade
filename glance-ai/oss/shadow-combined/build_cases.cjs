'use strict';
// Builds the combined-shadow case file: OSS eval (275), stratified v2 held-out sample (~400, EN/HE balanced, incl. the 3 v2+veto
// wrong-Do-Its), adversarial-v2 (74) and the hand-written injection/money set (veto/injection-cases.jsonl).
// For every case: engine 0.9.35 label + base/product/cap vetoes (model/runtime, read-only), engine date, v2+veto label, LLM-veto
// text verdict, and the exact prompt-case the LLM sees. Read-only on model/; writes only here.
const fs = require('fs'), path = require('path');
const { analyze } = require('./engine-plus.cjs');
const LV = require('../veto/llm-veto.cjs');
const { ROOT: AI } = require('../../paths.cjs');
const V2 = require(path.join(AI, 'model/runtime/glance-close-v2.cjs')).make('v2');
const D = process.env.GLANCE_V2_DATASET || path.join(AI, 'model', 'dataset', 'out-v2');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map(JSON.parse);
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const FAM2STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
// deterministic PRNG
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function rr(groups, n) { const keys = Object.keys(groups).sort(); const g = Object.fromEntries(keys.map((k) => [k, shuffle(groups[k])])); const out = []; let i = 0; while (out.length < n && keys.some((k) => g[k].length)) { const k = keys[i++ % keys.length]; if (g[k].length) out.push(g[k].shift()); } return out; }
const groupBy = (a, f) => a.reduce((m, r) => ((m[f(r)] = m[f(r)] || []).push(r), m), {});
const cases = [];
function push(set, r, gold, promptCase, extra) {
  const A = analyze(r);
  const own = A.P.own;
  const v2 = V2.decide(r);
  cases.push(Object.assign({ id: r.id, set, lang: r.lang, surface: r.surface || 'gmail', direction: r.direction || 'inbound', attachmentCount: r.attachmentCount || 0,
    gold, engine: A.P.eng.label, engineReason: A.P.eng.reason, engDate: A.eng.dateIso, engTitle: A.eng.title, today: A.eng.today,
    vetoBase: A.P.veto.base, vetoProduct: A.P.veto.product, capFlags: A.P.veto.cap, textVeto: LV.textVeto(A.P.c, own), money: LV.moneyMovement(A.P.c, own),
    v2veto: v2.label, v2alone: v2.modelAlone, own, subject: r.subject || '', prompt: promptCase }, extra || {}));
}
// (1) OSS eval 275: exact eval.jsonl prompt rows (so earlier Qwen/DictaLM preds are reusable)
const ev = Object.fromEntries(read('../eval/eval.jsonl').map((r) => [r.id, r]));
for (let r of read(D + '/oss-eval.jsonl')) {
  const e = ev[r.id.replace(/^oss-/, '')];
  // out-v2/oss-eval.jsonl carries attachmentCount=1 on att0/att2/noatt rows; eval.jsonl is the source of truth
  r = Object.assign({}, r, { attachmentCount: (e.attachments || []).length, surface: e.surface || r.surface });
  const gold = { step: e.gold.decision === 'act' ? FAM2STEP[e.gold.family] : 'SILENT', due: e.gold.due || '', title: e.gold.title || '', source: e.goldSource };
  push('oss', r, gold, { eval_id: e.id, direction: e.direction, from: e.from, subject: e.subject, attachments: e.attachments || [], body: e.body }, { core: false });
}
const CORE = new Set(fs.readFileSync('../eval/core_subset.txt', 'utf8').trim().split(','));
for (const c of cases) c.core = CORE.has(c.id.replace(/^oss-/, ''));
// (2) stratified v2 held-out sample
const test = read(D + '/test.jsonl').filter((r) => !r.reference.unsure);
const MUST = ['v2syn-9371', 'v2rtest-close-families-corpus-128', 'v2rtest-intent-actions-corpus-1122'];
const picked = new Set(MUST);
for (const L of ['en', 'he']) {
  const rows = test.filter((r) => r.lang === L && !picked.has(r.id));
  const show = rows.filter((r) => r.reference.label !== 'SILENT'), sil = rows.filter((r) => r.reference.label === 'SILENT');
  for (const r of rr(groupBy(show, (r) => r.reference.label), 90)) picked.add(r.id);
  for (const r of rr(groupBy(sil, (r) => (r.reference.ruleCorrected.filter((x) => x !== 'typo-invariant')[0] || r.scenario || r.provenance)), L === 'en' ? 108 : 109)) picked.add(r.id);
}
const norm = (r) => require(path.join(AI, 'model/runtime/normalize.cjs')).normalizeCase(r).body;
for (const r of read(D + '/test.jsonl').filter((r) => picked.has(r.id))) {
  const L = r.reference.label;
  push('v2test', r, { step: step(L), label: L, rules: r.reference.ruleCorrected, scenario: r.scenario || r.provenance },
    { direction: r.direction, from: (r.from || {}).email, subject: r.subject, attachments: Array.from({ length: r.attachmentCount || 0 }, (_, i) => `attachment${i + 1}.pdf`), body: norm(r) }, { mustInclude: MUST.includes(r.id) });
}
// (3) adversarial-v2
for (const r of read(D + '/adversarial-v2.jsonl')) push('adv', r, { step: r.expect === 'AMBIGUOUS' ? 'AMBIGUOUS' : r.expect, kind: r.kind },
  { direction: r.direction, from: (r.from || {}).email, subject: r.subject, attachments: Array.from({ length: r.attachmentCount || 0 }, (_, i) => `attachment${i + 1}.pdf`), body: norm(r) });
// (4) hand-written injection / money / past / no-attachment set
if (fs.existsSync('../veto/injection-cases.jsonl')) for (const r of read('../veto/injection-cases.jsonl')) push('inj', Object.assign({ surface: 'gmail', direction: 'inbound', from: { name: 'X', email: 'x@partner.example' }, to: ['ai.local.flow@gmail.com'], cc: [], ownNames: ['Sali', 'Sali Sapan', 'סאלי'] }, r),
  { step: r.expect, kind: r.kind }, { direction: 'inbound', from: 'x@partner.example', subject: r.subject || '', attachments: Array.from({ length: r.attachmentCount || 0 }, (_, i) => `attachment${i + 1}.pdf`), body: r.body });
for (const c of cases) c.needLLM = c.direction === 'inbound' && !c.vetoBase && !c.vetoProduct && !c.textVeto;
fs.writeFileSync('cases.jsonl', cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
const cnt = groupBy(cases, (c) => c.set);
for (const [k, v] of Object.entries(cnt)) console.log(k, v.length, 'needLLM', v.filter((c) => c.needLLM).length, 'en', v.filter((c) => c.lang === 'en').length, 'he', v.filter((c) => c.lang === 'he').length, 'goldShow', v.filter((c) => !['SILENT', 'AMBIGUOUS'].includes(c.gold.step)).length);
