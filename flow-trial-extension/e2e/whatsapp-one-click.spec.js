const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { registerWhatsApp, SEND_URL } = require('./support/rehearsal');

const FIXTURE_EN = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-w1-en-place.html'), 'utf8');
const FIXTURE_HE = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-w1-he-caption.html'), 'utf8');

async function seedWhatsAppOn(glance) {
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({
      glanceChatKillRemote: {
        off: { messenger: true, instagram: true },
        fetchedAt: Date.now(),
        neverFetched: false,
        valid: true
      }
    });
  });
}

async function openFixture(glance, html) {
  await seedWhatsAppOn(glance);
  expect(await registerWhatsApp(glance)).toBe(true);
  const page = await glance.context.newPage();
  await page.route('https://web.whatsapp.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return page;
}

test('W1: no DOM read until gesture (English fixture)', async ({ glance }) => {
  const page = await openFixture(glance, FIXTURE_EN);
  const reads = await page.evaluate(() => window.__glanceChatDomReads || 0);
  expect(reads).toBe(0);
});

test('W1: one click drafts into composer, never sends (English)', async ({ glance }) => {
  const page = await openFixture(glance, FIXTURE_EN);
  await page.evaluate(() => {
    window.__glanceSendClicks = 0;
    const btn = document.querySelector('[data-testid="send"]');
    if (btn) btn.addEventListener('click', () => { window.__glanceSendClicks = (window.__glanceSendClicks || 0) + 1; });
  });
  const r = await glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    const tab = tabs[0];
    return globalThis.FlowChatOnDemand.run(chrome, tab, { surface: 'whatsapp', source: 'test' });
  });
  expect(r.ok).toBe(true);
  const composer = await page.locator('[data-glance-composer="1"]').innerText();
  expect(composer.length).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => SEND_URL.test(c.url))).toBe(false);
});

test('W1: Hebrew image caption is read on gesture; kill switch silences', async ({ glance }) => {
  const page = await openFixture(glance, FIXTURE_HE);
  await glance.evaluateWorker(async () => {
    await chrome.storage.local.set({ 'glanceChatOff.whatsapp': true });
  });
  const r = await glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    return globalThis.FlowChatOnDemand.run(chrome, tabs[0], { surface: 'whatsapp', source: 'test' });
  });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/kill|off|user/);
});
