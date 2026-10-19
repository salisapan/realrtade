// Live Gate on 36ae877 — three engineer-verified fixes (content-gmail.js only).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const OTHER = 'glance.salisapan@outlook.com';
const ASK = 'Please save the attached pdf to Drive.';
const chip = (page) => page.locator('div[role="main"] .flow-chip-host');
const needsYou = (page) => page.locator('div[role="main"] [data-glance-chain="needs-you"]');
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  if (!server) return;
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

test('L36 Cc-only: collapsed To without the account stays quiet; details expand withdraws a late bubble', async ({ glance }) => {
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-l36-cc',
    threadId: 't-l36-cc',
    subject: 'דוח רבעון שלישי – ליבנה',
    senderEmail: 'dana@acme.com',
    senderName: 'Dana',
    ownEmail: SELF,
    lang: 'he',
    body: 'Can you send me the report',
    detailsTable: { expanded: false, hebrew: true, bidi: true, to: [OTHER], cc: [SELF] }
  });
  await page.waitForTimeout(3000);
  await expect(chip(page)).toHaveCount(0);
  await expect(needsYou(page)).toHaveCount(0);
  const toggle = page.locator('[aria-label="הצג פרטים"], [aria-label="הצגת פרטים"], span.ajy');
  if (await toggle.count()) await toggle.first().click();
  await page.waitForTimeout(800);
  await expect(needsYou(page)).toHaveCount(0);
  await expect(page.locator('div[role="main"]')).not.toContainText('לא מצאתי את');
});

test('L36 self EN subject-only Domain renewal gets a task card', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-self-en',
    threadId: 't-self-en',
    ownEmail: SELF,
    senderName: 'flow',
    subject: 'Domain renewal – Ofek',
    body: '',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  await page.waitForTimeout(3500);
  await expect(page.locator('[data-legacy-message-id="m-self-en"] .flow-chip-host')).toHaveCount(1);
});

test('L36 self HE אני header + subject renewal gets a task card', async ({ glance }) => {
  await glance.seedGmail();
  const hePage = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-self-he',
    threadId: 't-self-he',
    ownEmail: SELF,
    senderName: 'flow',
    subject: 'חידוש דומיין אופק',
    body: 'חידוש דומיין אופק\nhttp://google.com/url?q=http://ofek.dev',
    toSelfText: 'אני',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  await hePage.waitForTimeout(3500);
  await expect(hePage.locator('[data-legacy-message-id="m-self-he"] .flow-chip-host')).toHaveCount(1);
});

test('L36 Drive save decodes a percent-encoded Hebrew filename in the receipt', async ({ glance }) => {
  const hebrew = 'חוזה-ברוש.pdf';
  const encoded = encodeURIComponent(hebrew);
  const download = 'application/pdf:' + encoded + ':https://mail.google.com/e2e/att/board.pdf';
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-l36-drive',
    threadId: 't-l36-drive',
    subject: 'לשמור את הקובץ',
    senderEmail: 'dana@acme.com',
    senderName: 'Dana',
    ownEmail: SELF,
    to: [SELF],
    lang: 'he',
    body: ASK,
    downloadUrl: download,
    composeReply: true,
    composeTo: 'dana@acme.io',
    composeSubject: 'Re: לשמור את הקובץ'
  });
  const c = page.locator('div[role="main"] button.flow-chip');
  await expect(c).toBeVisible({ timeout: 20000 });
  await c.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('div[role="main"]')).toContainText(hebrew);
  await expect(page.locator('div[role="main"]')).not.toContainText(encoded);
});
