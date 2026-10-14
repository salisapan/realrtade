const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const FIX = require('./fixtures/ms-excel');
const lane = require('./support/lane-ms-mock');

test('a new Excel table is Handled after read-back, and Undo deletes the workbook', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.run(glance, { scenario: {} }, {
    id: FIX.CREATE_ID,
    subject: 'Excel',
    senderEmail: S.SENDER,
    body: FIX.CREATE_BODY
  }, async (page) => {
    await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible();
    await card.locator('button.flow-lane-do').click();
    await expect(card.locator('.flow-lane-status')).toHaveText('Handled.');
    const calls = await glance.apiCalls();
    expect(calls.some((c) => c.method === 'PUT' && c.url.indexOf('budget.xlsx') >= 0)).toBe(true);
    expect(calls.some((c) => c.method === 'GET' && c.url.indexOf('/rows') >= 0)).toBe(true);
    expect(calls.some((c) => c.url.indexOf('sendMail') >= 0)).toBe(false);
    await card.locator('button.flow-lane-undo').click();
    await expect(card.locator('.flow-lane-status')).toHaveText('Undone.');
    const after = await glance.apiCalls();
    expect(after.some((c) => c.method === 'DELETE' && /\/drive\/items\//.test(c.url))).toBe(true);
  });
});

test('append adds a row only when the workbook already exists', async ({ glance }) => {
  await glance.seedOutlook();
  await lane.run(glance, { scenario: FIX.APPEND_SCENARIO }, {
    id: FIX.APPEND_ID,
    subject: 'Excel row',
    senderEmail: S.SENDER,
    body: FIX.APPEND_BODY
  }, async (page) => {
    await page.waitForSelector('html[data-glance-lane-ms="on"]', { timeout: 20000 });
    const card = page.locator('#ReadingPaneContainerId .flow-lane-ms');
    await expect(card).toBeVisible();
    await card.locator('button.flow-lane-do').click();
    await expect(card.locator('.flow-lane-status')).toHaveText('Handled.');
    const calls = await glance.apiCalls();
    expect(calls.some((c) => c.method === 'POST' && c.url.indexOf('/rows/add') >= 0)).toBe(true);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await card.locator('button.flow-lane-undo').click();
    await expect(card.locator('.flow-lane-status')).toHaveText('Undone.');
    const after = await glance.apiCalls();
    expect(after.some((c) => c.method === 'GET' && /itemAt\(index=\d+\)$/.test(c.url))).toBe(true);
    expect(after.some((c) => c.method === 'POST' && c.url.indexOf('/delete') >= 0)).toBe(true);
    expect(after.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
