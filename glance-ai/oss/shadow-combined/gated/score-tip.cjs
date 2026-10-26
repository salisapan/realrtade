'use strict';
// Today's device engine (the extension tip, loaded the way the extension shares one scope: model/teacher/engine.cjs) alone, against the
// same engine as Tier 0 of the AI engine (flow-trial-extension/core/ai-engine.js read(): router, real device mask, the strict gate and
// veto, plan, carry). Tier 2 is the CACHED Qwen3.5-4B answer (no model is run). Spec labels, the 786 shadow cases.
// The older score-*.cjs files use the 0.9.35 engine columns stored in the cases; this one runs the current engine.
// usage: node glance-ai/oss/shadow-combined/gated/score-tip.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
const LV = require('../../veto/llm-veto.cjs');
const PG = require('../../veto/propose-gate.cjs');
const { EVAL } = require('../../../paths.cjs');
const { capVeto } = require('../../../model/runtime/veto-v2.cjs');
const { makeEngine } = require('../../../model/teacher/engine.cjs');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const cases = read(EVAL.shadowCases());
const LLM = Object.fromEntries(read(path.join(__dirname, '..', 'llm-qwen3.5-4b.jsonl')).map((r) => [r.id, r]));
const REL = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'relabels.json'), 'utf8')).map((r) => [r.id, r]));
const FAM2STEP = { task: 'task', calendar: 'calendar', reply: 'draft', file: 'file_save' };
const FAM2KIND = { task: 'promise_to_me', calendar: 'meeting', reply: 'ask_of_me', file: 'ask_of_me' };
const HE = /[֐-׿]/;
const ctx = (c) => ({ body: c.prompt.body, subject: c.subject, direction: c.direction, surface: c.surface, attachmentCount: c.attachmentCount });
const eng = (c) => ({ dateIso: c.engDate, today: c.today });
const goodTitle = (t, lang) => t && !LV.titleVeto(t) && (HE.test(t) === (lang === 'he'));

// The product core in one shared scope, as the extension loads it.
const sb = { module: undefined, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, TextEncoder, atob, btoa };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js',
  'understanding.js', 'request-types.js', 'follow-up.js', 'model-plan.js', 'privacyShield.js', 'mask-ids.js', 'exec-router.js', 'understanding-router.js', 'ai-engine.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'flow-trial-extension/core', f), 'utf8'), sb, { filename: f });
const g = (n) => vm.runInContext(n, sb);
const AI = g('FlowAiEngine'), U = g('FlowUnderstanding'), ER = g('FlowExecRouter'), Shield = g('FlowPrivacyShield'), MI = g('FlowMaskIds');
const TIP = makeEngine('tip');

const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 3);
const words = (t) => new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).map((w) => (HE.test(w) ? w.replace(/^[להבוכמש]/, '') : w)));
function cached(c, p, un) {
  return (masked) => {
    if (!p || p.decision !== 'act') return { relevant: 'unknown', intentions: [] };
    const now = new Date(c.today + 'T12:00:00'), ss = sentences(masked);
    let dueSpan;
    if (p.due) dueSpan = ss.find((s) => { const d = U.readDate(un.fn(s), now); return d && d.iso === p.due; }) || ss.find((s) => { const d = U.readDate(un.fn(s), now); return d && d.iso; });
    let askSpan = dueSpan || null;
    if (!askSpan) { const tw = words(p.title); let best = null, n0 = 0; for (const s of ss) { const sw = words(un.fn(s)); let n = 0; for (const w of tw) if (sw.has(w)) n++; if (n > n0) { best = s; n0 = n; } } askSpan = n0 >= 1 ? best : undefined; }
    return { relevant: 'unknown', state: 'open', needs: p.family === 'file' ? ['file'] : [], intentions: [{ kind: FAM2KIND[p.family] || 'fyi', actor: 'sender', ask_span: askSpan, evidence_span: askSpan, due_span: dueSpan, confidence: 0.9 }] };
  };
}
function tipOf(c) {
  const from = typeof c.prompt.from === 'string' ? { email: c.prompt.from } : (c.prompt.from || {});
  return TIP.teach({ surface: c.surface, from, to: [c.surface === 'outlook' ? 'glance.salisapan@outlook.com' : 'ai.local.flow@gmail.com'], body: c.prompt.body, subject: c.subject, attachmentCount: c.attachmentCount || 0, direction: c.direction });
}
function goldOf(c) { if (REL[c.id]) return REL[c.id].to; const gg = c.gold.step; return gg === 'AMBIGUOUS' || gg === 'ANY' ? null : gg; }

(async () => {
  const rows = [];
  for (const c of cases) {
    const t = tipOf(c);
    const tipStep = c.direction !== 'inbound' ? 'SILENT' : (t.show ? t.primaryStep : 'SILENT');
    const p = LLM[c.id] && LLM[c.id].pred;
    const un = { fn: (x) => x };
    const deps = {
      mask: (txt) => { const m = ER.maskForServer(txt, Shield, MI); if (!m.ok) return m; un.fn = (x) => MI.unmask(x, m.tokenMap); return { ok: true, text: m.text, unmask: un.fn }; },
      tier2: cached(c, p, un),
      gate: (prop) => { if (!p) return { pass: false }; if (FAM2STEP[p.family] !== prop.step) return { pass: false, reason: 'gate:step-mismatch' }; const r = PG.gate(c, c.own, p, eng(c), null); return r.pass ? { pass: true, step: r.step } : { pass: false, reason: r.reason }; },
      veto: (prop) => prop.step === 'file_save' ? (LV.textVeto(ctx(c), c.own) || (LV.moneyMovement(ctx(c), c.own) ? 'money-movement' : null))
        : (LV.proposalVeto(ctx(c), c.own, { step: prop.step, action: p.action, title: p.title }, eng(c)) || capVeto(c.capFlags, 'x|' + prop.step) || (goodTitle(p.title, c.lang) ? null : 'title')),
    };
    // Tier 0 is the current engine. A "possible intention" is a mail the engine left silent that is not a hard-quiet case of the lab.
    const quiet = c.vetoBase || c.vetoProduct || c.textVeto || null;
    const mail = { text: c.own, subject: c.subject, today: c.today, direction: c.direction, attachmentCount: c.attachmentCount || 0, surface: c.surface, lang: c.lang, cloudConsent: true,
      threadId: 'lab-' + c.id, now: Date.parse(c.today + 'T09:00:00'), tier0: { quiet: tipStep === 'SILENT' ? quiet : null, step: tipStep, possible: tipStep === 'SILENT' && !!LLM[c.id] } };
    const out = await AI.read(mail, deps, { aiPrimary: true, aiPlanV1: true });
    rows.push({ c, tip: tipStep, ai: out.card ? out.card.step : 'SILENT', out });
  }
  const SETS = [['OSS 275', (c) => c.set === 'oss'], ['v2 held-out 400', (c) => c.set === 'v2test'], ['adversarial 72', (c) => c.set === 'adv'], ['injection 39', (c) => c.set === 'inj'], ['ALL pooled 786', () => true]];
  const R = {};
  let md = '# Today\'s engine (tip) alone vs the AI engine on top of it\n\nSpec labels. Tier 2 = cached Qwen3.5-4B answers, real device mask, strict gate and veto. No model run.\n\n| set | system | wrong Do It | missed | HE missed | EN missed |\n|---|---|---|---|---|---|\n';
  for (const [title, f] of SETS) {
    for (const sys of ['tip', 'ai']) {
      const m = { wdi: 0, sil: 0, miss: 0, show: 0, he: [0, 0], en: [0, 0] };
      for (const r of rows.filter((x) => f(x.c))) {
        const gd = goldOf(r.c); if (!gd) continue; const pred = r[sys]; const L = r.c.lang === 'he' ? m.he : m.en;
        if (gd === 'SILENT') { m.sil++; if (pred !== 'SILENT') m.wdi++; } else { m.show++; L[1]++; if (pred === 'SILENT') { m.miss++; L[0]++; } }
      }
      R[title + ' / ' + sys] = m;
      md += `| ${title} | ${sys === 'tip' ? 'engine 0.9.56 (tip) alone' : 'tip + AI engine'} | ${m.wdi}/${m.sil} | ${m.miss}/${m.show} | ${m.he[0]}/${m.he[1]} | ${m.en[0]}/${m.en[1]} |\n`;
    }
  }
  const model = rows.filter((r) => r.out.card && r.out.card.source === 'model');
  const planned = model.filter((r) => r.out.card.plan).length, watched = model.filter((r) => r.out.watch).length, cloud = rows.filter((r) => r.out.calls && r.out.calls.tier2).length;
  const wrongModel = model.filter((r) => goldOf(r.c) === 'SILENT').map((r) => r.c.id);
  md += `\nModel cards: ${model.length} (planned ${planned}, carried by the follow loop ${watched}); model cards on a gold-silent mail: ${wrongModel.length}${wrongModel.length ? ' (' + wrongModel.join(', ') + ')' : ''}. Mails that reached the cloud tier: ${cloud}/${rows.length}.\n`;
  R.model = { cards: model.length, planned, watched, cloud, wrongModel };
  fs.writeFileSync(path.join(__dirname, 'tip-tables.md'), md);
  fs.writeFileSync(path.join(__dirname, 'tip-results.json'), JSON.stringify(R, null, 1) + '\n');
  console.log(md);
  const A = R['ALL pooled 786 / ai'], T = R['ALL pooled 786 / tip'];
  const pass = A.wdi <= T.wdi;
  console.log(pass ? 'PASS' : 'FAIL'); process.exitCode = pass ? 0 : 3;
})();
