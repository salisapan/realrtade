// A cancelled time slot is not a decision to log. "We need to cancel the <thing> on <day> at <time>" used to clear the
// decision bar through LOST ("cancel the") and offer a Log-it task at the cancelled time. Strings are written for this test.
// Run: node test/en-cancel-slot-corpus.cjs
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
// must stay quiet: no task, no event
const quiet = [
  'We need to cancel the coffee on Tuesday at 1:45pm. Will send new times later.',
  'We need to cancel the walkthrough on Tuesday at 1:45pm. Will send new times later.',
  'Sali, we have to cancel the lunch on Thursday at 1pm. I will send new times later.',
  'We need to cancel the catch-up on November 19 at 10:30am. New times to follow.'
];
for (const surface of ['gmail', 'outlook']) for (const t of quiet) {
  const r = judge(t, surface);
  expect(surface + ' quiet: ' + t.slice(0, 50), !r.show, JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
// unchanged: a deal outcome with no clock is still a decision to log, and a live meeting proposal still shows
const show = [
  ['Unfortunately we are not moving forward with the vendor contract signed on November 12.', /task/i],
  ['We agreed to terminate the contract on November 30.', /task/i],
  ['Can we meet on Thursday at 3pm to go over the budget?', /calendar/i]
];
for (const [t, kind] of show) {
  const r = judge(t, 'gmail');
  expect('still shows: ' + t.slice(0, 50), r.show && kinds(r).some((k) => kind.test(k)), JSON.stringify({ reason: r.reason, kinds: kinds(r) }));
}
if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('en-cancel-slot-corpus: all passed');
