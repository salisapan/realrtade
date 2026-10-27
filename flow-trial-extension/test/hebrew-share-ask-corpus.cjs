// Hebrew asks for a link, a folder, a recording or a place in a group that were quiet: «האם יש לך את הקישור למצגת?», «תוכל לשתף איתי את התיקייה?»,
// «תוכל להוסיף אותי לקבוצה?», «אפשר לקבל את התמונות מהאירוע?». The lines below were written after the change, not tuned to it. The QUIET lines are
// statements and questions that ask nothing of the reader. Run: node test/hebrew-share-ask-corpus.cjs
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
  'האם יש לכם את הקישור להקלטה של הוובינר?',
  'האם יש לך את הלוגו בגרסה עם רקע שקוף?',
  'תוכל לשתף איתי את התיקייה של הפרויקט?',
  'תוכלי להוסיף אותי לקבוצה של הצוות?',
  'אפשר לקבל את הצילומים מהאירוע?',
  'תוכל לשלוח לי את ההקלטה מהפגישה?'
];
const QUIET = [
  'יש לי תמונה של הקבוצה, רוצה לראות?',
  'האם יש לכם מקום ביום חמישי?',
  'הקבוצה נפגשת אצלי מחר',
  'הוספתי אותך לתיקייה המשותפת'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All hebrew-share-ask checks passed');
process.exit(failures ? 1 : 0);
