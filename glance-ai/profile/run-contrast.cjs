'use strict';
// Offline contrast: v2 alone (no profile) vs v2 plus profile features.
// Empty profile must not flip today's decision. Qwen is not run: the 4B
// weights are not vendored, and a CPU pass over 80 prompts is not a cheap check.
const fs = require('fs');
const path = require('path');
const { lines } = require('./build-contrast.cjs');
const { judge } = require('./judge.cjs');
const { scorePairs } = require('./score-contrast.cjs');
const { readJsonl } = require('../labeling/lib.cjs');
const { make } = require('../model/runtime/glance-close-v2.cjs');
const { DEFAULT_OWN_NAMES } = require('../model/runtime/pipeline-v2.cjs');

const PREDS = path.join(__dirname, '..', 'model', 'artifacts', 'v2.test-preds.jsonl');
const OUT = path.join(__dirname, 'out', 'contrast-report.json');

function emailOf(r) {
  return {
    id: r.id, lang: r.lang, surface: r.surface, direction: r.direction || 'inbound',
    subject: r.subject, body: r.body, from: r.from, to: r.to, cc: r.cc,
    attachmentCount: r.attachmentCount || 0,
    ownNames: DEFAULT_OWN_NAMES.slice()
  };
}

function run() {
  const rows = lines();
  const v2 = make('v2');
  const today = new Map();
  for (const r of rows) {
    if (today.has(r.pairId)) continue;
    today.set(r.pairId, v2.decide(emailOf(r)).label);
  }
  const before = scorePairs(rows, (r) => today.get(r.pairId));
  const after = scorePairs(rows, (r) => judge(r, r.profile, { label: today.get(r.pairId) }).action);
  const empty = { schemaVersion: 'user-context-v0', userId: 'empty', trainingConsent: false };
  let contrastFlips = 0;
  for (const r of rows) {
    if (r.side !== 'A') continue;
    const out = judge(r, empty, { label: today.get(r.pairId) });
    if (out.action !== today.get(r.pairId) || out.relevance !== 'unknown') contrastFlips++;
  }
  let heldoutFlips = 0;
  let heldoutN = 0;
  for (const row of readJsonl(PREDS)) {
    heldoutN++;
    const out = judge({ id: row.id }, empty, { label: row.pred });
    if (out.action !== row.pred) heldoutFlips++;
  }
  const he = new Set(rows.filter((r) => r.lang === 'he').map((r) => r.pairId)).size;
  const en = new Set(rows.filter((r) => r.lang === 'en').map((r) => r.pairId)).size;
  const report = {
    generatedAt: '2026-10-08',
    pairs: before.pairs,
    sides: rows.length,
    hebrewPairs: he,
    englishPairs: en,
    groupPairsWithAnOffer: before.groupPairsWithOffer,
    before: {
      system: 'v2 without profile features',
      pairAccuracy: before.pairAccuracy,
      wrongDoIt: before.wrongDoIt,
      missedClose: before.missedClose,
      missedCloseOnRelevant: before.missedCloseOnRelevant,
      wrongAction: before.wrongAction,
      sameAnswerPairs: before.sameAnswerPairs
    },
    after: {
      system: 'v2 plus profile features',
      pairAccuracy: after.pairAccuracy,
      wrongDoIt: after.wrongDoIt,
      missedClose: after.missedClose,
      missedCloseOnRelevant: after.missedCloseOnRelevant,
      wrongAction: after.wrongAction,
      sameAnswerPairs: after.sameAnswerPairs
    },
    emptyProfileFlips: { heldout: heldoutFlips, heldoutN: heldoutN, contrastEmails: contrastFlips, contrastEmailsN: before.pairs },
    qwen: {
      ran: false,
      reason: 'Skipped. Qwen3.5-4B is not vendored here, llama.cpp is not installed, and scoring 80 contrast prompts on CPU is not a cheap check. Cached predictions do not cover contrast-v0 ids.'
    },
    ownerVerified: 0,
    labeledBy: 'synthetic-contrast'
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + '\n');
  return report;
}

module.exports = { run, OUT, emailOf };

if (require.main === module) {
  const report = run();
  console.log(JSON.stringify(report, null, 1));
}
