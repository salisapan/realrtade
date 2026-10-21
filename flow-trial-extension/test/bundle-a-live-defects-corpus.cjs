// Live defects from David's b5571c0 recording — Drive attach-save, calendar title, mail-language writes, draft unchecked.
// Run: node test/bundle-a-live-defects-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const engine = { module: undefined, console };
vm.createContext(engine);
for (const f of ['domains.js', 'extract.js', 'judgment.js', 'file-attach.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'resolution.js', 'draft-reply.js', 'step-list.js', 'incoming-judge.js', 'google-calendar.js', 'display-copy.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core', f), 'utf8'), engine, { filename: f });
}
const FlowGoogleCloses = vm.runInContext('FlowGoogleCloses', engine);
const FlowIntent = vm.runInContext('FlowIntent', engine);
const FlowIncomingJudge = vm.runInContext('FlowIncomingJudge', engine);
const FlowGoogleCalendar = vm.runInContext('FlowGoogleCalendar', engine);
const FlowDisplay = vm.runInContext('FlowDisplay', engine);
const FlowStepList = vm.runInContext('FlowStepList', engine);

let failed = 0;
function check(label, ok, detail) {
  if (!ok) {
    failed++;
    console.error('FAIL:', label, detail || '');
  } else {
    console.log('ok:', label);
  }
}

const SIGNED_BODY = 'Attached is the signed contract, please file it.';
const SIGNED_SUBJ = 'Signed contract attached (184w)';
const SIGNED_TEXT = SIGNED_SUBJ + '\n' + SIGNED_BODY;

console.log('\n--- Drive: signed contract + please file (drop was intent-null @ incoming-judge.js:143-144 before google-closes attach-save) ---\n');
{
  const g = FlowGoogleCloses.consider({ text: SIGNED_TEXT, attachmentCount: 1, blocked: false });
  check('google-closes returns drive-file close', g && g.close && g.close.personalClose === 'drive-file', g);
  const intent = FlowIntent.classify(SIGNED_TEXT, {
    senderEmail: 'salisapan1@gmail.com',
    senderName: 'Sali Sapan',
    subject: SIGNED_SUBJ,
    attachmentCount: 1,
    inbound: true
  });
  check('classify yields a typed intent', intent && intent.type, intent);
  const judged = FlowIncomingJudge.judge({
    text: SIGNED_BODY,
    subject: SIGNED_SUBJ,
    attachmentCount: 1,
    sender: { email: 'salisapan1@gmail.com', name: 'Sali Sapan' },
    surface: 'gmail',
    inbound: true
  });
  check('incoming judge shows a card', judged.show === true, judged);
}

console.log('\n--- Calendar: subject is summary; description has no duplicate lines ---\n');
{
  const quote = 'Meeting: product review — see you then.';
  const body = FlowGoogleCalendar.eventBody({
    dateIso: '2026-10-22',
    hour: 11,
    minute: 0,
    title: 'Meeting: product review',
    quote: quote,
    fileName: 'deck-series-a.pdf',
    fileUrl: 'https://drive.google.com/file/d/abc/view',
    timeZone: 'Asia/Jerusalem'
  });
  check('summary is the meeting subject, not the file name', body && body.summary === 'Meeting: product review', body && body.summary);
  const lines = (body.description || '').split('\n').filter(Boolean);
  const uniq = new Set(lines);
  check('description lines are unique', lines.length === uniq.size, lines);
}

console.log('\n--- Tasks: written title follows mail language, not UI chrome ---\n');
{
  const enTitle = FlowDisplay.artifactTitle('he', { bodyText: SIGNED_BODY, process: { id: 'reply-track' } }, 'Review the deck');
  check('English mail + Hebrew UI artifact title stays English', /^Review the deck/.test(enTitle), enTitle);
  const heTitle = FlowDisplay.artifactTitle('en', { bodyText: 'תזכיר לי לשלוח את החוזה', process: { id: 'reply-track' } }, 'לשלוח את החוזה');
  check('Hebrew mail + English UI artifact title stays Hebrew', /[\u0590-\u05FF]/.test(heTitle), heTitle);
}

console.log('\n--- Tasks card: non-anchor draft step is unchecked by default ---\n');
{
  const process = {
    id: 'file-it',
    steps: [
      { id: 'file', kind: 'driveFile', label: 'Drive' },
      { id: 'draft', kind: 'gmailDraft', label: 'Draft link' }
    ]
  };
  const rows = FlowStepList.rowsFromProcess(process, null);
  check('file step checked', rows[0] && rows[0].checked === true, rows[0]);
  check('draft step unchecked', rows[1] && rows[1].checked === false, rows[1]);
}

if (failed) {
  console.error('\n' + failed + ' failed\n');
  process.exit(1);
}
console.log('\nAll bundle-a live defect corpus checks passed.\n');
