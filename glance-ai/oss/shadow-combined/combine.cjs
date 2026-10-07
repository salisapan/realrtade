'use strict';
// Combined system "engine+veto -> LLM inside", scored in shadow against engine alone, engine+veto, v2+veto (+llm-veto).
// Combined rules (the LLM can only):
//   (a) confirm or silence an engine card (engine card survives only if the LLM also says act; family/step stay the engine's),
//   (b) propose a card where the engine is silent -- only if no veto fires (base/product/text/money/past/no-attachment/cap),
//   (c) rewrite the title (kept only if it passes titleVeto + same language; else the engine title).
// Dates always come from the engine (engDate). Hard vetoes (v2 base/product/cap + oss-models/veto/llm-veto.cjs) gate everything.
// usage: node combine.cjs qwen3.5-4b [dictalm3-1.7b ...]
const fs = require('fs'), path = require('path');
const LV = require('../veto/llm-veto.cjs');
const { EVAL } = require('../../paths.cjs');
const { capVeto } = require('../../model/runtime/veto-v2.cjs');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const cases = read(EVAL.shadowCases());
const tags = process.argv.slice(2);
const LLM = {}; for (const t of tags) { const f = path.join(__dirname, `llm-${t}.jsonl`); LLM[t] = fs.existsSync(f) ? Object.fromEntries(read(f).map((r) => [r.id, r])) : {}; }
const step = (l) => (l && l !== 'SILENT' ? l.split('|')[1] : 'SILENT');
const FAM2STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
const HE = /[\u0590-\u05FF]/;
const ctx = (c) => ({ body: c.prompt.body, subject: c.subject, direction: c.direction, surface: c.surface, attachmentCount: c.attachmentCount });
const eng = (c) => ({ dateIso: c.engDate, today: c.today });
const SIL = { step: 'SILENT' };
function hardGate(c) { return c.vetoBase || c.vetoProduct || c.textVeto || null; }
function engineVeto(c, st, withLlmVeto) {
  const cap = capVeto(c.capFlags, c.engine);
  if (c.vetoBase || c.vetoProduct || cap) return c.vetoBase || c.vetoProduct || cap;
  if (!withLlmVeto) return null;
  return c.textVeto || LV.cardVeto(ctx(c), c.own, { step: st }, eng(c));
}
const sys = {
  'engine-0.9.35': (c) => ({ step: step(c.engine), title: c.engTitle }),
  'engine+veto (v2 stack)': (c) => { const s = step(c.engine); return s === 'SILENT' || engineVeto(c, s, false) ? SIL : { step: s, title: c.engTitle }; },
  'engine+veto (+llm-veto)': (c) => { const s = step(c.engine); return s === 'SILENT' || engineVeto(c, s, true) ? SIL : { step: s, title: c.engTitle }; },
  'v2+veto': (c) => ({ step: step(c.v2veto), title: c.engTitle }),
  'v2+veto (+llm-veto)': (c) => { const s = step(c.v2veto); if (s === 'SILENT') return SIL; return c.textVeto || LV.cardVeto(ctx(c), c.own, { step: s }, eng(c)) ? SIL : { step: s, title: c.engTitle }; },
};
function goodTitle(t, lang) { return t && !LV.titleVeto(t) && (HE.test(t) === (lang === 'he')); }
function combined(tag, mode) {
  return (c) => {
    const s = step(c.engine);
    const r = LLM[tag][c.id]; const p = r && r.pred;
    if (c.direction !== 'inbound') return sys['engine+veto (+llm-veto)'](c); // LLM never judges own/self mail; engine + vetoes decide
    if (hardGate(c)) return SIL;
    // Missing LLM pred (incomplete run / outbound skip) must NOT count as silence — keep engine+veto behavior.
    const llmAct = !!(p && p.decision === 'act');
    const llmSilence = !!(p && p.decision === 'silence');
    if (s !== 'SILENT') {
      if (engineVeto(c, s, true)) return SIL;
      if (mode === 'confirm' && llmSilence) return Object.assign({ via: 'llm-silenced-engine' }, SIL);
      // confirm mode with no pred yet: fall through and keep the engine card (same as propose-only)
      return { step: s, title: llmAct && goodTitle(p.title, c.lang) ? p.title : c.engTitle, via: llmAct ? 'engine+llm-confirm' : 'engine' };
    }
    if (!llmAct) return SIL;
    const ps = FAM2STEP[p.family] || (/save/.test(p.action || '') ? 'file_save' : null);
    if (!ps) return SIL;
    const card = { step: ps, action: p.action, title: p.title };
    const v = LV.proposalVeto(ctx(c), c.own, card, eng(c)) || capVeto(c.capFlags, 'x|' + ps);
    if (v) return Object.assign({ vetoed: v }, SIL);
    if (!goodTitle(p.title, c.lang)) return Object.assign({ vetoed: 'title' }, SIL);
    return { step: ps, title: p.title, via: 'llm-proposal', due: c.engDate || '' };
  };
}
for (const t of tags) { sys[`combined: engine+veto -> ${t} (confirm/silence + propose)`] = combined(t, 'confirm'); sys[`combined: engine+veto -> ${t} (propose-only, engine cards kept)`] = combined(t, 'propose'); }
// title quality (eval/score.py title_ok, ported)
const GREET = /^(hi|hello|hey|dear|re:|fw:|שלום|היי|הי)\b|sali|סאלי/i;
const DATEW = /\b(by|until|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|october|oct)\b|\d{1,2}[:/.]\d{2}|(?:^|\s)עד(?:\s|$)|יום\s|ראשון|שלישי|רביעי|חמישי|מחר/i;
const PRON = /^(i|we|i'll|we'll|i will|let's|quick|thanks|sorry|can|could|please)\b/i;
function titleOk(t, lang) { t = String(t || '').trim(); if (!t || t.length > 60 || GREET.test(t) || DATEW.test(t) || HE.test(t) !== (lang === 'he')) return false; return lang === 'he' ? t.split(' ')[0].startsWith('ל') : (!PRON.test(t) && t.split(/\s+/).length >= 2); }
function goldOf(c) { const g = c.gold.step; return g === 'AMBIGUOUS' || g === 'ANY' ? null : g; }
function score(name, rows) {
  const m = { n: 0, sil: 0, wdi: 0, show: 0, miss: 0, wact: 0, he: { show: 0, miss: 0, sil: 0, wdi: 0 }, en: { show: 0, miss: 0, sil: 0, wdi: 0 }, tN: 0, tOk: 0, wdiIds: [] };
  for (const c of rows) {
    const g = goldOf(c); if (!g) continue; const p = sys[name](c); const L = c.lang === 'he' ? 'he' : 'en'; m.n++;
    if (g === 'SILENT') { m.sil++; m[L].sil++; if (p.step !== 'SILENT') { m.wdi++; m[L].wdi++; m.wdiIds.push(`${c.id} [${c.lang}] pred=${p.step}${p.via ? ' via ' + p.via : ''} engine=${c.engine} :: ${JSON.stringify(c.prompt.body.slice(0, 110))}`); } }
    else { m.show++; m[L].show++; if (p.step === 'SILENT') { m.miss++; m[L].miss++; } else { if (p.step !== g) m.wact++; if (p.step === 'task' || p.step === 'draft') { m.tN++; if (titleOk(p.title, c.lang)) m.tOk++; } } }
  }
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—');
  return { name, n: m.n, wrongDoIt: `${pc(m.wdi, m.sil)} (${m.wdi}/${m.sil})`, missed: `${pc(m.miss, m.show)} (${m.miss}/${m.show})`, heMissed: `${pc(m.he.miss, m.he.show)} (${m.he.miss}/${m.he.show})`, enMissed: `${pc(m.en.miss, m.en.show)} (${m.en.miss}/${m.en.show})`,
    heWdi: `${m.he.wdi}/${m.he.sil}`, enWdi: `${m.en.wdi}/${m.en.sil}`, wrongAction: m.wact, titleOk: `${pc(m.tOk, m.tN)} (${m.tOk}/${m.tN})`, wdiIds: m.wdiIds, raw: m };
}
const SETS = [['OSS eval CORE162', (c) => c.set === 'oss' && c.core], ['OSS eval all 275', (c) => c.set === 'oss'], ['v2 held-out stratified sample (~400, EN/HE balanced)', (c) => c.set === 'v2test'],
  ['adversarial-v2 (spec labels, AMBIGUOUS excluded)', (c) => c.set === 'adv'], ['injection/money/past/no-attachment hand set (money asks excluded)', (c) => c.set === 'inj'], ['ALL sets pooled', () => true]];
const R = { builtAt: new Date().toISOString(), tags, sets: {}, latency: {}, coverage: {}, notes: [] };
let md = `# Combined shadow: engine+veto -> LLM inside\n\nBuilt ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' })} IL time. LLM(s): ${tags.join(', ') || 'none'}. Engine = Glance 0.9.35 core; vetoes = model/runtime/veto-v2 (base/product/cap, read-only) + oss-models/veto/llm-veto.cjs.\n`;
for (const t of tags) { const need = cases.filter((c) => c.needLLM), miss = need.filter((c) => !(LLM[t][c.id] && LLM[t][c.id].pred)); if (miss.length) md += `\n> **PARTIAL: ${t} has no usable prediction for ${miss.length}/${need.length} needLLM cases** (still running or unparsable). Those cases fall back to engine+veto (+llm-veto) in both combined modes, so combined rows are not final.\n`; }
md += `\nNote (fix 2026-10-08): earlier builds treated a missing LLM prediction as \"LLM said silence\", so in confirm/silence mode every engine card without a prediction yet was silenced (the 100%-missed rows of the 00:41 build). A missing/unparsable prediction now means \"LLM unavailable\" -> engine+veto (+llm-veto) behavior.\n`;
for (const [title, f] of SETS) {
  const rows = cases.filter(f); R.sets[title] = {};
  md += `\n### ${title}\n\n| system | n | wrong-Do-It | missed | HE missed | EN missed | wrong action | task/reply title OK | wDI HE / EN |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const name of Object.keys(sys)) { const s = score(name, rows); R.sets[title][name] = s; md += `| ${name} | ${s.n} | ${s.wrongDoIt} | ${s.missed} | ${s.heMissed} | ${s.enMissed} | ${s.wrongAction} | ${s.titleOk} | ${s.heWdi} / ${s.enWdi} |\n`; }
}
for (const t of tags) {
  const lat = Object.values(LLM[t]).filter((r) => !r.reused && r.latency_s != null).map((r) => r.latency_s).sort((a, b) => a - b);
  const all = Object.values(LLM[t]).map((r) => r.latency_s).filter((x) => x != null).sort((a, b) => a - b);
  const need = cases.filter((c) => c.needLLM).length, have = cases.filter((c) => c.needLLM && LLM[t][c.id]).length;
  const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : null);
  R.latency[t] = { calls_this_run: lat.length, p50_s: q(lat, 0.5), p95_s: q(lat, 0.95), p50_all_incl_reused_s: q(all, 0.5), share_of_emails_needing_llm: +(need / cases.length).toFixed(3), coverage: `${have}/${need}` };
  const props = cases.filter((c) => c.needLLM && step(c.engine) === 'SILENT' && LLM[t][c.id] && LLM[t][c.id].pred && LLM[t][c.id].pred.decision === 'act');
  const vetoedBy = {}; for (const c of props) { const o = sys[`combined: engine+veto -> ${t} (confirm/silence + propose)`](c); const k = o.vetoed || (o.step !== 'SILENT' ? 'shown' : 'silent'); vetoedBy[k] = (vetoedBy[k] || 0) + 1; }
  R.coverage[t] = { llm_proposals_where_engine_silent: props.length, outcome: vetoedBy };
  const moneyLeak = cases.filter((c) => c.money && sys[`combined: engine+veto -> ${t} (confirm/silence + propose)`](c).via === 'llm-proposal').length;
  R.coverage[t].llm_proposals_shown_on_money_text = moneyLeak;
  const conf = sys[`combined: engine+veto -> ${t} (confirm/silence + propose)`], base = sys['engine+veto (+llm-veto)'];
  const goodKilled = cases.filter((c) => { const g = goldOf(c); return g && g !== 'SILENT' && base(c).step === g && conf(c).via === 'llm-silenced-engine'; });
  R.coverage[t].confirm_mode_correct_engine_cards_silenced = goodKilled.length;
  R.coverage[t].confirm_mode_correct_engine_cards_silenced_ids = goodKilled.map((c) => c.id);
  R.coverage[t].missing_preds = cases.filter((c) => c.needLLM && !(LLM[t][c.id] && LLM[t][c.id].pred)).length;
}
md += `\n### LLM latency and coverage\n\n| LLM | calls (this run) | p50 / p95 per call | share of emails that reach the LLM | needLLM coverage (usable preds) | LLM proposals where engine silent → outcome | LLM proposals shown on money text | confirm mode: correct engine cards silenced by LLM |\n|---|---|---|---|---|---|---|---|\n`;
for (const t of tags) md += `| ${t} | ${R.latency[t].calls_this_run} | ${R.latency[t].p50_s}s / ${R.latency[t].p95_s}s | ${(100 * R.latency[t].share_of_emails_needing_llm).toFixed(0)}% | ${R.latency[t].coverage} (${R.coverage[t].missing_preds} missing) | ${R.coverage[t].llm_proposals_where_engine_silent} → ${JSON.stringify(R.coverage[t].outcome)} | ${R.coverage[t].llm_proposals_shown_on_money_text} | ${R.coverage[t].confirm_mode_correct_engine_cards_silenced} |\n`;
md += '\n## Wrong-Do-Its (pooled, every set)\n';
for (const name of Object.keys(sys)) { const s = R.sets['ALL sets pooled'][name]; md += `\n**${name}** (${s.wdiIds.length})\n\n` + s.wdiIds.slice(0, 40).map((x) => '- `' + x.split(' ')[0] + '` ' + x.split(' ').slice(1).join(' ')).join('\n') + (s.wdiIds.length > 40 ? `\n- …${s.wdiIds.length - 40} more in results.json` : '') + '\n'; }
const MUST = ['v2syn-9371', 'v2rtest-close-families-corpus-128', 'v2rtest-intent-actions-corpus-1122'];
md += '\n## The 3 v2+veto held-out wrong-Do-Its\n\n| id | v2+veto | v2+veto (+llm-veto) | engine+veto (+llm-veto) | ' + tags.map((t) => 'combined ' + t).join(' | ') + ' |\n|---|---|---|---|' + tags.map(() => '---').join('|') + '|\n';
for (const id of MUST) { const c = cases.find((x) => x.id === id); if (!c) continue; md += `| ${id} | ${sys['v2+veto'](c).step} | ${sys['v2+veto (+llm-veto)'](c).step} | ${sys['engine+veto (+llm-veto)'](c).step} | ${tags.map((t) => sys[`combined: engine+veto -> ${t} (confirm/silence + propose)`](c).step).join(' | ')} |\n`; }
fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(__dirname, 'tables.md'), md);
console.log(md.split('## Wrong-Do-Its')[0]);
