// Glance 0.9.41 display, steps list, and OneDrive grant regressions.
// Run: node test/display-0941-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const sandbox = { console: console };
vm.createContext(sandbox);
for (const f of ['commitment-title.js', 'actions.js', 'display-copy.js', 'suggest-save.js', 'step-list.js']) {
  vm.runInContext(read('core/' + f), sandbox, { filename: f });
}
vm.runInContext(read('src/step-kit.js'), sandbox, { filename: 'step-kit.js' });
sandbox.FlowActions = vm.runInContext('FlowActions', sandbox);
sandbox.FlowCommitmentTitle = vm.runInContext('FlowCommitmentTitle', sandbox);
const FlowDisplay = vm.runInContext('FlowDisplay', sandbox);
const FlowStepList = vm.runInContext('FlowStepList', sandbox);
const FlowStepKit = vm.runInContext('FlowStepKit', sandbox);
const FlowSuggestSave = vm.runInContext('FlowSuggestSave', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

console.log('--- activity titles come from the row, not a shared label ---\n');
{
  const file = FlowDisplay.activityTitle({
    connectorId: 'onedriveFile',
    label: 'Log commitment for Oct 9',
    writtenLine: 'OneDrive · Budget.xlsx'
  });
  check('a OneDrive row is Saved Budget.xlsx to OneDrive', file === 'Saved Budget.xlsx to OneDrive', file);
  const task = FlowDisplay.activityTitle({
    connectorId: 'outlookTask',
    label: 'Log commitment for Oct 9',
    params: { title: 'Renew the passport application' }
  });
  check('a To Do row uses its own task title', task === 'Renew the passport application', task);
  const fromFiles = FlowDisplay.activityTitle({
    connectorId: 'attachmentSave',
    label: 'Log commitment for Oct 9',
    params: { files: [{ name: 'board-pack.pdf' }] }
  });
  check('an attachment-save row names the file', fromFiles === 'Saved board-pack.pdf to OneDrive', fromFiles);
}

console.log('\n--- card face ---\n');
{
  const log = FlowDisplay.cardFace(
    { id: 'log-it', name: 'Log It', closingLine: 'Logging this so it stays tracked.' },
    { label: 'Log commitment for Oct 9' },
    { bodyText: 'We agreed to renew the passport application by Friday.' }
  );
  check('Log It shows the commitment title', log.title === 'Renew the passport application', log);
  check('Log It keeps the closing line as the sentence', log.sentence === 'Logging this so it stays tracked.', log);
  const file = FlowDisplay.cardFace(
    { id: 'file-it', name: 'File it', closingLine: 'Saving the attached file to OneDrive.' },
    null,
    {}
  );
  check('the file card title is Save the file?', file.title === 'Save the file?' && file.sentence === '', file);
}

console.log('\n--- Why not shown ---\n');
{
  check('a raw id is Untitled message', FlowDisplay.diagSubject('AQMkAGGlanceMessageIdValue123456') === 'Untitled message');
  check('a mailbox route is Untitled message', FlowDisplay.diagSubject('/mail/0/drafts') === 'Untitled message');
  check('a real subject stays', FlowDisplay.diagSubject('Board pack') === 'Board pack');
  check('a short list says the count', FlowDisplay.whyNotShownHeader(12, 12) === 'Why not shown (12)');
  check('a capped list says showing 20 of 28', FlowDisplay.whyNotShownHeader(28, 20) === 'Why not shown (showing 20 of 28)');
}

console.log('\n--- clear and panel receipts ---\n');
{
  check('an Outlook loop row is purged', FlowDisplay.dropOutlookLoopRow({ app: 'outlook', kind: 'shown' }) === true);
  check('a Gmail row is kept', FlowDisplay.dropOutlookLoopRow({ app: 'gmail', kind: 'written', connectorId: 'googleTask' }) === false);
  check('already-handled diagnostics are purged', FlowDisplay.dropAlreadyHandledDiag({ reason: 'page:already-handled' }) === true);
  check('a proved To Do row is a panel receipt', FlowDisplay.isPanelReceipt({
    kind: 'written', messageId: 'm', connectorId: 'outlookTask', fetchedBack: true
  }) === true);
  check('a proved OneDrive row is a panel receipt', FlowDisplay.isPanelReceipt({
    kind: 'written', messageId: 'm', connectorId: 'onedriveFile', fetchedBack: true
  }) === true);
  check('a draft row is a panel receipt', FlowDisplay.isPanelReceipt({
    kind: 'written', messageId: 'm', connectorId: 'outlookDraft'
  }) === true);
  check('an unproved task is not a panel receipt', FlowDisplay.isPanelReceipt({
    kind: 'written', messageId: 'm', connectorId: 'outlookTask', fetchedBack: false
  }) === false);
}

console.log('\n--- steps list ---\n');
{
  check('start moves Queued to Preparing', FlowStepList.nextState('queued', 'start') === 'preparing');
  check('a write moves Preparing to Verifying', FlowStepList.nextState('preparing', 'wrote') === 'verifying');
  check('fetch-back moves Verifying to Verified', FlowStepList.nextState('verifying', 'fetched') === 'verified');
  check('a miss is Couldn\'t confirm', FlowStepList.STATE_LABEL[FlowStepList.nextState('verifying', 'miss')] === "Couldn't confirm · Retry");
  check('Handled stays closed without fetchedBack', FlowStepList.handledAllowed([{ checked: true, state: 'verified' }], { fetchedBack: false }) === false);
  check('fetchedBack with no failed required step allows Handled', FlowStepList.handledAllowed(
    [{ checked: true, state: 'verified', suggested: false, manual: false }],
    { fetchedBack: true }
  ) === true);
  check('a failed suggested step does not block Handled', FlowStepList.handledAllowed(
    [{ checked: true, state: 'failed', suggested: true, manual: false }],
    { fetchedBack: true }
  ) === true);
  check('a failed required step blocks Handled', FlowStepList.handledAllowed(
    [{ checked: true, state: 'failed', suggested: false, manual: false }],
    { fetchedBack: true }
  ) === false);
  const added = FlowStepList.resolveAdded('remind me to call Noa Thursday');
  check('remind me to call Noa Thursday is Added and counted', added && added.tag === 'Added' && added.counted === true && added.kind === 'task', added);
  const manual = FlowStepList.resolveAdded('Print the contract');
  check('Print the contract is Manual and not counted', manual && manual.tag === 'Manual' && manual.counted === false && manual.manual === true, manual);
  const named = FlowStepList.rowFromAttachmentStep({
    kind: 'attachmentSave',
    copy: FlowSuggestSave.suggestSave({
      surface: 'outlook', inbound: true, otherCard: false, consent: true, messageId: 'm',
      text: 'Thanks, attaching the board pack for your records today.',
      attachments: [{ id: 'att', name: 'Q3-report.pdf', contentType: 'application/pdf', size: 4096, isInline: false }]
    }).step.copy
  });
  check('the attachment row uses the file sentence', named.copy === 'Save Q3-report.pdf to OneDrive?', named.copy);
  check('F1 chip copy is the kit sentence', FlowStepKit.textOf(FlowStepKit.EN.count(3, ['Morning', 'Gmail', 'Calendar'], 1)) === '+ Glance can close this in 3 steps · Morning · Gmail · Calendar · +1 suggested');
  check('F1 checked chip drops the suggested tail', FlowStepKit.textOf(FlowStepKit.EN.count(4, ['Morning', 'Gmail', 'Calendar', 'Drive'], 0)) === '+ Glance can close this in 4 steps · Morning · Gmail · Calendar · Drive');
  check('F6 chip copy omits tool names', FlowStepKit.textOf(FlowStepKit.HE.count(3, ['Morning'], 1)) === '+ Glance יכול לסגור את זה ב-3 צעדים · +1 מוצע');
  check('F6 checked chip has no suggested tail', FlowStepKit.textOf(FlowStepKit.HE.count(4, [], 0)) === '+ Glance יכול לסגור את זה ב-4 צעדים');
  const viewSrc = read('src/step-list-view.js');
  check('Approve is held on the card and does not send', viewSrc.indexOf("data-glance-approve', 'held'") > 0 && viewSrc.indexOf('sendMail') < 0);
  const preview = FlowStepList.mailSendPreview();
  check('the later send preview is Draft, Review, Approve & send', preview.map((r) => r.kind).join(',') === 'draft,review,approveSend');
  const stepSrc = read('core/step-list.js');
  check('the steps model does not request Mail.Send', !/scopes?\s*[:=][^;\n]*Mail\.Send/.test(stepSrc) && stepSrc.indexOf('mailSendPreview') > 0);
  const memory = { 'reply-track': { steps: { task: { removed: 3, undone: 0, accepted: 0 } } } };
  const rows = FlowStepList.rowsFor({ id: 'reply-track', steps: [{ kind: 'draft', id: 'draft' }] }, { memory: memory });
  const dormant = rows.filter((r) => r.id === 'dormant:task')[0];
  check('a net-rejected step is an unchecked extra row', dormant && dormant.checked === false, dormant);
  check('the anchor stays checked', rows[0] && rows[0].checked === true && rows[0].kind === 'draft');
  const live = FlowStepList.liveStepsFrom(rows, 'gmail');
  check('live steps stay the planned steps', live.length === 1 && live[0].kind === 'draft', live);
}

console.log('\n--- page wiring ---\n');
{
  const outlook = read('src/content-outlook.js');
  const bg = read('src/background.js');
  const popup = read('popup/popup.js');
  const storage = read('src/storage.js');
  const manifest = JSON.parse(read('manifest.json'));
  check('Handled replaces the open card', outlook.indexOf('host.replaceChildren(done)') > 0 && outlook.indexOf("querySelectorAll('.flow-chip-host')") > 0);
  check('the page loads FlowOnedriveFile and reads Files.ReadWrite itself', outlook.indexOf('FlowOnedriveFile.hasWriteScope') > 0 && outlook.indexOf("type: 'flow:onedrive-grant'") < 0);
  check('the page syncs a panel proof', outlook.indexOf("msg.type === 'flow:proof-sync'") > 0);
  check('an active draft receipt stays up on a later scan', outlook.indexOf('function keepActiveDraftReceipt') > 0 && outlook.indexOf('page:draft-receipt') > 0);
  check('the worker can read attachment bytes and the page does not ask it for a grant', bg.indexOf('function outlookAttachmentBytes') > 0 && bg.indexOf("msg.type === 'flow:onedrive-grant'") < 0);
  check('Activity uses the row title', popup.indexOf('FlowDisplay.activityTitle') > 0);
  check('Clear close memory re-renders the panel', /function wireClearCloseMemory\(\)[\s\S]{0,1200}renderSurfaces\(/.test(popup));
  check('Why not shown can show every row', popup.indexOf('whyNotShownAll') > 0 && popup.indexOf('Show all') > 0);
  check('clear drops Outlook loop rows', storage.indexOf('dropOutlookLoopRow') > 0);
  check('the panel lists proved Outlook receipts', storage.indexOf('isPanelReceipt') > 0);
  const js = manifest.content_scripts[0].js;
  check('the page loads the title, the face, the steps list, and OneDrive on Outlook',
    js.indexOf('core/commitment-title.js') >= 0 && js.indexOf('core/display-copy.js') >= 0 &&
    js.indexOf('core/step-list.js') >= 0 && js.indexOf('src/step-list-view.js') >= 0 &&
    js.indexOf('core/onedrive-file.js') >= 0 && js.indexOf('src/step-kit.js') >= 0);
  check('the extension version is 0.9.42', manifest.version === '0.9.42');
  check('permissions are unchanged', JSON.stringify(manifest.permissions) === JSON.stringify([
    'storage', 'identity', 'sidePanel', 'alarms', 'notifications', 'scripting', 'contextMenus', 'offscreen'
  ]));
  check('the manifest does not ask for Mail.Send', JSON.stringify(manifest).indexOf('Mail.Send') < 0);
}

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nall display 0.9.41 checks passed');
