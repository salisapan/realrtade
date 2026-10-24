const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const mock = 'file://' + path.join(__dirname, '..', 'design', 'connect-3', 'index.html');

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
      test(`connect-3 ${state} ${theme} ${vp.name}`, async ({ page }, testInfo) => {
        test.setTimeout(60000);
        const fileName = `connect-3-${state}-${theme}-${vp.name}.png`;
        const shotPath = process.env.PW_ARTIFACTS_DIR
          ? path.join(process.env.PW_ARTIFACTS_DIR, fileName)
          : testInfo.outputPath(fileName);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const q = 'state=' + state + '&theme=' + theme + '&lang=he';
        const errors = await openMock(page, q);
        expect(errors).toEqual([]);
        await expect(page.locator('h1')).toContainText('חברו את החשבונות');
        await expect(page.locator('.list .item')).toHaveCount(3);
        if (process.env.PW_ARTIFACTS_DIR && !fs.existsSync(process.env.PW_ARTIFACTS_DIR)) {
          fs.mkdirSync(process.env.PW_ARTIFACTS_DIR, { recursive: true });
        }
        await page.screenshot({ path: shotPath, fullPage: true });
      });
    }
  }
}
