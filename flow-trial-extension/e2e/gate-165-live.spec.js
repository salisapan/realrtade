// David's live Gate, two misses. Headless Chromium, fixtures only.
// A self-sent note whose recipient chip is the collapsed "to me" span
// (no email attribute) is the task Renew the domain, due Friday.
// A call at a clock about a topic keeps the calendar and the task.
// The card title is Call about the topic in the body. A Hebrew UI
// translates that topic. A brand, a product, and a person's name stay.
const { test, expect } = require('./support/harness');

const SELF = 'ai.local.flow@gmail.com';
const CALL = "Let's have a call Tuesday at 15:00 about the pilot";

function nextNamedDay(name) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = days.indexOf(name);
  const d = new Date();
  let delta = (target - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return String(d.getDate());
}

test('a self-sent remind-me with a collapsed to-me header renders the task', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-live-self-domain',
    threadId: 't-live-self-domain',
    ownEmail: SELF,
    senderName: 'Sali Sapan',
    subject: 'Reminder',
    body: 'Remind me to renew the domain on Friday',
    accountLabel: 'Google Account: Sali Sapan (' + SELF + ')'
  });
  const card = page.locator('[data-legacy-message-id="m-live-self-domain"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('Renew the domain');
  await expect(card.locator('.gs-intent')).not.toHaveText('Schedule It');
  const when = card.locator('[data-glance-when]');
  await expect(when).toBeVisible();
  await expect(when).toContainText(nextNamedDay('friday'));
  const glyphs = await card.locator('[data-glyph]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-glyph')));
  expect(glyphs).toContain('todo');
  expect(glyphs).not.toContain('calendar');
});

test('a call about the pilot is titled from the topic in English', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-live-call-en',
    threadId: 't-live-call-en',
    subject: 'the pilot',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    lang: 'en',
    body: CALL
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-en"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('Call about the pilot');
  await expect(card.locator('.gs-intent')).not.toHaveText('Schedule It');
  const when = card.locator('[data-glance-when]');
  await expect(when).toContainText('15:00');
  await expect(when).toContainText(nextNamedDay('tuesday'));
  const glyphs = await card.locator('[data-glyph]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-glyph')));
  expect(glyphs).toContain('calendar');
  expect(glyphs).toContain('todo');
});

test('a call about the pilot follows a Hebrew UI', async ({ glance }) => {
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-live-call-he',
    threadId: 't-live-call-he',
    subject: 'the pilot',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    lang: 'he',
    body: CALL
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-he"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('שיחה בנושא הפיילוט');
  await expect(card.locator('.gs-intent')).not.toHaveText('Schedule It');
  await expect(card.locator('.gs-intent')).not.toHaveText('שיחה בנושא the pilot');
  const when = card.locator('[data-glance-when]');
  await expect(when).toContainText('15:00');
  await expect(when).toContainText(nextNamedDay('tuesday'));
  const glyphs = await card.locator('[data-glyph]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-glyph')));
  expect(glyphs).toContain('calendar');
  expect(glyphs).toContain('todo');
});

test('a call about the Q4 budget uses the full subject', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-live-call-q4',
    threadId: 't-live-call-q4',
    subject: 'Q4 budget',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    body: "Let's have a call Tuesday at 15:00 about the Q4 budget"
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-q4"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('Call about the Q4 budget');
});

test('a greeting subject uses the topic in the body', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-live-call-hello',
    threadId: 't-live-call-hello',
    subject: 'Hello',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    body: "Let's have a call Tuesday at 15:00 about the Q4 budget"
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-hello"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('Call about the Q4 budget');
});

test('an address subject is Call with the sender', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-live-call-invoice',
    threadId: 't-live-call-invoice',
    subject: 'Invoice from billing@vendor.io',
    senderEmail: 'billing@vendor.io',
    senderName: 'Billing',
    ownEmail: SELF,
    to: [SELF],
    body: "Let's have a call Tuesday at 15:00"
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-invoice"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('Call with Billing');
});

test("Let's meet is not the call topic", async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-live-call-lets',
    threadId: 't-live-call-lets',
    subject: "Let's meet",
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    body: "Let's have a call Tuesday at 15:00"
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-lets"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('Call with Dana');
});

test('a Hebrew subject stays untranslated inside the call frame', async ({ glance }) => {
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-live-call-he-subject',
    threadId: 't-live-call-he-subject',
    subject: 'תקציב הרבעון',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    lang: 'he',
    body: "Let's have a call Tuesday at 15:00"
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-he-subject"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('שיחה בנושא תקציב הרבעון');
});

test('a self-sent negation stays quiet', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-live-self-wont',
    threadId: 't-live-self-wont',
    ownEmail: SELF,
    senderName: 'Sali Sapan',
    subject: 'the pilot',
    body: "We won't have a call Tuesday at 15:00",
    accountLabel: 'Google Account: Sali Sapan (' + SELF + ')'
  });
  const card = page.locator('[data-legacy-message-id="m-live-self-wont"] .flow-chip-host');
  await page.waitForTimeout(2500);
  await expect(card).toHaveCount(0);
});

test('a Hebrew self negation stays quiet', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-live-self-he-wont',
    threadId: 't-live-self-he-wont',
    ownEmail: SELF,
    senderName: 'Sali Sapan',
    subject: 'הפיילוט',
    body: 'לא נעשה שיחה ביום שלישי ב-15:00 על הפיילוט',
    accountLabel: 'Google Account: Sali Sapan (' + SELF + ')'
  });
  const card = page.locator('[data-legacy-message-id="m-live-self-he-wont"] .flow-chip-host');
  await page.waitForTimeout(2500);
  await expect(card).toHaveCount(0);
});

const SUPPLIER = 'billing@vendor.io';
const SUPPLIER_BODY = 'I will book the venue tomorrow';

test('a supplier address in the subject is not self when the stored address differs', async ({ glance }) => {
  await glance.seedGmail({
    googleWebAuth: { accessToken: 'ya29.e2e', expiresAt: Date.now() + 60 * 60 * 1000, loginHint: SELF },
    googleProfile: { displayName: 'Sali Sapan', givenName: 'Sali', surname: 'Sapan', email: SELF }
  });
  const page = await glance.openGmail({
    messageId: 'm-supplier-stored',
    threadId: 't-supplier-stored',
    subject: 'Invoice from ' + SUPPLIER,
    titleEmail: SUPPLIER,
    senderEmail: SUPPLIER,
    senderName: 'Billing',
    ownEmail: SELF,
    to: [SELF],
    accountLabel: 'Google Account: Vendor (' + SUPPLIER + ')',
    body: SUPPLIER_BODY
  });
  const card = page.locator('[data-legacy-message-id="m-supplier-stored"] .flow-chip-host');
  await page.waitForTimeout(2500);
  await expect(card).toHaveCount(0);
  await expect(page.locator('.gs-intent')).toHaveCount(0);
});

test('a supplier address in the subject is not self when only the account button is known', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-supplier-button',
    threadId: 't-supplier-button',
    subject: 'Invoice from ' + SUPPLIER,
    titleEmail: SUPPLIER,
    senderEmail: SUPPLIER,
    senderName: 'Billing',
    ownEmail: SELF,
    to: [SELF],
    accountLabel: 'Google Account: Sali Sapan (' + SELF + ')',
    body: SUPPLIER_BODY
  });
  const card = page.locator('[data-legacy-message-id="m-supplier-button"] .flow-chip-host');
  await page.waitForTimeout(2500);
  await expect(card).toHaveCount(0);
});

test('no stored address and no account button is names-pending, not self', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-supplier-none',
    threadId: 't-supplier-none',
    subject: 'Invoice from ' + SUPPLIER,
    titleEmail: SUPPLIER,
    senderEmail: SUPPLIER,
    senderName: 'Billing',
    ownEmail: SELF,
    to: [SELF],
    accountLabel: false,
    body: SUPPLIER_BODY
  });
  const host = page.locator('[data-legacy-message-id="m-supplier-none"]');
  await expect(host.locator('.flow-chip-host')).toHaveCount(0);
  await expect(host.locator('.flow-why-not')).toHaveText('Waiting for your name');
});
