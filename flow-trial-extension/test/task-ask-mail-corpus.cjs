'use strict';
// Task asks in mail (Outlook and Gmail): "Don't forget to bring the signed form on Monday", "I need the signed contract by Wednesday" and
// "Please call me back tomorrow" become a task due that day, only when the host passes taskAskOn (glanceSwitches.TASK_ASK, off), only for a mail
// addressed to the person (their address on To, not Cc-only). The lines are invented. Run: node test/task-ask-mail-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'system-notice.js', 'day-words.js', 'chat-reminder.js', 'chat-deadline-ask.js', 'chat-callback-ask.js', 'incoming-judge.js'];
const box = { module: undefined, console };
vm.createContext(box);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), box, { filename: f });
const J = vm.runInContext('FlowIncomingJudge', box);
const NOW = new Date(2026, 9, 23, 10, 0, 0); // Friday
const ME = 'sali@mine.example';
const judge = (text, extra) => J.judge(Object.assign({ text, subject: 'Quick one', sender: { name: 'Dana Levi', email: 'dana@example.com' }, senderEmail: 'dana@example.com', now: NOW, surface: 'outlook', inbound: true, taskAskOn: true, to: [ME], cc: [], ownAddresses: [ME] }, extra || {}));

const YES = [
  ["Hi Sali, don't forget to bring the signed form on Monday. Thanks!", '2026-10-26', /^Bring the signed form$/i],
  ['Hi Sali, I need the signed contract by Wednesday, thanks', '2026-10-28', /^Signed contract$|^The signed contract$|contract/i],
  ['Hi, please sign the lease by Monday', '2026-10-26', /sign the lease/i],
  ['Hi Sali, please call me back tomorrow when you have a minute', '2026-10-24', /^Call back · Dana Levi$/],
  ['שלום, אל תשכח להביא את הטופס החתום ביום שני', '2026-10-26', /הטופס/],
  ['תחתום על החוזה עד יום שישי, תודה', '2026-10-30', /החוזה/],
  ['שלום סלי, תתקשר אליי מחר', '2026-10-24', /^להתקשר · Dana Levi$/]
];
for (const [text, day, titleRe] of YES) {
  const r = judge(text);
  const st = r.show && r.process.steps[0];
  check('task ask offers one task: ' + text.slice(0, 50), r.show && r.process.taskAsk === true && r.process.steps.length === 1 && st.kind === 'outlookTask' && st.params.dateIso === day && titleRe.test(st.params.title), r);
}
check('the same ask on Gmail keeps the Google task step', judge(YES[0][0], { surface: 'gmail' }).process.steps[0].kind === 'googleTask');
for (const [text] of YES) check('switch off: no task ask card: ' + text.slice(0, 40), !(judge(text, { taskAskOn: false }).intent || {}).taskAsk);
check('Cc-only: no task ask', !(judge(YES[0][0], { to: ['other@example.com'], cc: [ME] }).intent || {}).taskAsk);
check('no To list: no task ask', !(judge(YES[0][0], { to: null }).intent || {}).taskAsk);
check('addressed to someone else: no task ask', !(judge(YES[0][0], { to: ['other@example.com'], cc: [] }).intent || {}).taskAsk);
check("the person's own mail is never a task ask", !(judge(YES[0][0], { senderIsUser: true }).intent || {}).taskAsk);
check('a mail that is not inbound is never a task ask', !(judge(YES[0][0], { inbound: false }).intent || {}).taskAsk);
const LONG = 'Hi Sali,\n\nHope you are well. One small thing before the weekend: don\'t forget to bring the signed form on Monday, the office opens at 9:00 and the guard will ask for it at the gate.\n\nThanks a lot,\nDana Levi\nOffice manager | 03-1234567 | dana@example.com';
{ const r = judge(LONG); check('a long mail still finds its one reminder', r.show && r.process.taskAsk === true && r.process.steps[0].params.dateIso === '2026-10-26', r); }
const QUIET = [
  "Don't forget to bring the form", 'Remember to call on 2025-01-02', 'I forgot to send it on Monday', 'Need the report', 'Maybe sign the lease by Monday',
  'I need the report by 2025-01-02', "I'll send the report by Wednesday", 'He needs the report by Wednesday', 'Call me', "Don't call me tomorrow",
  'Thanks, the report was sent by Wednesday', 'תחתום על החוזה', 'אל תתקשר אליי מחר', 'אולי תחתום על החוזה עד יום שישי'
];
for (const text of QUIET) check('no task ask for: ' + text, !(judge(text).intent || {}).taskAsk, judge(text).reason);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const js = manifest.content_scripts[0].js;
check('manifest loads the three readers before the judge', ['core/chat-reminder.js', 'core/chat-deadline-ask.js', 'core/chat-callback-ask.js'].every((f) => js.indexOf(f) > -1 && js.indexOf(f) < js.indexOf('core/incoming-judge.js')));
const ol = fs.readFileSync(path.join(ROOT, 'src', 'content-outlook.js'), 'utf8');
check('Outlook reads glanceSwitches.TASK_ASK and passes taskAskOn', /TASK_ASK === true/.test(ol) && /taskAskOn: taskAskSwitch === true/.test(ol));
const gm = fs.readFileSync(path.join(ROOT, 'src', 'content-gmail.js'), 'utf8');
check('Gmail asks the same helper behind TASK_ASK with its audience', /FlowIncomingJudge\.taskAsk/.test(gm) && /TASK_ASK === true/.test(gm) && /ownAddresses: ctx\.ownAddresses/.test(gm));
console.log(failures ? '\n' + failures + ' FAILED' : '\nAll task-ask-mail checks passed');
process.exit(failures ? 1 : 0);
