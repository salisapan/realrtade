// Work asks that were quiet: "Please make sure the contract is signed by Thursday", "Make sure the invoice is signed before Friday", "Please proofread the
// attached and send it back by Wednesday", "Please order 10 boxes by Tuesday", "Do you mind uploading the files to the shared drive by Friday?", «תוודא שהחוזה חתום
// עד יום חמישי», «אפשר שתעיף מבט על המצורף…». The lines below were written after the patterns, not tuned to them. The QUIET lines are polite notices and
// marketing that use the same verbs. Run: node test/work-ask-corpus.cjs
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
  'Please make sure the timesheet is approved by Friday',
  'Make sure the figures are final before Monday',
  'Please proofread the brochure and return it by Tuesday',
  'Please order the replacement parts by Wednesday',
  'Please fill out the onboarding form by Thursday',
  'Do you mind reviewing the draft by tomorrow?',
  'תוודאי שהטופס מולא עד יום שלישי',
  'אפשר שתסתכל על ההצעה ותחזור אליי עד מחר?',
  'הלקוח רוצה צבע אחר בכפתור, אפשר לעדכן עד יום שלישי?',
  'אפשר לתקן את שגיאת הכתיב בעמוד הראשי עד מחר?'
];
const QUIET = [
  'Please find attached the signed agreement',
  'Please note that the office is closed on Thursday',
  'Please make sure to follow us on social media',
  'Please book now and save 20% this Friday',
  'Make sure you have a great weekend',
  'Please contact support@example.com for help',
  'אפשר לעדכן אותך מחר?',
  'אפשר לעדכן את הסטטוס שלי בהמשך?'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All work-ask checks passed');
process.exit(failures ? 1 : 0);
