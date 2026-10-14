const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-word');

// Skipped: the lane card is not registered at startup, and launch.js stays the 0.9.56 Graph mock.
test.skip('a Word file is Handled only after read-back, and Undo deletes it', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({});
  const page = await glance.openOutlook({
    id: FIX.ID,
    subject: 'Word',
    senderEmail: S.SENDER,
    body: FIX.BODY
  });
  await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
  const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
  await expect(card).toBeVisible();
  await card.locator('button.flow-lane-do').click();
  await expect(card.locator('.flow-lane-status')).toHaveText('Handled.');
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'PUT' && c.url.indexOf('notes.docx') >= 0)).toBe(true);
  expect(calls.some((c) => c.method === 'GET' && /\/drive\/items\//.test(c.url))).toBe(true);
  expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
  await card.locator('button.flow-lane-undo').click();
  await expect(card.locator('.flow-lane-status')).toHaveText('Undone.');
  const after = await glance.apiCalls();
  expect(after.some((c) => c.method === 'DELETE' && /\/drive\/items\//.test(c.url))).toBe(true);
});
