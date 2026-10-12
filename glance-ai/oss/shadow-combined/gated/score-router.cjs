'use strict';
// M2 measurement: the real Router v2 (flow-trial-extension/core/understanding-router.js) end to end on the 786 shadow cases, with the
// device's real mask (core/privacyShield.js + core/mask-ids.js through core/exec-router.js maskForServer) in front of Tier 2.
// Tier 2 is the CACHED Qwen3.5-4B answer (no model is run); there is no Tier 1 here. Tier 0 is the engine + veto columns of each case.
// The cached answers were made on unmasked text and carry no spans, so the adapter quotes the MASKED text the router hands to Tier 2,
// and reads the date with the device's reader after restoring the placeholders. Confidence is not in the cache: every act is 0.9.
// usage: node score-router.cjs
const fs = require('fs'), path = require('path');
const LV = require('../../veto/llm-veto.cjs');
const PG = require('../../veto/propose-gate.cjs');
const { EVAL } = require('../../../paths.cjs');
const { capVeto } = require('../../../model/runtime/veto-v2.cjs');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const core = (f, n) => require(path.join(ROOT, 'flow-trial-extension/core', f))[n];
const U = core('understanding.js', 'FlowUnderstanding');
const Router = core('understanding-router.js', 'FlowUnderstandingRouter');
const ER = core('exec-router.js', 'FlowExecRouter');
const Shield = core('privacyShield.js', 'FlowPrivacyShield');
const MI = core('mask-ids.js', 'FlowMaskIds');
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
const hardGate = (c) => c.vetoBase || c.vetoProduct || c.textVeto || null;
function engineVeto(c, st) { const cap = capVeto(c.capFlags, c.engine); if (c.vetoBase || c.vetoProduct || cap) return c.vetoBase || c.vetoProduct || cap; return c.textVeto || LV.cardVeto(ctx(c), c.own, { step: st }, eng(c)); }
const goodTitle = (t, lang) => t && !LV.titleVeto(t) && (HE.test(t) === (lang === 'he'));
const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 3);
const words = (t) => new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).map((w) => (HE.test(w) ? w.replace(/^[להבוכמש]/, '') : w)));

// Tier 2 stand-in: the cached answer, quoted against the masked text the router actually sends.
function cachedTier2(c, p, unmaskRef) {
  return (masked) => {
    if (!p || p.decision !== 'act') return { relevant: 'unknown', intentions: [] };
    const now = new Date(c.today + 'T12:00:00'), ss = sentences(masked), un = (s) => unmaskRef.fn(s);
    let dueSpan;
    if (p.due) {
      const hit = ss.find((s) => { const d = U.readDate(un(s), now); return d && d.iso === p.due; });
      dueSpan = hit || ss.find((s) => { const d = U.readDate(un(s), now); return d && d.iso; });
    }
    let askSpan = dueSpan || null;
    if (!askSpan) {
      const tw = words(p.title); let best = null, bestN = 0;
      for (const s of ss) { const sw = words(un(s)); let n = 0; for (const w of tw) if (sw.has(w)) n++; if (n > bestN) { best = s; bestN = n; } }
      askSpan = bestN >= 1 ? best : undefined;
    }
    return { relevant: 'unknown', state: 'open', needs: p.family === 'file' ? ['file'] : [],
      intentions: [{ kind: FAM2KIND[p.family] || 'fyi', actor: 'sender', ask_span: askSpan, evidence_span: askSpan, due: p.due || undefined, due_span: dueSpan, confidence: 0.9 }] };
  };
}

async function run(c) {
  const s = step(c.engine), p = LLM[c.id] && LLM[c.id].pred;
  const quiet = hardGate(c) || (s !== 'SILENT' ? engineVeto(c, s) : null);
  const unmaskRef = { fn: (x) => x };
  const deps = {
    mask: (t) => { const m = ER.maskForServer(t, Shield, MI); if (!m.ok) return m; unmaskRef.fn = (x) => MI.unmask(x, m.tokenMap); return { ok: true, text: m.text, unmask: unmaskRef.fn }; },
    tier2: cachedTier2(c, p, unmaskRef),
    // The same strict gate and device vetoes the lab scores with (score-gated.cjs, strict mode).
    gate: (prop) => {
      if (!p) return { pass: false, reason: 'gate:no-pred' };
      if (FAM2STEP[p.family] !== prop.step) return { pass: false, reason: 'gate:step-mismatch' };
      const g = PG.gate(c, c.own, p, eng(c), null);
      return g.pass ? { pass: true, step: g.step } : { pass: false, reason: g.reason };
    },
    veto: (prop) => {
      if (prop.step === 'file_save') return LV.textVeto(ctx(c), c.own) || (LV.moneyMovement(ctx(c), c.own) ? 'money-movement' : null);
      return LV.proposalVeto(ctx(c), c.own, { step: prop.step, action: p.action, title: p.title }, eng(c)) || capVeto(c.capFlags, 'x|' + prop.step) || (goodTitle(p.title, c.lang) ? null : 'title');
    },
  };
  const input = { text: c.own, today: c.today, attachmentCount: c.attachmentCount || 0, direction: c.direction, cloudConsent: true,
    tier0: { quiet: quiet || null, step: quiet ? 'SILENT' : s, possible: !!LLM[c.id] } };
  return Router.route(input, deps, { aiPrimary: true });
}

function goldOf(c) { if (REL[c.id]) return REL[c.id].to; const g = c.gold.step; return g === 'AMBIGUOUS' || g === 'ANY' ? null : g; }
(async () => {
  const res = {};
  for (const c of cases) res[c.id] = await run(c);
  const SETS = [['OSS 275', (c) => c.set === 'oss'], ['v2 held-out 400', (c) => c.set === 'v2test'], ['adversarial 72', (c) => c.set === 'adv'], ['injection 39', (c) => c.set === 'inj'], ['ALL pooled 786', () => true]];
  const R = { sets: {} };
  let md = '# Router v2 (M2) end to end, real device mask, cached Qwen3.5-4B as Tier 2\n\nNo model was run. Spec labels. Tier 1 absent. Confidence not measured.\n\n| set | n | wrong Do It | missed | HE missed | EN missed | wrong date (model cards) | reached Tier 2 | stopped by the mask |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const [title, f] of SETS) {
    const m = { n: 0, sil: 0, wdi: 0, show: 0, miss: 0, he: [0, 0], en: [0, 0], dated: 0, wrongDate: 0, t2: 0, masked: 0, all: 0, wdiIds: [], wrongDateIds: [] };
    for (const c of cases.filter(f)) {
      const r = res[c.id]; m.all++;
      if (r.calls.tier2) m.t2++;
      if (r.reason === 'pii-blocked' || r.reason === 'mask-failed') m.masked++;
      const g = goldOf(c); if (!g) continue; m.n++; const L = c.lang === 'he' ? m.he : m.en;
      if (g === 'SILENT') { m.sil++; if (r.step !== 'SILENT') { m.wdi++; m.wdiIds.push(c.id); } }
      else { m.show++; L[1]++; if (r.step === 'SILENT') { m.miss++; L[0]++; }
        else if (r.tier === 2 && r.step === g && c.gold.due && ['calendar', 'task', 'draft'].includes(r.step)) { m.dated++; if (r.proposal.due !== c.gold.due) { m.wrongDate++; m.wrongDateIds.push(`${c.id} card=${r.proposal.due} gold=${c.gold.due}`); } } }
    }
    R.sets[title] = m;
    md += `| ${title} | ${m.n} | ${m.wdi}/${m.sil} | ${m.miss}/${m.show} | ${m.he[0]}/${m.he[1]} | ${m.en[0]}/${m.en[1]} | ${m.wrongDate}/${m.dated} | ${m.t2}/${m.all} | ${m.masked} |\n`;
  }
  const reasons = {};
  for (const c of cases) { const r = res[c.id]; if (r.tier === 2 && r.step === 'SILENT') reasons[r.reason] = (reasons[r.reason] || 0) + 1; }
  R.tier2SilentReasons = reasons;
  md += '\n## Why a Tier 2 answer stayed silent\n\n' + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, 'router-tables.md'), md);
  fs.writeFileSync(path.join(__dirname, 'router-results.json'), JSON.stringify(R, null, 1) + '\n');
  console.log(md);
  const pass = SETS.every(([t]) => R.sets[t].wdi === 0);
  console.log(pass ? 'PASS' : 'FAIL'); process.exitCode = pass ? 0 : 3;
})();
