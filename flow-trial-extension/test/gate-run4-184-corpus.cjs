'use strict';
// Gate Run 4 (#184 @ 20c9b1b): attachment evidence, reply+task, note-to-self, scope lines.
// Run: node test/gate-run4-184-corpus.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const ROOT = path.join(__dirname, '..');
const { FlowOutlookAttachmentEvidence: E } = require('../core/outlook-attachment-evidence.js');
const outlookSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
const displaySrc = fs.readFileSync(path.join(ROOT, 'core/display-copy.js'), 'utf8');
const popupSrc = fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8');

check('mergeCount uses DOM when Graph list is null',
  E.mergeCount(null, { attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] }, { hasAttachments: true }).count === 2 &&
  E.mergeCount(null, { attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] }, { hasAttachments: true }).unread === true);
check('attachments-not-read reason is not intent-null copy',
  /attachments-not-read/.test(displaySrc) && displaySrc.indexOf("'attachments-not-read'") >= 0);
check('decideFromText uses attachmentListFor not bare graphValues',
  /attachmentListFor\(id\)/.test(outlookSrc) && !/save-count'\)\s*:\s*null/.test(outlookSrc));
check('signed-save-suggest triggers recordSuggestNote',
  /signed-save-suggest/.test(outlookSrc) && /recordSuggestNote/.test(outlookSrc));
check('buildCtx keeps task steps with reply draft (H1)',
  /taskSteps/.test(outlookSrc) && /draftSteps\.concat\(taskSteps\)/.test(outlookSrc));
check('note-to-self does not return before decideFromText',
  !/pane\.noteToSelf = true[\s\S]{0,40}return;/.test(outlookSrc));
check('paintMissingScope mentions OneDrive Files.ReadWrite',
  /Files\.ReadWrite/.test(outlookSrc) && /onedriveFile/.test(outlookSrc));
check('background loads outlook-attachment-evidence.js',
  /outlook-attachment-evidence\.js/.test(bgSrc));
check('popup lists all own addresses not only primary',
  /ownAddresses\.join/.test(popupSrc));

const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const J = vm.runInContext('FlowIncomingJudge', engine);
const ME = 'glance.salisapan@outlook.com';
const FROM = 'ai.local.flow@gmail.com';

function judge(text, attachmentCount) {
  return J.judge({
    text,
    subject: 'Gate Run 4',
    sender: { name: 'flow', email: FROM },
    surface: 'outlook',
    to: [ME],
    cc: [],
    ownAddresses: [ME, 'salisapan1@gmail.com'],
    userName: 'Sali',
    direction: 'inbound',
    inbound: true,
    attachmentCount: attachmentCount == null ? 0 : attachmentCount,
    hasThreadAttachment: attachmentCount === 1,
    now: new Date('2026-10-20T12:00:00Z')
  });
}

const contract = 'Please sign the contract and return the appendix by Friday.';
const j1 = judge(contract, 2);
check('Check 1: contract + appendix (2 attach) shows a card (reply-track or file)',
  j1.show && j1.process && j1.process.steps && j1.process.steps.length > 0,
  { show: j1.show, id: j1.process && j1.process.id, kinds: j1.process && j1.process.steps.map((s) => s.kind) });

const amb = 'Attached is the signed contract and the appendix';
const j2 = judge(amb, 2);
check('Check 2: two-file signed delivery → file-it',
  j2.show && j2.process && j2.process.id === 'file-it',
  { show: j2.show, id: j2.process && j2.process.id });

const signed = 'Attached is the signed NDA. Please save it to OneDrive.';
const j3 = judge(signed, 1);
check('Check 3: single signed copy OneDrive save shows',
  j3.show && (j3.process.steps || []).some((s) => s && (s.kind === 'onedriveFile' || s.kind === 'driveFile')),
  { show: j3.show, kinds: j3.process && j3.process.steps && j3.process.steps.map((s) => s.kind) });

const h1 = 'האם תוכל לעדכן אותי לגבי החוזה עד יום ראשון?';
const jH = judge(h1, 0);
const hKinds = jH.process && jH.process.steps && jH.process.steps.map((s) => s.kind);
check('H1 Hebrew reply-track includes task row',
  jH.show && hKinds && hKinds.indexOf('googleTask') >= 0 && hKinds.some((k) => k === 'outlookDraft' || k === 'gmailDraft'),
  { show: jH.show, kinds: hKinds, label: jH.intent && jH.intent.label });

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll gate-run4-184 corpus checks passed.');
