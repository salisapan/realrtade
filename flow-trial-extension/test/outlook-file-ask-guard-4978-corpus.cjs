// M2 (#184): a file ask must never fall back to a task-only card when OneDrive
// scopes are missing or attachment evidence is still loading. Asserts the
// blocked fallback reason explicitly. Run: node test/outlook-file-ask-guard-4978-corpus.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const { FlowOutlookFileAskGuard: G } = require('../core/outlook-file-ask-guard.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const TASK_ONLY = { id: 'task', steps: [{ kind: 'outlookTask', id: 'outlookTask' }] };
const FILE_REPLY = { id: 'reply', steps: [{ kind: 'outlookDraft' }, { kind: 'onedriveFile' }] };
const SEND_ASK = 'Please send the signed NDA by Friday.';
const SAVE_ASK = 'Hi, Please save the attachment to OneDrive by Friday, October 9. Thanks';
const REMEMBER_TASK = 'Remind me to call the accountant by Friday.';
const SCOPES_FULL = ['Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite', 'Files.ReadWrite'];
const SCOPES_NO_FILES = ['Mail.Read', 'Mail.ReadWrite', 'Tasks.ReadWrite'];
const SCOPES_READ_ONLY = ['Mail.Read', 'Files.Read'];

console.log('\n--- (a) missing Files scopes: reconnect line, never task ---\n');
{
  const send = G.evaluate({ text: SEND_ASK, process: TASK_ONLY, scopes: SCOPES_NO_FILES });
  check('send-file ask without Files.Read blocks task', send.allowTaskCard === false && send.guard === 'files-not-granted', send);
  check('explicit task fallback reason on missing scope', send.taskFallbackBlocked === G.TASK_FALLBACK_BLOCKED, send);
  check('page reason is files-not-granted', send.pageReason === 'files-not-granted', send);
  check('one-line copy names OneDrive reconnect', /OneDrive/.test(send.line.en), send.line);

  const save = G.evaluate({ text: SAVE_ASK, process: TASK_ONLY, scopes: SCOPES_NO_FILES });
  check('save-shaped ask without Files.ReadWrite blocks task', save.allowTaskCard === false && save.guard === 'files-not-granted', save);

  const okRead = G.evaluate({ text: SEND_ASK, process: TASK_ONLY, scopes: SCOPES_READ_ONLY });
  check('send-file ask with Files.Read allows task card (judge may still be wrong)', okRead.allowTaskCard === true, okRead);

  const okWrite = G.evaluate({ text: SAVE_ASK, process: TASK_ONLY, scopes: SCOPES_FULL });
  check('save ask with Files.ReadWrite allows task card when attachments are ready', okWrite.allowTaskCard === true, okWrite);
}

console.log('\n--- (b) attachments not loaded: wait, never task ---\n');
{
  const pending = G.evaluate({
    text: SAVE_ASK,
    process: TASK_ONLY,
    scopes: SCOPES_FULL,
    pageReason: 'page:attachment-count-unread',
    attachmentsPending: false
  });
  check('unread attachment count blocks task', pending.allowTaskCard === false && pending.guard === 'attachments-pending', pending);
  check('task fallback blocked while attachments load', pending.taskFallbackBlocked === G.TASK_FALLBACK_BLOCKED, pending);
  check('retry flag set for attachment pending', pending.retry === true, pending);
  check('reason stays attachment-count-unread', pending.pageReason === 'page:attachment-count-unread', pending);

  const flag = G.evaluate({
    text: SAVE_ASK,
    process: TASK_ONLY,
    scopes: SCOPES_FULL,
    attachmentsPending: true
  });
  check('hasAttachments without list blocks task', flag.allowTaskCard === false && flag.guard === 'attachments-pending', flag);
}

console.log('\n--- non-file asks and non-task plans are untouched ---\n');
check('a real task ask keeps task card', G.evaluate({ text: REMEMBER_TASK, process: TASK_ONLY, scopes: SCOPES_NO_FILES }).allowTaskCard === true);
check('a file reply plan is not task-only', G.evaluate({ text: SEND_ASK, process: FILE_REPLY, scopes: SCOPES_NO_FILES }).allowTaskCard === true);
check('quiet mail stays allowed', G.evaluate({ text: 'Thanks!', process: TASK_ONLY, scopes: SCOPES_NO_FILES }).allowTaskCard === true);

console.log('\n--- wiring on Outlook page ---\n');
{
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'content-outlook.js'), 'utf8');
  const bg = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  check('content-outlook blocks task fallback for file asks', page.indexOf('blockTaskFallbackForFileAsk') > 0);
  check('content-outlook loads the guard module on the page', bg.indexOf('core/outlook-file-ask-guard.js') > 0);
}

console.log('\n--- OWA harness: guard loads with registered Outlook scripts ---\n');
{
  const vm = require('vm');
  const bgText = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const only = JSON.parse(bgText.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bgText.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  const files = (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
  check('registered list includes outlook-file-ask-guard', files.indexOf('core/outlook-file-ask-guard.js') >= 0, files.slice(-4));
  const sandbox = { console, TextEncoder, TextDecoder, module: { exports: {} }, exports: {} };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const root = path.join(__dirname, '..');
  const mini = ['core/file-attach.js', 'core/google-closes.js', 'core/onedrive-file.js', 'core/onedrive-find.js', 'core/outlook-file-ask-guard.js'];
  const throws = [];
  for (const f of mini) {
    try {
      new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }).runInContext(ctx);
    } catch (e) {
      throws.push(f + ': ' + e.message.split('\n')[0]);
    }
  }
  check('guard stack loads without throw', throws.length === 0, throws);
  check('FlowOutlookFileAskGuard global after inject', typeof sandbox.FlowOutlookFileAskGuard !== 'undefined' && typeof sandbox.FlowOutlookFileAskGuard.evaluate === 'function');
}

console.log('\n' + (failures ? 'FAILED: ' + failures : 'All passed'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures ? 1 : 0);
