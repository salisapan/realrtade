const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-send');

// Skipped: the lane card is not registered at startup, and launch.js stays the 0.9.56 Graph mock.
test.skip('Mail.Send stays off: no preview card and no sendMail request', async ({ glance }) => {
  await glance.seedOutlook({}, { mailSend: true });
  await glance.setScenario({ sent: [] });
  const page = await glance.openOutlook({
    id: FIX.ID,
    subject: 'Send',
    senderEmail: S.SENDER,
    body: FIX.BODY
  });
  await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await expect(page.locator('#ReadingPaneContainerId .flow-lane-ms')).toHaveCount(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
});
