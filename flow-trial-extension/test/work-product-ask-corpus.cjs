'use strict';
// A request to make a work product (a document, a spreadsheet, a report, a summary) is a request: the card offers a reply
// draft and a task. Found on real test mail where "Please put these figures into a spreadsheet" and "תכין מסמך סיכום"
// stayed silent. The work product has to be named: "please create an account" and "write back when you can" stay quiet.
// The lines are invented. Run: node test/work-product-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'incoming-judge.js']) {
  const p = path.join(ROOT, 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
}
const J = sandbox.FlowIncomingJudge;
const own = ['me@example.com'];
function judge(text, subject, from) {
  return J.judge({
    text, subject: subject || 'Request', sender: { email: from || 'dana@firm.example', name: 'Dana Levi' },
    to: own, ownAddresses: own, now: new Date('2026-10-20T10:00:00+03:00'), surface: 'gmail', userName: 'Sam', ownNames: ['Sam', 'סאם'], attachmentCount: 0
  }, {});
}

const offered = [
  ['figures into a spreadsheet', 'Hi Sam,\nPlease put these figures into a spreadsheet: Q1 10, Q2 20, Q3 35.\nThanks, Dana'],
  ['draft a summary doc', 'Hi Sam,\nPlease draft a one-page summary doc of the pilot.\nThanks, Dana'],
  ['create a shared sheet', 'Hi Sam,\nCan you create a shared sheet for the Q4 budget and send me the link by Friday?\nDana'],
  ['Hebrew: summary document by Thursday', 'היי סאם,\nתכין בבקשה מסמך סיכום של הפיילוט עד יום חמישי.\nדנה'],
  ['Hebrew: the numbers into a table', 'היי סאם,\nתכניס בבקשה את הנתונים לטבלה: רבעון 1 - 10, רבעון 2 - 20.\nדנה']
];
for (const [label, text] of offered) {
  const r = judge(text);
  check('offered: ' + label, r.show === true && r.process && r.process.id === 'reply-track', r);
}

const quiet = [
  ['an account to create on a portal', 'Hi Sam,\nPlease create an account on our portal to see the invoice.\nThanks', 'billing@vendor.example'],
  ['a password prompt', 'Please enter your password to continue.', 'no-reply@bank.example'],
  ['a phone on silent', 'Please put your phone on silent during the meeting.', 'dana@firm.example'],
  ['write back when you can', 'Hi,\nPlease write back when you can, no rush.\nDana', 'dana@firm.example'],
  ['a survey with a footer', 'Please fill in the survey below to help us improve. Unsubscribe here.', 'news@vendor.example']
];
for (const [label, text, from] of quiet) {
  const r = judge(text, 'Update', from);
  check('quiet: ' + label, r.show !== true, r);
}

process.exit(failures ? 1 : 0);
