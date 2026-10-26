// Hebrew "can you" in the second person («את יכולה לשלוח לי את הקובץ עד הערב?», «אתה יכול לבדוק את החשבונית?», «אתם יכולים…», «היית יכולה…») and
// English "Are you able to …?" are an ask of the reader and were quiet. The QUIET lines are look-alikes (a permission, a way to pay, a
// scheduling reply, a question about attending). Run: node test/can-you-he-corpus.cjs
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
  'את יכולה לשלוח לי את הקובץ עד הערב?',
  'אתה יכול לשלוח לי את החוזה עד מחר?',
  'אתם יכולים לשלוח לי את ההצעה עד יום רביעי?',
  'את יכולה לאשר לי את ההצעה עד מחר?',
  'אתה יכול לבדוק את החשבונית ולחזור אליי עד חמישי?',
  'היית יכולה לשלוח לי את הקובץ עד יום שני?',
  'היית יכול להעביר לי את הטפסים החתומים עד מחר?',
  'Are you able to review this by Friday?',
  'Are you able to send me the signed form by Tuesday?'
];
const QUIET = [
  'אתה יכול לבוא מתי שאתה רוצה',
  'אתה יכול לשלם בכרטיס אשראי או במזומן',
  'את יכולה להעביר את הכסף לחשבון הזה',
  'אתה יכול לשלוח לי את החוזה מתי שנוח לך',
  'Are you able to attend? We are meeting at 10'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All can-you-he checks passed');
process.exit(failures ? 1 : 0);
