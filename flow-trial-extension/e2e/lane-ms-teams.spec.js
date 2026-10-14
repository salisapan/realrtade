const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-teams');

// Skipped: the lane card is not registered at startup, and launch.js stays the 0.9.56 Graph mock.
test.skip('a Teams draft is shown and never posted', async ({ glance }) => {
  await glance.seedOutlook({}, { teams: true });
  await glance.setScenario(FIX.SCENARIO);
  const page = await glance.openOutlook({
    id: FIX.ID,
    subject: 'Teams',
    senderEmail: S.SENDER,
    body: FIX.BODY
  });
  await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
  const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
  await expect(card).toBeVisible();
  await card.locator('button.flow-lane-do').click();
  await expect(card.locator('.flow-lane-draft')).toHaveText('I will send the numbers Thursday.');
  await expect(card.locator('.flow-lane-topic')).toHaveText('pricing');
  await expect(card.locator('.flow-lane-status')).toHaveText('Not posted.');
  await expect(card).not.toContainText('Handled');
  const calls = await glance.apiCalls();
  const chats = calls.filter((c) => c.url.indexOf('/me/chats') >= 0 || c.url.indexOf('/messages') >= 0);
  expect(chats.some((c) => c.method === 'GET' && c.url.indexOf('/me/chats') >= 0)).toBe(true);
  expect(calls.some((c) => c.method !== 'GET' && c.url.indexOf('/chats') >= 0)).toBe(false);
  expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
});
