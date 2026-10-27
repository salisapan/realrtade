// Asks for an account action that were quiet: "Please grant me access to the shared folder by Monday", "Please reset my password by end of day tomorrow", "Please transfer the
// domain to the new registrar by the 30th", "Please copy me on the reply to the client", «תעלה בבקשה את הטופס החתום לפורטל עד יום חמישי», «תשים אותי בעותק בתשובה ללקוח». The QUIET
// lines are the done-state twins and look-alikes. Written after the patterns, not tuned to them. Run: node test/account-ask-corpus.cjs
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
  'Please grant me access to the shared folder by Monday',
  'Could you give us access to the analytics dashboard before Friday?',
  'Please reset my password by end of day tomorrow',
  'Please transfer the domain to the new registrar by the 30th',
  'Please copy me on the reply to the client',
  'תעלה בבקשה את הטופס החתום לפורטל עד יום חמישי',
  'בבקשה תעביר את הדומיין לרשם החדש עד ה-30',
  'תשים אותי בעותק בתשובה ללקוח בבקשה',
  'בבקשה תאפס לי את הסיסמה עד מחר'
];
const QUIET = [
  'Access to the shared folder has been granted',
  'Your password was reset successfully',
  'The domain transfer is complete',
  "I'll copy you on the reply",
  'We reset the password and gave Dana access yesterday',
  'הגישה לתיקייה אושרה',
  'אעלה את הטופס לפורטל מחר',
  'החשבונית שולמה אתמול'
];
for (const t of SHOW) check('asks: ' + t, ask(t));
for (const t of QUIET) check('stays quiet: ' + t, !ask(t));
console.log(failures ? failures + ' FAILED' : 'All account-ask checks passed');
process.exit(failures ? 1 : 0);
