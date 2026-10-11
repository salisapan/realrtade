'use strict';
// M1 measurement: the Understanding validator (flow-trial-extension/core/understanding.js) on the CACHED Qwen3.5-4B shadow predictions.
// No LLM is run. Same cases, same labels and the same device vetoes as score-gated.cjs; the only new thing is the grounding step.
//
// The cached answers predate the contract: they carry {decision, family, action, title, due} and no spans. The adapter below gives each
// claim the span the text itself offers: the due date is grounded only by a sentence whose words the device reads as that same date;
// the ask is that sentence, or the sentence that shares the most words with the title. A claim the text does not support gets no span and
// the validator drops it. Confidence is not in the cached answers; every act is given 0.9, so the confidence floor is NOT measured here.
// usage: node score-understanding.cjs [--json]
const fs = require('fs'), path = require('path');
const LV = require('../../veto/llm-veto.cjs');
const PG = require('../../veto/propose-gate.cjs');
const { EVAL } = require('../../../paths.cjs');
const { capVeto } = require('../../../model/runtime/veto-v2.cjs');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const { FlowUnderstanding: U } = require(path.join(ROOT, 'flow-trial-extension/core/understanding.js'));
const { FlowExtract: X } = require(path.join(ROOT, 'flow-trial-extension/core/extract.js'));
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const cases = read(EVAL.shadowCases());
const LLM = Object.fromEntries(read(path.join(__dirname, '..', 'llm-qwen3.5-4b.jsonl')).map((r) => [r.id, r]));
const REL = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'relabels.json'), 'utf8')).map((r) => [r.id, r]));
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const FAM2STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
const FAM2KIND = { task: 'promise_to_me', calendar: 'meeting', reply: 'ask_of_me', file: 'ask_of_me' };
const HE = /[֐-׿]/;
const ctx = (c) => ({ body: c.prompt.body, subject: c.subject, direction: c.direction, surface: c.surface, attachmentCount: c.attachmentCount });
const eng = (c) => ({ dateIso: c.engDate, today: c.today });
const SIL = { step: 'SILENT' };
const hardGate = (c) => c.vetoBase || c.vetoProduct || c.textVeto || null;
function engineVeto(c, st) { const cap = capVeto(c.capFlags, c.engine); if (c.vetoBase || c.vetoProduct || cap) return c.vetoBase || c.vetoProduct || cap; return c.textVeto || LV.cardVeto(ctx(c), c.own, { step: st }, eng(c)); }
const goodTitle = (t, lang) => t && !LV.titleVeto(t) && (HE.test(t) === (lang === 'he'));
function baseline(c) { const s = step(c.engine); return s === 'SILENT' || engineVeto(c, s) ? SIL : { step: s, title: c.engTitle }; }

// --- adapter: a cached answer -> an Understanding with the spans the text offers ---
const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 3);
const words = (t) => new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).map((w) => (HE.test(w) ? w.replace(/^[להבוכמש]/, '') : w)));
function toUnderstanding(c, p) {
  const text = c.own, now = new Date(c.today + 'T12:00:00'), ss = sentences(text);
  // The place: the sentence that carries the date the model claimed, else the first sentence with any date the device can read.
  // The value is the device's reading of that place, not the model's ISO (a disagreement is corrected and counted).
  let dueSpan;
  if (p.due) {
    const hit = ss.find((s) => { const d = X.parseDate(s, now); return d && d.iso === p.due; });
    dueSpan = hit || ss.find((s) => { const d = X.parseDate(s, now); return d && d.iso; });
  }
  let askSpan = dueSpan || null;
  if (!askSpan) {
    const tw = words(p.title); let best = null, bestN = 0;
    for (const s of ss) { const sw = words(s); let n = 0; for (const w of tw) if (sw.has(w)) n++; if (n > bestN) { best = s; bestN = n; } }
    askSpan = bestN >= 1 ? best : undefined;
  }
  return { relevant: 'unknown', state: 'open', needs: p.family === 'file' ? ['file'] : [],
    intentions: [{ kind: FAM2KIND[p.family] || 'fyi', actor: 'sender', ask_span: askSpan, evidence_span: askSpan, due: p.due || undefined, due_span: dueSpan, confidence: 0.9 }] };
}
function grounded(c, p) {
  const v = U.validate(toUnderstanding(c, p), c.own, { today: c.today });
  if (!v.ok) return { step: 'SILENT', reason: 'invalid-' + v.reason, drops: v.drops };
  const q = U.proposal(v.understanding, { attachmentCount: c.attachmentCount || 0 });
  return Object.assign({ drops: v.drops, corrected: v.drops.some((d) => d.reason === 'model-date-corrected') }, q);
}

// --- the systems ---
function system(useGate, useU) {
  return (c) => {
    const s = step(c.engine), p = LLM[c.id] && LLM[c.id].pred;
    if (c.direction !== 'inbound') return baseline(c);
    if (hardGate(c)) return SIL;
    const llmAct = !!(p && p.decision === 'act');
    if (s !== 'SILENT') { if (engineVeto(c, s)) return SIL; return { step: s, via: 'engine' }; }
    if (!llmAct) return SIL;
    let st = FAM2STEP[p.family] || null; if (!st) return SIL;
    let due = p.due || null;
    if (useU) {
      const q = grounded(c, p); due = q.due;
      if (q.step === 'SILENT') return Object.assign({ vetoed: 'understanding:' + q.reason, ungrounded: true }, SIL);
      if (q.step !== st) return Object.assign({ vetoed: 'understanding:step-mismatch:' + q.step, ungrounded: true }, SIL);
    }
    if (useGate) {
      const g = PG.gate(c, c.own, p, eng(c), null);
      if (!g.pass) return Object.assign({ vetoed: g.reason }, SIL);
      st = g.step;
      if (st === 'file_save') {
        const v = LV.textVeto(ctx(c), c.own) || (LV.moneyMovement(ctx(c), c.own) ? 'money-movement' : null); if (v) return Object.assign({ vetoed: v }, SIL);
        return { step: 'file_save', via: 'llm', due };
      }
    }
    const v = LV.proposalVeto(ctx(c), c.own, { step: st, action: p.action, title: p.title }, eng(c)) || capVeto(c.capFlags, 'x|' + st); if (v) return Object.assign({ vetoed: v }, SIL);
    if (!goodTitle(p.title, c.lang)) return Object.assign({ vetoed: 'title' }, SIL);
    return { step: st, via: 'llm', due };
  };
}
const SYS = {
  'engine+veto (today)': baseline,
  'model, no gate': system(false, false),
  'model + Understanding validator (M1)': system(false, true),
  'model + strict propose-gate': system(true, false),
  'model + Understanding validator + strict gate': system(true, true),
};
function goldOf(c) { if (REL[c.id]) return REL[c.id].to; const g = c.gold.step; return g === 'AMBIGUOUS' || g === 'ANY' ? null : g; }
function score(fn, rows) {
  const m = { n: 0, sil: 0, wdi: 0, show: 0, miss: 0, wact: 0, dated: 0, wrongDate: 0, wrongDateIds: [], he: { show: 0, miss: 0, sil: 0, wdi: 0 }, en: { show: 0, miss: 0, sil: 0, wdi: 0 }, wdiIds: [] };
  for (const c of rows) {
    const g = goldOf(c); if (!g) continue; const p = fn(c); const L = c.lang === 'he' ? 'he' : 'en'; m.n++;
    if (g === 'SILENT') { m.sil++; m[L].sil++; if (p.step !== 'SILENT') { m.wdi++; m[L].wdi++; m.wdiIds.push(c.id); } }
    else { m.show++; m[L].show++; if (p.step === 'SILENT') { m.miss++; m[L].miss++; } else if (p.step !== g) m.wact++;
      else if (p.via === 'llm' && c.gold.due && (p.step === 'calendar' || p.step === 'task' || p.step === 'draft')) { m.dated++; if (p.due !== c.gold.due) { m.wrongDate++; m.wrongDateIds.push(`${c.id} card=${p.due} gold=${c.gold.due}`); } } }
  }
  return m;
}
const SETS = [['OSS 275', (c) => c.set === 'oss'], ['v2 held-out 400', (c) => c.set === 'v2test'], ['adversarial 72', (c) => c.set === 'adv'], ['injection 39', (c) => c.set === 'inj'], ['ALL pooled 786', () => true]];
const R = {};
let md = '# Understanding validator (M1) on cached Qwen3.5-4B answers\n\nNo LLM was run. Spec labels. Confidence not measured (cached answers carry none).\n';
for (const [title, f] of SETS) {
  const rows = cases.filter(f); R[title] = {};
  md += `\n### ${title}\n\n| system | n | wrong Do It | missed | HE missed | EN missed | wrong Do It HE / EN | wrong action | model card, wrong date |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const [name, fn] of Object.entries(SYS)) {
    const s = score(fn, rows); R[title][name] = { n: s.n, wdi: s.wdi, sil: s.sil, miss: s.miss, show: s.show, heMiss: s.he.miss, heShow: s.he.show, enMiss: s.en.miss, enShow: s.en.show, heWdi: s.he.wdi, enWdi: s.en.wdi, wact: s.wact, wdiIds: s.wdiIds, dated: s.dated, wrongDate: s.wrongDate, wrongDateIds: s.wrongDateIds };
    md += `| ${name} | ${s.n} | ${s.wdi}/${s.sil} | ${s.miss}/${s.show} | ${s.he.miss}/${s.he.show} | ${s.en.miss}/${s.en.show} | ${s.he.wdi} / ${s.en.wdi} | ${s.wact} | ${s.wrongDate}/${s.dated} |\n`;
  }
}
// what the validator did to each model proposal the engine left silent
const noGate = SYS['model, no gate'], withU = SYS['model + Understanding validator (M1)'];
const rows = [];
for (const c of cases) {
  const p = LLM[c.id] && LLM[c.id].pred; if (!p || p.decision !== 'act' || step(c.engine) !== 'SILENT' || c.direction !== 'inbound' || hardGate(c)) continue;
  const a = noGate(c), b = withU(c), g = goldOf(c); if (a.step === b.step) continue;
  rows.push({ id: c.id, set: c.set, lang: c.lang, gold: g, model: `${p.family}/${p.due || '-'}`, noGate: a.step, withU: b.step + (b.vetoed ? ` (${b.vetoed})` : ''),
    effect: g === 'SILENT' ? 'prevented wrong Do It' : (g ? 'lost a right Do It' : 'unlabelled') });
}
md += `\n## What the validator changed (${rows.length} model proposals)\n\n| id | set/lang | gold | model | no gate | with validator | effect |\n|---|---|---|---|---|---|---|\n` + rows.map((r) => `| ${r.id} | ${r.set}/${r.lang} | ${r.gold} | ${r.model} | ${r.noGate} | ${r.withU} | ${r.effect} |`).join('\n') + '\n';
R.changed = rows;
fs.writeFileSync(path.join(__dirname, 'understanding-tables.md'), md);
fs.writeFileSync(path.join(__dirname, 'understanding-results.json'), JSON.stringify(R, null, 1) + '\n');
console.log(process.argv.includes('--json') ? JSON.stringify(R['ALL pooled 786'], null, 1) : md);
// pass bar: the validator never adds a wrong Do It, and with the strict gate every set stays at 0.
const K = 'model + Understanding validator + strict gate';
const pass = SETS.every(([t]) => R[t][K].wdi === 0) && SETS.every(([t]) => R[t]['model + Understanding validator (M1)'].wdi <= R[t]['model, no gate'].wdi);
console.log(pass ? 'PASS' : 'FAIL'); process.exitCode = pass ? 0 : 3;
