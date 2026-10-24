// A supplier asking to confirm a delivery date is a reply card, not silence,
// whatever the subject says (an invoice for a street address). Headless
// Chromium, fixtures only.
const { test, expect } = require('./support/harness');

const SELF = 'ai.local.flow@gmail.com';

test('"Please confirm the delivery date" under an address subject shows a reply card', async ({ glance }) => {
  await glance.seedGmail({});
  const page = await glance.openGmail({
    messageId: 'm-supplier', threadId: 't-supplier', subject: 'Invoice for 12 Herzl St, Tel Aviv',
    senderEmail: 'dana@supplier.co.il', senderName: 'Dana Levi', ownEmail: SELF, to: [SELF], lang: 'en',
    body: 'Please confirm the delivery date'
  });
  const card = page.locator('[data-legacy-message-id="m-supplier"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card.locator('.gs-intent')).toContainText('Reply');
});
