const { test: base, expect } = require('@playwright/test');
const { bootM2PreC1 } = require('./m2-outlook-pre-c1-registry-4978');

// pre-C1 registry: modules injected by test — see m2-outlook-pre-c1-registry-4978.js
const test = base.extend({
  glance: [async ({}, use) => {
    const harness = await bootM2PreC1();
    await use(harness);
    await harness.close();
  }, { scope: 'worker' }],
  resetGlance: [async ({ glance }, use) => {
    await glance.reset();
    await use();
  }, { scope: 'test', auto: true }]
});

module.exports = { test, expect };
