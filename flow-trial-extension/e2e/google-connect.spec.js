const { test, expect } = require('./support/harness');

// Disconnect evicts the cached token (one interactive:false call) and must
// not open a window. A getAuthToken failure that is a user cancel does not
// fall through to launchWebAuthFlow (0.9.39, open-tasks row 50).

async function connectButton(page) {
  return page.getByRole('button', { name: 'Connect Google' });
}

test('Disconnect does not silently reconnect until Connect is clicked', async ({ glance }) => {
  const page = await glance.openPopup();
  await (await connectButton(page)).click();
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  const bagOn = await glance.storage();
  expect(bagOn.googleTasksAuth && bagOn.googleTasksAuth.taskListId).toBe('glance-list');

  const pagesBefore = glance.context.pages().length;
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(await connectButton(page)).toBeVisible();
  const stamp = await glance.now();
  await expect.poll(async () => {
    const bag = await glance.storage();
    const calls = await glance.authCalls();
    const flows = await glance.flows();
    const lateToken = calls.some((c) => c.at > stamp && c.interactive === false && !c.removeCached);
    const lateFlow = flows.some((c) => c.at > stamp);
    const pages = glance.context.pages().length;
    if (bag.googleTasksAuth) return 'reconnected';
    if (lateToken) return 'late-token';
    if (lateFlow) return 'late-flow';
    if (pages > pagesBefore) return 'popup';
    return 'quiet';
  }).toBe('quiet');

  await (await connectButton(page)).click();
  await expect(page.locator('#statusPill')).toHaveText('Google connected');
  const again = await glance.storage();
  expect(again.googleTasksAuth && again.googleTasksAuth.taskListId).toBe('glance-list');
});

test('getAuthToken failure leaves Google disconnected and does not open a window', async ({ glance }) => {
  await glance.setAuthFail(true);
  const page = await glance.openPopup();
  const pagesBefore = glance.context.pages().length;
  await (await connectButton(page)).click();
  await expect(page.locator('.conn-err')).toBeVisible();
  const bag = await glance.storage();
  expect(bag.googleTasksAuth || null).toBe(null);
  const flows = await glance.flows();
  expect(flows.length).toBe(0);
  expect(glance.context.pages().length).toBe(pagesBefore);
  await expect(page.locator('#statusPill')).toHaveText('Not connected');
});
