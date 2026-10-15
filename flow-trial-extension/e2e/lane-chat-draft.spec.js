const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const PLACE = 'Taizu, 23 Montefiore, Tel Aviv';
const OTHER = 'North Abraxas, 40 Lilienblum, Tel Aviv';
const LANE_JS = [
  'core/fact-reply.js',
  'core/close-chains.js',
  'src/chat-draft.js',
  'src/chat-compose.js',
  'src/chat-lane.js',
  'src/lane-draft-store.js',
  'src/group-word.js',
  'src/messenger-parse.js',
  'src/content-messenger.js'
];
const PLACE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/messenger-place.html'), 'utf8');
const SUITE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/live/business-suite-existing.html'), 'utf8');
const SUITE_ASK = 'איפה המסעדה שהיינו בה שבוע שעבר?';

async function registerMessenger(glance) {
  const registered = await glance.evaluateWorker(async (files) => {
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: ['https://www.messenger.com/*', 'https://messenger.com/*'],
      js: files,
      runAt: 'document_idle'
    }]);
    const listed = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    return listed.length === 1 && listed[0].js.indexOf('src/content-messenger.js') >= 0;
  }, LANE_JS);
  expect(registered).toBe(true);
}

function mapsDraft(text) {
  expect(text.indexOf('https://www.google.com/maps/search/?api=1&query=')).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(encodeURIComponent('23 Montefiore'))).toBeGreaterThanOrEqual(0);
}

test('the service worker loads the chat worker and drafts one Outlook place', async ({ glance }) => {
  const loaded = await glance.evaluateWorker(() => Boolean(
    globalThis.FlowLaneChat && typeof globalThis.FlowLaneChat.placeEvidence === 'function' &&
    globalThis.__glanceGoogleAuth && typeof globalThis.__glanceGoogleAuth.webTokenUsable === 'function'
  ));
  expect(loaded).toBe(true);
  await registerMessenger(glance);

  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: PLACE });
  const page = await glance.openMessenger(PLACE_HTML);
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('Taizu', { timeout: 15000 });
  const text = await box.innerText();
  mapsDraft(text);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

  const calls = await glance.apiCalls();
  expect(calls.some((call) => call.method === 'GET' && String(call.url).indexOf('/me/calendarView') >= 0)).toBe(true);
  expect(calls.some((call) => /calendar\/v3/.test(String(call.url)))).toBe(false);
  expect(calls.some((call) => /\/(send|reply|sendMail)\b/i.test(String(call.url)))).toBe(false);
  const flows = await glance.flows();
  expect(flows.length).toBe(0);
});

test('Google only drafts the one address', async ({ glance }) => {
  await registerMessenger(glance);
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: PLACE });
  const page = await glance.openMessenger(PLACE_HTML);
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('Taizu', { timeout: 15000 });
  const text = await box.innerText();
  mapsDraft(text);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

  const calls = await glance.apiCalls();
  expect(calls.some((call) => call.method === 'GET' && /calendar\/v3/.test(String(call.url)))).toBe(true);
  expect(calls.some((call) => String(call.url).indexOf('/me/calendarView') >= 0)).toBe(false);
  expect(calls.some((call) => /\/(send|reply|sendMail)\b/i.test(String(call.url)))).toBe(false);
});

test('Google and Outlook at different addresses stay quiet', async ({ glance }) => {
  await registerMessenger(glance);
  await glance.seedOutlook({ googleTasksAuth: { taskListId: 'glance-list' } });
  await glance.setScenario({ chatLocation: PLACE, chatGoogleLocation: OTHER });
  const page = await glance.openMessenger(PLACE_HTML);
  const box = page.locator('[data-glance-composer="1"]');
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((call) => /calendar\/v3/.test(String(call.url))) &&
      calls.some((call) => String(call.url).indexOf('/me/calendarView') >= 0);
  }, { timeout: 15000 }).toBe(true);
  await page.waitForTimeout(2000);
  expect((await box.innerText()).trim()).toBe('');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  const calls = await glance.apiCalls();
  expect(calls.some((call) => /\/(send|reply|sendMail)\b/i.test(String(call.url)))).toBe(false);
});

test('an open Business Suite thread drafts the existing last row and sends nothing', async ({ glance }) => {
  const registered = await glance.evaluateWorker(async (files) => {
    const id = 'glance-lane-messenger-e2e';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: [
        'https://business.facebook.com/latest/inbox',
        'https://business.facebook.com/latest/inbox/*',
        'https://www.business.facebook.com/latest/inbox',
        'https://www.business.facebook.com/latest/inbox/*'
      ],
      js: files,
      runAt: 'document_idle'
    }]);
    const listed = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    return listed.length === 1 && listed[0].matches.indexOf('https://business.facebook.com/latest/inbox/*') >= 0;
  }, LANE_JS);
  expect(registered).toBe(true);

  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: 'דיזנגוף 99', chatEventIso: '2026-10-08T10:00:00.000Z' });
  const page = await glance.openBusiness(SUITE_HTML);
  const before = await page.locator('[role="row"]').count();
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('דיזנגוף', { timeout: 15000 });
  const text = await box.innerText();
  expect(text.indexOf('דיזנגוף 99 - ')).toBe(0);
  expect(text.indexOf(encodeURIComponent('דיזנגוף 99'))).toBeGreaterThanOrEqual(0);
  expect(await page.locator('[role="row"]').count()).toBe(before);
  expect(await page.locator('[role="row"]').last().innerText()).toContain(SUITE_ASK);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

  const calls = await glance.apiCalls();
  expect(calls.some((call) => call.method === 'GET' && String(call.url).indexOf('/me/calendarView') >= 0)).toBe(true);
  expect(calls.some((call) => /\/(send|reply|sendMail)\b/i.test(String(call.url)))).toBe(false);
  const flows = await glance.flows();
  expect(flows.length).toBe(0);

  const reinjected = await glance.evaluateWorker(async (files) => {
    const tabs = await chrome.tabs.query({ url: ['https://business.facebook.com/*'] });
    const tab = (tabs || [])[0];
    if (!tab) return { error: 'no-tab' };
    const actions = [];
    for (let n = 0; n < 3; n++) {
      let alive = false;
      try {
        const reply = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => Boolean(window.__glanceLaneChat)
        });
        alive = Array.isArray(reply) && reply.some((row) => row && row.result === true);
      } catch (e) { alive = false; }
      if (alive) { actions.push('skip'); continue; }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: files });
      actions.push('injected');
    }
    const counted = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.__glanceLaneChat && window.__glanceLaneChat.observers) || 0
    });
    return { actions: actions, observers: counted && counted[0] && counted[0].result };
  }, LANE_JS);
  expect(reinjected.actions).toEqual(['skip', 'skip', 'skip']);
  expect(reinjected.observers).toBe(1);
});

test('the dev fixture drafts one address and stays quiet for two', async ({ glance }) => {
  await glance.seed({ glanceDevFixture: true });
  const page = await glance.openFixture('');
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('דיזנגוף', { timeout: 15000 });
  const text = await box.innerText();
  expect(text.indexOf('דיזנגוף 99 - ')).toBe(0);
  expect(text.indexOf(encodeURIComponent('דיזנגוף 99'))).toBeGreaterThanOrEqual(0);
  expect(await page.locator('button').count()).toBe(0);
  await page.close();

  const quiet = await glance.openFixture('?case=two');
  const quietBox = quiet.locator('[data-glance-composer="1"]');
  await quiet.waitForTimeout(3500);
  expect((await quietBox.innerText()).trim()).toBe('');
  expect(await quiet.locator('button').count()).toBe(0);
  await quiet.close();
});
