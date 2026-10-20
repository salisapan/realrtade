// PR #165 follow-up (b): the Outlook Save card is ticked by default, says the exact
// OneDrive folder it will write to, writes there, and Undo deletes that file.
// Headless Chromium, mocked Graph, fixtures only.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const { testDay } = require('./support/fixtures');
const TD = testDay();

const NAME = 'northwind-agreement-signed.pdf';

function localIso(y, month, day, hour, minute) {
  return new Date(y, month - 1, day, hour, minute, 0, 0).toISOString();
}

async function openSaveCard(glance, scenarioExtra, conv, msg) {
  const when = localIso(TD.y, TD.m, TD.d, 14, 1);
  await glance.setScenario(Object.assign({
    inboxFilterFails: true,
    inbox: [{
      id: msg, conversationId: conv, subject: 'Northwind agreement - signed PDF', receivedDateTime: when,
      from: { emailAddress: { name: 'flow', address: S.SENDER } }, hasAttachments: true,
      internetMessageId: '<' + msg + '@mail.test>'
    }],
    sent: [],
    messages: {},
    attachments: { [msg]: [{ id: 'att-nw', name: NAME, contentType: 'application/pdf', size: 3072, isInline: false }] },
    conversation: [],
    mailboxSettings: { timeFormat: 'HH:mm' }
  }, scenarioExtra || {}));
  const page = await glance.openOutlook({
    confirmConversation: true,
    live: true,
    id: conv,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: 'The signed Northwind Supplies agreement is attached.',
    receivedLabel: TD.dmy + ' 14:01',
    attachments: [{ shownName: '…hwind-agreement-signed.pdf', titleName: NAME, sizeLabel: '3 KB' }]
  });
  return page;
}

test('the Save card is ticked and names the exact OneDrive folder and file', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  const page = await openSaveCard(glance, null, 'AQQKGlanceE2EDest', 'AQMkGlanceE2EDest');
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save ' + NAME + ' to OneDrive?')).toBeVisible();
  await expect(pane.locator('.act-check').first()).toBeChecked();
  await expect(pane.locator('[data-glance-dest]').first()).toHaveText('OneDrive > Glance > ' + NAME);
});

test('Do It writes into the Glance folder and Undo deletes that file', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  const page = await openSaveCard(glance, null, 'AQQKGlanceE2EUndo', 'AQMkGlanceE2EUndo');
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save ' + NAME + ' to OneDrive?')).toBeVisible();
  await expect(async () => {
    await pane.locator('button.flow-chip').click();
    await expect(pane.locator('.flow-chip-handled')).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 30000 });
  const calls = await glance.apiCalls();
  const put = calls.find((c) => c.method === 'PUT' && /\/me\/drive\//.test(c.url));
  expect(put && put.url).toMatch(/\/me\/drive\/root:\/Glance\/northwind-agreement-signed\.pdf:\/content$/);

  await pane.locator('button.flow-chip-undo').click();
  await expect.poll(async () => {
    const after = await glance.apiCalls();
    return after.some((c) => c.method === 'DELETE' && /\/me\/drive\/items\/e2e-file-/.test(c.url));
  }).toBe(true);
  await expect(pane.locator('.flow-chip-handled')).toHaveCount(0);
});

test('a failed OneDrive step is an honest error, not a saved file', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  const page = await openSaveCard(glance, { driveUnauthorized: true }, 'AQQKGlanceE2EHonest', 'AQMkGlanceE2EHonest');
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save ' + NAME + ' to OneDrive?')).toBeVisible();
  await expect(async () => {
    await pane.locator('button.flow-chip').click();
    await expect(pane.getByText('Reconnect Outlook to allow OneDrive')).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 30000 });
  await expect(pane.locator('.flow-chip-handled')).toHaveCount(0);
});
