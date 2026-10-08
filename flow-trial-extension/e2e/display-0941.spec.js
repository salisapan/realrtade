const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const DANA = "I'll send Dana the numbers by Thursday.";

function writtenRow(messageId) {
  return {
    kind: 'written',
    messageId: messageId,
    itemId: messageId,
    system: 'microsoft/todo',
    externalId: 'todo-seeded',
    connectorId: 'outlookTask',
    fetchedBack: true,
    verifiedAt: '2026-10-07T12:00:00.000Z',
    ref: { taskId: 'todo-seeded', externalId: 'todo-seeded', taskListId: 'todo-list' },
    ts: 2,
    app: 'outlook',
    actionTitle: 'Send Dana the numbers',
    label: 'Send Dana the numbers',
    writtenLine: 'To Do'
  };
}

test('Do It leaves one Handled card and the panel shows the same Handled', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_TODO,
    subject: 'Numbers',
    senderEmail: S.SENDER,
    body: DANA
  });
  await page.locator('#ReadingPaneContainerId button.flow-chip').click();
  const hosts = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(hosts).toHaveCount(1);
  await expect(hosts.locator('.flow-chip-handled')).toHaveText('Handled.');
  await expect(page.getByText('Closing')).toHaveCount(0);

  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  await expect(popup.locator('#open-list .log-kind').filter({ hasText: 'Handled' })).toBeVisible();
});

test('a panel proof replaces the floating Do It card in place', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_A,
    subject: 'Numbers',
    senderEmail: S.SENDER,
    body: DANA
  });
  await expect(page.locator('#ReadingPaneContainerId button.flow-chip')).toBeVisible();
  await glance.seed({ log: [writtenRow(S.MSG_A)] });
  const hosts = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(hosts).toHaveCount(1);
  await expect(hosts.locator('.flow-chip-handled')).toHaveText('Handled.');
  await expect(page.getByText('Closing')).toHaveCount(0);
});

test('Clear close memory drops the handled card and already-handled rows', async ({ glance }) => {
  await glance.seedOutlook({
    log: [writtenRow(S.MSG_A)],
    outlookPageDiag: [
      {
        key: 'page:already-handled|' + S.MSG_B,
        reason: 'page:already-handled',
        messageId: S.MSG_B,
        subject: '/mail/0/drafts',
        at: 1
      }
    ]
  });
  const page = await glance.openOutlook({
    id: S.MSG_A,
    subject: 'Numbers',
    senderEmail: S.SENDER,
    body: S.SILENT
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(1);
  await expect.poll(async () => {
    const bag = await glance.storage();
    return (bag.outlookPageDiag || []).some((d) => d && d.reason === 'page:already-handled');
  }).toBe(true);

  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="log"]').click();
  popup.once('dialog', (dialog) => dialog.accept());
  await popup.locator('#clearCloseMemory').click();
  await expect.poll(async () => {
    const bag = await glance.storage();
    const handled = (bag.log || []).some((e) => e && e.app === 'outlook' && e.kind === 'written');
    const diag = (bag.outlookPageDiag || []).some((d) => d && d.reason === 'page:already-handled');
    return handled || diag;
  }).toBe(false);
  await expect(popup.locator('#open-list .log-kind').filter({ hasText: 'Handled' })).toHaveCount(0);
  await expect(page.locator('#ReadingPaneContainerId [data-glance-chain="task-proof"]')).toHaveCount(0);
  await popup.locator('button[data-tab="surfaces"]').click();
  const why = popup.locator('#surface-list').getByText(/Why not shown/);
  if (await why.count()) {
    await why.click();
    await expect(popup.getByText('page:already-handled')).toHaveCount(0);
  }
});
