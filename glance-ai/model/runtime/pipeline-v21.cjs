'use strict';
// Shared v2.1 preparation (identical to pipeline-v2 except the featurizer): normalize body -> engine 0.9.35 on the normalized body (base veto + quote stripping + facts)
// -> features + veto inputs. Used by training export and by the runtime, so they cannot drift.
const { makeEngine, OWN } = require('../teacher/engine.cjs');
const { normalizeCase } = require('./normalize.cjs');
const { featuresOf, shapeOf } = require('../train/featurize-v21.cjs');
const V = require('./veto-v2.cjs');
const { addresseeOf, recipientRole } = require('./addressee.cjs');
const DEFAULT_OWN_NAMES = ['Sali', 'Sali Sapan', 'סאלי'];
let E = null;
function engine() { return E || (E = makeEngine(process.env.GLANCE_V2_ENGINE || 'tip')); }
function prepare(c0) {
  const e = engine();
  const c = normalizeCase(Object.assign({ ownNames: DEFAULT_OWN_NAMES }, c0));
  const ownEmail = OWN[c.surface === 'outlook' ? 'outlook' : 'gmail'];
  const eng = e.teach(c);
  const pp = e.preprocess(c);
  const voc = addresseeOf(pp.own, c.ownNames), role = recipientRole(c, ownEmail);
  const x = featuresOf(Object.assign({}, c, pp), { voc, role, ownEmail });
  return { c, eng, own: pp.own, facts: pp.facts, x, voc, role, shape: shapeOf(Object.assign({}, c, pp)),
    veto: { base: V.baseVeto(eng), product: V.productVeto(c, pp.own, ownEmail), cap: V.capFlags(c, pp.own, e.DEPS.fileAttach) } };
}
module.exports = { prepare, engine, DEFAULT_OWN_NAMES };
