const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-contacts');

// Skipped: the lane card is not registered at startup, and launch.js stays the 0.9.56 Graph mock.
test.skip('Contacts.Read resolves one recipient and does not write', async ({ glance }) => {
  await glance.seedOutlook({}, { contacts: true });
  await glance.setScenario(FIX.SCENARIO);
  const page = await glance.openOutlook({
    id: FIX.ID,
    subject: 'Contacts',
    senderEmail: S.SENDER,
    body: FIX.BODY
  });
  await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
  const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
  await expect(card).toBeVisible();
  await card.locator('button.flow-lane-do').click();
  await expect(card.locator('.flow-lane-address')).toHaveText('dana@acme.com');
  const calls = await glance.apiCalls();
  const looked = calls.filter((c) => c.url.indexOf('/me/contacts') >= 0 || c.url.indexOf('/me/people') >= 0);
  expect(looked.some((c) => c.method === 'GET' && c.url.indexOf('/me/contacts') >= 0)).toBe(true);
  expect(looked.some((c) => c.method === 'GET' && c.url.indexOf('/me/people') >= 0)).toBe(true);
  expect(looked.some((c) => c.method !== 'GET')).toBe(false);
  expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
  await expect(card).not.toContainText('Handled');
});
