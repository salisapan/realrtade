'use strict';
// v2 decision = normalize -> engine 0.9.35 (base veto, quote strip, facts) -> gate p>=tau(label) -> product veto -> chooser
// -> cap veto -> ONE label or SILENT. Offline / shadow only: nothing here surfaces a Do It.
const { prepare } = require('./pipeline-v2.cjs');
const { capVeto } = require('./veto-v2.cjs');
const { load } = require('./glance-model-v2.cjs');
function make(tag) {
  const M = load(tag);
  function decide(c) {
    const P = prepare(c);
    const s = M.scores(P.x);
    const tau = M.tauFor(s.label);
    const veto = P.veto.base || P.veto.product || capVeto(P.veto.cap, s.label);
    const modelAlone = s.pShow >= tau ? s.label : 'SILENT';
    const label = !veto && s.pShow >= tau ? s.label : 'SILENT';
    return { label, modelAlone, pShow: s.pShow, top: s.label, tau, veto: veto || null, engine: P.eng.label, engineReason: P.eng.reason, voc: P.voc, role: P.role };
  }
  return { decide, model: M };
}
module.exports = { make };
