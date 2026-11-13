'use strict';
// The engine's hard quiets also veto the model (lab, 2026-11-11; docs/glance-ai/model-upgrade-plan.md). A model may act only where the rules engine
// found no intent (`intent-null`) or a soft reason. On the frozen agreement labels these engine silence reasons carried no act at all:
//   quiet:hedge 69 silent / 0 act, quiet:google 10 / 0, own-sender 22 / 0, meeting-veto 2 / 0, onedrive-target-on-gmail 2 / 0   (set A)
//   quiet:noise 24 / 2, quiet:family 3 / 2                                                                                    (added in set B)
// The list was chosen on those labels; batch-007 (labelled afterwards) had no model error of this kind, so the veto is NOT yet confirmed out of
// sample. The extension's router already puts the same rule in `core/understanding-router.js` (tier0.quiet ends the read before any model).
const A = new Set(['quiet:hedge', 'quiet:google', 'own-sender', 'meeting-veto', 'onedrive-target-on-gmail']);
const B = new Set([...A, 'quiet:noise', 'quiet:family']);
function modelMayAct(engineReason, set) { return !(set || A).has(engineReason); }
module.exports = { A, B, modelMayAct };
