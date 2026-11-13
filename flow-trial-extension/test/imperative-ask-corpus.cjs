// A firm Hebrew ask in the plain second person ("סאלי, תשיב לספק עד סוף היום", "בבקשה שלח לי את המצגת", "תוסיף משימה ל…")
// and "please add a task to …" used to get no card: HANDOFF_HE knew these verbs only behind תוכל / בבקשה ת / תשלח לי, so the
// request gate saw no ask and the score stayed under the bar. Third person, negation, reported speech, conditionals, a money
// transfer, a send-as-attachment and an approval keep their existing behaviour. Strings are written for this test.
// Run: node test/imperative-ask-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} } };
vm.createContext(sb);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'source-text.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js',
  'file-attach.js', 'fact-reply.js', 'quiet-metrics.js', 'resolution.js', 'incoming-judge.js', 'draft-reply.js']) {
  const p = path.join(__dirname, '..', 'core', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f });
}
const g = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb);
const J = g('FlowIncomingJudge');
const DEPS = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const NOW = new Date('2026-11-09T12:00:00+02:00');
function judge(text, surface) {
  return J.judge({ text, subject: 'Update', sender: { name: 'Jamie P.', email: 'jamie@example.com' }, now: NOW, threadUrl: 'https://mail.google.com/x',
    hasThreadAttachment: false, attachmentCount: 0, surface: surface || 'gmail', ownNames: ['Sali', 'Sali Sapan', 'סאלי'], namesPending: false, namesWaitDone: true }, DEPS);
}
let failures = 0;
function expect(name, ok, detail) { if (!ok) { failures++; console.error('FAIL', name, detail || ''); } else console.log('ok  ', name); }
const kinds = (r) => (r.show && r.process && r.process.steps ? r.process.steps.map((s) => s.kind) : []);
const shows = [
  'סאלי, תשיב לספק עם התשובה עד סוף היום.',
  'סאלי, תוסיף משימה לחדש את הביטוח עד יום שישי.',
  'סאלי, בבקשה שלח לי את המצגת המעודכנת.',
  'סאלי, תעדכן אותי על הסטטוס עד מחר בצהריים.',
  'סאלי, תשתף אותי בטבלת התקציב עד יום רביעי.',
  'סאלי, אשמח לתשובה לגבי ההצעה עד יום חמישי.',
  'Sali, please add a task to renew the insurance by Friday.',
  'Sali, the budget is approved. Please add a task to order the laptops by Thursday.'
];
for (const surface of ['gmail', 'outlook']) for (const t of shows) {
  const r = judge(t, surface);
  const ok = r.show || r.reason === 'file' || r.reason === 'file-chain-not-run';
  expect(surface + ' shows: ' + t.slice(0, 50), ok, JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
const quiet = [
  'סאלי, דנה תשלח לך את הקובץ מחר.',
  'סאלי, היא תעדכן את הנתונים עד מחר.',
  'סאלי, אל תשלח לי את הקובץ, כבר יש לי אותו.',
  'סאלי, בבקשה אל תשלח את זה עדיין.',
  'סאלי, אם הלקוח יאשר, תשלח לי את ההצעה.',
  'סאלי, אולי תשלח לי את הקובץ מתישהו.',
  'סאלי, המנהלת אמרה: תעדכן את הלקוח. אני כבר טיפלתי בזה.',
  'סאלי, רק לעדכן שהמערכת תעדכן את הנתונים מחר.',
  'סאלי, תעביר את ה-₪250 לספק ביום שני.',
  'Sali, Dana will add a task for this on Friday.',
  'Sali, please don\'t add a task for this yet.',
  'Sali, I added a task to renew the lease.',
  'Sali, if they sign, please add a task to invoice them.'
];
for (const surface of ['gmail', 'outlook']) for (const t of quiet) {
  const r = judge(t, surface);
  expect(surface + ' quiet: ' + t.slice(0, 50), !r.show, JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('imperative-ask-corpus: all passed');
