'use strict';
// Score the frozen contrast-heldout-v0. The file is not a training input.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { lines: contrastLines } = require('./build-contrast.cjs');
const { lines: trainLines } = require('./generate-train.cjs');
const { vector } = require('./learn-features.cjs');
const { train } = require('./relevance-lr.cjs');
const { judge } = require('./judge.cjs');
const { judgeLearned } = require('./judge-learned.cjs');
const { scorePairs } = require('./score-contrast.cjs');
const { readJsonl } = require('../labeling/lib.cjs');
const { make } = require('../model/runtime/glance-close-v2.cjs');
const { DEFAULT_OWN_NAMES } = require('../model/runtime/pipeline-v2.cjs');

const HELD = path.join(__dirname, '..', 'labeling', 'contrast-heldout-v0.jsonl');
const PREDS = path.join(__dirname, '..', 'model', 'artifacts', 'v2.test-preds.jsonl');
const OUT = path.join(__dirname, 'out', 'heldout-report.json');
const GMAIL = 'ai.local.flow@gmail.com';
const OLK = 'glance.salisapan@outlook.com';

function own(r) {
  const ownEmail = r.ownEmail || (r.surface === 'outlook' ? OLK : GMAIL);
  return Object.assign({}, r, { ownEmail: ownEmail });
}

function todayOf(rows) {
  const v2 = make('v2');
  const today = new Map();
  for (const r of rows) {
    if (today.has(r.pairId)) continue;
    today.set(r.pairId, v2.decide({
      id: r.id, lang: r.lang, surface: r.surface, direction: 'inbound',
      subject: r.subject, body: r.body, from: r.from, to: r.to, cc: r.cc || [],
      attachmentCount: r.attachmentCount || 0, ownNames: DEFAULT_OWN_NAMES.slice()
    }).label);
  }
  return today;
}

function pack(system, scored) {
  return {
    system: system,
    pairAccuracy: scored.pairAccuracy,
    wrongDoIt: scored.wrongDoIt,
    missedClose: scored.missedClose,
    missedCloseOnRelevant: scored.missedCloseOnRelevant,
    wrongAction: scored.wrongAction,
    sameAnswerPairs: scored.sameAnswerPairs
  };
}

function run() {
  const text = fs.readFileSync(HELD, 'utf8');
  const sha = crypto.createHash('sha256').update(text).digest('hex');
  const held = text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const heldIds = new Set(held.map((r) => r.pairId));
  const contrast = contrastLines().map(own);
  const gen = trainLines();
  const trainRows = contrast.concat(gen);
  if (trainRows.some((r) => heldIds.has(r.pairId) || String(r.id).indexOf('heldout-') === 0)) {
    throw new Error('training rows overlap the frozen held-out');
  }
  const samples = trainRows.map((r) => ({ x: vector(own(r), r.profile), y: r.goldRelevance, pairId: r.pairId }));
  const model = train(samples);
  const today = todayOf(held);
  const hand = scorePairs(held, (r) => judge(own(r), r.profile, { label: today.get(r.pairId) }).action);
  const learned = scorePairs(held, (r) => judgeLearned(own(r), r.profile, { label: today.get(r.pairId) }, model).action);
  const empty = { schemaVersion: 'user-context-v0', userId: 'empty', trainingConsent: false };
  let flips = 0;
  let n = 0;
  for (const row of readJsonl(PREDS)) {
    n++;
    const email = { id: row.id };
    if (judge(email, empty, { label: row.pred }).action !== row.pred) flips++;
    if (judgeLearned(email, empty, { label: row.pred }, model).action !== row.pred) flips++;
  }
  const adv = {};
  for (const r of held) {
    if (!r.adversarial) continue;
    const bucket = adv[r.scenario] || (adv[r.scenario] = { handWrong: 0, learnedWrong: 0, sides: 0 });
    bucket.sides++;
    const h = judge(own(r), r.profile, { label: today.get(r.pairId) }).action;
    const l = judgeLearned(own(r), r.profile, { label: today.get(r.pairId) }, model).action;
    if (h !== r.goldAction) bucket.handWrong++;
    if (l !== r.goldAction) bucket.learnedWrong++;
  }
  const report = {
    generatedAt: '2026-10-08',
    heldoutSha256: sha,
    pairs: held.length / 2,
    labeledBy: 'synthetic-heldout',
    ownerVerified: 0,
    circularity: 'contrast-v0 was the set the hand rule was written against. The learned scorer trains on contrast-v0 plus a separate generator and is scored on contrast-heldout-v0, which is not a training input. The held-out gold and the generator labels were both written from the same owner spec in this lab, so a high held-out score is not an owner-verified result.',
    hand: pack('hand rule, current featurize/judge', hand),
    learned: pack('L2 logistic regression on profile x email features', learned),
    model: { l2: model.l2, valRelevanceAccuracy: model.valRelevanceAccuracy, valN: model.valN, trainN: model.trainN, ranked: model.ranked },
    adversarialWrongActions: adv,
    emptyProfileFlips: { shippedPreds: flips, shippedN: n, note: 'each of the 6982 predictions is checked with the hand rule and again with the learned scorer; a flip on either increments shippedPreds' }
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n');
  return report;
}

module.exports = { run, HELD };

if (require.main === module) {
  const report = run();
  console.log(JSON.stringify({ sha: report.heldoutSha256, hand: report.hand, learned: report.learned, l2: report.model.l2, val: report.model.valRelevanceAccuracy, flips: report.emptyProfileFlips, top: report.model.ranked.slice(0, 8), adv: report.adversarialWrongActions }, null, 2));
}
