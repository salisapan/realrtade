// 0.9.43: engine steps are Suggested, Undo offers one Do It again, a
// handled promise is the same receipt on the mail, and a real Outlook
// attachment list reaches Save the file? through the reading pane.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const DANA = "I'll send Dana the numbers by Thursday.";
const NORTHWIND = 'The signed Northwind Supplies agreement is attached.';
const CONV = 'AQQkGlanceE2ENorthwindConv';
const MSG = 'AQMkGlanceE2ENorthwindMsg';
const SKIP_CONV = 'AQQkGlanceE2ENorthwindSkipConv';
const SKIP_MSG = 'AQMkGlanceE2ENorthwindSkipMsg';

function pdf(size) {
  return [{
    id: 'att-northwind',
    name: 'northwind-agreement-signed.pdf',
    contentType: 'application/pdf',
    size: size,
    isInline: false
  }];
}

function inboxRow(id, conversationId, subject) {
  return {
    id: id,
    conversationId: conversationId,
    subject: subject,
    receivedDateTime: new Date().toISOString(),
    from: { emailAddress: { name: 'flow', address: S.SENDER } },
    hasAttachments: true
  };
}

test('a handled promise hides Do It, and Undo offers it once in both places', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: 'AQMkGlanceE2EPromise0943',
    subject: 'Numbers for Dana',
    senderEmail: S.SENDER,
    body: DANA
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.locator('.act-tag', { hasText: 'Suggested' })).toBeVisible();
  await pane.locator('.ss-add-btn').click();
  await pane.locator('.ss-add-input').fill('Call Noa Thursday');
  await pane.locator('.ss-add-input').press('Enter');
  await expect(pane.locator('.act-tag', { hasText: 'Added' })).toBeVisible();
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible();
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(pane.locator('.flow-chip-handled')).toHaveCount(1);
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);

  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  await expect(popup.locator('#open-list .log-kind').filter({ hasText: 'Handled' })).toHaveCount(1);
  await expect(popup.locator('#open-list').getByRole('button', { name: 'Do It' })).toHaveCount(0);
  await popup.locator('button[data-tab="log"]').click();
  await expect(popup.locator('#stillOpenQuality')).toContainText('Do It 1');

  await popup.locator('button[data-tab="open"]').click();
  await popup.locator('#open-list').getByRole('button', { name: 'Undo' }).click();
  await expect(popup.locator('#open-list').getByRole('button', { name: 'Do It' })).toHaveCount(1);
  await popup.locator('button[data-tab="log"]').click();
  await expect(popup.locator('#stillOpenQuality')).toContainText('undo 1');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(pane.locator('button.flow-chip')).toHaveCount(1);
  const before = await glance.apiCalls();
  const prior = before.filter((c) => c.method === 'POST' && c.url.indexOf('/me/todo/lists/') >= 0).length;
  await pane.locator('button.flow-chip').click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.filter((c) => c.method === 'POST' && c.url.indexOf('/me/todo/lists/') >= 0).length;
  }).toBe(prior + 1);
  await expect(pane.locator('button.flow-chip')).toHaveCount(0);
  await popup.locator('button[data-tab="open"]').click();
  await popup.locator('button[data-tab="log"]').click();
  await expect(popup.locator('#stillOpenQuality')).toContainText('Do It 2');
});

test('a conversation id with a real PDF shows Save the file?, and a small PDF is a skipped row', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [
      inboxRow(MSG, CONV, 'Northwind agreement - signed PDF'),
      inboxRow(SKIP_MSG, SKIP_CONV, 'Northwind agreement - small PDF')
    ],
    sent: [],
    messages: {},
    attachments: {
      [MSG]: pdf(3072),
      [SKIP_MSG]: pdf(800)
    },
    conversation: []
  });

  const page = await glance.openOutlook({
    id: CONV,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-process-name')).toHaveText('Save the file?');

  const skipped = await glance.openOutlook({
    id: SKIP_CONV,
    subject: 'Northwind agreement - small PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND
  });
  const skipPane = skipped.locator('#ReadingPaneContainerId');
  await expect(skipPane.getByText('northwind-agreement-signed.pdf · skipped · small-doc')).toBeVisible();
  await expect(skipPane.getByText('Save the file?')).toHaveCount(0);
});
