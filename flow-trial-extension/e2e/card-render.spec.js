const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

test('Outlook show case renders a card', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_SHOW,
    subject: 'Transfer',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SHOW
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Outlook silent case renders no card and keeps a Why-not-shown reason', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_SILENT,
    subject: 'Thanks',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SILENT
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = bag.outlookPageDiag || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    return {
      chips,
      reason: diags.some((d) => d && /intent-null|quiet:/.test(String(d.reason || '')))
    };
  }).toEqual({ chips: 0, reason: true });

  const popup = await glance.openPopup();
  const why = popup.getByText(/Why not shown/);
  await expect(why).toBeVisible();
  await why.click();
  await expect(popup.getByText(/intent-null|quiet:/)).toBeVisible();
});

test('Gmail show case renders a card', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-show-1',
    threadId: 't-show-1',
    subject: 'Transfer',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SHOW
  });
  await expect(page.locator('div[role="main"] .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Gmail silent case renders no card after the scan is recorded', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-silent-1',
    threadId: 't-silent-1',
    subject: 'Thanks',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.SILENT
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const recent = (bag.classificationStats && bag.classificationStats.recent) || [];
    const chips = await page.locator('div[role="main"] .flow-chip-host').count();
    return { chips, scanned: recent.length > 0 };
  }).toEqual({ chips: 0, scanned: true });
});
