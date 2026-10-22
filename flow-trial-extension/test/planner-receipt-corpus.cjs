// Planner receipt copy names the plan and bucket; not To Do undo wording.
// Run: node test/planner-receipt-corpus.cjs
'use strict';
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const { FlowProofOfClose: Proof } = require('../core/proof-of-close.js');

const row = {
  kind: 'written',
  fetchedBack: true,
  system: 'microsoft/planner',
  connectorId: 'plannerTask',
  externalId: 'planner:e2e-planner-1',
  writtenLine: 'Planner · Renew domain · 2026-10-23',
  planTitle: 'Website relaunch',
  bucketTitle: 'To do',
  processName: 'Website relaunch · To do',
  ref: { taskId: 'planner:e2e-planner-1', externalId: 'planner:e2e-planner-1' }
};
const copy = Proof.remountCopy(row);
check('Planner undo names plan and bucket', copy.undoHint === 'Undo removes the Planner task in Website relaunch · To do.', copy);
check('Planner undone line names plan and bucket', copy.undoneLine.indexOf('Website relaunch') >= 0 && copy.undoneLine.indexOf('To do') >= 0, copy.undoneLine);
check('Planner row is not To Do undo', copy.undoHint.indexOf('To Do task') < 0, copy.undoHint);
check('connector is plannerTask', copy.connectorId === 'plannerTask', copy.connectorId);

const todo = Proof.remountCopy({ kind: 'written', fetchedBack: true, system: 'microsoft/todo', connectorId: 'outlookTask', externalId: 't1', ref: { taskId: 't1' } });
check('To Do row keeps To Do undo', todo.undoHint === 'Undo removes the To Do task.', todo.undoHint);

if (failures) process.exit(1);
console.log('planner-receipt-corpus: all passed');
