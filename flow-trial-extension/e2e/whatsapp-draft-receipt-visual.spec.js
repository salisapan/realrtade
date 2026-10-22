// WhatsApp lane draft receipt in chip-host: light/dark, LTR English and RTL Hebrew.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { freezeDate } = require('./support/frozen-date');

const SHOTS = '/opt/cursor/artifacts/screenshots';
const FIXTURE_NOW = '2026-10-12T11:00:00+03:00';
const PLACE = 'Taizu, 23 Montefiore, Tel Aviv';
const EN_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-place.html'), 'utf8');
const HE_HTML = fs.readFileSync(path.join(__dirname, '../test/fixtures/chat/whatsapp-place-he.html'), 'utf8');

async function registerWhatsApp(glance) {
  const ok = await glance.evaluateWorker(async () => {
    const lane = (globalThis.__glanceLaneChatDefs || []).find((l) => l.id === 'glance-lane-whatsapp');
    if (!lane || typeof globalThis.__glanceLaneChatScripts !== 'function') return false;
    const js = globalThis.__glanceLaneChatScripts(lane);
    const css = globalThis.__glanceLaneChatCss || [];
    const id = 'glance-lane-whatsapp-visual';
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{
      id: id,
      matches: lane.origins,
      js: js,
      css: css,
      runAt: 'document_idle'
    }]);
    return js.indexOf('src/chip-host.js') >= 0;
  });
  expect(ok).toBe(true);
}

async function armEngine(glance) {
  await glance.evaluateWorker(async () => {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    const switches = Object.assign({}, bag.glanceSwitches || {}, { WHATSAPP_ENGINE: true });
    await chrome.storage.local.set({ glanceSwitches: switches });
  });
}

async function shotReceipt(page, name, dark) {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (dark) {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.style.background = '#1c1c1e';
      const host = document.querySelector('#glance-chat-draft .flow-chip-host');
      if (host) host.setAttribute('data-theme', 'dark');
    });
  } else {
    await page.evaluate(() => { document.body.style.background = '#f4f1ea'; });
  }
  const receipt = page.locator('#glance-chat-draft .flow-chip-host');
  await expect(receipt).toBeVisible({ timeout: 15000 });
  await receipt.screenshot({ path: path.join(SHOTS, name) });
}

test('WhatsApp draft receipt uses chip-host tokens in light and dark', async ({ glance }) => {
  test.setTimeout(120000);
  await registerWhatsApp(glance);
  await glance.seedGmail();
  await armEngine(glance);
  await glance.setScenario({ chatGoogleLocation: PLACE });

  for (const row of [
    { html: EN_HTML, label: 'en-ltr', expectText: 'Draft in the box' },
    { html: HE_HTML, label: 'he-rtl', expectText: 'טיוטה בתיבה' }
  ]) {
    for (const dark of [false, true]) {
      const page = await glance.openWhatsApp(row.html);
      await freezeDate(page, FIXTURE_NOW);
      await page.evaluate(() => {
        const s = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.whatsapp;
        if (s && typeof s.scan === 'function') s.scan();
      });
      const box = page.locator('[data-glance-composer="1"]');
      await expect(box).toContainText('Taizu', { timeout: 25000 });
      await expect(page.locator('#glance-chat-draft .flow-chip-handled')).toContainText(row.expectText, { timeout: 15000 });
      await shotReceipt(page, 'whatsapp-draft-receipt-' + row.label + '-' + (dark ? 'dark' : 'light') + '.png', dark);
      await page.close();
    }
  }
});
