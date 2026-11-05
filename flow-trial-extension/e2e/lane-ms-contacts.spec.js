const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-contacts');
const lane = require('./support/lane-ms-mock');

test('Contacts.Read drafts one contact card and does not write', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.run(glance, { scopes: ['Contacts.Read'], scenario: FIX.SCENARIO }, {
    id: FIX.ID,
    subject: 'Contacts',
    senderEmail: S.SENDER,
    body: FIX.BODY
  }, async (page) => {
    await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible();
    await card.locator('button.flow-lane-do').click();
    await expect(card.locator('.flow-lane-draft')).toContainText('dana@acme.com');
    const calls = await glance.apiCalls();
    const looked = calls.filter((c) => c.url.indexOf('/me/contacts') >= 0 || c.url.indexOf('/me/people') >= 0);
    expect(looked.some((c) => c.method === 'GET' && c.url.indexOf('/me/contacts') >= 0)).toBe(true);
    expect(looked.some((c) => c.method === 'GET' && c.url.indexOf('/me/people') >= 0)).toBe(true);
    expect(looked.some((c) => c.method !== 'GET')).toBe(false);
    expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
    await expect(card).toContainText('You send');
    await expect(card).not.toContainText('Handled');
  });
});
