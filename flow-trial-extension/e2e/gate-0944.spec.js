// 0.9.44: a conversation pane links to one Graph message, and a reply
// draft is offered only when the user is in To. The content script reads
// the page. Nothing is sent.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const Q3 = 'Can you reply and confirm whether the Q3 summary will include the October numbers?';
const DANA = 'Dana, can you reply and confirm whether the Q3 summary will include the October numbers?';
const SEPT = '2026-09-30T14:01:00.000Z';
const OCT = '2026-10-08T09:12:00.000Z';
const V1 = '2026-10-02T11:00:00.000Z';
const V2 = '2026-10-07T16:40:00.000Z';

function file(name, size) {
  return { id: 'att-' + name, name: name, contentType: 'application/pdf', size: size, isInline: false };
}

function row(id, conv, subject, when) {
  return {
    id: id,
    conversationId: conv,
    subject: subject,
    receivedDateTime: when,
    from: { emailAddress: { name: 'flow', address: S.SENDER } },
    hasAttachments: true,
    internetMessageId: '<' + id + '@mail.test>'
  };
}

async function openPair(glance, open, other, fileOpen, fileOther) {
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [
      row(other.id, other.conv, other.subject, other.when),
      row(open.id, open.conv, open.subject, open.when)
    ],
    sent: [],
    messages: {},
    attachments: {
      [open.id]: [fileOpen],
      [other.id]: [fileOther]
    },
    conversation: []
  });
  return glance.openOutlook({
    id: open.conv,
    subject: open.subject,
    senderEmail: S.SENDER,
    body: 'The signed file is attached for your records today.',
    received: open.when,
    attachments: [fileOpen]
  });
}

test('September invoice does not save the October file', async ({ glance }) => {
  const page = await openPair(
    glance,
    { id: 'AQMkSept', conv: 'AQQkSept', subject: 'Invoice', when: SEPT },
    { id: 'AQMkOct', conv: 'AQQkOct', subject: 'Invoice', when: OCT },
    file('invoice-sept.pdf', 3072),
    file('invoice-oct.pdf', 4096)
  );
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.locator('.flow-chip-process-name')).toHaveText('Save the file?');
  await expect(pane.getByText('Save invoice-sept.pdf to OneDrive?')).toBeVisible();
  await expect(pane.getByText('invoice-oct.pdf')).toHaveCount(0);
});

test('contract v1 does not save contract v2', async ({ glance }) => {
  const page = await openPair(
    glance,
    { id: 'AQMkV1', conv: 'AQQkContract', subject: 'Contract', when: V1 },
    { id: 'AQMkV2', conv: 'AQQkContract', subject: 'Contract', when: V2 },
    file('contract-v1.pdf', 3072),
    file('contract-v2.pdf', 4096)
  );
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save contract-v1.pdf to OneDrive?')).toBeVisible();
  await expect(pane.getByText('contract-v2.pdf')).toHaveCount(0);
});

test('an RE: thread does not save the newer file', async ({ glance }) => {
  const page = await openPair(
    glance,
    { id: 'AQMkOld', conv: 'AQQkThread', subject: 'RE: Scope', when: V1 },
    { id: 'AQMkNew', conv: 'AQQkThread', subject: 'RE: Scope', when: V2 },
    file('scope-v1.pdf', 3072),
    file('scope-v2.pdf', 5120)
  );
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save scope-v1.pdf to OneDrive?')).toBeVisible();
  await expect(pane.getByText('scope-v2.pdf')).toHaveCount(0);
});

test('two matching files stay unresolved', async ({ glance }) => {
  const same = file('scope-v1.pdf', 3072);
  const page = await openPair(
    glance,
    { id: 'AQMkTwinA', conv: 'AQQkTwin', subject: 'RE: Scope', when: V1 },
    { id: 'AQMkTwinB', conv: 'AQQkTwin', subject: 'RE: Scope', when: V1 },
    same,
    same
  );
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save the file?')).toHaveCount(0);
  await expect.poll(async () => {
    const bag = await glance.storage();
    return (bag.suggestLog || []).some((row) => row && row.reason === 'suggest:unresolved')
      || (bag.outlookPageDiag || []).some((row) => row && row.reason === 'suggest:unresolved');
  }).toBe(true);
});

test('Cc-only Dana stays quiet and a To ask drafts, on Outlook and Gmail', async ({ glance }) => {
  await glance.seedOutlook();
  const cc = await glance.openOutlook({
    id: 'AQMkGlanceE2EDanaCc',
    subject: 'Q3 summary',
    senderEmail: S.SENDER,
    body: DANA,
    to: ['dana@meridian.com'],
    cc: [S.ME]
  });
  await expect(cc.locator('#ReadingPaneContainerId button.flow-chip')).toHaveCount(0);

  const to = await glance.openOutlook({
    id: 'AQMkGlanceE2EDanaTo',
    subject: 'Q3 summary',
    senderEmail: S.SENDER,
    body: Q3,
    to: [S.ME]
  });
  await expect(to.locator('#ReadingPaneContainerId button.flow-chip')).toBeVisible();

  await glance.seedGmail();
  const gmailCc = await glance.openGmail({
    messageId: 'm-dana-cc',
    threadId: 't-dana-cc',
    subject: 'Q3 summary',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: DANA,
    userName: 'Sali',
    to: ['dana@meridian.com'],
    cc: [S.GMAIL_ME]
  });
  await expect(gmailCc.locator('div[role="main"] button.flow-chip')).toHaveCount(0);

  const gmailTo = await glance.openGmail({
    messageId: 'm-dana-to',
    threadId: 't-dana-to',
    subject: 'Q3 summary',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: Q3,
    userName: 'Sali',
    to: [S.GMAIL_ME]
  });
  await expect(gmailTo.locator('div[role="main"] button.flow-chip')).toBeVisible();
});
