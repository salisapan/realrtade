const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
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
