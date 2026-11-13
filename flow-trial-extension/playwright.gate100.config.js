// Gate100: the 100-case release gate. Own config so it runs as its own required CI job and the
// fixed clock (a Wednesday, local time, same in every TZ) reaches the extension's content scripts.
const { defineConfig } = require('@playwright/test');
const now = new Date(2026, 10, 4, 12, 0, 0);
process.env.GLANCE_E2E_CLOCK_ISO = process.env.GLANCE_E2E_CLOCK_ISO || now.toISOString();
module.exports = defineConfig({
  testDir: './test/gate100',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 20000 },
  reporter: [['list'], ['json', { outputFile: 'gate100-results.json' }]],
  outputDir: 'test-results-gate100'
});
