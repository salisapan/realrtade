const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-send');
const lane = require('./support/lane-ms-mock');

test('Mail.Send stays off: no preview card and no sendMail request', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.run(glance, { scopes: ['Mail.Send'], scenario: { sent: [] } }, {
    id: FIX.ID,
    subject: 'Send',
    senderEmail: S.SENDER,
    body: FIX.BODY
  }, async (page) => {
    await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('#ReadingPaneContainerId .flow-lane-ms')).toHaveCount(0);
    const calls = await glance.apiCalls();
    expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
  });
});
