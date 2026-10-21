'use strict';
// M2 measurement: the real Router v2 (flow-trial-extension/core/understanding-router.js) end to end on the 786 shadow cases, with the
// device's real mask (core/privacyShield.js + core/mask-ids.js through core/exec-router.js maskForServer) in front of Tier 2.
// Tier 2 is the CACHED Qwen3.5-4B answer (no model is run); there is no Tier 1 here. Tier 0 is the engine + veto columns of each case.
// The cached answers were made on unmasked text and carry no spans, so the adapter quotes the MASKED text the router hands to Tier 2,
// and reads the date with the device's reader after restoring the placeholders. Confidence is not in the cache: every act is 0.9.
// usage: node score-router.cjs [--via-server]   (--via-server: Tier 2 goes through glance-assist/understand.js with the cached answer as its mock provider)
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
const VIA_SERVER = process.argv.includes('--via-server');
// --device: Tier 1 is the device adapter (core/understanding-device.js) with the cached answer playing the device model on the unmasked
// text, both wordings alike. A SIMULATION of a device model as good as the cached one: its self-test on these cases decides per language
// whether it may run at all. It is not a measurement of any real browser model.
const DEVICE = process.argv.includes('--device');
const Dev = core('understanding-device.js', 'FlowUnderstandingDevice');
const BY_TEXT = new Map();
const deviceSession = { prompt: async (text) => { const msg = String(text).split('\n\nMessage:\n').pop(); const c = BY_TEXT.get(msg); if (!c) return JSON.stringify({ intentions: [] }); return JSON.stringify(cachedTier2(c, LLM[c.id] && LLM[c.id].pred, { fn: (x) => x })(msg)); } };
let DEVICE_STATUS = null;
const UND = VIA_SERVER ? require(path.join(ROOT, 'flow-landing/netlify/functions/glance-assist/understand.js')) : null;
const serverStore = UND ? UND.memoryStore() : null;
const serverCodes = {};
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
    tier2: !VIA_SERVER ? cachedTier2(c, p, unmaskRef) : async (masked) => {
      const answer = cachedTier2(c, p, unmaskRef);
      const srv = UND.createUnderstand({ env: { GLANCE_AI_PRIMARY: 'en,he', GLANCE_AI_SPEND_CAP_USD: '50' }, now: Date.parse(c.today + 'T09:00:00Z'), store: serverStore,
        provider: async ({ user }) => JSON.stringify(answer(user)), license: async () => ({}) });
      const r = await srv.read({ maskedText: masked, installId: 'lab-' + c.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60).padEnd(8, '0'), today: c.today });
      serverCodes[r.status + (r.body.code ? ':' + r.body.code : '')] = (serverCodes[r.status + (r.body.code ? ':' + r.body.code : '')] || 0) + 1;
      if (r.status !== 200) throw new Error(r.body.code);
      return r.body.understanding || { intentions: [] };
    },
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
  if (DEVICE) deps.tier1 = Dev.tier1For({ aiDeviceTier1: true }, deviceSession, DEVICE_STATUS, { now: DEVICE_STATUS.checkedAt, today: c.today, attachmentCount: c.attachmentCount || 0 }) || undefined;
  const input = { text: c.own, today: c.today, attachmentCount: c.attachmentCount || 0, direction: c.direction, cloudConsent: true,
    tier0: { quiet: quiet || null, step: quiet ? 'SILENT' : s, possible: !!LLM[c.id] } };
  return Router.route(input, deps, { aiPrimary: true });
}

function goldOf(c) { if (REL[c.id]) return REL[c.id].to; const g = c.gold.step; return g === 'AMBIGUOUS' || g === 'ANY' ? null : g; }
(async () => {
  const res = {};
  if (DEVICE) {
    for (const c of cases) BY_TEXT.set(c.own, c);
    const audit = cases.filter((c) => c.direction === 'inbound' && LLM[c.id] && goldOf(c)).map((c) => ({ text: c.own, gold: goldOf(c) === 'file_save' ? 'SILENT' : goldOf(c), lang: c.lang === 'he' ? 'he' : 'en', today: c.today, attachmentCount: c.attachmentCount || 0 }));
    DEVICE_STATUS = await Dev.selfTest(deviceSession, audit, { now: Date.parse('2026-10-07T09:00:00Z') });
    // --device-pass: what-if only. Pretend the self-test passed, to see what a device model this good would save and whether the floor holds.
    if (process.argv.includes('--device-pass')) DEVICE_STATUS = Object.assign({}, DEVICE_STATUS, { en: Object.assign({}, DEVICE_STATUS.en, { ok: true }), he: Object.assign({}, DEVICE_STATUS.he, { ok: true }) });
  }
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
        else if (r.tier >= 1 && r.step === g && c.gold.due && ['calendar', 'task', 'draft'].includes(r.step)) { m.dated++; if (r.proposal.due !== c.gold.due) { m.wrongDate++; m.wrongDateIds.push(`${c.id} card=${r.proposal.due} gold=${c.gold.due}`); } } }
    }
    R.sets[title] = m;
    md += `| ${title} | ${m.n} | ${m.wdi}/${m.sil} | ${m.miss}/${m.show} | ${m.he[0]}/${m.he[1]} | ${m.en[0]}/${m.en[1]} | ${m.wrongDate}/${m.dated} | ${m.t2}/${m.all} | ${m.masked} |\n`;
  }
  const reasons = {};
  for (const c of cases) { const r = res[c.id]; if (r.tier >= 1 && r.step === 'SILENT') reasons[r.reason] = (reasons[r.reason] || 0) + 1; }
  R.tier2SilentReasons = reasons;
  md += '\n## Why a Tier 2 answer stayed silent\n\n' + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
  // M5: every model proposal that reached the screen becomes a plan (core/model-plan.js, loaded the way the extension shares one scope).
  {
    const vm = require('vm');
    const sb = { module: undefined, console };
    vm.createContext(sb);
    for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'step-list.js', 'json-enforce.js', 'understanding.js', 'request-types.js', 'follow-up.js', 'model-plan.js'])
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'flow-trial-extension/core', f), 'utf8'), sb, { filename: f });
    const MP = vm.runInContext('FlowModelPlan', sb);
    const pm = { shown: 0, planned: 0, fileSave: 0, rejected: {}, anchorRight: 0, dated: 0, dateRight: 0, sendSteps: 0, doneWhen: 0, rows: 0, byProcess: {}, calendarSteps: 0, calendarClocked: 0, watches: 0, watchable: 0, watchDated: 0, watchOnGold: 0, watchMine: 0, watchTheirs: 0 };
    for (const c of cases) {
      const r = res[c.id];
      if (!(r.tier >= 1) || r.step === 'SILENT') continue;
      pm.shown++;
      const g = goldOf(c);
      const x = MP.plan({ aiPlanV1: true }, r.proposal, { text: c.own, today: c.today, lang: c.lang, surface: c.surface === 'outlook' ? 'outlook' : 'gmail' });
      if (!x.plan) { if (x.reason === 'file-save-is-suggest-save') pm.fileSave++; else pm.rejected[x.reason] = (pm.rejected[x.reason] || 0) + 1; continue; }
      pm.planned++; pm.byProcess[x.plan.processId] = (pm.byProcess[x.plan.processId] || 0) + 1;
      if (r.proposal.step === 'draft' || r.proposal.step === 'task') {
        pm.watchable++;
        const w = MP.toWatch(x.plan, r.proposal, { threadId: 'lab-' + c.id, subject: c.subject, channel: c.surface }, Date.parse(c.today + 'T09:00:00'));
        if (w) { pm.watches++; if (w.direction === 'mine') pm.watchMine++; else pm.watchTheirs++; if (c.gold.due) { pm.watchDated++; if (w.deadlineIso === c.gold.due) pm.watchOnGold++; } }
      }
      if (x.rows.length === x.plan.steps.length) pm.rows++;
      if (x.plan.doneWhen && x.plan.doneWhen.kind) pm.doneWhen++;
      pm.sendSteps += x.plan.steps.filter((s) => /send/i.test(s.kind)).length;
      for (const s of x.plan.steps) if (/alendar/.test(s.kind)) { pm.calendarSteps++; if (s.params && Number.isInteger(s.params.hour)) pm.calendarClocked++; }
      const anchorStep = { calendar: 'calendar', outlookCalendar: 'calendar', gmailDraft: 'draft', outlookDraft: 'draft', googleTask: 'task', outlookTask: 'task' }[x.plan.anchor];
      if (anchorStep === g) pm.anchorRight++;
      const ds = x.plan.steps.map((s) => s.params && s.params.dateIso).filter(Boolean);
      if (c.gold.due && ds.length) { pm.dated++; if (ds.every((d) => d === c.gold.due)) pm.dateRight++; }
    }
    R.plan = pm;
    md += `\n## Plans (M5)\n\nModel proposals on screen: ${pm.shown}. Planned into the product's own process: ${pm.planned} (${JSON.stringify(pm.byProcess)}); file saves left to suggest-save: ${pm.fileSave}; refused by the plan gate: ${JSON.stringify(pm.rejected)}.\nAnchor step equals the gold step: ${pm.anchorRight}/${pm.planned}. Every dated step on the gold due day: ${pm.dateRight}/${pm.dated}. Send steps: ${pm.sendSteps}. Calendar steps with a clock: ${pm.calendarClocked}/${pm.calendarSteps}. A done-when condition: ${pm.doneWhen}/${pm.planned}. Drawn by the steps list (one row per step): ${pm.rows}/${pm.planned}.\nCarried by the follow loop (asks and promises): ${pm.watches}/${pm.watchable} (mine ${pm.watchMine}, theirs ${pm.watchTheirs}); loop deadline on the gold day: ${pm.watchOnGold}/${pm.watchDated}.\n`;
  }
  if (VIA_SERVER) {
    const spent = [...serverStore.rows.entries()].filter(([k]) => k.startsWith('u-spend')).reduce((a, [, v]) => a + v, 0);
    R.server = { codes: serverCodes, spentMicroUsd: spent };
    md = md.replace('# Router v2 (M2) end to end', '# Router v2 + Glance cloud server path (M3) end to end') + `\n## Server path\n\nTier 2 went through \`glance-assist/understand.js\` (cached answer as the mock provider). Server answers: ${JSON.stringify(serverCodes)}. Counted against the spend cap: $${(spent / 1e6).toFixed(4)} at the default $0.0004 a read.\n`;
  }
  if (DEVICE) {
    const t1 = Object.values(res).filter((r) => r.calls && r.calls.tier1).length, t1ans = Object.values(res).filter((r) => r.tier === 1).length, t2 = Object.values(res).filter((r) => r.calls && r.calls.tier2).length;
    R.device = { selfTest: DEVICE_STATUS, tier1Asked: t1, tier1Answered: t1ans, cloudCalls: t2 };
    md = md.replace('# Router v2 (M2) end to end', '# Router v2 with a simulated device Tier 1 (M4) end to end') + `\n## Device Tier 1 (simulation: the cached answers play the device model)\n\nSelf-test on these cases: EN ${JSON.stringify(DEVICE_STATUS.en)}, HE ${JSON.stringify(DEVICE_STATUS.he)}. Tier 1 asked ${t1}, answered ${t1ans}; cloud calls ${t2}.\n`;
  }
  const base = VIA_SERVER ? 'server-' : DEVICE ? (process.argv.includes('--device-pass') ? 'device-pass-' : 'device-') : '';
  fs.writeFileSync(path.join(__dirname, base + 'router-tables.md'), md);
  fs.writeFileSync(path.join(__dirname, base + 'router-results.json'), JSON.stringify(R, null, 1) + '\n');
  console.log(md);
  const pass = SETS.every(([t]) => R.sets[t].wdi === 0);
  console.log(pass ? 'PASS' : 'FAIL'); process.exitCode = pass ? 0 : 3;
})();
