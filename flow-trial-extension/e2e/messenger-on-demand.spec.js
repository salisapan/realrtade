const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const PLACE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/messenger-place.html'), 'utf8');
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
  'src/messenger-parse.js',
  'src/content-messenger.js'
];
const LANE_ON = {
  glanceSwitches: { MESSENGER_CLICK_LANE: true },
  'glanceChatRemoteKill.messenger': false
};

async function registerMessenger(glance) {
  await glance.evaluateWorker(async (files) => {
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: ['https://www.messenger.com/*', 'https://messenger.com/*'],
      js: files,
      runAt: 'document_idle'
    }]);
  }, LANE_JS);
}

async function injectMessengerLane(page, glance) {
  const pageUrl = page.url().split('#')[0];
  const ok = await glance.evaluateWorker(async ({ pageUrl, files }) => {
    const tabs = await chrome.tabs.query({});
    const tab = (tabs || []).find((t) => t.url && t.url.split('#')[0] === pageUrl);
    if (!tab || typeof tab.id !== 'number') return false;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: files });
    return true;
  }, { pageUrl: pageUrl, files: LANE_JS });
  expect(ok).toBe(true);
}

async function userReadMessenger(page, glance) {
  const pageUrl = page.url().split('#')[0];
  await glance.evaluateWorker(async ({ pageUrl }) => {
    const tabs = await chrome.tabs.query({});
    const tab = (tabs || []).find((t) => t.url && t.url.split('#')[0] === pageUrl);
    if (!tab || typeof tab.id !== 'number') return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const row = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.messenger;
        if (row && typeof row.runUserRead === 'function') await row.runUserRead();
      }
    });
  }, { pageUrl: pageUrl });
}

test('Messenger does not draft without an explicit read', async ({ glance }) => {
  await registerMessenger(glance);
  await glance.seed(Object.assign({}, LANE_ON));
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const page = await glance.openMessenger(PLACE_HTML);
  await injectMessengerLane(page, glance);
  const box = page.locator('[data-glance-composer="1"]');
  await page.waitForTimeout(2500);
  expect((await box.innerText()).trim()).toBe('');
  const counters = await glance.evaluateWorker(async () => {
    const bag = await chrome.storage.local.get('glanceChatReadCounters');
    return bag.glanceChatReadCounters || { background: 0, user: 0 };
  });
  expect(counters.user || 0).toBe(0);
});

test('Messenger drafts after user read and shows then hides the indicator', async ({ glance }) => {
  await registerMessenger(glance);
  await glance.seed(Object.assign({}, LANE_ON));
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const page = await glance.openMessenger(PLACE_HTML);
  await injectMessengerLane(page, glance);
  await userReadMessenger(page, glance);
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('Taizu', { timeout: 15000 });
  await expect(page.locator('[data-glance-reading]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('kill switch keeps Messenger silent even with the lane switch on', async ({ glance }) => {
  await registerMessenger(glance);
  await glance.seed({
    glanceSwitches: { MESSENGER_CLICK_LANE: true },
    'glanceChatRemoteKill.messenger': true
  });
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'Taizu, 23 Montefiore, Tel Aviv' });
  const page = await glance.openMessenger(PLACE_HTML);
  await injectMessengerLane(page, glance);
  await userReadMessenger(page, glance);
  const box = page.locator('[data-glance-composer="1"]');
  await page.waitForTimeout(1500);
  expect((await box.innerText()).trim()).toBe('');
});
