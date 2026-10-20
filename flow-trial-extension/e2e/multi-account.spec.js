// Two Gmail accounts in one extension. The account button is this tab.
// The stored userinfo address is the other account, and it does not
// turn Sali's outgoing mail into a reply.
const { test, expect } = require('./support/harness');

const HOME = 'sali.home@gmail.com';
const WORK = 'sali.work@gmail.com';
const DANA = 'dana@acme.com';
const ASK = 'Could you review the deck and reply with your comments?';

function seedHome(glance) {
  return glance.seedGmail({
    googleProfile: { displayName: 'Sali Sapan', givenName: 'Sali', surname: 'Sapan', email: HOME },
    googleWebAuth: { accessToken: 'ya29.e2e', expiresAt: Date.now() + 60 * 60 * 1000, loginHint: HOME }
  });
}

test('mail/u/0 uses the account button when it matches the stored address', async ({ glance }) => {
  await seedHome(glance);
  const page = await glance.openGmail({
    accountIndex: 0,
    messageId: 'm-u0-in',
    threadId: 't-u0-in',
    subject: 'Deck',
    senderEmail: DANA,
    senderName: 'Dana',
    ownEmail: HOME,
    to: [HOME],
    accountLabel: 'Google Account: Sali Sapan (' + HOME + ')',
    body: ASK
  });
  const card = page.locator('[data-legacy-message-id="m-u0-in"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card.locator('.gs-intent')).toContainText('Reply');
});

test('mail/u/1 outgoing mail from the second account has no Reply card', async ({ glance }) => {
  await seedHome(glance);
  const page = await glance.openGmail({
    accountIndex: 1,
    messageId: 'm-u1-out',
    threadId: 't-u1-out',
    subject: 'Deck',
    senderEmail: WORK,
    senderName: 'Sali',
    ownEmail: WORK,
    to: [DANA],
    accountLabel: 'Google Account: Sali (' + WORK + ')',
    body: ASK
  });
  const row = page.locator('[data-legacy-message-id="m-u1-out"]');
  await page.waitForTimeout(2500);
  await expect(row.locator('.flow-chip-host')).toHaveCount(0);
  await expect(page.locator('.gs-intent')).toHaveCount(0);
  await expect(row.locator('.flow-why-not')).toHaveCount(0);
});
