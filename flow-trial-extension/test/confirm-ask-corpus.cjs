// Asks to confirm or acknowledge that were quiet: "Kindly acknowledge receipt by Thursday", «תאשר לי בבקשה שהכול בסדר עד מחר», «אשמח לאישור שלך שקיבלת את
// המייל». A soft Hebrew ask ("אין לחץ", "כשיתאפשר", "בהזדמנות") is a hedge and stays quiet, like "no rush" in English. The lines were written after the patterns.
// Run: node test/confirm-ask-corpus.cjs
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
  'Kindly acknowledge receipt of the documents by Friday',
  'Kindly reply with your decision by Monday',
  'תאשר לי בבקשה שהקבצים הגיעו עד מחר',
  'תאשרי לי שקיבלת את החוזה עד יום חמישי',
  'אשמח לאישור שלך על לוח הזמנים עד יום שלישי',
  'נשמח לעדכון שלכם עד סוף השבוע'
];
const QUIET = [
  'אשמח לאישור שלך על ההצעה, אין לחץ',
  'נשמח לעדכון שלכם כשיתאפשר',
  'אשמח לתשובה שלך בהזדמנות',
  'Kindly note that the office is closed on Thursday',
  'תאשר לי את הבקשה, אני מנהל במערכת'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All confirm-ask checks passed');
process.exit(failures ? 1 : 0);
