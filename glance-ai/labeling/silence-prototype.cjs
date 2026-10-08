'use strict';
// Lab-only post-filters on the shipped v2+veto predictions.
// Nothing here is imported by model/runtime or by the shadow package.
// A rule that raises held-out missed-close by more than 1.0 point is rejected.
// Rules under that line are still not adopted: the labels are machine reference,
// provisional / not owner-verified, and a silence change has to be worth the misses.
const fs = require('fs');
const path = require('path');
const { metricsOf, loadBatch, readJsonl, HERE } = require('./lib.cjs');
const { sheetCases } = require('./score-owner-gold.cjs');
const { EVAL } = require('../paths.cjs');
const PG = require('../oss/veto/propose-gate.cjs');
const LV = require('../oss/veto/llm-veto.cjs');
const { featuresOf } = require('../model/train/featurize-v2.cjs');
const { prepare, DEFAULT_OWN_NAMES } = require('../model/runtime/pipeline-v2.cjs');
const { make: makeV2 } = require('../model/runtime/glance-close-v2.cjs');
const { productVeto } = require('../model/runtime/veto-v2.cjs');
const { makeEngine, OWN } = require('../model/teacher/engine.cjs');

const REJECT_MISSED_POINTS = 1.0;
const AUDIT_IDS = [
  'v2syn-9371',
  'v2rtest-close-families-corpus-128',
  'v2syn-6931',
  'v2syn-7013',
  'v2syn-9674',
  'v2syn-25034'
];

const FEE = /(?:confirming|confirmed)\s+(?:the\s+)?(?:fee|amount)\b|מאשר(?:ת|ים|ות)?\s+את\s+הסכום/i;

function attachInvite(text) {
  return PG.RX.ATTACH_INVITE_HE.test(text || '') || PG.RX.ATTACH_INVITE_EN.test(text || '');
}

// Each function returns the prediction after a silence-only rewrite. It never turns a silence into a card.
function rules() {
  return {
    'attach-to-invite': (r) => (r.pred !== 'SILENT' && attachInvite(r.body) ? 'SILENT' : r.pred),
    'calendar-hold-attach': (r) => (String(r.pred || '').indexOf('calendar-hold|') === 0 && attachInvite(r.body) ? 'SILENT' : r.pred),
    'fee-statement': (r) => (r.pred !== 'SILENT' && FEE.test(r.body || '') ? 'SILENT' : r.pred),
    'confirmed-amount-engine-silent': (r) => (
      r.pred === 'confirmed-amount|task' && r.eng === 'SILENT' && !LV.moneyMovement({ body: r.body, subject: r.subject }, r.body)
        ? 'SILENT' : r.pred
    ),
    'group-voc': (r) => (r.pred !== 'SILENT' && r.voc === 'group' ? 'SILENT' : r.pred)
  };
}

function points(afterMiss, beforeMiss, show) {
  if (!show) return 0;
  return (afterMiss - beforeMiss) / show * 100;
}

function pack(rows, predOf) {
  const m = metricsOf(rows, (r) => r.y, predOf);
  return {
    n: m.n,
    wrongDoIt: m.wrongDoIt,
    missed: m.missed,
    heWrongDoIt: m.heWrongDoIt,
    enWrongDoIt: m.enWrongDoIt,
    heMissed: m.heMissed,
    enMissed: m.enMissed,
    raw: { wdi: m.raw.wdi, miss: m.raw.miss, silent: m.raw.silent, show: m.raw.show, he: m.raw.he, en: m.raw.en }
  };
}

function measure(rows) {
  const before = pack(rows, (r) => r.pred);
  const out = { n: rows.length, before, rejectMissedPoints: REJECT_MISSED_POINTS, rules: {} };
  for (const [name, fn] of Object.entries(rules())) {
    let flipped = 0;
    let fixed = 0;
    let newMiss = 0;
    const pred = (r) => {
      const p = fn(r);
      if (p !== r.pred) {
        flipped++;
        if (r.y === 'SILENT' && r.pred !== 'SILENT' && p === 'SILENT') fixed++;
        if (r.y !== 'SILENT' && r.pred !== 'SILENT' && p === 'SILENT') newMiss++;
      }
      return p;
    };
    const after = pack(rows, pred);
    const delta = points(after.raw.miss, before.raw.miss, before.raw.show);
    const heDelta = points(after.raw.he.miss, before.raw.he.miss, before.raw.he.show);
    const enDelta = points(after.raw.en.miss, before.raw.en.miss, before.raw.en.show);
    out.rules[name] = {
      flipped, fixed, newMiss, after,
      deltaMissedPoints: +delta.toFixed(3),
      heDeltaMissedPoints: +heDelta.toFixed(3),
      enDeltaMissedPoints: +enDelta.toFixed(3),
      rejected: delta > REJECT_MISSED_POINTS,
      adopted: false
    };
  }
  return out;
}

function loadJoined() {
  const predPath = path.join(HERE, '..', 'model', 'artifacts', 'v2.test-preds.jsonl');
  const preds = readJsonl(predPath);
  const bodies = new Map(readJsonl(EVAL.v2Test()).map((r) => [r.id, r]));
  return preds.map((p) => {
    const b = bodies.get(p.id) || {};
    return {
      id: p.id, y: p.y, pred: p.pred, lang: p.lang === 'he' ? 'he' : 'en',
      eng: p.eng, voc: p.voc, body: b.body || '', subject: b.subject || ''
    };
  });
}

function loadLinear(p) {
  const w = JSON.parse(fs.readFileSync(p, 'utf8'));
  const rows = (w.rows || w.classes).map((c) => {
    const a = new Map();
    c.idx.forEach((i, j) => a.set(i, c.q[j] * c.scale));
    return { label: c.label, bias: c.bias, a };
  });
  return { rows };
}

function topFeatures(row, x, namesByHash, k) {
  const inv = 1 / Math.sqrt(x.length || 1);
  const scored = [];
  for (const i of x) {
    const weight = row.a.get(i);
    if (!weight) continue;
    const contrib = weight * inv;
    scored.push({ contrib: +contrib.toFixed(3), names: namesByHash.get(i) || ['#' + i] });
  }
  scored.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  return scored.slice(0, k);
}

function explain(c, gate, chooser) {
  const P = prepare(c);
  const names = [];
  const ownEmail = OWN[c.surface === 'outlook' ? 'outlook' : 'gmail'];
  const x2 = featuresOf(Object.assign({}, P.c, { own: P.own, facts: P.facts }), {
    voc: P.voc, role: P.role, ownEmail, names
  });
  const namesByHash = new Map();
  const { fnv1a } = require('../model/train/featurize.cjs');
  const DIM = 1 << 17;
  for (const n of names) {
    const h = fnv1a(n) % DIM;
    if (!namesByHash.has(h)) namesByHash.set(h, []);
    const list = namesByHash.get(h);
    if (list.indexOf(n) < 0) list.push(n);
  }
  const same = x2.length === P.x.length && x2.every((v, i) => v === P.x[i]);
  const gateRow = gate.rows[0];
  const inv = 1 / Math.sqrt(P.x.length || 1);
  const dot = (row) => { let s = row.bias; for (const i of P.x) s += (row.a.get(i) || 0) * inv; return s; };
  const shown = chooser.rows.slice().sort((a, b) => dot(b) - dot(a))[0];
  const text = P.own || '';
  const step = shown ? String(shown.label).split('|')[1] : null;
  return {
    hashMatch: same,
    facts: P.facts,
    engine: P.eng && P.eng.label,
    engineReason: P.eng && P.eng.reason,
    voc: P.voc,
    role: P.role,
    veto: P.veto,
    productOnOwn: productVeto(P.c, text, ownEmail),
    moneyMovement: LV.moneyMovement({ body: text, subject: c.subject }, text),
    unsupported: PG.unsupportedKind ? PG.unsupportedKind(text) : null,
    offerAcceptance: PG.offerAcceptance ? PG.offerAcceptance(text) : null,
    cardVeto: step ? LV.cardVeto(
      { body: text, subject: c.subject, direction: c.direction, surface: c.surface, attachmentCount: c.attachmentCount },
      text,
      { step },
      { dateIso: P.facts && P.facts.dateIso, today: P.facts && P.facts.today }
    ) : null,
    gateTop: topFeatures(gateRow, P.x, namesByHash, 6),
    chooserLabel: shown && shown.label,
    chooserTop: shown ? topFeatures(shown, P.x, namesByHash, 6) : []
  };
}

function auditCases() {
  const batch = loadBatch(path.join(HERE, 'batch-001.json'));
  const sheet = fs.readFileSync(path.join(HERE, 'batch-001.md'), 'utf8');
  const cases = sheetCases(batch, sheet).filter((c) => AUDIT_IDS.indexOf(c.id) >= 0);
  const v2 = makeV2('v2');
  const tip = makeEngine('tip');
  const gate = loadLinear(path.join(HERE, '..', 'model', 'artifacts', 'v2.gate.weights.json'));
  const chooser = loadLinear(path.join(HERE, '..', 'model', 'artifacts', 'v2.chooser.weights.json'));
  return cases.map((c) => {
    const row = Object.assign({ ownNames: DEFAULT_OWN_NAMES }, c, { body: c.body, subject: c.subject });
    const d = v2.decide(row);
    let liveTip = null;
    try { liveTip = tip.teach(row).label; } catch (e) { liveTip = 'ERR'; }
    const why = explain(row, gate, chooser);
    return {
      id: c.id,
      item: c.item.item,
      lang: c.lang,
      surface: c.surface,
      direction: c.direction,
      attachmentCount: c.attachmentCount,
      cc: c.cc,
      to: c.to,
      live: { label: d.label, modelAlone: d.modelAlone, pShow: +d.pShow.toFixed(3), top: d.top, tau: d.tau, veto: d.veto, engine: d.engine, engineReason: d.engineReason },
      liveTip,
      why
    };
  });
}

function qwenStrictZeros() {
  const p = path.join(HERE, '..', 'oss', 'shadow-combined', 'gated', 'results.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const want = [];
  for (const [setName, rows] of Object.entries(j.sets || {})) {
    for (const [name, cell] of Object.entries(rows)) {
      if (name.indexOf('propose-only + propose-gate (strict') !== 0) continue;
      if (name.indexOf('[spec]') < 0 && name.indexOf('spec') < 0) continue;
      want.push({ set: setName, name, wrongDoIt: cell.wrongDoIt, n: cell.n });
    }
  }
  return want;
}

module.exports = {
  rules, measure, loadJoined, auditCases, qwenStrictZeros, attachInvite, FEE,
  REJECT_MISSED_POINTS, AUDIT_IDS
};

if (require.main === module) {
  const joined = loadJoined();
  const rep = measure(joined);
  const slim = {
    n: rep.n,
    before: { wrongDoIt: rep.before.wrongDoIt, missed: rep.before.missed, heWrongDoIt: rep.before.heWrongDoIt, enWrongDoIt: rep.before.enWrongDoIt, heMissed: rep.before.heMissed, enMissed: rep.before.enMissed },
    rules: Object.fromEntries(Object.entries(rep.rules).map(([k, v]) => [k, {
      flipped: v.flipped, fixed: v.fixed, newMiss: v.newMiss,
      wrongDoIt: v.after.wrongDoIt, missed: v.after.missed,
      heMissed: v.after.heMissed, enMissed: v.after.enMissed,
      heWrongDoIt: v.after.heWrongDoIt, enWrongDoIt: v.after.enWrongDoIt,
      deltaMissedPoints: v.deltaMissedPoints, heDelta: v.heDeltaMissedPoints, enDelta: v.enDeltaMissedPoints,
      rejected: v.rejected, adopted: v.adopted
    }]))
  };
  console.log(JSON.stringify(slim, null, 1));
  if (process.argv.includes('--audit')) {
    console.log('AUDIT');
    console.log(JSON.stringify(auditCases(), null, 1));
  }
}
