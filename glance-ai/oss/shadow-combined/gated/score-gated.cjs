'use strict';
// Offline re-score of the combined shadow (engine+veto -> Qwen3.5-4B, propose-only) with the deterministic propose-gate
// (oss-models/veto/propose-gate.cjs). Uses the CACHED predictions in ../llm-<tag>.jsonl; no LLM is run.
// Writes gated/tables.md, gated/results.json, gated/gate-drops.jsonl.
// usage: node score-gated.cjs [qwen3.5-4b]
const fs = require('fs'), path = require('path');
const LV = require('../../veto/llm-veto.cjs');
const PG = require('../../veto/propose-gate.cjs');
const RL = require('./relabel.cjs');
const { EVAL } = require('../../../paths.cjs');
const { capVeto } = require('../../../model/runtime/veto-v2.cjs');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const tag = process.argv[2] || 'qwen3.5-4b';
const OUTD = tag === 'qwen3.5-4b' ? __dirname : path.join(__dirname, tag); fs.mkdirSync(OUTD, { recursive: true });
// step-1 pass bar for any later model (e.g. the LoRA): strict gate, spec labels -> 0 wrong-Do-It on every set AND v2 held-out 400 missed <= MISS_BAR
const MISS_BAR = Number(process.env.MISS_BAR || 20);
const cases = read(EVAL.shadowCases());
const LLM = Object.fromEntries(read(path.join(__dirname, '..', `llm-${tag}.jsonl`)).map((r) => [r.id, r]));
const relabels = JSON.parse(fs.readFileSync(path.join(__dirname, 'relabels.json'), 'utf8'));
const REL = Object.fromEntries(relabels.map((r) => [r.id, r]));
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const FAM2STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
const HE = /[\u0590-\u05FF]/;
const ctx = (c) => ({ body: c.prompt.body, subject: c.subject, direction: c.direction, surface: c.surface, attachmentCount: c.attachmentCount });
const eng = (c) => ({ dateIso: c.engDate, today: c.today });
const SIL = { step: 'SILENT' };
const hardGate = (c) => c.vetoBase || c.vetoProduct || c.textVeto || null;
function engineVeto(c, st) { const cap = capVeto(c.capFlags, c.engine); if (c.vetoBase || c.vetoProduct || cap) return c.vetoBase || c.vetoProduct || cap; return c.textVeto || LV.cardVeto(ctx(c), c.own, { step: st }, eng(c)); }
const goodTitle = (t, lang) => t && !LV.titleVeto(t) && (HE.test(t) === (lang === 'he'));
function baseline(c) { const s = step(c.engine); return s === 'SILENT' || engineVeto(c, s) ? SIL : { step: s, title: c.engTitle }; }
// attachment data: NO set in cases.jsonl carries the real file list (names only for OSS, a count for v2/adv/inj; no size / inline /
// contentId / kind). Strict = unread. Sensitivity = declared files modelled as real, non-inline 240KB PDFs (not a result).
function attData(c, mode) { if (mode !== 'assume-real') return null; return { read: true, consent: true, attachments: RL.realPdfs(c.attachmentCount || 0), bodyCids: [], headers: {} }; }
function combined(gateMode) {
  return (c) => {
    const s = step(c.engine), r = LLM[c.id], p = r && r.pred;
    if (c.direction !== 'inbound') return baseline(c);
    if (hardGate(c)) return SIL;
    const llmAct = !!(p && p.decision === 'act');
    if (s !== 'SILENT') { if (engineVeto(c, s)) return SIL; return { step: s, title: llmAct && goodTitle(p.title, c.lang) ? p.title : c.engTitle, via: 'engine' }; }
    if (!llmAct) return SIL;
    if (gateMode === 'none') {
      const ps = FAM2STEP[p.family] || (/save/.test(p.action || '') ? 'file_save' : null); if (!ps) return SIL;
      const card = { step: ps, action: p.action, title: p.title };
      const v = LV.proposalVeto(ctx(c), c.own, card, eng(c)) || capVeto(c.capFlags, 'x|' + ps); if (v) return Object.assign({ vetoed: v }, SIL);
      if (!goodTitle(p.title, c.lang)) return Object.assign({ vetoed: 'title' }, SIL);
      return { step: ps, title: p.title, via: 'llm-proposal' };
    }
    const g = PG.gate(c, c.own, p, eng(c), attData(c, gateMode));
    if (!g.pass) return Object.assign({ vetoed: g.reason, gated: true }, SIL);
    if (g.step === 'file_save') {
      // attachmentSave step from suggest-save; text-level vetoes still apply; attachment count/target rules are suggest-save's job
      const v = LV.textVeto(ctx(c), c.own) || (LV.moneyMovement(ctx(c), c.own) ? 'money-movement' : null); if (v) return Object.assign({ vetoed: v }, SIL);
      return { step: 'file_save', kind: 'attachmentSave', target: g.card.target, title: g.card.chip.en, via: 'llm-proposal->suggest-save' };
    }
    const card = { step: g.step, action: p.action, title: p.title };
    const v = LV.proposalVeto(ctx(c), c.own, card, eng(c)) || capVeto(c.capFlags, 'x|' + g.step); if (v) return Object.assign({ vetoed: v }, SIL);
    if (!goodTitle(p.title, c.lang)) return Object.assign({ vetoed: 'title' }, SIL);
    return { step: g.step, title: p.title, via: 'llm-proposal' };
  };
}
const SYS = {
  'engine+veto (+llm-veto)': baseline,
  'propose-only, no gate (01:22 build)': combined('none'),
  'propose-only + propose-gate (strict: real attachment list unread)': combined('strict'),
  'propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs)': combined('assume-real'),
};
const GREET = /^(hi|hello|hey|dear|re:|fw:|שלום|היי|הי)\b|sali|סאלי/i;
const DATEW = /\b(by|until|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|october|oct)\b|\d{1,2}[:/.]\d{2}|(?:^|\s)עד(?:\s|$)|יום\s|ראשון|שלישי|רביעי|חמישי|מחר/i;
const PRON = /^(i|we|i'll|we'll|i will|let's|quick|thanks|sorry|can|could|please)\b/i;
function titleOk(t, lang) { t = String(t || '').trim(); if (!t || t.length > 60 || GREET.test(t) || DATEW.test(t) || HE.test(t) !== (lang === 'he')) return false; return lang === 'he' ? t.split(' ')[0].startsWith('ל') : (!PRON.test(t) && t.split(/\s+/).length >= 2); }
function goldOf(c, labels) { if (labels === 'spec' && REL[c.id]) return REL[c.id].to; const g = c.gold.step; return g === 'AMBIGUOUS' || g === 'ANY' ? null : g; }
function score(fn, rows, labels) {
  const m = { n: 0, sil: 0, wdi: 0, show: 0, miss: 0, wact: 0, he: { show: 0, miss: 0, sil: 0, wdi: 0 }, en: { show: 0, miss: 0, sil: 0, wdi: 0 }, tN: 0, tOk: 0, wdiIds: [], missIds: [], wactIds: [] };
  for (const c of rows) {
    const g = goldOf(c, labels); if (!g) continue; const p = fn(c); const L = c.lang === 'he' ? 'he' : 'en'; m.n++;
    if (g === 'SILENT') { m.sil++; m[L].sil++; if (p.step !== 'SILENT') { m.wdi++; m[L].wdi++; m.wdiIds.push(`${c.id} pred=${p.step}${p.via ? ' via ' + p.via : ''}`); } }
    else { m.show++; m[L].show++; if (p.step === 'SILENT') { m.miss++; m[L].miss++; m.missIds.push(`${c.id} gold=${g}${p.vetoed ? ' dropped=' + p.vetoed : ''}`); } else { if (p.step !== g) { m.wact++; m.wactIds.push(`${c.id} gold=${g} pred=${p.step}`); } if (p.step === 'task' || p.step === 'draft') { m.tN++; if (titleOk(p.title, c.lang)) m.tOk++; } } }
  }
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—');
  return { n: m.n, wrongDoIt: `${pc(m.wdi, m.sil)} (${m.wdi}/${m.sil})`, missed: `${pc(m.miss, m.show)} (${m.miss}/${m.show})`, heMissed: `${pc(m.he.miss, m.he.show)} (${m.he.miss}/${m.he.show})`, enMissed: `${pc(m.en.miss, m.en.show)} (${m.en.miss}/${m.en.show})`,
    wdiHeEn: `${m.he.wdi}/${m.he.sil} / ${m.en.wdi}/${m.en.sil}`, wrongAction: m.wact, titleOk: `${pc(m.tOk, m.tN)} (${m.tOk}/${m.tN})`, wdiIds: m.wdiIds, missIds: m.missIds, wactIds: m.wactIds, raw: m };
}
const SETS = [['CORE162', (c) => c.set === 'oss' && c.core], ['OSS all 275', (c) => c.set === 'oss'], ['v2 held-out 400', (c) => c.set === 'v2test'],
  ['adversarial-v2 72', (c) => c.set === 'adv'], ['injection hand set 39', (c) => c.set === 'inj'], ['ALL pooled', () => true]];
const R = { builtAt: new Date().toISOString(), tag, relabels, sets: {}, drops: {} };
const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
let md = `# Propose-gate re-score (offline, cached ${tag} predictions)\n\nBuilt ${now} IL. No LLM was run. Gate: oss-models/veto/propose-gate.cjs. Labels: "v2" = original; "spec" = v2 held-out re-checked against specs/suggest-save.md (${relabels.length} relabels, see gated/relabels.json). OSS / adversarial / injection labels unchanged.\n\n`;
md += `Attachment data: no set carries the real file list (OSS: file names only; v2/adv/inj: a count). So in the strict rows every LLM save proposal gets suggest-save reason suggest:attachments-unread and stays silent. The SENSITIVITY row models each declared attachment as a real 240KB non-inline PDF to show what real data would unlock; it is not a result.\n`;
for (const [title, f] of SETS) {
  const rows = cases.filter(f); R.sets[title] = {};
  md += `\n### ${title}\n\n| system | labels | n | wrong-Do-It | missed | HE missed | EN missed | wDI HE / EN | wrong action | task/reply title OK |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const [name, fn] of Object.entries(SYS)) for (const labels of ['v2', 'spec']) {
    if (labels === 'v2' && name.startsWith('propose-only + propose-gate (SENS')) continue;
    const s = score(fn, rows, labels); R.sets[title][`${name} [${labels}]`] = s;
    md += `| ${name} | ${labels} | ${s.n} | ${s.wrongDoIt} | ${s.missed} | ${s.heMissed} | ${s.enMissed} | ${s.wdiHeEn} | ${s.wrongAction} | ${s.titleOk} |\n`;
  }
}
// gate-drop log: every LLM proposal (engine silent, inbound, past the hard gate) that the gate dropped
const drops = [], strict = SYS['propose-only + propose-gate (strict: real attachment list unread)'], sens = SYS['propose-only + propose-gate (SENSITIVITY: declared attachments = real PDFs)'], ung = SYS['propose-only, no gate (01:22 build)'];
for (const c of cases) {
  const p = LLM[c.id] && LLM[c.id].pred; if (!p || p.decision !== 'act' || step(c.engine) !== 'SILENT' || c.direction !== 'inbound' || hardGate(c)) continue;
  const o = strict(c), u = ung(c), z = sens(c);
  const gV2 = goldOf(c, 'v2'), gSp = goldOf(c, 'spec');
  drops.push({ id: c.id, set: c.set, lang: c.lang, surface: c.surface, goldV2: gV2, goldSpec: gSp, llm: `${p.family}/${p.action}`, ungated: u.step + (u.vetoed ? ' (vetoed ' + u.vetoed + ')' : ''),
    strict: o.step + (o.vetoed ? ' (dropped ' + o.vetoed + ')' : ''), sensitivity: z.step + (z.vetoed ? ' (dropped ' + z.vetoed + ')' : ''), gated: !!o.gated, reason: o.vetoed || null,
    effect: !o.gated ? 'not gated' : (gSp === 'SILENT' ? 'prevented wrong-Do-It' : (u.step !== 'SILENT' ? 'lost recovery' : 'already vetoed')), text: c.own.slice(0, 110) });
}
fs.writeFileSync(path.join(OUTD, 'gate-drops.jsonl'), drops.map((d) => JSON.stringify(d)).join('\n') + '\n');
const byReason = {}; for (const d of drops.filter((x) => x.gated)) (byReason[d.reason] = byReason[d.reason] || []).push(d);
R.drops = { total_llm_proposals: drops.length, gated: drops.filter((d) => d.gated).length, byReason: Object.fromEntries(Object.entries(byReason).map(([k, v]) => [k, v.map((d) => `${d.id} [${d.set}/${d.lang}] gold=${d.goldSpec} -> ${d.effect}`)])) };
md += `\n## Gate drops (${R.drops.gated} of ${drops.length} LLM proposals where the engine was silent)\n\n| reason | id | set/lang | gold (spec) | LLM | effect | text |\n|---|---|---|---|---|---|---|\n`;
for (const [k, v] of Object.entries(byReason).sort()) for (const d of v) md += `| ${k} | ${d.id} | ${d.set}/${d.lang} | ${d.goldSpec} | ${d.llm} | ${d.effect} | ${JSON.stringify(d.text.replace(/\s+/g, ' ').slice(0, 70))} |\n`;
md += `\n## Not gated (passed the gate)\n\n| id | set/lang | gold (spec) | LLM | outcome |\n|---|---|---|---|---|\n` + drops.filter((d) => !d.gated).map((d) => `| ${d.id} | ${d.set}/${d.lang} | ${d.goldSpec} | ${d.llm} | ${d.strict} |`).join('\n') + '\n';
const att = cases.filter((c) => (c.attachmentCount || 0) > 0);
R.attachmentDataUnavailable = { casesWithDeclaredAttachments: att.length, llmSaveProposalsAffected: drops.filter((d) => /suggest:attachments-unread/.test(d.reason || '')).length };
md += `\n## Attachment data\n\n${att.length} of ${cases.length} cases declare attachments; 0 carry the real list (size / inline / contentId / kind). LLM save proposals that went silent for that reason (suggest:attachments-unread): **${R.attachmentDataUnavailable.llmSaveProposalsAffected}**.\n`;
const W = R.sets['ALL pooled']['propose-only + propose-gate (strict: real attachment list unread) [spec]'];
md += `\n## Pooled wrong-Do-Its, strict gate, spec labels: ${W.raw.wdi}\n${W.wdiIds.map((x) => '- ' + x).join('\n')}\n`;
fs.writeFileSync(path.join(OUTD, 'results.json'), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(OUTD, 'tables.md'), md);
const K = 'propose-only + propose-gate (strict: real attachment list unread) [spec]';
const bar = { wdiAllZero: SETS.every(([t]) => R.sets[t][K].raw.wdi === 0), v2Missed: R.sets['v2 held-out 400'][K].raw.miss, missBar: MISS_BAR,
  ungatedWdiV2: R.sets['v2 held-out 400']['propose-only, no gate (01:22 build) [spec]'].raw.wdi,
  coverage: cases.filter((c) => c.needLLM && LLM[c.id] && LLM[c.id].pred).length + '/' + cases.filter((c) => c.needLLM).length };
const [have, need] = bar.coverage.split('/').map(Number); bar.fullCoverage = have === need; // a missing pred falls back to engine+veto, so partial runs must not pass
bar.pass = bar.wdiAllZero && bar.v2Missed <= MISS_BAR && bar.fullCoverage;
R.passBar = bar; fs.writeFileSync(path.join(OUTD, 'results.json'), JSON.stringify(R, null, 1));
md += `\n## Pass bar (strict gate, spec labels)\n\n${JSON.stringify(bar)}\n`; fs.writeFileSync(path.join(OUTD, 'tables.md'), md);
console.log(md); console.log((bar.pass ? 'PASS ' : 'FAIL ') + JSON.stringify(bar)); process.exitCode = bar.pass ? 0 : 3;
