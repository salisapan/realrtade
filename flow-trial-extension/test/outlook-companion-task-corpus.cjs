'use strict';
// A card that carries a reply draft and a task (a mail of questions with a hold instruction) writes both on one Do It in Outlook, as Gmail does.
// Source-wiring check: the Outlook content script cannot be run headless here, so this pins the order and the guards that keep it honest.
// Run: node test/outlook-companion-task-corpus.cjs
const fs = require('fs');
const path = require('path');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
const draftFn = src.slice(src.indexOf("payload.connectorId = 'outlookDraft';"));
check('the companion writer exists and uses the task connector', /async function writeCompanionTodo\(ctx, taskStep\)/.test(src) && /connectorId: 'outlookTask'/.test(src.slice(src.indexOf('async function writeCompanionTodo'))));
check('the task is written only after the draft succeeded and was read back (not on an unverified draft)', /const companion = unverified \? null : await writeCompanionTodo\(ctx, taskStep\);/.test(draftFn));
check('the draft failure paths return before any task is written', draftFn.indexOf('return;') < draftFn.indexOf('writeCompanionTodo(ctx, taskStep)'));
check('a task that is not proved is not claimed on the receipt', /companion && companion\.proved \? written \+ ' Task added\.' : written/.test(draftFn));
check('Undo of the draft takes the task back too, and only after the draft is gone', /if \(u && u\.ok && companion\) \{[\s\S]{0,200}connectorId: 'outlookTask', ref: companion\.ref/.test(draftFn));
check('an edited draft is refused before the task is touched', draftFn.indexOf("u.reason === 'user-edited'") < draftFn.indexOf("connectorId: 'outlookTask', ref: companion.ref"));
const helper = src.slice(src.indexOf('async function writeCompanionTodo'), src.indexOf('function outlookTodoRow'));
check('the helper asks ProofOfClose, logs a fetched-back row only when proved, and a failed write adds nothing', /allowsHandled/.test(helper) && /fetchedBack: proved \? undefined : false/.test(helper) && /livePromiseProof/.test(helper));
console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
