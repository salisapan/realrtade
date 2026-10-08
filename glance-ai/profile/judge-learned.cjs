'use strict';
// Learned relevance, then the same hard floor and feasible close as the hand rule.
// An empty profile never calls the model: today's decision is returned unchanged.
const { featurize } = require('./featurize.cjs');
const { hardFloor, feasible } = require('./judge.cjs');
const { hasSignal } = require('./learn-features.cjs');
const { predict } = require('./relevance-lr.cjs');

function judgeLearned(email, profile, today, model) {
  const base = today && today.label ? today.label : 'SILENT';
  if (!hasSignal(profile) || !model) {
    return { action: base, relevance: 'unknown', fallback: true, hardFloor: null };
  }
  const rel = predict(model, email, profile).relevance;
  if (rel === 'unknown') {
    return { action: base, relevance: 'unknown', fallback: true, hardFloor: null };
  }
  const floor = hardFloor(email || {});
  if (floor) return { action: 'SILENT', relevance: rel, fallback: false, hardFloor: floor };
  if (rel === 'not_relevant') return { action: 'SILENT', relevance: rel, fallback: false, hardFloor: null };
  const span = featurize(email || {}, profile || {}).intent_span;
  const action = feasible(email || {}, span);
  if (!action) return { action: 'SILENT', relevance: 'relevant', fallback: false, hardFloor: span ? 'close-not-feasible' : 'no-intent-span' };
  return { action: action, relevance: 'relevant', fallback: false, hardFloor: null };
}

module.exports = { judgeLearned };
