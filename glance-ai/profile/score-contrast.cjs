'use strict';
// Pair accuracy on contrast-v0. A pair counts only when both sides match
// and the two predictions differ. The same answer on both sides fails the pair.
const { rate } = require('../labeling/lib.cjs');

function scorePairs(rows, decide) {
  const by = new Map();
  for (const r of rows) {
    const pred = decide(r);
    let g = by.get(r.pairId);
    if (!g) { g = { id: r.pairId, scenario: r.scenario, lang: r.lang, sides: {} }; by.set(r.pairId, g); }
    g.sides[r.side] = { pred, gold: r.goldAction, relevance: r.goldRelevance };
  }
  const m = { pairs: 0, pairOk: 0, same: 0, wdi: 0, wdiDen: 0, miss: 0, missDen: 0, mcr: 0, mcrDen: 0, wact: 0, groupOffer: 0 };
  for (const g of by.values()) {
    m.pairs++;
    const a = g.sides.A;
    const b = g.sides.B;
    if (!a || !b) continue;
    if (a.pred === b.pred) m.same++;
    if (a.pred === a.gold && b.pred === b.gold && a.pred !== b.pred) m.pairOk++;
    if (g.scenario === 'group-approver' && (a.gold !== 'SILENT' || b.gold !== 'SILENT')) m.groupOffer++;
    for (const s of [a, b]) {
      if (s.gold === 'SILENT') {
        m.wdiDen++;
        if (s.pred !== 'SILENT') m.wdi++;
      } else {
        m.missDen++;
        if (s.pred === 'SILENT') m.miss++;
        else if (s.pred !== s.gold) m.wact++;
      }
      if (s.relevance === 'relevant') {
        m.mcrDen++;
        if (s.pred === 'SILENT') m.mcr++;
      }
    }
  }
  return {
    pairs: m.pairs,
    pairOk: m.pairOk,
    sameAnswerPairs: m.same,
    groupPairsWithOffer: m.groupOffer,
    pairAccuracy: rate(m.pairOk, m.pairs),
    wrongDoIt: rate(m.wdi, m.wdiDen),
    missedClose: rate(m.miss, m.missDen),
    missedCloseOnRelevant: rate(m.mcr, m.mcrDen),
    wrongAction: rate(m.wact, m.missDen),
    raw: m
  };
}

module.exports = { scorePairs };
