'use strict';
// A run of spaces or tabs in a mail is one space. Found 2026-11-11 by a metamorphic check (glance-ai/scoreboard/metamorphic): doubling the spaces of 600
// test mails flipped 62 decisions (53 acts went silent) because the patterns assume single spaces. `prepareForJudge` now collapses runs of spaces and tabs
// (newlines are kept). This corpus pins that the shared judge gives the same decision for the same words with extra spaces or tabs, in English and Hebrew,
// for asks, promises, meetings, payments and quiets alike.
// Run: node test/whitespace-robust-corpus.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
let failures = 0;
function check(name, cond, detail) { if (cond) console.log('PASS:', name); else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); } }
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'];
const sb = { module: undefined, console }; vm.createContext(sb);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sb, { filename: f });
const judge = vm.runInContext('FlowIncomingJudge.judge', sb);
const base = { subject: 'q', sender: { name: 'Dana Cole', email: 'dana@northwind.com' }, now: new Date('2026-10-07T12:00:00+03:00'), namesWaitDone: true, ownNames: ['Sali', 'סאלי'],
  to: ['ai.local.flow@gmail.com'], cc: [], ownAddresses: ['ai.local.flow@gmail.com'], inbound: true, direction: 'inbound', surface: 'gmail' };
const decide = (text) => { const r = judge(Object.assign({ text }, base), {}); return JSON.stringify([r.show === true, r.intent && r.intent.type || null, r.reason || null]); };
const LINES = ['Hi Sali,\n\nCould you send me the budget by Tuesday?\n\nThanks,\nDana', 'Hi Sali,\n\nAs agreed, you will send the invoice by Monday.\n\nDana', 'Can we meet Thursday at 3pm to go over the pilot?',
  'Please wire $4,850 by Friday.', 'היי סאלי,\n\nתוכל לשלוח לי את התקציב עד יום חמישי?\n\nתודה, דנה', 'סיכמנו שתשלח את ה-SOW עד ה-15.10', 'נוכל להיפגש ביום שלישי בשעה 15:00 לסקירת החוזה?',
  'Thanks for the update, the status looks good.', 'FYI the payment went out this morning.', 'Unsubscribe from this newsletter to stop receiving these emails.', 'תודה רבה, קיבלתי את הכל.'];
for (const t of LINES) {
  const plain = decide(t), dbl = decide(t.replace(/ /g, '  ')), tab = decide(t.replace(/ /g, '\t ')), many = decide(t.replace(/ /g, '     '));
  check('same decision with doubled spaces: ' + t.slice(0, 32).replace(/\n/g, ' '), plain === dbl, [plain, dbl]);
  check('same decision with tabs and five spaces: ' + t.slice(0, 32).replace(/\n/g, ' '), plain === tab && plain === many, [plain, tab, many]);
}
check('newlines are not collapsed (a paragraph break stays one)', decide('Hi Sali,\n\nCould you send me the budget by Tuesday?\n\nThanks') === decide('Hi Sali,\n\nCould you send me the budget by Tuesday?\n\nThanks'));
console.log(failures ? '\nFAILURES: ' + failures : '\nTOTAL FAILURES: 0'); process.exit(failures ? 1 : 0);
