// A self-mail with two intents was giving the reminder task the meeting's day.
// Mail: «היי, אפשר להיפגש ביום שלישי 17/11 ב-10:00 לחצי שעה? וגם תזכיר לי לשלוח את הצעת המחיר עד 22/11.»
//   task «לשלוח את הצעת המחיר» was due 2026-11-17 (should be 2026-11-22).
// The reminder sentence alone wrote no due date and left «עד 22/11» in the title
// (should be due 2026-11-22, title without the day).
// now = 2026-11-13T10:50Z, Asia/Jerusalem. Run: node test/gate-two-intent-task-date-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');
let failures = 0;
function expect(name, ok, detail) {
  if (ok) console.log('ok  ', name);
  else { failures++; console.error('FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const gmailScripts = manifest.content_scripts.find((c) => c.matches.some((m) => m.indexOf('mail.google.com') >= 0)).js;
const sb = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, setTimeout, clearTimeout, TextEncoder, TextDecoder };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of gmailScripts) {
  if (f.indexOf('core/') !== 0) continue;
  vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), sb, { filename: f });
}
const g = (n) => vm.runInContext('typeof ' + n + ' !== "undefined" ? ' + n + ' : null', sb);
const Intent = g('FlowIntent');
const Actions = g('FlowActions');
const Judge = g('FlowIncomingJudge');
const DEPS = { intent: Intent, actions: Actions, factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };

const OWN = 'ai.local.flow@gmail.com';
const NOW = new Date('2026-11-13T10:50:00Z');
const SUBJECT = 'פגישה עם דנה';
const FULL = 'היי, אפשר להיפגש ביום שלישי 17/11 ב-10:00 לחצי שעה? וגם תזכיר לי לשלוח את הצעת המחיר עד 22/11.';
const ONLY = 'תזכיר לי לשלוח את הצעת המחיר עד 22/11.';
const EN_FULL = 'Hi, can we meet on Tuesday 17/11 at 10:00 for half an hour? Also remind me to send the quote by 22/11.';
const EN_ONLY = 'Remind me to send the quote by 22/11.';

function gmailPlan(body, subject, self) {
  const prepared = Judge.prepareForJudge(body);
  const ctx = {
    now: NOW, subject: subject, senderEmail: self ? OWN : 'dana@example.com', senderName: self ? 'flow' : 'Dana',
    to: [OWN], cc: [], ownAddresses: [OWN], ownNames: ['Sali'], inbound: !self, threadUrl: 'https://mail.google.com/mail/u/0/#inbox/x'
  };
  const intent = Intent.classify(prepared, ctx);
  const process = intent && intent.type ? Actions.planFor(intent, { threadUrl: ctx.threadUrl, text: body, subject: subject }) : null;
  return { intent, process, steps: (process && process.steps) || [] };
}
function judged(body, subject, self) {
  return Judge.judge({
    text: body, subject: subject, sender: { name: self ? 'flow' : 'Dana', email: self ? OWN : 'dana@example.com' }, now: NOW,
    threadUrl: 'https://mail.google.com/x', to: [OWN], cc: [], ownAddresses: [OWN], hasThreadAttachment: false, attachmentCount: 0,
    surface: 'gmail', ownNames: ['Sali'], namesPending: false, namesWaitDone: true, inbound: !self
  }, DEPS);
}
const taskStep = (steps) => steps.find((s) => s.kind === 'googleTask' || s.kind === 'googleTasks') || null;
function titleHasDue(title) {
  return /עד\s*22\/11|by\s*22\/11|until\s*22\/11/i.test(String(title || ''));
}

function checkTask(name, r) {
  const t = taskStep(r.steps);
  expect(name + ': has a quote task', Boolean(t) && /הצעת המחיר|quote/i.test(String((t.params && (t.params.title || t.params.what)) || (r.intent && r.intent.label) || '')), t && t.params);
  expect(name + ': task is due 2026-11-22, not the meeting day', t && t.params.dateIso === '2026-11-22', t && t.params);
  expect(name + ': task title does not keep the due day', t && !titleHasDue(t.params.title), t && t.params.title);
}

checkTask('self-mail, two intents', gmailPlan(FULL, SUBJECT, true));
checkTask('self-mail, reminder only', gmailPlan(ONLY, SUBJECT, true));
checkTask('self-mail, English two intents', gmailPlan(EN_FULL, 'Meeting with Dana', true));
checkTask('self-mail, English reminder only', gmailPlan(EN_ONLY, 'Meeting with Dana', true));

for (const [label, body, self] of [
  ['judge self two intents', FULL, true],
  ['judge self reminder only', ONLY, true]
]) {
  const j = judged(body, SUBJECT, self);
  const t = j.show && j.process ? taskStep(j.process.steps) : null;
  expect(label + ': judge task is due 2026-11-22', t && t.params.dateIso === '2026-11-22', { reason: j.reason, params: t && t.params });
  expect(label + ': judge title does not keep the due day', t && !titleHasDue(t.params.title), t && t.params && t.params.title);
}

if (failures) {
  console.error('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall passed');
