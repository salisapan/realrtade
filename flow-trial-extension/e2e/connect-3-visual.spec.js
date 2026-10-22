const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const mock = 'file://' + path.join(__dirname, '..', 'design', 'connect-3', 'index.html');
const art = '/opt/cursor/artifacts/connect-3';

const states = ['default', 'connecting', 'connected', 'partial'];
const themes = ['light', 'dark'];
const widths = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 }
];

async function openMock(page, query) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(mock + '?' + query + '&shot=1', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

for (const theme of themes) {
  for (const state of states) {
    for (const vp of widths) {
      test(`connect-3 ${state} ${theme} ${vp.name}`, async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const q = 'state=' + state + '&theme=' + theme + '&lang=he';
        const errors = await openMock(page, q);
        expect(errors).toEqual([]);
        await expect(page.locator('h1')).toContainText('חברו את החשבונות');
        await expect(page.locator('.list .item')).toHaveCount(3);
        if (!fs.existsSync(art)) fs.mkdirSync(art, { recursive: true });
        await page.screenshot({
          path: path.join(art, `connect-3-${state}-${theme}-${vp.name}.png`),
          fullPage: true
        });
      });
    }
  }
}
