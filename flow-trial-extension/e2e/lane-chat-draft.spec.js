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
  'src/messenger-parse.js',
  'src/content-messenger.js'
];
const PLACE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/messenger-place.html'), 'utf8');

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
