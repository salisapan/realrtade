const { test: base, expect } = require('@playwright/test');
const { boot } = require('./launch');

const test = base.extend({
  glance: [async ({}, use) => {
    const harness = await boot();
    await use(harness);
    await harness.close();
  }, { scope: 'worker' }],
  resetGlance: [async ({ glance }, use) => {
    await glance.reset();
    await use();
  }, { scope: 'test', auto: true }]
});

module.exports = { test, expect };
