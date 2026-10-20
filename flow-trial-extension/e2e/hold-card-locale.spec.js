// Hold card text and chrome, light and dark, at two widths.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/opt/cursor/artifacts/screenshots';

async function paint(page, dark) {
  await page.setContent(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;padding:16px;font-family:system-ui,sans-serif"><div id="en"></div><div id="he" style="margin-top:16px"></div></body></html>',
    { waitUntil: 'domcontentloaded' }
  );
  await page.addStyleTag({ path: path.join(ROOT, 'design/step-states-v1/scoped.css') });
  await page.addStyleTag({ path: path.join(ROOT, 'src/chip.css') });
  for (const rel of ['core/display-copy.js', 'core/step-list.js', 'src/step-kit.js', 'src/step-list-view.js', 'src/chip-host.js']) {
    await page.addScriptTag({ path: path.join(ROOT, rel) });
  }
  await page.evaluate((isDark) => {
    document.body.style.background = isDark ? '#1c1c1e' : '#f4f1ea';
    function ctx(lang) {
      return {
        uiLang: lang,
        app: 'outlook',
        glanceChain: 'calendar-hold',
        process: {
          id: 'hold',
          name: 'Hold It',
          closingLine: 'Putting this on your calendar.',
          steps: [{ kind: 'calendar', id: 'cal', label: lang === 'he' ? 'שמירת הזמן' : 'Hold the time', params: { dateIso: '2026-10-19', hour: 10, minute: 0 } }]
        },
        intent: { label: 'Hold the slot' }
      };
    }
    window.FlowChipHost.inject(document.getElementById('en'), ctx('en'), {});
    window.FlowChipHost.inject(document.getElementById('he'), ctx('he'), {});
    if (isDark) {
      document.querySelectorAll('.flow-step-card').forEach((node) => node.setAttribute('data-theme', 'dark'));
    }
  }, dark);
}

test('hold card text follows the UI language in light and dark', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const widths = [1280, 390];
  for (const dark of [false, true]) {
    for (const width of widths) {
      await page.setViewportSize({ width: width, height: width === 390 ? 844 : 800 });
      await paint(page, dark);
      const en = page.locator('#en .gs-intent');
      const he = page.locator('#he .gs-intent');
      await expect(en).toHaveText('Hold Mon 10:00');
      await expect(he).toHaveText('שריין ב׳ 10:00');
      await expect(page.locator('#en .chip-hold')).toHaveText('Hold It');
      await expect(page.locator('#he .chip-hold')).toHaveText('השהה');
      await expect(page.locator('#en')).not.toContainText('השהה');
      await expect(page.locator('#en')).not.toContainText('שריין');
      await expect(page.locator('#he')).not.toContainText('Do It');
      await expect(page.locator('#he')).not.toContainText('Hold It');
      if (width === 1280) {
        const heName = 'hold-card-he-' + (dark ? 'dark' : 'light') + '.png';
        await page.locator('#he .flow-chip-host').screenshot({ path: path.join(SHOTS, heName) });
      }
      const name = 'hold-card-' + (dark ? 'dark' : 'light') + '-' + width + '.png';
      await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
    }
  }
});
