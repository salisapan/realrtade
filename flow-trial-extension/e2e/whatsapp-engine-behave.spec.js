// Playwright behavioural check: same WhatsApp inbound message drafts only when WHATSAPP_ENGINE is on.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { freezeDate } = require('./support/frozen-date');

const FIXTURE_NOW = '2026-10-12T11:00:00+03:00';
const PLACE = 'Taizu, 23 Montefiore, Tel Aviv';
const WA_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-place.html'), 'utf8');

async function registerWhatsApp(glance) {
  const ok = await glance.evaluateWorker(async () => {
    const lane = (globalThis.__glanceLaneChatDefs || []).find((l) => l.id === 'glance-lane-whatsapp');
    if (!lane) return false;
    const js = globalThis.__glanceLaneChatScripts(lane);
    const css = globalThis.__glanceLaneChatCss || [];
    const id = 'glance-lane-whatsapp-behave';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) {}
    await chrome.scripting.registerContentScripts([{ id, matches: lane.origins, js, css, runAt: 'document_idle' }]);
    return true;
  });
  expect(ok).toBe(true);
}

async function setEngine(glance, on) {
  await glance.evaluateWorker(async (engineOn) => {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    const switches = Object.assign({}, bag.glanceSwitches || {}, { WHATSAPP_ENGINE: engineOn === true });
    await chrome.storage.local.set({ glanceSwitches: switches });
  }, on);
}

test('WHATSAPP_ENGINE off is quiet; on drafts the place answer', async ({ glance }) => {
  test.setTimeout(120000);
  await registerWhatsApp(glance);
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: PLACE });
  await setEngine(glance, false);
  const off = await glance.openWhatsApp(WA_HTML);
  await freezeDate(off, FIXTURE_NOW);
  await off.evaluate(() => {
    const s = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.whatsapp;
    if (s && typeof s.scan === 'function') s.scan();
  });
  await off.waitForTimeout(500);
  const offText = await off.locator('[data-glance-composer="1"]').innerText().catch(() => '');
  await off.close();
  expect(offText.trim()).toBe('');
  await setEngine(glance, true);
  const page = await glance.openWhatsApp(WA_HTML);
  await freezeDate(page, FIXTURE_NOW);
  await page.evaluate(() => {
    const s = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.whatsapp;
    if (s && typeof s.scan === 'function') s.scan();
  });
  const box = page.locator('[data-glance-composer="1"]');
  await expect(box).toContainText('Taizu', { timeout: 25000 });
  await page.close();
});
