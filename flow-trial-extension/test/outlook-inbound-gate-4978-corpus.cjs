'use strict';
// #179 inbound deck / OneDrive cards — Gmail and Outlook judge parity.
// Run: node test/outlook-inbound-gate-4978-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const FlowIncomingJudge = vm.runInContext('FlowIncomingJudge', engine);

const OUTLOOK_SELF = 'glance.salisapan@outlook.com';
const GMAIL_SELF = 'ai.local.flow@gmail.com';
const b5a = 'היי סלי,\nמצורף ה-deck המעודכן לסבב A.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה';
const b5b = 'היי, תשמרי את המצורף בוואן דרייב בבקשה. תודה!';

function judgeInbound(body, subject, surface, self) {
  return FlowIncomingJudge.judge({
    text: body,
    subject: subject || 'בדיקה',
    sender: { name: 'Dana Levi', email: 'dana@acme.io' },
    surface,
    to: [self],
    cc: [],
    ownAddresses: [self],
    userName: 'Sali',
    ownNames: ['Sali'],
    direction: 'inbound',
    inbound: true,
    attachmentCount: 1,
    now: new Date('2026-10-20T12:20:00Z')
  });
}

for (const surface of ['outlook', 'gmail']) {
  const self = surface === 'outlook' ? OUTLOOK_SELF : GMAIL_SELF;
  const j5a = judgeInbound(b5a, 'Deck סבב A (179)', surface, self);
  const j5b = judgeInbound(b5b, 'מסמכי ספק (179)', surface, self);
  check('item5a ' + surface + ' inbound card shows with title לחתום על ה-deck',
    Boolean(j5a.show) && j5a.intent && j5a.intent.label === 'לחתום על ה-deck',
    { show: j5a.show, reason: j5a.reason, label: j5a.intent && j5a.intent.label });
  check('item5b ' + surface + ' inbound card shows with title לשמור את המצורף בוואן דרייב',
    Boolean(j5b.show) && j5b.intent && j5b.intent.label === 'לשמור את המצורף בוואן דרייב',
    { show: j5b.show, reason: j5b.reason, label: j5b.intent && j5b.intent.label });
}

const outlookSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
const officeKindBlock = outlookSrc.split('function officeKind')[1].split('function bytesFromBase64')[0];
check('officeKind reads docx', /wordprocessingml\\\.document/.test(officeKindBlock));
check('officeKind reads xlsx', /spreadsheetml\\\.sheet/.test(officeKindBlock));
check('officeKind does not read pdf', !/\.pdf|application\/pdf/.test(officeKindBlock));

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll outlook-inbound-gate-4978 corpus checks passed.');
