// David's live Gate, two misses. Headless Chromium, fixtures only.
// A self-sent note whose recipient chip is the collapsed "to me" span
// (no email attribute) is the task Renew the domain, due Friday.
// A call at a clock about a topic keeps the calendar and the task.
// The card title is Call about the pilot, and a Hebrew UI says
// שיחה בנושא הפילוט. Schedule It is not that title.
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
    subject: 'Pilot',
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
    subject: 'Pilot',
    senderEmail: 'dana@acme.io',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    lang: 'he',
    body: CALL
  });
  const card = page.locator('[data-legacy-message-id="m-live-call-he"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toHaveText('שיחה בנושא הפילוט');
  await expect(card.locator('.gs-intent')).not.toHaveText('Schedule It');
  await expect(card.locator('.gs-intent')).not.toHaveText('Call about the pilot');
  const when = card.locator('[data-glance-when]');
  await expect(when).toContainText('15:00');
  await expect(when).toContainText(nextNamedDay('tuesday'));
  const glyphs = await card.locator('[data-glyph]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-glyph')));
  expect(glyphs).toContain('calendar');
  expect(glyphs).toContain('todo');
});
