// Asks for a reply, a decision or a signature that were quiet: "Please get back to me on the pricing by Wednesday", "Let me know your decision by
// Thursday", "Kindly revert by Monday", "I'd appreciate a quick update by tomorrow", "Need your decision by Wednesday", «אשמח שתחזור אליי עד יום חמישי»,
// «אני זקוק לחתימה שלך על ההסכם», «אפשר לשמוע ממך עדכון?». The lines below were written after the patterns, not tuned to them. The QUIET lines are
// the writer's own promise or a wish that is not an ask. Run: node test/reply-ask-corpus.cjs
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
  'Please get back to me on the schedule by Thursday',
  'Let me know your preference by Tuesday',
  'Kindly revert by Monday with the signed copy',
  "We'd appreciate a prompt confirmation by Friday",
  'Need your signature by Wednesday',
  'Do let me know by Thursday whether the venue works',
  'אשמח שתחזור אליי עד מחר עם המחיר',
  'אשמח שתשלח לי את הטופס עד יום שלישי',
  'אנחנו זקוקים לאישור שלכם עד יום חמישי',
  'אפשר לשמוע ממך עדכון עד סוף השבוע?'
];
const QUIET = [
  "Thanks, I'll revert by Monday with my feedback",
  "We'll let you know our decision by Thursday",
  'I need your attention to this: the weather is great',
  'אשמח שתהיה לך שבת נעימה',
  'אנחנו נחזור אליך עד יום חמישי עם תשובה',
  'אפשר לשמוע ממך? הכל טוב?'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All reply-ask checks passed');
process.exit(failures ? 1 : 0);
