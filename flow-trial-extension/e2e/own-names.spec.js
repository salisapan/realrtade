const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const SALI_ASK = 'Hi Sali,\n\nCould you review the pilot proposal and confirm by Wednesday?\n';
const HEBREW_ASK = 'היי סאלי, בבקשה תעדכן אותי עד יום חמישי.';
const DANA_ASK = 'Hi Dana,\n\nCould you review the pilot proposal and confirm by Wednesday?\n';
const GIVEN_SALI = { glanceOwnNames: [], googleProfile: { displayName: 'Sali Sapan', givenName: 'Sali', surname: 'Sapan' } };

test('Gmail offers Hi Sali from display name Glance plus Google given_name Sali', async ({ glance }) => {
  await glance.seedGmail(GIVEN_SALI);
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

test('Gmail offers היי סאלי from display name Glance plus Google given_name Sali', async ({ glance }) => {
  await glance.seedGmail(GIVEN_SALI);
  const page = await glance.openGmail({
    messageId: 'm-own-hebrew',
    threadId: 't-own-hebrew',
    subject: 'עדכון',
    senderEmail: S.SENDER,
    senderName: 'flow',
    userName: 'Glance',
    to: [S.GMAIL_ME],
    body: HEBREW_ASK
  });
  await expect(page.locator('div[role="main"] .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Gmail stays quiet on Hi Dana when the given name is Sali', async ({ glance }) => {
  await glance.seedGmail(GIVEN_SALI);
  const page = await glance.openGmail({
    messageId: 'm-own-dana',
    threadId: 't-own-dana',
    subject: 'Pilot proposal',
    senderEmail: S.SENDER,
    senderName: 'flow',
    userName: 'Glance',
    to: [S.GMAIL_ME],
    body: DANA_ASK
  });
  await page.waitForTimeout(2500);
  await expect(page.locator('div[role="main"] .flow-chip-host button.flow-chip')).toHaveCount(0);
});

test('Gmail offers היי סאלי when the me chip is only Sali Sapan', async ({ glance }) => {
  await glance.seedGmail({ glanceOwnNames: [], googleProfile: null });
  const page = await glance.openGmail({
    messageId: 'm-own-sapan',
    threadId: 't-own-sapan',
    subject: 'עדכון',
    senderEmail: S.SENDER,
    senderName: 'flow',
    userName: 'Sali Sapan',
    to: [S.GMAIL_ME],
    body: HEBREW_ASK
  });
  await expect(page.locator('div[role="main"] .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Outlook offers Hi Sali from display name Glance plus Graph givenName Sali', async ({ glance }) => {
  await glance.seedOutlook({ glanceOwnNames: [] }, { name: 'Glance', givenName: 'Sali', surname: 'Sapan' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceOwnSali',
    subject: 'Pilot proposal',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: SALI_ASK
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Outlook offers היי סאלי from display name Glance plus Graph givenName Sali', async ({ glance }) => {
  await glance.seedOutlook({ glanceOwnNames: [] }, { name: 'Glance', givenName: 'Sali', surname: 'Sapan' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceOwnHebrew',
    subject: 'עדכון',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: HEBREW_ASK
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Outlook offers היי סאלי when the account name is only Sali Sapan', async ({ glance }) => {
  await glance.seedOutlook({ glanceOwnNames: [] }, { name: 'Sali Sapan' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceOwnSapan',
    subject: 'עדכון',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: HEBREW_ASK
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('Outlook stays quiet on Hi Dana when the given name is Sali', async ({ glance }) => {
  await glance.seedOutlook({ glanceOwnNames: [] }, { name: 'Glance', givenName: 'Sali', surname: 'Sapan' });
  const page = await glance.openOutlook({
    id: 'AQMkGlanceOwnDana',
    subject: 'Pilot proposal',
    senderEmail: S.SENDER,
    senderName: 'flow',
    body: DANA_ASK
  });
  await page.waitForTimeout(2500);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toHaveCount(0);
});
