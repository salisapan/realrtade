// A note to yourself can be only a subject line. The subject is the note,
// on Gmail and on Outlook. Someone else's subject-only mail stays quiet.
// Headless Chromium, fixtures only.
const { test, expect } = require('./support/harness');

const S = require('./support/sentences');
const SELF = 'ai.local.flow@gmail.com';
const SUBJECT = 'Remind me to renew the domain on Friday';

test('Gmail: a subject-only note to self is the task Renew the domain', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true, messageId: 'm-subj-self', threadId: 't-subj-self', ownEmail: SELF,
    senderName: 'Sali Sapan', subject: SUBJECT, body: '',
    accountLabel: 'Google Account: Sali Sapan (' + SELF + ')'
  });
  const card = page.locator('[data-legacy-message-id="m-subj-self"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 6000 });
  await expect(card.locator('.gs-intent')).toHaveText('Renew the domain');
});

test('Gmail: a subject-only mail from someone else stays quiet', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    messageId: 'm-subj-other', threadId: 't-subj-other', ownEmail: SELF, to: [SELF],
    senderEmail: 'dana@acme.io', senderName: 'Dana', subject: SUBJECT, body: ''
  });
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-legacy-message-id="m-subj-other"] .flow-chip-host')).toHaveCount(0);
});

test('Outlook: a subject-only note to self is the task Renew the domain', async ({ glance }) => {
  await glance.seedOutlook({}, {});
  await glance.setScenario({ inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] });
  const page = await glance.openOutlook({
    id: 'AQMkSubjSelf', subject: SUBJECT, senderEmail: S.ME, to: [S.ME], body: ''
  });
  const card = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toContainText('Renew the domain');
});

const PAST = [
  ['en-body', 'I already renewed the insurance, you can delete the reminder', ''],
  ['he-body', 'כבר חידשתי את הביטוח, אפשר למחוק את התזכורת', ''],
  ['en-sent', 'I already sent the report to Dana yesterday', ''],
  ['en-subject', 'I already renewed the insurance, delete the reminder', ''],
  ['he-subject', 'כבר חידשתי את הביטוח, אפשר למחוק את התזכורת', '']
];

PAST.forEach(([key, first, second]) => {
  const inSubject = key.indexOf('subject') >= 0;
  test('Gmail: a past tense note to self (' + key + ') gets no card', async ({ glance }) => {
    await glance.seedGmail();
    const id = 'm-past-' + key;
    const page = await glance.openGmail({
      liveSelf: true, messageId: id, threadId: 't-' + id, ownEmail: SELF,
      senderName: 'Sali Sapan', subject: inSubject ? first : 'note', body: inSubject ? second : first,
      accountLabel: 'Google Account: Sali Sapan (' + SELF + ')'
    });
    await page.waitForTimeout(2500);
    await expect(page.locator('[data-legacy-message-id="' + id + '"] .flow-chip-host')).toHaveCount(0);
  });
});

test('Gmail: a past clause with a future ask is still the task', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true, messageId: 'm-past-then', threadId: 't-past-then', ownEmail: SELF,
    senderName: 'Sali Sapan', subject: 'note',
    body: 'I already renewed the insurance. Remind me to renew the car insurance on Friday',
    accountLabel: 'Google Account: Sali Sapan (' + SELF + ')'
  });
  const card = page.locator('[data-legacy-message-id="m-past-then"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 6000 });
  await expect(card.locator('.gs-intent')).toHaveText('Renew the car insurance');
});

test('Outlook: a past tense note to self gets no card', async ({ glance }) => {
  await glance.seedOutlook({}, {});
  await glance.setScenario({ inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] });
  const page = await glance.openOutlook({
    id: 'AQMkPastSelf', subject: 'note', senderEmail: S.ME, to: [S.ME], body: 'I already renewed the insurance, you can delete the reminder'
  });
  await page.waitForTimeout(3500);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(0);
});
