const { defineConfig } = require('@playwright/test');

let metaLaneSpecs = ['**/lane-register-meta.spec.js'];
try {
  const sw = JSON.parse(process.env.GLANCE_E2E_SWITCHES || '{}');
  if (sw.META_CHAT_LANES === true) metaLaneSpecs = [];
} catch (e) { /* blocking job: no META flag */ }

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  testIgnore: metaLaneSpecs,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: process.env.CI
    ? [
      ['list'],
      ['blob', { outputDir: 'blob-report' }]
    ]
    : [
      ['list'],
      ['html', { open: 'never', outputFolder: 'e2e-report' }]
    ],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
