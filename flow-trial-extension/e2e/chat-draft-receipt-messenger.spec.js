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
const CASES = [
  { file: 'messenger-place.html', label: 'en-ltr', expectText: 'Draft in the box', rtl: false },
  { file: 'messenger-place-he.html', label: 'he-rtl', expectText: 'טיוטה בתיבה', rtl: true }
];

test('chat draft receipt on messenger', async ({ glance }) => {
  test.setTimeout(180000);
  const ok = await glance.evaluateWorker(async () => {
    const lane = (globalThis.__glanceLaneChatDefs || []).find((l) => l.id === 'glance-lane-messenger');
    const id = 'glance-lane-chat-receipt-ms';
    const js = lane.js.concat(['src/chip-host.js']);
    const css = globalThis.__glanceLaneChatCss || [];
    try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch (e) { /* first run */ }
    await chrome.scripting.registerContentScripts([{ id, matches: lane.origins, js, css, runAt: 'document_idle' }]);
    return true;
  });
  expect(ok).toBe(true);
  await glance.seedGmail();
  await glance.setScenario({ chatGoogleLocation: PLACE });
  let lightBg = '';
  let darkBg = '';
  for (const row of CASES) {
    const html = fs.readFileSync(path.join(FIXTURE_DIR, row.file), 'utf8');
    for (const dark of [false, true]) {
      const page = await glance.openMessenger(html);
      await freezeDate(page, FIXTURE_NOW);
      const box = page.locator('[data-glance-composer="1"]');
      await expect(box).toContainText('Taizu', { timeout: 25000 });
      const handled = page.locator('#glance-chat-draft .flow-chip-handled');
      await expect(handled).toContainText(row.expectText, { timeout: 15000 });
      await expect(page.locator('#glance-chat-draft .flow-chip-undo')).toHaveText(row.rtl ? 'בטל' : 'Undo');
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      const done = page.locator('#glance-chat-draft .flow-chip.flow-chip-done');
      await expect(done).toBeVisible({ timeout: 15000 });
      const metrics = await page.evaluate(() => {
        const mount = document.getElementById('glance-chat-draft');
        const card = mount && mount.querySelector('.flow-chip.flow-chip-done');
        if (!card || !mount) return null;
        const cs = getComputedStyle(card);
        return { bg: cs.backgroundColor, dir: card.getAttribute('dir'), mountWidth: mount.getBoundingClientRect().width };
      });
      expect(metrics.bg).toBe(dark ? DARK_DONE_BG : LIGHT_DONE_BG);
      expect(metrics.dir).toBe(row.rtl ? 'rtl' : 'ltr');
      if (dark) darkBg = metrics.bg;
      else lightBg = metrics.bg;
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.evaluate((isDark) => {
        document.body.style.background = isDark ? '#1c1c1e' : '#f4f1ea';
      }, dark);
      const shotName = 'messenger-draft-receipt-' + row.label + '-' + (dark ? 'dark' : 'light') + '.png';
      await page.locator('#glance-chat-draft .flow-chip-host').screenshot({ path: path.join(SHOTS, shotName) });
      await page.close();
      await glance.evaluateWorker(() => chrome.storage.local.remove('glanceLaneDrafts'));
    }
  }
  expect(lightBg).not.toBe(darkBg);
});
