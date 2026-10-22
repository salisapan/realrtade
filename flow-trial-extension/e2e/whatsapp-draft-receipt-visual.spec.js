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
const LIGHT_DONE_BG = 'rgb(243, 250, 246)';
const DARK_DONE_BG = 'rgb(16, 33, 24)';

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

async function assertReceiptVisual(page, dark, rtl) {
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  const done = page.locator('#glance-chat-draft .flow-chip.flow-chip-done');
  await expect(done).toBeVisible({ timeout: 15000 });
  const metrics = await page.evaluate(() => {
    const mount = document.getElementById('glance-chat-draft');
    const card = mount && mount.querySelector('.flow-chip.flow-chip-done');
    if (!card || !mount) return null;
    const cs = getComputedStyle(card);
    return {
      bg: cs.backgroundColor,
      dir: card.getAttribute('dir'),
      mountWidth: mount.getBoundingClientRect().width
    };
  });
  expect(metrics).not.toBeNull();
  expect(metrics.bg).toBe(dark ? DARK_DONE_BG : LIGHT_DONE_BG);
  expect(metrics.dir).toBe(rtl ? 'rtl' : 'ltr');
  expect(metrics.mountWidth).toBeLessThanOrEqual(361);
  expect(metrics.mountWidth).toBeGreaterThan(200);
}

async function shotReceipt(page, name, dark) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate((isDark) => {
    document.body.style.background = isDark ? '#1c1c1e' : '#f4f1ea';
  }, dark);
  const receipt = page.locator('#glance-chat-draft .flow-chip-host');
  await receipt.screenshot({ path: path.join(SHOTS, name) });
}

test('WhatsApp draft receipt uses chip-host tokens in light and dark', async ({ glance }) => {
  test.setTimeout(120000);
  await registerWhatsApp(glance);
  await glance.seedGmail();
  await armEngine(glance);
  await glance.setScenario({ chatGoogleLocation: PLACE });

  let lightBg = '';
  let darkBg = '';

  for (const row of [
    { html: EN_HTML, label: 'en-ltr', expectText: 'Draft in the box', rtl: false },
    { html: HE_HTML, label: 'he-rtl', expectText: 'טיוטה בתיבה', rtl: true }
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
      const handled = page.locator('#glance-chat-draft .flow-chip-handled');
      await expect(handled).toContainText(row.expectText, { timeout: 15000 });
      if (row.rtl) {
        const text = await handled.innerText();
        expect(text.trim().indexOf('.')).not.toBe(0);
      }
      await assertReceiptVisual(page, dark, row.rtl);
      const bg = await page.locator('#glance-chat-draft .flow-chip.flow-chip-done').evaluate((el) => getComputedStyle(el).backgroundColor);
      if (dark) darkBg = bg;
      else lightBg = bg;
      await shotReceipt(page, 'whatsapp-draft-receipt-' + row.label + '-' + (dark ? 'dark' : 'light') + '.png', dark);
      await page.close();
    }
  }
  expect(lightBg).not.toBe(darkBg);
});
