// Live Gate on 36ae877 — three engineer-verified fixes (content-gmail.js only).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const OTHER = 'glance.salisapan@outlook.com';
const ASK = 'Please save the attached pdf to Drive.';
const GMAIL_REDIRECT_OFek = 'https://www.google.com/url?q=http://ofek.dev&source=gmail&ust=1792459637319000&usg=AOvVaw1HPvAdPiNszcpLxyGDkTuA&sa=E';
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

test('L36 self bare אליי header still gets a subject-only task card', async ({ glance }) => {
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-self-alei',
    threadId: 't-self-alei',
    ownEmail: SELF,
    senderName: 'flow',
    subject: 'Remind me to renew the domain on Friday',
    body: '',
    toSelfText: 'אליי',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  await page.waitForTimeout(3500);
  await expect(page.locator('[data-legacy-message-id="m-self-alei"] .flow-chip-host')).toHaveCount(1);
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
    body: 'תזכיר לי לחדש את הדומיין ' + GMAIL_REDIRECT_OFek + ' ביום שישי',
    toSelfText: 'אני',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  await hePage.waitForTimeout(3500);
  const heHost = hePage.locator('[data-legacy-message-id="m-self-he"] .flow-chip-host');
  await expect(heHost).toHaveCount(1);
  await expect(heHost).toContainText('לחדש את הדומיין ofek.dev');
  await expect(heHost).not.toContainText('&source=gmail');
});

test('L36 self renew unwraps google.com/url in the task title', async ({ glance }) => {
  await glance.seedGmail();
  const page = await glance.openGmail({
    liveSelf: true,
    messageId: 'm-self-url',
    threadId: 't-self-url',
    ownEmail: SELF,
    senderName: 'flow',
    subject: 'Domain renewal – Ofek',
    body: 'Remind me to renew the ' + GMAIL_REDIRECT_OFek,
    toSelfText: 'me',
    accountLabel: 'Google Account: flow (' + SELF + ')'
  });
  await page.waitForTimeout(3500);
  const host = page.locator('[data-legacy-message-id="m-self-url"] .flow-chip-host');
  await expect(host).toHaveCount(1);
  await expect(host).toContainText('Renew ofek.dev');
  await expect(host).not.toContainText('google.com/url');
  await expect(host).not.toContainText('&source=gmail');
});

test.describe('self completion vs open work', () => {
  const selfOpen = async (glance, id, subject, body, lang) => {
    const page = await glance.openGmail({
      liveSelf: true,
      messageId: 'm-' + id,
      threadId: 't-' + id,
      ownEmail: SELF,
      senderName: 'flow',
      subject: subject,
      body: body,
      lang: lang || 'en',
      toSelfText: lang === 'he' ? 'אני' : 'me',
      accountLabel: 'Google Account: flow (' + SELF + ')'
    });
    await page.waitForTimeout(3500);
    return page;
  };

  test('EN: Domain renewal done in the subject stays quiet', async ({ glance }) => {
    await glance.seedGmail();
    const page = await selfOpen(glance, 'done-en', 'Domain renewal done – Ofek', '');
    await expect(page.locator('[data-legacy-message-id="m-done-en"] .flow-chip-host')).toHaveCount(0);
  });

  test('HE: בוצע in the subject stays quiet', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he' });
    const page = await selfOpen(glance, 'done-he', 'חידוש דומיין בוצע – אופק', '', 'he');
    await expect(page.locator('[data-legacy-message-id="m-done-he"] .flow-chip-host')).toHaveCount(0);
  });

  test('EN: get it done / needs to be done / done by Friday still get a card', async ({ glance }) => {
    await glance.seedGmail();
    const cases = [
      ['keep-get', 'note', 'Please get it done before the board meeting'],
      ['keep-needs', 'note', 'This needs to be done by Friday'],
      ['keep-by', 'note', 'Send the pack — to be done by Friday']
    ];
    for (const [id, sub, body] of cases) {
      const page = await selfOpen(glance, id, sub, body);
      await expect(page.locator('[data-legacy-message-id="m-' + id + '"] .flow-chip-host')).toHaveCount(1);
    }
  });

  test('HE: צריך לבצע still gets a card', async ({ glance }) => {
    await glance.seedGmail({ glanceUiLanguage: 'he' });
    const page = await selfOpen(glance, 'keep-he', 'תשלום', 'צריך לבצע את התשלום עד יום שישי', 'he');
    await expect(page.locator('[data-legacy-message-id="m-keep-he"] .flow-chip-host')).toHaveCount(1);
  });
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
