const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');

const PLACE = 'Taizu, 23 Montefiore, Tel Aviv';
const LANE_JS = [
  'core/fact-reply.js',
  'core/close-chains.js',
  'src/chat-draft.js',
  'src/chat-compose.js',
  'src/chat-lane.js',
  'src/messenger-parse.js',
  'src/content-messenger.js'
];

test('the service worker loads the chat worker and drafts one Outlook place', async ({ glance }) => {
  const loaded = await glance.evaluateWorker(() => Boolean(globalThis.FlowLaneChat && typeof globalThis.FlowLaneChat.placeEvidence === 'function'));
  expect(loaded).toBe(true);

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

  await glance.seedOutlook();
  await glance.setScenario({ chatLocation: PLACE });
  const html = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/messenger-place.html'), 'utf8');
  const page = await glance.openMessenger(html);
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('Taizu', { timeout: 15000 });
  const text = await box.innerText();
  expect(text.indexOf('https://www.google.com/maps/search/?api=1&query=')).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(encodeURIComponent('23 Montefiore'))).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);

  const calls = await glance.apiCalls();
  expect(calls.some((call) => call.method === 'GET' && String(call.url).indexOf('/me/calendarView') >= 0)).toBe(true);
  expect(calls.some((call) => /calendar\/v3/.test(String(call.url)))).toBe(false);
  expect(calls.some((call) => /\/(send|reply|sendMail)\b/i.test(String(call.url)))).toBe(false);
  const flows = await glance.flows();
  expect(flows.length).toBe(0);
});
