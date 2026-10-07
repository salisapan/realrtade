'use strict';
// One decision = teacher (incumbent engine) + model + hard veto. Offline/shadow only: nothing here surfaces a Do It.
const { teach, preprocess } = require('../teacher/teacher.cjs');
const { baseVeto, v2Veto, capVeto } = require('./veto.cjs');
const { load } = require('./glance-model.cjs');
function make(variant) {
  const M = load(variant);
  function decide(c, teacher) {
    const t = teacher || teach(c);
    const m = M.predict(c);
    const vb = baseVeto(t), v2 = v2Veto(c), cap = capVeto(c, m.label, preprocess(c).own);
    const modelVetoed = vb || cap ? 'SILENT' : m.label;
    const modelV2 = vb || cap || v2 ? 'SILENT' : m.label;
    const teacherV2 = t.show && v2 ? 'SILENT' : t.label;
    return { teacher: t.label, teacherReason: t.reason, teacherV2, model: m.label, modelVeto: modelVetoed, modelVetoV2: modelV2,
      veto: { base: vb, v2, cap }, pShow: m.pShow, top: m.top };
  }
  return { decide, model: M };
}
module.exports = { make };
