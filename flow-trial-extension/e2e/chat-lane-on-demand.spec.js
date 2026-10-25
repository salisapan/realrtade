const path = require('path');
const { test, expect } = require('./support/harness');

test('chat trigger alone does not increment DOM read counter', async ({ glance }) => {
  const page = await glance.context.newPage();
  const fixture = 'chrome-extension://' + glance.extensionId + '/dev/whatsapp-fixture.html';
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#glance-chat-trigger', { timeout: 10000 });
  const reads = await page.evaluate(() => window.__glanceChatDomReads || 0);
  expect(reads).toBe(0);
});

test('on-demand scan increments read counter once and never clicks send', async ({ glance }) => {
  const page = await glance.context.newPage();
  const fixture = 'chrome-extension://' + glance.extensionId + '/dev/whatsapp-fixture.html';
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__glanceSendClicks = 0;
    const btn = document.querySelector('[data-testid="send"]');
    if (btn) btn.addEventListener('click', () => { window.__glanceSendClicks = (window.__glanceSendClicks || 0) + 1; });
  });
  const triggered = await glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: 'chrome-extension://*/*' });
    const tab = tabs.find((t) => t.url && t.url.indexOf('whatsapp-fixture.html') >= 0);
    if (!tab) return { ok: false, reason: 'no-tab' };
    return globalThis.FlowChatOnDemand.run(chrome, tab, { surface: 'whatsapp', source: 'test' });
  });
  expect(triggered.ok).toBe(true);
  const reads = await page.evaluate(() => window.__glanceChatDomReads || 0);
  expect(reads).toBe(1);
  const sends = await page.evaluate(() => window.__glanceSendClicks || 0);
  expect(sends).toBe(0);
});
