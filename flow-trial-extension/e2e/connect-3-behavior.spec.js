// C1 connect-3: three ecosystem buttons (mocked auth). CONNECT_ECOSYSTEM on; no real OAuth.
const { test, expect } = require('./support/harness');

test('connect-3 three buttons fire flow:connect with ecosystem connector ids', async ({ glance }) => {
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({ glanceSwitches: { CONNECT_ECOSYSTEM: true } });
  });
  const page = await glance.openPopup();
  await page.waitForSelector('#connect-ecosystem-host .c3-doit', { timeout: 15000 });
  const buttons = page.locator('#connect-ecosystem-host [data-connect-eco]');
  await expect(buttons).toHaveCount(3);
  const calls = [];
  await page.evaluate(() => {
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = function (msg, cb) {
      if (msg && msg.type === 'flow:connect') {
        window.__c3ConnectCalls = (window.__c3ConnectCalls || []).concat(msg.connectorId);
        const res = { ok: true, partial: false };
        if (typeof cb === 'function') cb(res);
        return Promise.resolve(res);
      }
      return orig(msg, cb);
    };
  });
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await buttons.nth(2).click();
  const ids = await page.evaluate(() => window.__c3ConnectCalls || []);
  expect(ids).toEqual(['googleTasks', 'microsoft', 'meta']);
});
