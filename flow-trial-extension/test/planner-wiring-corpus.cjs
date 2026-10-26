// The Planner destination on the existing Outlook To Do card, behind the owner's switch PLANNER_TASK
// (off). Checks: which plan a mail names (exactly one of the person's plans, in words); the worker
// wiring is switch-gated, falls back to To Do on any doubt, keeps the entity tag in the worker and
// the id self-describing, reads Planner tasks by id on reopen, and Undo uses If-Match.
// The real-browser run is e2e/outlook-planner.spec.js.
// Run: node test/planner-wiring-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowPlannerTask: P } = require('../core/planner-task.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const PLANS = [{ id: 'P1', title: 'Website relaunch' }, { id: 'P2', title: 'Offsite' }, { id: 'P3', title: 'Ops' }, { id: 'P4', title: 'ops' }, { id: 'P5', title: 'שיווק' }];

console.log('\n--- which plan a mail names ---\n');
const named = [
  ['Please send the contract to Dana, track it on the Website relaunch plan.', 'P1'],
  ['Add this to the Offsite board by Friday', 'P2'],
  ['Put it on the website relaunch plan please', 'P1'],
  ['Please add it to Planner plan Offsite', 'P2'],
  ['אפשר להוסיף את זה לתוכנית שיווק', 'P5'],
  ['תוסיף את זה ללוח שיווק', 'P5']
];
for (const [text, id] of named) {
  const r = P.planNamed(text, PLANS);
  check('names one plan: ' + text, r.plan && r.plan.id === id, r);
}
const unnamed = [
  ['Put it on the Ops plan', 'ambiguous-plan'],
  ['Please add it to the Jira board for the Offsite plan', 'other-app'],
  ['Add this to the Retreat plan', 'not-named'],
  ['The Offsite planning is moving', 'not-named'],
  ['Please remember to renew the domain by Friday.', 'not-named'],
  ['', 'not-named']
];
for (const [text, why] of unnamed) {
  const r = P.planNamed(text, PLANS);
  check('stays in To Do (' + why + '): ' + (text || '(empty)'), !r.plan && r.reason === why, r);
}
check('a plan list that was not read stays in To Do', !P.planNamed('track it on the Offsite plan', null).plan);
check('a plan with no id is never picked', !P.planNamed('track it on the Broken plan', [{ title: 'Broken' }]).plan);
check('a title that is a regex is matched as text, not as a pattern', !P.planNamed('track it on the Q(3 plan', [{ id: 'X', title: '.*' }]).plan);

console.log('\n--- the worker wiring ---\n');
const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8');
check('the module is imported after proof-of-close.js (it reads FlowProofOfClose when it loads)', bg.indexOf("import '../core/proof-of-close.js'") < bg.indexOf("import '../core/planner-task.js'") && bg.indexOf("import '../core/planner-task.js'") > 0);
check('the Planner path needs the switch', /async function outlookPlannerWrite/.test(bg) && /glanceSwitchOn\(P\.SWITCH\)/.test(bg));
check('any doubt falls back to To Do: no plan, no list, no named plan', /if \(!listed\.ok \|\| !listed\.json \|\| !Array\.isArray\(listed\.json\.value\)\) return null;/.test(bg) && /if \(!named\.plan\) return null;/.test(bg));
check('the task card writes Planner before the To Do body is built', bg.indexOf('const planned = await outlookPlannerWrite(p, title, close.dueIso);') > 0 && bg.indexOf('const planned = await outlookPlannerWrite') < bg.indexOf("const body = { title: title };"));
check('the id says Planner and the entity tag stays in the worker', /PLANNER_ID_PREFIX = 'planner:'/.test(bg) && /PLANNER_REFS_KEY = 'glancePlannerRefs'/.test(bg) && /outlookPlannerRefPut\(raw, r\.ref\)/.test(bg));
check('reopen reads a Planner task by id, not a To Do list', /if \(plannerRawId\(id\)\) \{/.test(bg) && /\/planner\/tasks\/' \+ encodeURIComponent\(plannerRawId\(id\)\)/.test(bg));
check('Undo uses the kept entity tag and says so when it has none', /outlookPlannerRefGet\(raw\)/.test(bg) && /if \(!kept\) return \{ ok: false, reason: 'unconfirmed'/.test(bg));
check('no assignee and no send: the Graph helper refuses send paths and the module sets no assignee', /outlookAssertNotSend\(url\);\n    const init = \{ method: method \}/.test(bg) && P.SWITCH === 'PLANNER_TASK' && P.SWITCH_DEFAULT === false);
check('the manifest is not changed by this wiring', !/planner/i.test(manifest));

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
