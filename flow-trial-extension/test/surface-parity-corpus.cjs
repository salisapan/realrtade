'use strict';
// One algorithm on every surface (owner, 2026-10-21): the same words give the same detection whether they arrive in Gmail on a
// computer, in Outlook, in the Gmail app through the Workspace card, or in a chat. Detection is FlowIncomingJudge.judge. A surface
// differs only in what it can write (a draft, a task, a hold), never in whether Glance saw the ask.
// This test runs one set of lines through the four entry points and fails when the intent type or the show decision differs.
// The lines are invented. Run: node test/surface-parity-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const CORE = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'file-attach.js', 'intent.js', 'actions.js', 'resolution.js', 'incoming-judge.js'];
const sandbox = { module: undefined, console };
vm.createContext(sandbox);
for (const f of CORE) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sandbox, { filename: f });
const judgeCore = vm.runInContext('FlowIncomingJudge.judge', sandbox);

// The Workspace card ships the same core inside CoreBundle.js; it must be built from this tree.
const bundleBox = { module: undefined, console };
vm.createContext(bundleBox);
vm.runInContext(fs.readFileSync(path.join(ROOT, '..', 'glance-gmail-addon', 'CoreBundle.js'), 'utf8'), bundleBox, { filename: 'CoreBundle.js' });
const addon = vm.runInContext('Glance', bundleBox);
check('the Workspace card bundle carries the shared judge', typeof addon.judge === 'function');

const { FlowChatDraft } = require(path.join(ROOT, 'src', 'chat-draft.js'));
const NOW = new Date('2026-10-20T10:00:00+03:00');
const base = { subject: 'Re: x', sender: { email: 'dana@firm.example', name: 'Dana' }, to: ['me@example.com'], ownAddresses: ['me@example.com'], now: NOW, attachmentCount: 0, userName: 'Sam', ownNames: ['Sam', 'סאם'] };

const LINES = [
  'Could you introduce me to someone on your digital team?',
  'What is the status of the proposal? I need to know by tonight.',
  'Please keep me posted once the payment goes out.',
  'תעדכן אותי בבקשה עד מחר לגבי התשלום',
  'אפשר שתפגיש אותי עם איש הקשר אצלכם עד סוף השבוע?',
  'Can you send me the Zoom link for tomorrow?',
  'יש קישור לזום ?',
  'Do you have the invoice?',
  'really?',
  'Could we meet Thursday at 3pm to go over the pilot?',
  'Please send the report by Thursday.',
  'אשמח לתאם שיחה השבוע, מתי נוח לך?',
  'Thanks for the update, the status looks good.',
  'FYI the payment went out this morning.',
  'Maybe we could look at it sometime, no rush.',
  'We approved the budget last week.',
  'Let me know if you have any questions.',
  'תודה רבה, קיבלתי את הכל.',
  'Unsubscribe from this newsletter to stop receiving these emails.'
];

const SIGN_LINES = [
  { text: 'מצורף החוזה, חתום והחזר עד יום חמישי.', attachmentCount: 1, replyTrack: true },
  { text: 'לא צריך, חתום והחזר כבר טופל.', attachmentCount: 1, replyTrack: false }
];

for (const text of LINES) {
  const input = Object.assign({ text }, base);
  const g = judgeCore(Object.assign({ surface: 'gmail' }, input), {});
  const o = judgeCore(Object.assign({ surface: 'outlook' }, input), {});
  const c = judgeCore(Object.assign({ surface: 'chat' }, input), {});
  const a = addon.judge(Object.assign({ surface: 'gmail' }, input));
  const type = (r) => (r && r.intent && r.intent.type) || null;
  check('same intent type on Gmail, Outlook, chat and the Workspace card: ' + text,
    type(g) === type(o) && type(g) === type(c) && type(g) === type(a), { gmail: type(g), outlook: type(o), chat: type(c), card: type(a) });
  check('the Workspace card decides exactly as Gmail does: ' + text, Boolean(g.show) === Boolean(a.show), { gmail: g.show, card: a.show });
}

for (const row of SIGN_LINES) {
  const input = Object.assign({ text: row.text, attachmentCount: row.attachmentCount }, base);
  const g = judgeCore(Object.assign({ surface: 'gmail' }, input), {});
  const o = judgeCore(Object.assign({ surface: 'outlook' }, input), {});
  const a = addon.judge(Object.assign({ surface: 'gmail' }, input));
  const proc = (r) => (r && r.process && r.process.id) || null;
  if (row.replyTrack) {
    check('Hebrew sign-and-return is reply-track on Gmail: ' + row.text.slice(0, 28), proc(g) === 'reply-track' && g.show, { got: proc(g), show: g.show });
    check('Hebrew sign-and-return is reply-track on Outlook: ' + row.text.slice(0, 28), proc(o) === 'reply-track' && o.show, { got: proc(o), show: o.show });
  } else {
    check('negated sign-and-return is not reply-track on Gmail: ' + row.text.slice(0, 28), proc(g) !== 'reply-track', { got: proc(g), show: g.show });
    check('negated sign-and-return is not reply-track on Workspace card: ' + row.text.slice(0, 28), proc(a) !== 'reply-track', { got: proc(a), show: a.show });
  }
  check('Workspace card matches Gmail on sign-and-return: ' + row.text.slice(0, 28),
    proc(g) === proc(a) && Boolean(g.show) === Boolean(a.show), { gmail: proc(g), card: proc(a), showG: g.show, showA: a.show });
}

// The chat lane runs this same judge and only adds its own place and fact detection on top.
check('the chat lane carries the shared judge result', (() => {
  const r = FlowChatDraft.judge(Object.assign({ text: 'Where is the restaurant from last week?', evidence: {} }, base));
  return r && Object.prototype.hasOwnProperty.call(r, 'incoming');
})());
console.log(failures ? 'TOTAL FAILURES: ' + failures : 'TOTAL FAILURES: 0');
process.exit(failures ? 1 : 0);
