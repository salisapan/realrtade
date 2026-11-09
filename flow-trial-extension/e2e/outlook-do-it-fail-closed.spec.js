// A reply-draft Do It must end. When Outlook refuses (401) or never answers, the card leaves
// "preparing", says what happened, offers Reconnect for an auth failure, writes nothing and sends nothing.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PANE = '#ReadingPaneContainerId';

async function openTransfer(glance, id, scenario) {
  await glance.seedOutlook();
  await glance.setScenario(Object.assign({ inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] }, scenario));
  const page = await glance.openOutlook({ id, subject: 'Transfer', senderEmail: S.SENDER, body: S.SHOW });
  await expect(page.locator(PANE + ' .flow-step-list')).toBeVisible();
  return page;
}

async function notSentAndNoDraft(glance) {
  const calls = await glance.apiCalls();
  expect(calls.some((c) => /sendMail|\/send$/.test(c.url))).toBe(false);
  expect(calls.some((c) => c.method === 'PATCH' && /\/me\/messages\//.test(c.url))).toBe(false);
}

test('a 401 on the draft write ends the spinner, offers Reconnect, writes and sends nothing', async ({ glance }) => {
  test.setTimeout(90000);
  const page = await openTransfer(glance, 'AQMkGlanceFailClosed401', { draftStatus: 401 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' [data-glance-consent="reconnect"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator(PANE + ' [data-glance-reconnect]')).toHaveText('התחבר מחדש');
  await expect(page.locator(PANE + ' .flow-step-list .act-out')).toContainText('צריך להתחבר מחדש');
  // The step list left "preparing" (מכין) and no receipt claims a draft.
  await expect(page.locator(PANE + ' .flow-step-list')).toHaveAttribute('data-glance-state', 'offline');
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(0);
  await notSentAndNoDraft(glance);
});

test('a draft write that never answers times out, says so, and leaves no spinner', async ({ glance }) => {
  test.setTimeout(90000);
  const page = await openTransfer(glance, 'AQMkGlanceFailClosedHang', { draftHang: true, writeTimeoutMs: 1500 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-step-list .act-out')).toContainText('לא ענה בזמן', { timeout: 30000 });
  await expect(page.locator(PANE + ' .flow-step-list')).toHaveAttribute('data-glance-state', 'failed');
  // A timeout is not an auth failure: no Reconnect row.
  await expect(page.locator(PANE + ' [data-glance-consent="reconnect"]')).toHaveCount(0);
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(0);
  await notSentAndNoDraft(glance);
});
