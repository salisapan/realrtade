// 0.9.47: a conversation-id save confirms on the Graph message, the header
// follows Outlook, a Hebrew To line in one text node still drafts, and an
// unmarked 10:05 does not pick 10:05 when 22:05 is also there.
const { test, expect } = require('./support/harness');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('./support/sentences');

const NORTHWIND = 'The signed Northwind Supplies agreement is attached.';
const DANA = "I'll send Dana the numbers by Thursday.";
const Q3_SUBJECT = 'Gate A 0.9.41 - quick question on the Q3 summary';
const Q3_BODY = 'Can you reply and confirm whether the Q3 summary will include the October numbers?';

function localIso(y, month, day, hour, minute) {
  return new Date(y, month - 1, day, hour, minute, 0, 0).toISOString();
}

function pdf(id, name, size) {
  return [{ id: id, name: name, contentType: 'application/pdf', size: size, isInline: false }];
}

function inboxRow(id, conversationId, subject, when) {
  return {
    id: id,
    conversationId: conversationId,
    subject: subject,
    receivedDateTime: when,
    from: { emailAddress: { name: 'flow', address: S.SENDER } },
    hasAttachments: true,
    internetMessageId: '<' + id + '@mail.test>'
  };
}

test('a connected Outlook save goes Verifying then Handled on the Graph message', async ({ glance }) => {
  test.setTimeout(90000);
  const conv = 'AQQKGlanceE2ESave0947';
  const msg = 'AQMkGlanceE2ESave0947';
  const when = localIso(2026, 10, 8, 14, 1);
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [inboxRow(msg, conv, 'Northwind agreement - signed PDF', when)],
    sent: [],
    messages: {},
    attachments: { [msg]: pdf('att-nw', 'northwind-agreement-signed.pdf', 3072) },
    conversation: [],
    mailboxSettings: { timeFormat: 'HH:mm' }
  });
  const page = await glance.openOutlook({
    live: true,
    id: conv,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 14:01',
    attachments: [{ shownName: '…hwind-agreement-signed.pdf', titleName: 'northwind-agreement-signed.pdf', sizeLabel: '3 KB' }]
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save northwind-agreement-signed.pdf to OneDrive?')).toBeVisible();
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toHaveText('Handled.');
  await expect(pane.getByText("Couldn't confirm")).toHaveCount(0);
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    const bytes = calls.some((c) => c.method === 'GET' && c.url.indexOf('/me/messages/' + encodeURIComponent(msg) + '/attachments/') >= 0);
    const convBytes = calls.some((c) => c.method === 'GET' && c.url.indexOf('/me/messages/' + encodeURIComponent(conv) + '/attachments/') >= 0);
    const put = calls.some((c) => c.method === 'PUT' && c.url.indexOf('/me/drive/') >= 0);
    const back = calls.some((c) => c.method === 'GET' && /\/me\/drive\/items\/e2e-file-/.test(c.url));
    return bytes && put && back && !convBytes;
  }).toBe(true);
  await expect.poll(async () => {
    const bag = await glance.storage();
    const row = (bag.log || []).find((e) => e && e.kind === 'written' && e.connectorId === 'attachmentSave');
    return Boolean(row && row.fetchedBack === true);
  }).toBe(true);
});

test('the header says Outlook connected when Microsoft is on', async ({ glance }) => {
  await glance.seedOutlook();
  const popup = await glance.openPopup();
  await expect(popup.locator('#statusPill')).toHaveText('Outlook connected');
  await expect(popup.getByText('Connect Google')).toBeVisible();
});

test('a Hebrew To line in one text node still offers the Q3 draft', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: 'AQMkGlanceE2EHebrewToInline',
    subject: Q3_SUBJECT,
    senderEmail: S.SENDER,
    body: Q3_BODY,
    hebrewToInline: true,
    to: [S.ME],
    toName: 'sali sapan'
  });
  await expect(page.locator('#ReadingPaneContainerId button.flow-chip')).toHaveCount(1);
});

test('an older undone promise still matches when OWA adds a translation line', async ({ glance }) => {
  test.setTimeout(60000);
  const sandbox = { console: console };
  vm.createContext(sandbox);
  const core = path.join(__dirname, '..', 'core');
  ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'fact-reply.js', 'close-families.js', 'intent.js', 'actions.js', 'commitment-title.js', 'still-open.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(core, file), 'utf8'), sandbox, { filename: file });
  });
  const intent = vm.runInContext('FlowIntent', sandbox).classify(DANA, { now: new Date() });
  const process = vm.runInContext('FlowActions', sandbox).planFor(intent, { threadUrl: 'https://outlook.live.com/mail/', hasThreadAttachment: false });
  const line = 'Undone — the To Do task was removed.';
  await glance.seedOutlook({
    glanceUndoneBanners: { AQMkPassport35: { line: line, ids: ['AQMkPassport35'], at: Date.now() } },
    log: [{
      kind: 'undone', messageId: 'AQMkPassport35', itemId: 'AQMkPassport35', text: DANA,
      subject: 'Gate 0.9.35 To Do title', app: 'outlook', ts: Date.now()
    }, {
      kind: 'shown', messageId: 'AQMkPassport35', itemId: 'AQMkPassport35', app: 'outlook',
      ts: Date.now() - 1000, sender: { name: 'flow', email: S.SENDER },
      subject: 'Gate 0.9.35 To Do title', text: DANA, intent: intent, process: process
    }]
  });
  const page = await glance.openOutlook({
    id: 'AQMkPassport34',
    subject: 'Gate 0.9.34 To Do title',
    senderEmail: S.SENDER,
    body: DANA,
    translateBanner: true
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.locator('button.flow-chip')).toHaveCount(1);
  await expect(pane.getByText(line)).toHaveCount(0);
});

test('10:05 and 22:05 on one subject stay unresolved without a 24-hour proof', async ({ glance }) => {
  test.setTimeout(60000);
  const conv = 'AQQKGlanceE2EHour0947';
  const morning = 'AQMkGlanceE2EHourMorning';
  const evening = 'AQMkGlanceE2EHourEvening';
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    mailboxSettings: { timeFormat: 'h:mm tt' },
    inbox: [
      inboxRow(morning, conv, 'Northwind agreement - signed PDF', localIso(2026, 10, 8, 10, 5)),
      inboxRow(evening, conv, 'Northwind agreement - signed PDF', localIso(2026, 10, 8, 22, 5))
    ],
    sent: [],
    messages: {},
    attachments: {
      [morning]: pdf('att-am', 'northwind-agreement-signed.pdf', 3072),
      [evening]: pdf('att-pm', 'northwind-agreement-signed.pdf', 4096)
    },
    conversation: []
  });
  const page = await glance.openOutlook({
    live: true,
    id: conv,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 10:05',
    attachments: [{ shownName: '…hwind-agreement-signed.pdf', titleName: 'northwind-agreement-signed.pdf', sizeLabel: '3 KB' }]
  });
  await expect(page.locator('#ReadingPaneContainerId').getByText('Save the file?')).toHaveCount(0);
  await expect.poll(async () => {
    const bag = await glance.storage();
    return (bag.outlookPageDiag || []).some((d) => d && d.reason === 'suggest:unresolved' && /hour-ambiguous/.test(String(d.detail || '')));
  }).toBe(true);
});
