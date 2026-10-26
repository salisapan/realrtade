'use strict';
// A request for an update or an introduction is a request, English and Hebrew: "keep me posted once the payment goes out",
// "what's the status of the proposal, I need it by tonight", "introduce me to your CTO", "תעדכן אותי", "תפגיש אותי".
// Found by a value test on test mail (2026-10-21). The reader has to be the one who acts, so a status line stays quiet.
// The lines are invented. Run: node test/status-intro-ask-corpus.cjs
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
function judge(text) {
  return J.judge({
    text, subject: 'Re: update', sender: { email: 'dana@firm.example', name: 'Dana Levi' },
    to: own, ownAddresses: own, now: new Date('2026-10-20T10:00:00+03:00'), surface: 'gmail', userName: 'Sam', ownNames: ['Sam', 'סאם'], attachmentCount: 0
  }, {});
}
const SHOW = [
  "Could you introduce me to someone on your digital team?",
  "Can you connect me with your CFO this week?",
  "Would you please introduce me to the head of operations?",
  "What's the status of the proposal? I need to know by tonight.",
  "Please keep me posted once the payment goes out.",
  "Let me know the status of the invoice by Thursday.",
  "Please update me on the migration before Friday.",
  "תעדכן אותי בבקשה עד מחר לגבי התשלום",
  "מה הסטטוס של החשבונית? אשמח לעדכון עד מחר",
  "אפשר שתפגיש אותי עם איש הקשר אצלכם עד סוף השבוע?",
  "אשמח שתפגיש אותי עם מי שאחראי אצלכם על הדיגיטל",
  "תעדכני אותי כשהתשלום יצא עד סוף היום",
  "Can you approve the budget by Wednesday?",
  "יש קישור לזום ?",
  "Do you have the invoice?",
  "Can you send the deck?",
  "אפשר לקבל את החשבונית?"
];
const QUIET = [
  "Thanks for the update, the status looks good.",
  "The status of the proposal is approved, no action needed.",
  "I introduced you to our CFO yesterday.",
  "She will keep him posted on the payment.",
  "We updated the roadmap last week.",
  "תודה על העדכון, הכל ברור",
  "FYI the payment went out this morning.",
  "Let me know if you have any questions.",
  "האם אתה מסכים להצעה?",
  "really?",
  "Do you like it?",
  "מה נשמע?",
  "איפה אתה?"
];
for (const t of SHOW) { const r = judge(t); check('show: ' + t, r.show === true, r.reason); }
for (const t of QUIET) { const r = judge(t); check('quiet: ' + t, r.show === false, r.reason); }
console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
