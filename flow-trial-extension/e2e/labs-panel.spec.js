// The Labs panel in the real popup, in a real headless Chromium with the unpacked extension: every off switch is a row,
// all start off, one click turns one on and the storage object carries exactly that key, "off all" clears them, and the
// worker reads the same object. Nothing is sent and no permission is asked.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { copyExtension } = require('./support/launch');

function launch(extDir, userData) {
  return chromium.launchPersistentContext(userData, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--headless=new', '--disable-extensions-except=' + extDir, '--load-extension=' + extDir, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage']
  });
}

test('the Labs panel lists every off switch and writes only glanceSwitches', async () => {
  test.setTimeout(120000);
  const extDir = copyExtension({ bare: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-labs-'));
  let context = null;
  try {
    context = await launch(extDir, userData);
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
    await expect.poll(async () => worker.evaluate(() => Boolean(chrome.runtime && chrome.runtime.id)).catch(() => false), { timeout: 20000 }).toBe(true);
    const extensionId = await worker.evaluate(() => chrome.runtime.id);
    const popup = await context.newPage();
    await popup.goto('chrome-extension://' + extensionId + '/popup/popup.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const rows = popup.locator('#labs-list .wait-item');
    const ids = await popup.evaluate(() => FlowLabsSwitches.IDS.slice());
    await expect(rows).toHaveCount(ids.length);
    await expect(popup.locator('#labs-list .wait-state.ok')).toHaveCount(0);
    await expect(rows.first()).toContainText('לא נבדק חי');

    await rows.first().locator('button').click();
    await expect(popup.locator('#labs-list .wait-state.ok')).toHaveCount(1);
    const one = await worker.evaluate(async () => (await chrome.storage.local.get({ glanceSwitches: {} })).glanceSwitches);
    expect(Object.keys(one)).toEqual([ids[0]]);
    expect(one[ids[0]]).toBe(true);
    expect(one[ids[1]]).toBeUndefined();

    await popup.getByRole('button', { name: 'הפעל הכל' }).click();
    await expect(popup.locator('#labs-list .wait-state.ok')).toHaveCount(ids.length);
    await popup.getByRole('button', { name: 'כבה הכל' }).click();
    await expect(popup.locator('#labs-list .wait-state.ok')).toHaveCount(0);
    const none = await worker.evaluate(async () => (await chrome.storage.local.get({ glanceSwitches: {} })).glanceSwitches);
    expect(Object.keys(none)).toEqual([]);
  } finally {
    if (context) await context.close().catch(() => {});
  }
});
