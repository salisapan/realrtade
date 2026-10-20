// G146-1: a new mail is opened beside the inbox list. Those rows are
// listitems with no message body. The card belongs on the opened mail
// within 3s, including after a reload of that same thread.
// G146-6: a Hebrew sync meeting shows within 3s. The title is the hold
// line (שריין plus the day and clock). The primary button stays בצע.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const OPEN_BODY = 'פגישת עבודה ביום ד׳ ב-14:30?';

test('a new Gmail mail shows a card within 3s, including after reload', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-g146-1',
    threadId: 't-g146-1',
    subject: 'G146-1',
    senderEmail: 'salisapan1@gmail.com',
    senderName: 'salisapan1',
    ownEmail: 'ai.local.flow@gmail.com',
    to: ['ai.local.flow@gmail.com'],
    body: OPEN_BODY,
    threadBesideInbox: true
  });
  const card = page.locator('[data-legacy-message-id="m-g146-1"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 3000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(card).toBeVisible({ timeout: 3000 });
});

test('a Hebrew sync meeting shows the hold line and the chrome follows the page', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: 'AQMkGlanceSyncTitle',
    subject: 'סנכרון',
    senderEmail: 'dana@acme.com',
    senderName: 'Dana',
    to: [S.ME],
    lang: 'he',
    body: 'תשמור לי את הזמן לפגישת סנכרון ביום חמישי ב-11:00'
  });
  const card = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 3000 });
  await expect(card.locator('.gs-intent')).toHaveText('שריין ה׳ 11:00');
  await expect(card.locator('.gs-intent-label')).toHaveText('כוונה שזוהתה');
  await expect(card.locator('.doit-dark')).toHaveText('בצע');
});
