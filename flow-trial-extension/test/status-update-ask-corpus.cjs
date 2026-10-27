// Asks for an update, a progress report or a countersignature that were quiet: "Please give me a status update on the migration by Tuesday", "Could you send me a quick
// update ...", "Please countersign the NDA and return it by Friday", «נשמח לעדכון סטטוס על הפרויקט עד יום רביעי», «תעדכני את הסטטוס של הפרויקט עד מחר». The QUIET lines
// are the writer's own update, reports that are attached and look-alikes. Written after the patterns, not tuned to them. Run: node test/status-update-ask-corpus.cjs
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'];
const sb = { console }; vm.createContext(sb);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8'), sb, { filename: f });
const judge = vm.runInContext('FlowIncomingJudge.judge', sb);
const base = { subject: 'Re: x', sender: { email: 'dana@firm.example', name: 'Dana' }, to: ['me@example.com'], ownAddresses: ['me@example.com'], now: new Date('2026-10-26T10:00:00+02:00'), attachmentCount: 0, userName: 'Sali', ownNames: ['Sali'], surface: 'outlook' };
const ask = (t) => { const r = judge(Object.assign({ text: t }, base), {}); return Boolean(r.show) || (r.intent && r.intent.type === 'request'); };
let failures = 0;
function check(name, cond) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name); } }
const SHOW = [
  'Please give me a status update on the migration by Tuesday',
  'Could you send me a quick update on the delivery by Thursday?',
  'Can you give me an update on the contract by tomorrow?',
  'Please send me a short progress report by Monday',
  'I need a status update on the audit before Friday',
  'Please countersign the NDA and return it by Friday',
  'נשמח לעדכון סטטוס על הפרויקט עד יום רביעי',
  'נשמח לקבל עדכון על ההזמנה עד יום חמישי',
  'תעדכני את הסטטוס של הפרויקט עד מחר'
];
const QUIET = [
  "I'll give you a status update by Friday",
  'Here is a status update on the migration',
  'Thanks for the update, much appreciated',
  'Our weekly report is attached',
  'Please find the progress report attached',
  'נשמח לעדכון שלכם כשיתאפשר',
  'נשמח לראות אותך באירוע ביום חמישי',
  'נשמח לעדכן אותך בהמשך',
  'עדכנתי את הסטטוס בטבלה'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All status-update-ask checks passed');
process.exit(failures ? 1 : 0);
