const { test, expect } = require('./support/harness');
const manifest = require('../manifest.json');
const pkg = require('../package.json');

test('manifest, package, popup and service worker share one build stamp', async ({ glance }) => {
  expect(manifest.version).toBe(pkg.version);
  const page = await glance.openPopup();
  await expect(page.locator('[data-glance-stamp]')).toHaveAttribute('data-glance-stamp', manifest.version);
  const ui = await page.evaluate(() => (globalThis.FlowBuild && FlowBuild.STAMP) || '');
  const shown = await page.evaluate(() => chrome.runtime.getManifest().version);
  expect(ui).toBe(manifest.version);
  expect(shown).toBe(manifest.version);
  await expect(page.locator('#reloadGlance')).toBeHidden();
});
