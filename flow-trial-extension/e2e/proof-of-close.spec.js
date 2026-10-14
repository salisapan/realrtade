const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

async function activityUndone(glance) {
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="log"]').click();
  await expect(popup.locator('#log-list .log-kind').filter({ hasText: 'Undone' })).toBeVisible();
  await expect(popup.locator('#log-list .log-kind').filter({ hasText: 'Handled' })).toHaveCount(0);
}

test('Microsoft To Do Do It reads the task back, remounts, and Undo deletes it', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_TODO,
    subject: 'Contract',
    senderEmail: S.SENDER,
    body: S.HEBREW_TASK
  });
  await page.locator('#ReadingPaneContainerId button.flow-chip').click();
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toBeVisible();
  const created = await glance.apiCalls();
  expect(created.some((c) => c.method === 'POST' && c.url.indexOf('/me/todo/lists/') >= 0)).toBe(true);
  expect(created.some((c) => c.method === 'GET' && /\/me\/todo\/lists\/[^/]+\/tasks\/e2e-todo-/.test(c.url))).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(1);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);

  await page.locator('#ReadingPaneContainerId button.flow-chip-undo').click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'DELETE' && /\/me\/todo\/lists\/[^/]+\/tasks\//.test(c.url));
  }).toBe(true);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(0);
  await activityUndone(glance);
});

test('Google Tasks Do It reads the task back, remounts, and Undo deletes it', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-todo-1',
    threadId: 't-todo-1',
    subject: 'Contract',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: S.HEBREW_TASK
  });
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible();
  const created = await glance.apiCalls();
  expect(created.some((c) => c.method === 'POST' && c.url.indexOf('tasks.googleapis.com') >= 0 && c.url.indexOf('/tasks') >= 0)).toBe(true);
  expect(created.some((c) => c.method === 'GET' && /\/tasks\/e2e-gtask-/.test(c.url))).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toHaveCount(1);
  await expect(page.locator('div[role="main"] .flow-chip-host')).toHaveCount(1);

  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'DELETE' && c.url.indexOf('tasks.googleapis.com') >= 0);
  }).toBe(true);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toHaveCount(0);
  await activityUndone(glance);
});
