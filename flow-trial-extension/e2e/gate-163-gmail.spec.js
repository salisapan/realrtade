// David's Gate on #163, Gmail fixtures. The account is ai.local.flow.
// The mail comes from glance.salisapan. Headless Chromium, fixtures only.
// Any console error or unhandled rejection on this path fails the test.
const { test, expect } = require('./support/harness');

const OWN = 'ai.local.flow@gmail.com';
const FROM = 'glance.salisapan@outlook.com';
const ATTACH = 'please attach the contract to the invite';
const HI = 'Hi Sali,\n\nCould you review the pilot proposal and confirm by Wednesday?\n';
const REPLY = 'please reply by tomorrow at 11:00';

function since(glance) {
  const start = glance.consoleErrors.length;
  return function () {
    const fresh = glance.consoleErrors.slice(start);
    expect(fresh, fresh.join('\n')).toEqual([]);
  };
}

function mail(opts) {
  return Object.assign({
    senderEmail: FROM,
    senderName: 'glance.salisapan',
    ownEmail: OWN,
    to: [OWN],
    subject: 'Gate163'
  }, opts);
}

test('an inbound attach-to-invite shows the task and the short draft', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail();
  const page = await glance.openGmail(mail({
    messageId: 'm-gate163-attach',
    threadId: 't-gate163-attach',
    body: ATTACH
  }));
  const card = page.locator('[data-legacy-message-id="m-gate163-attach"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card).toContainText('Attach contract to invite');
  await expect(card).toContainText("I'll attach it shortly.");
  await expect(card).toHaveAttribute('data-glance-task', 'Attach contract to invite');
  await expect(card).toHaveAttribute('data-glance-draft', "I'll attach it shortly.");
  clean();
});

test('Hi Sali with no loaded name shows names-pending', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail({ glanceOwnNames: [], googleProfile: null });
  const page = await glance.openGmail(mail({
    messageId: 'm-gate163-hi',
    threadId: 't-gate163-hi',
    body: HI
  }));
  const why = page.locator('[data-legacy-message-id="m-gate163-hi"] .flow-why-not');
  await expect(why).toBeVisible({ timeout: 4000 });
  await expect(why).toHaveAttribute('data-glance-why', 'names-pending');
  await expect(why).toHaveText('Waiting for your name');
  await expect(page.locator('[data-legacy-message-id="m-gate163-hi"] .flow-chip-host')).toHaveCount(0);
  const worker = glance.context.serviceWorkers()[0];
  const stored = await worker.evaluate(async () => {
    return chrome.storage.local.get({ glanceWhyCurrent: null, glanceOwnNames: [], googleProfile: null });
  });
  expect(stored.glanceWhyCurrent && stored.glanceWhyCurrent.reason).toBe('names-pending');
  expect(stored.glanceOwnNames || []).toEqual([]);
  expect(stored.googleProfile || null).toBeNull();
  clean();
});

test('Hi Sali stays quiet when the stored name is not Sali', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail({
    glanceOwnNames: ['Flow'],
    googleProfile: { displayName: 'Flow', givenName: 'Flow', surname: '' }
  });
  const page = await glance.openGmail(mail({
    messageId: 'm-gate163-flow',
    threadId: 't-gate163-flow',
    body: HI
  }));
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-legacy-message-id="m-gate163-flow"] .flow-chip-host')).toHaveCount(0);
  await expect(page.locator('[data-legacy-message-id="m-gate163-flow"] .flow-why-not')).toHaveCount(0);
  clean();
});

test('Gmail chrome follows the page language, including the card date', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail();
  const english = await glance.openGmail(mail({
    messageId: 'm-gate163-en',
    threadId: 't-gate163-en',
    body: REPLY
  }));
  const enCard = english.locator('[data-legacy-message-id="m-gate163-en"] .flow-chip-host');
  await expect(enCard).toBeVisible({ timeout: 4000 });
  await expect(enCard.locator('.gs-intent-label')).toHaveText('Detected intent');
  await expect(enCard.locator('[data-glance-when]')).toContainText('Oct');
  await english.close();

  const hebrew = await glance.openGmail(mail({
    messageId: 'm-gate163-he',
    threadId: 't-gate163-he',
    lang: 'he',
    body: REPLY
  }));
  const heCard = hebrew.locator('[data-legacy-message-id="m-gate163-he"] .flow-chip-host');
  await expect(heCard).toBeVisible({ timeout: 4000 });
  await expect(heCard.locator('.gs-intent-label')).toHaveText('כוונה שזוהתה');
  await expect(heCard.locator('[data-glance-when]')).toContainText('באוק׳');
  await expect(heCard.locator('[data-glance-when]')).not.toContainText('Oct');
  clean();
});

test('no token, account aria-label Sali Sapan, Hi Sali offers within 3s', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail({ glanceOwnNames: [], googleProfile: null });
  const worker = glance.context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    await chrome.storage.local.remove(['googleWebAuth']);
  });
  const page = await glance.openGmail(mail({
    messageId: 'm-gate163-aria',
    threadId: 't-gate163-aria',
    accountLabel: 'Google Account: Sali Sapan (ai.local.flow@gmail.com)',
    body: HI
  }));
  const card = page.locator('[data-legacy-message-id="m-gate163-aria"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 3000 });
  clean();
});

test('with no names at all a judgment arrives after 2s', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail({ glanceOwnNames: [], googleProfile: null });
  const worker = glance.context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    await chrome.storage.local.remove(['googleWebAuth']);
  });
  const page = await glance.openGmail(mail({
    messageId: 'm-gate163-noname',
    threadId: 't-gate163-noname',
    body: HI
  }));
  const row = page.locator('[data-legacy-message-id="m-gate163-noname"]');
  await expect(row.locator('.flow-why-not')).toBeVisible({ timeout: 1500 });
  await expect(row.locator('.flow-why-not')).toHaveAttribute('data-glance-why', 'names-pending');
  const seen = Date.now();
  await expect(row).toHaveAttribute('data-glance-names', 'quiet', { timeout: 4000 });
  expect(Date.now() - seen).toBeGreaterThanOrEqual(1500);
  await expect(row.locator('.flow-chip-host')).toHaveCount(0);
  await expect(row.locator('.flow-why-not')).toHaveCount(0);
  clean();
});

test('the Gmail path has no console error or unhandled rejection', async ({ glance }) => {
  const clean = since(glance);
  await glance.seedGmail({ glanceOwnNames: [], googleProfile: null });
  const page = await glance.openGmail(mail({
    messageId: 'm-gate163-quiet',
    threadId: 't-gate163-quiet',
    body: 'Thanks so much for the call. Let me know if you have any questions.'
  }));
  await page.waitForTimeout(1200);
  await expect(page.locator('.flow-chip-host')).toHaveCount(0);
  clean();
});
