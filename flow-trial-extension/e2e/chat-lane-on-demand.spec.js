const path = require('path');
const { test, expect } = require('./support/harness');

test('chat trigger alone does not increment DOM read counter', async ({ glance }) => {
  const page = await glance.context.newPage();
  const fixture = 'chrome-extension://' + glance.extensionId + '/dev/whatsapp-fixture.html';
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#glance-chat-trigger', { timeout: 10000 });
  const reads = await page.evaluate(() => Number(document.documentElement.getAttribute('data-glance-reads') || 0));
  expect(reads).toBe(0);
});

test('on-demand scan increments read counter once and never clicks send', async ({ glance }) => {
  const page = await glance.context.newPage();
  const nonce = String(Date.now()) + Math.random().toString(16).slice(2);
  const fixture = 'chrome-extension://' + glance.extensionId + '/dev/whatsapp-fixture.html?nonce=' + nonce;
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#glance-chat-trigger', { timeout: 10000 });
  await page.evaluate(() => {
    window.__glanceSendClicks = 0;
    const btn = document.querySelector('[data-testid="send"]');
    if (btn) btn.addEventListener('click', () => { window.__glanceSendClicks = (window.__glanceSendClicks || 0) + 1; });
  });
  const triggered = await glance.evaluateWorker(async (needle) => {
    // tabs.query hides chrome-extension URLs without the tabs permission, and
    // that permission stays off. getContexts lists this extension's own pages.
    // The nonce picks this tab when an earlier fixture page is still open.
    const contexts = chrome.runtime.getContexts
      ? await chrome.runtime.getContexts({ contextTypes: ['TAB'] })
      : [];
    const ctx = contexts.find((c) => c.documentUrl && c.documentUrl.indexOf(needle) >= 0);
    if (!ctx || typeof ctx.tabId !== 'number') return { ok: false, reason: 'no-tab' };
    return globalThis.FlowChatOnDemand.run(chrome, { id: ctx.tabId, url: ctx.documentUrl }, { surface: 'whatsapp', source: 'test' });
  }, 'nonce=' + nonce);
  expect(triggered.ok, triggered && triggered.reason).toBe(true);
  const reads = await page.evaluate(() => Number(document.documentElement.getAttribute('data-glance-reads') || 0));
  expect(reads).toBe(1);
  const sends = await page.evaluate(() => window.__glanceSendClicks || 0);
  expect(sends).toBe(0);
});
