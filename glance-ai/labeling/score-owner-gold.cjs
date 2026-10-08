'use strict';
// Strict score of owner-gold rows (❓ already removed by ingest).
// Systems: v2 alone, v2+veto, v2.1+veto, the engine on the tip, gated Qwen propose-only where the cache covers the case.
const fs = require('fs');
const path = require('path');
const { loadBatch, readJsonl, parseSheet, metricsOf, stepOf, rate, HERE } = require('./lib.cjs');
const { makeEngine, OWN } = require('../model/teacher/engine.cjs');
const LV = require('../oss/veto/llm-veto.cjs');
const PG = require('../oss/veto/propose-gate.cjs');
const { capVeto } = require('../model/runtime/veto-v2.cjs');
const { EVAL } = require('../paths.cjs');

const V2_PREDS = path.join(HERE, '..', 'model', 'artifacts', 'v2.test-preds.jsonl');
const V21_PREDS = path.join(HERE, '..', 'model', 'artifacts', 'v21.test-preds.jsonl');
const LLM_CACHE = path.join(HERE, '..', 'oss', 'shadow-combined', 'llm-qwen3.5-4b.jsonl');
const HE = /[\u0590-\u05FF]/;

function loadMap(p) {
  const m = new Map();
  if (!fs.existsSync(p)) return m;
  for (const r of readJsonl(p)) m.set(r.id, r);
  return m;
}

function sheetCases(batch, sheetMd) {
  const sheet = parseSheet(sheetMd || '');
  return batch.map((item) => {
    const h = sheet.get(item.id) || {};
    const surface = item.surface || h.surface || 'gmail';
    const direction = item.direction || h.direction || 'inbound';
    const ownEmail = direction === 'self' || direction === 'outbound' ? OWN[surface] || OWN.gmail : '';
    const from = item.from && (item.from.name || item.from.email)
      ? { name: item.from.name || h.fromName || '', email: item.from.email || ownEmail }
      : { name: h.fromName || '', email: ownEmail || '' };
    return {
      item, id: item.id, lang: item.lang, surface, direction,
      attachmentCount: item.attachmentCount != null ? item.attachmentCount : (h.attachmentCount || 0),
      from,
      to: Array.isArray(item.to) && item.to.length ? item.to : (h.to || []),
      cc: Array.isArray(item.cc) && item.cc.length ? item.cc : (h.cc || []),
      subject: item.subject || '', body: item.body || '',
      engine35: item.engine35, engineTip: item.engineTip || null, v2batch: item.v2
    };
  });
}

function ctx(c) { return { body: c.own || '', subject: c.subject, direction: c.direction, surface: c.surface, attachmentCount: c.attachmentCount }; }
function engOf(c) { return { dateIso: c.engDate, today: c.today }; }
function hardGate(c) { return c.vetoBase || c.vetoProduct || c.textVeto || null; }
function goodTitle(t, lang) { return t && !LV.titleVeto(t) && (HE.test(t) === (lang === 'he')); }
function engineVeto(c, st) {
  const cap = capVeto(c.capFlags, c.engine);
  if (c.vetoBase || c.vetoProduct || cap) return c.vetoBase || c.vetoProduct || cap;
  return c.textVeto || LV.cardVeto(ctx(c), c.own, { step: st }, engOf(c));
}

// Same decision as score-gated.cjs combined('strict'). A missing cache row is not scored here.
function strictGated(c, pred) {
  const s = stepOf(c.engine);
  const p = pred || null;
  if (c.direction !== 'inbound') {
    if (s === 'SILENT' || engineVeto(c, s)) return { step: 'SILENT' };
    return { step: s, via: 'engine' };
  }
  if (hardGate(c)) return { step: 'SILENT' };
  const llmAct = !!(p && p.decision === 'act');
  if (s !== 'SILENT') {
    if (engineVeto(c, s)) return { step: 'SILENT' };
    return { step: s, via: 'engine' };
  }
  if (!llmAct) return { step: 'SILENT' };
  const g = PG.gate(c, c.own, p, engOf(c), null);
  if (!g.pass) return { step: 'SILENT', vetoed: g.reason, gated: true };
  if (g.step === 'file_save') {
    const v = LV.textVeto(ctx(c), c.own) || (LV.moneyMovement(ctx(c), c.own) ? 'money-movement' : null);
    if (v) return { step: 'SILENT', vetoed: v };
    return { step: 'file_save', via: 'llm-proposal->suggest-save' };
  }
  const card = { step: g.step, action: p.action, title: p.title };
  const v = LV.proposalVeto(ctx(c), c.own, card, engOf(c)) || capVeto(c.capFlags, 'x|' + g.step);
  if (v) return { step: 'SILENT', vetoed: v };
  if (!goodTitle(p.title, c.lang)) return { step: 'SILENT', vetoed: 'title' };
  return { step: g.step, via: 'llm-proposal' };
}

function goldY(row) {
  return row.ownerLabel === 'SILENT' ? 'SILENT' : row.actionLabel;
}

function scoreRows(goldRows, opt) {
  opt = opt || {};
  const batch = opt.batch || loadBatch(path.join(HERE, 'batch-001.json'));
  let sheetMd = opt.sheetMd;
  if (sheetMd == null) {
    const names = [...new Set(batch.map((r) => r.batchName).filter(Boolean))];
    if (!names.length) names.push('batch-001');
    sheetMd = names.map((n) => {
      const p = path.join(HERE, n + '.md');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    }).join('\n');
  }
  const cases = sheetCases(batch, sheetMd);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const v2 = opt.v2 || loadMap(V2_PREDS);
  const v21 = opt.v21 || loadMap(V21_PREDS);
  const llm = opt.llm || loadMap(LLM_CACHE);
  const shadow = opt.shadow || loadMap(EVAL.shadowCases());
  let engine = opt.engine;
  if (engine === undefined) engine = makeEngine('tip');

  const joined = goldRows.map((g) => {
    const c = byId.get(g.id) || { id: g.id, lang: g.lang, subject: g.subject, body: g.redactedBody, surface: g.source, direction: 'inbound', to: [], cc: [], from: {}, attachmentCount: 0 };
    let tip = null;
    if (engine) {
      try { tip = engine.teach(c).label; }
      catch (e) { tip = 'SILENT'; }
    }
    const p2 = v2.get(g.id);
    const p21 = v21.get(g.id);
    const sh = shadow.get(g.id);
    const cached = llm.get(g.id);
    let qwen = null;
    let qwenReason = null;
    if (sh && cached && cached.pred) {
      const d = strictGated(sh, cached.pred);
      qwen = d.step;
      qwenReason = d.vetoed || d.via || null;
    }
    return {
      id: g.id, item: c.item && c.item.item || null, lang: g.lang || c.lang, ownerLabel: g.ownerLabel,
      y: goldY(g), actionLabel: g.actionLabel, expectedAction: g.expectedAction, ownerVerified: g.ownerVerified === true,
      v2Alone: p2 ? p2.predAlone : null,
      v2Veto: p2 ? p2.pred : null,
      v21Veto: p21 ? p21.pred : null,
      engineTip: tip,
      engine35: c.engine35 || null,
      qwen
    };
  });

  function pack(name, predOf, covered) {
    const rows = covered ? joined.filter(covered) : joined.filter((r) => predOf(r) != null);
    const notCovered = joined.filter((r) => predOf(r) == null).map((r) => r.id);
    const scored = metricsOf(rows, (r) => r.y, predOf);
    return { name, notCovered, scored };
  }
  const systems = [
    pack('v2 alone', (r) => r.v2Alone),
    pack('v2+veto', (r) => r.v2Veto),
    pack('v2.1+veto', (r) => r.v21Veto),
    pack('engine tip', (r) => r.engineTip),
    pack('gated Qwen propose-only', (r) => {
      if (r.qwen == null) return null;
      if (r.y === 'SILENT') return r.qwen === 'SILENT' ? 'SILENT' : 'SHOW';
      const want = stepOf(r.y);
      if (r.qwen === 'SILENT') return 'SILENT';
      return r.qwen === want ? r.y : ('other|' + r.qwen);
    })
  ];
  // Qwen compares steps. Map its prediction onto the gold label when the step matches,
  // and onto a different non-silent label when the step does not, so wrong-action counts.
  const qwen = systems[4];
  qwen.covered = joined.filter((r) => r.qwen != null).map((r) => ({ id: r.id, step: r.qwen, reason: joined.find((x) => x.id === r.id) && null }));
  qwen.detail = joined.filter((r) => r.qwen != null).map((r) => ({ id: r.id, item: r.item, step: r.qwen }));

  const tipDiff = joined.filter((r) => r.engineTip && r.engine35 && r.engineTip !== r.engine35)
    .map((r) => ({ id: r.id, item: r.item, tip: r.engineTip, engine35: r.engine35 }));

  return {
    nGold: goldRows.length,
    ownerVerified: goldRows.filter((r) => r.ownerVerified === true).length,
    systems: Object.fromEntries(systems.map((s) => [s.name, s])),
    cases: joined,
    tipDiffersFromEngine35: tipDiff
  };
}

module.exports = { scoreRows, strictGated, sheetCases, goldY, V2_PREDS, V21_PREDS };

if (require.main === module) {
  const gold = process.argv[2] || path.join(HERE, 'owner-gold.jsonl');
  const rows = readJsonl(gold);
  const r = scoreRows(rows);
  console.log(JSON.stringify({ nGold: r.nGold, ownerVerified: r.ownerVerified, systems: Object.fromEntries(Object.entries(r.systems).map(([k, v]) => [k, { n: v.scored.n, wrongDoIt: v.scored.wrongDoIt, missed: v.scored.missed, wrongAction: v.scored.wrongAction, notCovered: v.notCovered }])) }, null, 1));
}
