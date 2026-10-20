// Who a mail was sent to is read from Gmail's own header, in a right-to-left
// account too: a collapsed line with no labels, and the details table with
// bidi marks and a trailing colon on each label. Copied-only stays quiet.
const { test, expect } = require('./support/harness');

const SELF = 'ai.local.flow@gmail.com';
const ASK = "Let's have a call Tuesday at 15:00 about the pilot";
const chip = (page) => page.locator('div[role="main"] button.flow-chip');

function mail(id, details, extra) {
  return Object.assign({
    messageId: 'm-' + id, threadId: 't-' + id, subject: 'the pilot',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, lang: 'he', body: ASK,
    detailsTable: details
  }, extra || {});
}

test.beforeEach(async ({ glance }) => { await glance.seedGmail({ glanceUiLanguage: 'he' }); });

test('details table, Hebrew labels with bidi marks: copied only stays quiet', async ({ glance }) => {
  const page = await glance.openGmail(mail('cc-only', { expanded: true, to: ['noa@acme.io'], cc: [SELF] }));
  await page.waitForTimeout(2500);
  await expect(chip(page)).toHaveCount(0);
});

test('details table, Hebrew labels with bidi marks: addressed to the account is offered', async ({ glance }) => {
  const page = await glance.openGmail(mail('to-me', { expanded: true, to: [SELF], cc: ['noa@acme.io'] }));
  await expect(chip(page)).toBeVisible();
});

test('details table, English labels without marks: copied only stays quiet', async ({ glance }) => {
  const page = await glance.openGmail(mail('cc-en', { expanded: true, hebrew: false, bidi: false, to: ['noa@acme.io'], cc: [SELF] }, { lang: 'en' }));
  await page.waitForTimeout(2500);
  await expect(chip(page)).toHaveCount(0);
});

test('collapsed header: the details are opened once and copied-only stays quiet', async ({ glance }) => {
  const page = await glance.openGmail(mail('collapsed-cc', { to: ['noa@acme.io'], cc: [SELF, 'ron@acme.io'] }));
  await page.waitForTimeout(2500);
  await expect(chip(page)).toHaveCount(0);
});

test('collapsed header: the details are opened once and an ask to the account is offered', async ({ glance }) => {
  const page = await glance.openGmail(mail('collapsed-to', { to: [SELF, 'noa@acme.io'], cc: ['ron@acme.io'] }));
  await expect(chip(page)).toBeVisible();
});
