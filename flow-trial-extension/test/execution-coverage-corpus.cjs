// After Do It, the plan has to be executable on the surface it was offered on: every step kind the shared judge can put on a card has a
// writer AND an undoer in src/background.js, a surface never gets another ecosystem's draft or file step, and the reply draft is written in
// the language of the ask (found 2026-11-12: a Hebrew ask got an English draft on every surface). Portable check, no network.
// Run: node test/execution-coverage-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const ROOT = path.join(__dirname, '..');
const FILES = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'intent.js', 'actions.js', 'file-attach.js', 'fact-reply.js',
  'quiet-metrics.js', 'resolution.js', 'commitment-title.js', 'graph-mail.js', 'incoming-judge.js', 'draft-reply.js'];
const NOW = new Date('2026-10-07T12:00:00+03:00').getTime();
const sb = { module: undefined, console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, atob, btoa };
vm.createContext(sb);
vm.runInContext('(function (N) { var D = Date; function F() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(D, [null].concat(a)))() : new D(N); } F.prototype = D.prototype; F.now = function () { return N; }; F.UTC = D.UTC; F.parse = D.parse; Date = F; })(' + NOW + ')', sb);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), sb, { filename: f });
const g = (n) => vm.runInContext(n, sb);
const J = g('FlowIncomingJudge');
const DEPS = { intent: g('FlowIntent'), actions: g('FlowActions'), factReply: g('FlowFactReply'), fileAttach: g('FlowFileAttach'), resolution: g('FlowResolution'), quietMetrics: g('FlowQuietMetrics') };
const bg = fs.readFileSync(path.join(ROOT, 'src', 'background.js'), 'utf8');
const keysOf = (name) => { const m = bg.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};')); return new Set(m ? [...m[1].matchAll(/([a-zA-Z]+):/g)].map((x) => x[1]) : []); };
const WRITERS = keysOf('WRITERS'), UNDOERS = keysOf('UNDOERS');
check('the writer and undo registries were read from src/background.js', WRITERS.size >= 15 && UNDOERS.size >= 15, [WRITERS.size, UNDOERS.size]);

const OWN = { gmail: 'ai.local.flow@gmail.com', outlook: 'glance.salisapan@outlook.com', chat: 'ai.local.flow@gmail.com' };
const MAILS = [
  ['reply ask EN', 'Hi Sali, could you send me the Q3 numbers by Thursday? Thanks, Dana', 0],
  ['reply ask HE', 'היי סאלי, תוכל לאשר לי עד יום חמישי אם אתה מגיע לישיבה? תודה, דנה', 0],
  ['payment HE', 'היי סאלי, נא לשלם את החשבונית של ₪1,200 עד יום חמישי. תודה, דנה', 0],
  ['meeting EN', "Hi Sali, let's meet Monday, October 12 at 10:00 to go over the budget. Dana", 0],
  ['work EN', 'Hi Sali, please create a task: call the bank next Tuesday. Dana', 0],
  ['promise to me EN', "Hi Sali, I'll send you the signed contract by Friday. Dana", 0],
  ['save file EN', 'Hi Sali, please save the attached pdf to Drive. Dana', 1],
  ['questions HE', 'סאלי היי,\n\n1. מה ההבדלים בין ענן מאובטח למחשב העובד ?\n2. האם תהיה התקנה בכל מחשב ?\n\nתודה,\nדנה', 0],
  ['questions EN', 'Hi Sali,\n\n1. What is the difference between the cloud plan and the on-prem plan?\n2. How many seats does the base price include?\n\nThanks,\nDana', 0],
  ['imperative HE', 'שלום, מלא את הטופס, חתום והחזר עד מחר. תודה, דנה', 0]
];
function run(surface, text, att) {
  const own = OWN[surface];
  const input = { text, subject: 'Subject', sender: { name: 'Dana Levi', email: 'dana@acme.io' }, now: new Date(NOW), threadUrl: 'https://x/y', hasThreadAttachment: att > 0, attachmentCount: att, surface, oneToOne: surface === 'chat',
    to: [own], cc: [], ownAddresses: [own], ownNames: ['Sali', 'Sali Sapan', 'סאלי'], userName: 'Sali', direction: 'inbound', inbound: true, namesWaitDone: true, directAskOn: true };
  const r = J.judge(input, DEPS);
  return { r, input, kinds: r.show ? r.process.steps.map((s) => s.kind) : [], draft: r.show && r.process.steps.some((s) => /Draft$/.test(s.kind)) ? (J.draftText(r.process, input) || '') : null };
}
const isHeText = (t) => /[֐-׿]/.test(String(t || ''));
let shown = 0, expected = 30;
for (const surface of ['gmail', 'outlook', 'chat']) {
  console.log('\n--- ' + surface + ' ---\n');
  for (const [name, text, att] of MAILS) {
    const x = run(surface, text, att);
    // A chat has its own reader for the bare Hebrew imperative (core/chat-deadline-ask.js): the shared judge's direct-ask reader leaves it alone there.
    if (surface === 'chat' && name === 'imperative HE') { check(surface + ' / ' + name + ': the shared direct-ask reader does not read it in a chat', !x.r.show, x.r.show && x.kinds); expected--; continue; }
    if (!x.r.show) { check(surface + ' / ' + name + ': offered', false, x.r.reason); continue; }
    shown++;
    const noWriter = x.kinds.filter((k) => !WRITERS.has(k)), noUndo = x.kinds.filter((k) => !UNDOERS.has(k));
    check(surface + ' / ' + name + ': every step has a writer and an undoer (' + x.kinds.join('+') + ')', !noWriter.length && !noUndo.length, { noWriter, noUndo });
    if (surface === 'outlook') check(surface + ' / ' + name + ': no Gmail draft and no Drive step on Outlook', !x.kinds.some((k) => k === 'gmailDraft' || k === 'driveFile' || k === 'driveDoc' || k === 'driveSheet'), x.kinds);
    if (surface === 'gmail') check(surface + ' / ' + name + ': no Outlook or OneDrive step on Gmail', !x.kinds.some((k) => /^(outlook|onedrive|sharepoint|microsoft)/.test(k)), x.kinds);
    if (surface === 'chat' && /^questions/.test(name)) check(surface + ' / ' + name + ': in a chat the questions become one task to answer, no email draft', x.kinds.join() === 'googleTask', x.kinds);
    if (x.draft !== null) {
      const body = x.draft.split('\n').slice(0, 3).join(' ');
      check(surface + ' / ' + name + ': the draft is written in the language of the ask', isHeText(body) === isHeText(text), x.draft.slice(0, 120));
      check(surface + ' / ' + name + ': the draft does not repeat the greeting the sender wrote to the reader', !/(?:follow up on|בנוגע ל): (?:Hi|Hello|היי|שלום) /i.test(x.draft), x.draft.slice(0, 160));
    }
  }
}
check('every mail was offered on every surface (' + expected + ' plans checked)', shown === expected, shown);

console.log('\n--- the answer frame ---\n');
const q = run('gmail', MAILS[7][1], 0);
check('a mail of questions: the draft lists every question in order, each with a place for the answer', /1\. מה ההבדלים[^\n]*\n\[התשובה שלך\]/.test(q.draft) && /2\. האם תהיה התקנה[^\n]*\n\[התשובה שלך\]/.test(q.draft), q.draft);
check('the draft writes no answer of its own (only the questions, the greeting and the frame)', q.draft.split('\n').filter((l) => l.trim()).every((l) => /^היי |^תודה על השאלות|^\d\. |^\[התשובה שלך\]$/.test(l)), q.draft);
const qo = run('outlook', MAILS[8][1], 0);
check('the same frame on Outlook, in English for an English mail', qo.kinds.join() === 'outlookDraft' && /1\. What is the difference[^\n]*\n\[Your answer\]/.test(qo.draft), qo.draft);

console.log('\nTOTAL FAILURES:', failures);
process.exit(failures ? 1 : 0);
