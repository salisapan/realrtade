const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const KNOWN = ['Sali', 'Sali Sapan', 'סאלי'];
const SALI_ASK = 'Hi Sali,\n\nCould you review the pilot proposal and confirm by Wednesday?\n';
const HEBREW_ASK = 'היי סאלי, בבקשה תעדכן אותי עד יום חמישי.';

test('a Glance display name still offers when the mail greets Sali', async ({ glance }) => {
  await glance.seedOutlook({ glanceOwnNames: KNOWN });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceOwnSali',
    subject: 'Pilot proposal',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: SALI_ASK
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('a Latin display name still offers when the mail greets סאלי', async ({ glance }) => {
  await glance.seedOutlook({ glanceOwnNames: ['סאלי'] }, { name: 'Sali Sapan' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceOwnHebrew',
    subject: 'עדכון',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: HEBREW_ASK
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Gmail offers היי סאלי when the me chip says Sali Sapan and known names include סאלי', async ({ glance }) => {
  await glance.seedGmail({ glanceOwnNames: ['סאלי'] });
  const page = await glance.openGmail({
    messageId: 'm-own-hebrew',
    threadId: 't-own-hebrew',
    subject: 'עדכון',
    senderEmail: S.SENDER,
    senderName: 'flow',
    userName: 'Sali Sapan',
    to: [S.GMAIL_ME],
    body: HEBREW_ASK
  });
  await expect(page.locator('div[role="main"] .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Gmail offers Hi Sali when the me chip says Glance and known names include Sali', async ({ glance }) => {
  await glance.seedGmail({ glanceOwnNames: KNOWN });
  const page = await glance.openGmail({
    messageId: 'm-own-sali',
    threadId: 't-own-sali',
    subject: 'Pilot proposal',
    senderEmail: S.SENDER,
    senderName: 'flow',
    userName: 'Glance',
    to: [S.GMAIL_ME],
    body: SALI_ASK
  });
  await expect(page.locator('div[role="main"] .flow-chip-host button.flow-chip')).toBeVisible();
});
