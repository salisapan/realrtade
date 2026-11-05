const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { freezeDate } = require('./support/frozen-date');

// The dev fixture's place event is Thu Oct 8 2026, 10:00 +03:00, and the sentence asks about last week.
// "Last week" is Sun Oct 4 to Sat Oct 10 only while the page's clock is in Oct 11-17, so the clock is fixed
// on Mon Oct 12, and the spec gives the same answer on any run date.
const FIXTURE_NOW = '2026-10-12T11:00:00+03:00';

async function openFixturePage(glance, search) {
  const page = await glance.context.newPage();
  await freezeDate(page, FIXTURE_NOW);
  await page.goto('chrome-extension://' + glance.extensionId + '/dev/messenger-fixture.html' + (search || ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
  return page;
}

const PLACE = 'Taizu, 23 Montefiore, Tel Aviv';
const OTHER = 'North Abraxas, 40 Lilienblum, Tel Aviv';
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
const MESSENGER_LANE_ON = {
  glanceSwitches: { MESSENGER_CLICK_LANE: true },
  'glanceChatRemoteKill.messenger': false
};

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
  if (pageUrl.indexOf('messenger-fixture.html') >= 0) {
    await page.evaluate(async () => {
      const row = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.messenger;
      if (row && typeof row.runUserRead === 'function') await row.runUserRead();
    });
    return;
  }
  const out = await glance.evaluateWorker(async ({ pageUrl }) => {
    const tabs = await chrome.tabs.query({});
    const tab = (tabs || []).find((t) => t.url && t.url.split('#')[0] === pageUrl);
    if (!tab || typeof tab.id !== 'number') return { ok: false, reason: 'no-tab' };
    const reply = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const row = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.messenger;
        if (row && typeof row.runUserRead === 'function') return await row.runUserRead();
        return { ok: false, reason: 'no-handler' };
      }
    });
    return (reply && reply[0] && reply[0].result) || { ok: false, reason: 'no-result' };
  }, { pageUrl: pageUrl });
  if (out && out.reason === 'kill-switch') throw new Error('Messenger kill switch blocked the read');
  if (out && out.reason === 'no-handler') throw new Error('Messenger runUserRead is missing');
}
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

  await glance.seed(Object.assign({}, MESSENGER_LANE_ON));
  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: PLACE });
  const page = await glance.openMessenger(PLACE_HTML);
  await injectMessengerLane(page, glance);
  await userReadMessenger(page, glance);
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
  await glance.seed(Object.assign({}, MESSENGER_LANE_ON));
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: PLACE });
  const page = await glance.openMessenger(PLACE_HTML);
  await injectMessengerLane(page, glance);
  await userReadMessenger(page, glance);
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
  await glance.seed(Object.assign({}, MESSENGER_LANE_ON));
  await glance.seedOutlook({ googleTasksAuth: { taskListId: 'glance-list' } });
  await glance.setScenario({ chatLocation: PLACE, chatGoogleLocation: OTHER });
  const page = await glance.openMessenger(PLACE_HTML);
  await injectMessengerLane(page, glance);
  await userReadMessenger(page, glance);
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

test('the packed manifest does not list Business Suite hosts', async ({ glance }) => {
  const blob = await glance.evaluateWorker(() => JSON.stringify(chrome.runtime.getManifest()));
  expect(blob.indexOf('business.facebook.com')).toBeLessThan(0);
});

test('the dev fixture drafts one address and stays quiet for two', async ({ glance }) => {
  await glance.seed(Object.assign({ glanceDevFixture: true }, MESSENGER_LANE_ON));
  const page = await openFixturePage(glance, '');
  await userReadMessenger(page, glance);
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('דיזנגוף', { timeout: 15000 });
  const text = await box.innerText();
  expect(text.indexOf('דיזנגוף 99 - ')).toBe(0);
  expect(text.indexOf(encodeURIComponent('דיזנגוף 99'))).toBeGreaterThanOrEqual(0);
  expect(await page.locator('button').count()).toBe(0);
  await page.close();

  await glance.seed(Object.assign({ glanceDevFixture: true, glanceLaneDrafts: {} }, MESSENGER_LANE_ON));
  const quietLogs = [];
  const quiet = await glance.context.newPage();
  quiet.on('console', (msg) => quietLogs.push(msg.text()));
  await freezeDate(quiet, FIXTURE_NOW);
  await quiet.goto('chrome-extension://' + glance.extensionId + '/dev/messenger-fixture.html?case=two', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await userReadMessenger(quiet);
  await expect(quiet.locator('[data-glance-quiet]')).toHaveText('[Glance] whyNotShown: conflict', { timeout: 15000 });
  expect((await quiet.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
  expect(await quiet.locator('button').count()).toBe(0);
  expect(quietLogs.some((line) => line.indexOf('[Glance] whyNotShown: conflict') >= 0)).toBe(true);
  expect(quietLogs.some((line) => line.indexOf('whyNotShown: closed') >= 0)).toBe(false);
  await quiet.close();
});

test('each fixture quiet case shows its own reason', async ({ glance }) => {
  await glance.seed(Object.assign({ glanceDevFixture: true }, MESSENGER_LANE_ON));
  const cases = [
    ['?case=greeting', 'no-ask'],
    ['?case=group', 'not-one-to-one'],
    ['?case=self-last', 'from-me'],
    ['?case=stale', 'stale'],
    ['?case=future', 'future']
  ];
  for (const [search, reason] of cases) {
    const logs = [];
    const page = await glance.context.newPage();
    page.on('console', (msg) => logs.push(msg.text()));
    await page.goto('chrome-extension://' + glance.extensionId + '/dev/messenger-fixture.html' + search, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await userReadMessenger(page, glance);
    const line = '[Glance] whyNotShown: ' + reason;
    await expect(page.locator('[data-glance-quiet]')).toHaveText(line, { timeout: 15000 });
    expect((await page.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
    expect(await page.locator('button').count()).toBe(0);
    expect(logs.some((item) => item.indexOf(line) >= 0)).toBe(true);
    await page.close();
  }
});

test('a deleted fixture draft stays closed ahead of two addresses', async ({ glance }) => {
  const { FlowLaneDraftStore } = require('../src/lane-draft-store.js');
  const key = FlowLaneDraftStore.hashKey('ms:dev-fixture?case=two', 'm-fixture', 'איפה היה המסעדה משבוע שעבר?');
  await glance.seed(Object.assign({
    glanceDevFixture: true,
    glanceLaneDrafts: { [key]: { hash: 'abc', state: 'closed', ts: Date.now() } }
  }, MESSENGER_LANE_ON));
  const logs = [];
  const page = await glance.context.newPage();
  page.on('console', (msg) => logs.push(msg.text()));
  await page.goto('chrome-extension://' + glance.extensionId + '/dev/messenger-fixture.html?case=two', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await userReadMessenger(page, glance);
  await expect(page.locator('[data-glance-quiet]')).toHaveText('[Glance] whyNotShown: closed', { timeout: 15000 });
  expect((await page.locator('[data-glance-composer="1"]').innerText()).trim()).toBe('');
  expect(logs.some((line) => line.indexOf('[Glance] whyNotShown: closed') >= 0)).toBe(true);
  expect(logs.some((line) => line.indexOf('whyNotShown: conflict') >= 0)).toBe(false);
  await page.close();
});

test('?reset=1 clears only the lane draft store', async ({ glance }) => {
  await glance.seed({
    glanceDevFixture: true,
    glanceKeep: 'untouched',
    glanceLaneDrafts: { abc: { hash: 'abc', state: 'closed', ts: Date.now() } }
  });
  const logs = [];
  const page = await glance.context.newPage();
  page.on('console', (msg) => logs.push(msg.text()));
  await page.goto('chrome-extension://' + glance.extensionId + '/dev/messenger-fixture.html?reset=1&case=greeting', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(page.locator('[data-glance-reset]')).toHaveText('[Glance] lane store reset', { timeout: 15000 });
  expect(logs.some((line) => line.indexOf('[Glance] lane store reset') >= 0)).toBe(true);
  const bag = await glance.storage();
  expect(bag.glanceLaneDrafts).toEqual({});
  expect(bag.glanceKeep).toBe('untouched');
  expect(bag.glanceDevFixture).toBe(true);
  expect(await page.locator('button').count()).toBe(0);
  await page.close();
});
