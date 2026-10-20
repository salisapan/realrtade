// The Gmail task card goes through the lane host. The click must reach the
// mock Tasks API (a real fetch), read the task back, then Undo deletes it.
// The offline stub returns status 0 and never shows up in apiCalls.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

test.afterEach(async ({ glance }) => {
  await glance.evaluateWorker(() => { globalThis.__glanceE2e.tokenAccounts = {}; });
});

test('Gmail task card writes through the lane host, reads back, and Undo deletes it', async ({ glance }) => {
  await glance.seedGmail();
  await glance.evaluateWorker(() => { globalThis.__glanceE2e.tokenAccounts = { 'ya29.e2e': 'me@x.com' }; });
  const page = await glance.openGmail({
    messageId: 'm-lane-1',
    threadId: 't-lane-1',
    subject: 'Contract',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.HEBREW_TASK
  });
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible();
  const created = await glance.apiCalls();
  const post = created.find((c) => c.method === 'POST' && c.url.indexOf('https://tasks.googleapis.com/tasks/v1/lists/glance-list/tasks') >= 0);
  const got = created.find((c) => c.method === 'GET' && /https:\/\/tasks\.googleapis\.com\/tasks\/v1\/lists\/glance-list\/tasks\/e2e-gtask-/.test(c.url));
  expect(post).toBeTruthy();
  expect(got).toBeTruthy();

  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'DELETE' && /https:\/\/tasks\.googleapis\.com\/tasks\/v1\/lists\/glance-list\/tasks\/e2e-gtask-/.test(c.url));
  }).toBe(true);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toHaveCount(0);
});
