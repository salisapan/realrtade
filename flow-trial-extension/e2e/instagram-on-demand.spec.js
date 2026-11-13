const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { freezeDate } = require('./support/frozen-date');

const FIXTURE_NOW = '2026-10-12T11:00:00+03:00';
const PLACE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/instagram-place.html'), 'utf8');
const REEL_EN = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/instagram-share-reel-en.html'), 'utf8');
const REEL_HE = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/instagram-share-reel-he.html'), 'utf8');

const LANE_JS = [
  'core/fact-reply.js',
  'core/close-chains.js',
  'core/chat-kill-switch.js',
  'src/chat-draft.js',
  'src/chat-compose.js',
  'src/chat-redact.js',
  'src/chat-indicator.js',
  'src/chat-lane.js',
  'src/lane-draft-store.js',
  'src/group-word.js',
  'src/instagram-parse.js',
  'src/content-instagram.js'
];

async function openIgPage(glance, html, pathSuffix) {
  const page = await glance.context.newPage();
  await freezeDate(page, FIXTURE_NOW);
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const url = 'https://www.instagram.com/direct/t/' + (pathSuffix || 'e2e') + '/';
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return page;
}

test('Instagram: no read until on-demand scan with flag on', async ({ glance }) => {
  await glance.evaluateWorker(async (files) => {
    await chrome.storage.local.set({ glanceSwitches: { INSTAGRAM_LANE: false } });
    const id = 'glance-lane-instagram-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{ id, matches: ['https://www.instagram.com/direct/*'], js: files, runAt: 'document_idle', persistAcrossSessions: false }]);
  }, LANE_JS);

  const page = await openIgPage(glance, PLACE_HTML, 'quiet');
  const box = page.locator('[data-glance-composer="1"]');
  await page.waitForTimeout(1500);
  await expect(box).toHaveText('', { timeout: 3000 });

  await glance.evaluateWorker(() => chrome.storage.local.set({ glanceSwitches: { INSTAGRAM_LANE: true } }));
  const tabId = await page.evaluate(() => null).catch(() => null);
  const pages = glance.context.pages();
  const igTab = pages.find((p) => p.url().includes('instagram.com/direct'));
  const realTabId = await glance.evaluateWorker(async () => {
    const tabs = await chrome.tabs.query({ url: ['https://www.instagram.com/direct/*'] });
    return tabs[0] && tabs[0].id;
  });
  if (realTabId) {
    const injected = await glance.evaluateWorker(async (tid) => {
      if (typeof FlowChatOnDemand === 'undefined') return { ok: false, reason: 'no-on-demand' };
      return await FlowChatOnDemand.injectAndScan(tid, 'instagram');
    }, realTabId);
    expect(injected.ok).toBe(true);
  }
  await expect(box).not.toHaveText('', { timeout: 15000 });
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('Instagram reel share fixtures draft in English and Hebrew', async ({ glance }) => {
  await glance.evaluateWorker(() => chrome.storage.local.set({ glanceSwitches: { INSTAGRAM_LANE: true } }));
  for (const [label, html] of [['en', REEL_EN], ['he', REEL_HE]]) {
    const page = await openIgPage(glance, html, 'reel-' + label);
    await glance.evaluateWorker(async (files) => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0] && tabs[0].id;
      if (!tabId) return;
      await chrome.scripting.executeScript({ target: { tabId }, files });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { if (globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.instagram) globalThis.__glanceChatSurfaces.instagram.scan({ gesture: true }); }
      });
    }, LANE_JS);
    const box = page.locator('[data-glance-composer="1"]');
    await expect(box).not.toHaveText('', { timeout: 15000 });
    await page.close();
  }
});
