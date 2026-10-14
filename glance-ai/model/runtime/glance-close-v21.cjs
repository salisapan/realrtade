'use strict';
// v2.1 decision = minimal normalize (normalize-v21) -> v2 normalize + engine 0.9.35 (base veto, quote strip, facts)
// -> gate p >= tau(label@shape) -> chooser floor -> product veto -> cap veto -> ONE label or SILENT. Offline / shadow only.
const { prepare } = require('./pipeline-v21.cjs');
const { capVeto } = require('./veto-v2.cjs');
const { load } = require('./glance-model-v21.cjs');
const { normalizeInput } = require('./normalize-v21.cjs');
function make(tag, opt) {
  const M = load(tag, opt);
  function decide(c0) {
    const P = prepare(normalizeInput(c0));
    const s = M.scores(P.x);
    const tau = M.tauFor(s.label, P.shape);
    const pass = s.pShow >= tau && M.floorOk(s);
    const veto = P.veto.base || P.veto.product || capVeto(P.veto.cap, s.label);
    return { label: !veto && pass ? s.label : 'SILENT', modelAlone: pass ? s.label : 'SILENT', pShow: s.pShow, pLabel: s.pLabel, top: s.label, tau, shape: P.shape,
      floorBlocked: s.pShow >= tau && !M.floorOk(s), veto: veto || null, engine: P.eng.label, engineReason: P.eng.reason, voc: P.voc, role: P.role, x: P.x };
  }
  return { decide, model: M };
}
module.exports = { make };
