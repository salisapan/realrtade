// Draft undo receipt (shared chat-lane) on WhatsApp, Messenger, and Instagram.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/harness');
const { freezeDate } = require('./support/frozen-date');

const SHOTS = '/opt/cursor/artifacts/screenshots';
const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/chat');
const FIXTURE_NOW = '2026-10-12T11:00:00+03:00';
const PLACE = 'Taizu, 23 Montefiore, Tel Aviv';
const LIGHT_DONE_BG = 'rgb(243, 250, 246)';
const DARK_DONE_BG = 'rgb(16, 33, 24)';

const SURFACES = [
  {
    channel: 'whatsapp',
    laneId: 'glance-lane-whatsapp',
    scanKey: 'whatsapp',
    registerId: 'glance-lane-chat-receipt-wa',
    open(glance, html) { return glance.openWhatsApp(html); },
    cases: [
      { file: 'whatsapp-place.html', label: 'en-ltr', expectText: 'Draft in the box', rtl: false },
      { file: 'whatsapp-place-he.html', label: 'he-rtl', expectText: 'טיוטה בתיבה', rtl: true }
    ]
  },
  {
    channel: 'instagram',
    laneId: 'glance-lane-instagram',
    scanKey: 'instagram',
    registerId: 'glance-lane-chat-receipt-ig',
    open(glance, html) { return glance.openInstagram(html); },
    cases: [
      { file: 'instagram-place-en.html', label: 'en-ltr', expectText: 'Draft in the box', rtl: false },
      { file: 'instagram-place.html', label: 'he-rtl', expectText: 'טיוטה בתיבה', rtl: true }
    ]
  }
];

async function registerLaneChat(glance, laneId, registerId, jsMode) {
  const ok = await glance.evaluateWorker(async ({ laneId, registerId, jsMode }) => {
    const lane = (globalThis.__glanceLaneChatDefs || []).find((l) => l.id === laneId);
    if (!lane) return false;
    const css = globalThis.__glanceLaneChatCss || [];
    let js;
    if (jsMode === 'draft-receipt') {
      js = lane.js.concat(['src/chip-host.js']);
    } else if (typeof globalThis.__glanceLaneChatScripts === 'function') {
      js = globalThis.__glanceLaneChatScripts(lane);
    } else return false;
    try { await chrome.scripting.unregisterContentScripts({ ids: [registerId] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{ id: registerId, matches: lane.origins, js, css, runAt: 'document_idle' }]);
    return js.indexOf('src/chip-host.js') >= 0 && css.indexOf('src/chip.css') >= 0;
  }, { laneId, registerId, jsMode });
  expect(ok).toBe(true);
}

async function registerSurface(glance, surface) {
  return registerLaneChat(glance, surface.laneId, surface.registerId, 'production');
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
  await page.locator('#glance-chat-draft .flow-chip-host').screenshot({ path: path.join(SHOTS, name) });
}

for (const surface of SURFACES) {
  test(`chat draft receipt on ${surface.channel}`, async ({ glance }) => {
    test.setTimeout(180000);
    await registerSurface(glance, surface);
    await glance.seedGmail();
    await glance.setScenario({ chatGoogleLocation: PLACE });

    let lightBg = '';
    let darkBg = '';

    for (const row of surface.cases) {
      const html = fs.readFileSync(path.join(FIXTURE_DIR, row.file), 'utf8');
      for (const dark of [false, true]) {
        const page = await surface.open(glance, html);
        await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
        await freezeDate(page, FIXTURE_NOW);
        await page.evaluate((scanKey) => {
          const s = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces[scanKey];
          if (s && typeof s.scan === 'function') s.scan();
        }, surface.scanKey);
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
        const shotName = surface.channel + '-draft-receipt-' + row.label + '-' + (dark ? 'dark' : 'light') + '.png';
        await shotReceipt(page, shotName, dark);
        await page.close();
        await glance.evaluateWorker(() => chrome.storage.local.remove('glanceLaneDrafts'));
      }
    }
    expect(lightBg).not.toBe(darkBg);
  });
}
