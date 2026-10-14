const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const DANA = "I'll send Dana the numbers by Thursday.";

function order(trail) {
  const parts = String(trail || '').split(',').filter(Boolean);
  return ['queued', 'preparing', 'verifying', 'verified'].every((name, i, all) => {
    if (i === 0) return parts.indexOf(name) >= 0;
    return parts.indexOf(name) > parts.indexOf(all[i - 1]);
  });
}

test('the steps list records Queued, Preparing, Verifying, and Verified', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_TODO,
    subject: 'Numbers',
    senderEmail: S.SENDER,
    body: DANA
  });
  const list = page.locator('#ReadingPaneContainerId .flow-step-list');
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute('data-glance-states', 'queued');
  await expect(list.getByText('Queued')).toBeVisible();
  await page.locator('#ReadingPaneContainerId button.flow-chip').click();
  const host = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(host).toHaveCount(1);
  await expect(host.locator('.flow-chip-handled')).toHaveText('Handled.');
  await expect(page.getByText('Closing')).toHaveCount(0);
  await expect.poll(async () => order(await host.getAttribute('data-glance-states'))).toBe(true);
});

test('a missed read-back stays Couldn\'t confirm and Retry then verifies', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({
    inbox: [], sent: [], messages: {}, attachments: {}, conversation: [], todoVerifyFail: true
  });
  const page = await glance.openOutlook({
    id: S.MSG_A,
    subject: 'Numbers',
    senderEmail: S.SENDER,
    body: DANA
  });
  await page.locator('#ReadingPaneContainerId button.flow-chip').click();
  const list = page.locator('#ReadingPaneContainerId .flow-step-list');
  await expect(list.getByText(/Couldn.t confirm · Retry/)).toBeVisible();
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(0);
  await glance.evaluateWorker(() => { globalThis.__glanceE2e.scenario.todoVerifyFail = false; });
  await page.locator('#ReadingPaneContainerId .ss-retry').click();
  const host = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(host.locator('.flow-chip-handled')).toHaveText('Handled.');
  await expect.poll(async () => {
    const trail = await host.getAttribute('data-glance-states');
    return order(trail) && String(trail).indexOf('failed') >= 0;
  }).toBe(true);
});

test('Add step marks a task Added and a loose line Manual', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_SHOW,
    subject: 'Transfer',
    senderEmail: S.SENDER,
    body: S.SHOW
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await pane.locator('.ss-add-btn').click();
  await pane.locator('.ss-add-input').fill('remind me to call Noa Thursday');
  await pane.locator('.ss-add-input').press('Enter');
  await expect(pane.locator('.act-tag', { hasText: 'Added' })).toBeVisible();
  await pane.locator('.ss-add-btn').click();
  await pane.locator('.ss-add-input').fill('Print the contract');
  await pane.locator('.ss-add-input').press('Enter');
  await expect(pane.locator('.act-tag', { hasText: 'Manual' })).toBeVisible();
});
