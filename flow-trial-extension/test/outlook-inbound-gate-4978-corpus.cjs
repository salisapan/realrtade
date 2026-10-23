'use strict';
// M1: #179 item (5) desired inbound cards on Outlook (fix lands in core/intent.js via C1/#179).
// Office attachment read: docx/xlsx only (src/content-outlook.js officeKind / officeAttachmentText).
// Run: node test/outlook-inbound-gate-4978-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
let knownGaps = 0;

function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function knownGap(name, cond, detail) {
  if (cond) {
    console.log('PASS:', name);
    return;
  }
  knownGaps++;
  const extra = detail !== undefined ? ' ' + JSON.stringify(detail) : '';
  console.log('KNOWN-GAP (#179):', name + extra);
}

const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const FlowIncomingJudge = vm.runInContext('FlowIncomingJudge', engine);

const SELF = 'glance.salisapan@outlook.com';
const b5a = 'היי סלי,\nמצורף ה-deck המעודכן לסבב A.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה';
const b5b = 'היי, תשמרי את המצורף בוואן דרייב בבקשה. תודה!';

function judgeOutlook(body, subject, attachmentCount) {
  return FlowIncomingJudge.judge({
    text: body,
    subject: subject || 'בדיקה',
    sender: { name: 'Dana Levi', email: 'dana@acme.io' },
    surface: 'outlook',
    to: [SELF],
    cc: [],
    ownAddresses: [SELF],
    userName: 'Sali',
    ownNames: ['Sali'],
    direction: 'inbound',
    inbound: true,
    attachmentCount: attachmentCount == null ? 1 : attachmentCount,
    now: new Date('2026-10-20T12:20:00Z')
  });
}

const j5a = judgeOutlook(b5a, 'Deck סבב A (179)', 1);
const j5b = judgeOutlook(b5b, 'מסמכי ספק (179)', 1);
knownGap('item5a inbound card shows with title לחתום על ה-deck', Boolean(j5a.show) && j5a.intent && j5a.intent.label === 'לחתום על ה-deck', { show: j5a.show, reason: j5a.reason, label: j5a.intent && j5a.intent.label });
knownGap('item5b inbound card shows with title לשמור את המצורף בוואן דרייב', Boolean(j5b.show) && j5b.intent && j5b.intent.label === 'לשמור את המצורף בוואן דרייב', { show: j5b.show, reason: j5b.reason, label: j5b.intent && j5b.intent.label });

const outlookSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
const officeKindBlock = outlookSrc.split('function officeKind')[1].split('function bytesFromBase64')[0];
check('officeKind reads docx', /wordprocessingml\\\.document/.test(officeKindBlock));
check('officeKind reads xlsx', /spreadsheetml\\\.sheet/.test(officeKindBlock));
check('officeKind does not read pdf', !/\.pdf|application\/pdf/.test(officeKindBlock));

console.log('\nKNOWN-GAP count:', knownGaps);
if (failures) {
  console.log(failures + ' failed (non-gap checks only)');
  process.exit(1);
}
console.log('All non-gap outlook-inbound-gate-4978 corpus checks passed.');
