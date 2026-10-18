// A Drive save that cannot start says why on the File row. It does not hide
// behind the skipped draft step. A file name with a colon still saves.
// Headless Chromium, a local Google server, fixtures only.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const ASK = 'Please save the attached pdf to Drive.';
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function run(glance, lang, id, download, route) {
  await glance.context.route('https://mail.googleusercontent.com/**', route);
  await glance.seedGmail(lang === 'he' ? { glanceUiLanguage: 'he' } : {});
  const page = await glance.openGmail({
    messageId: 'm-' + id, threadId: 't-' + id, subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: lang,
    body: ASK, downloadUrl: download
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  return page;
}

const uploads = () => server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/upload/drive/v3/files') >= 0);
const unreadable = (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' });
const pdf = (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-e2e') });
const URL_ = 'https://mail.googleusercontent.com/e2e/board.pdf';

test('an attachment Gmail will not hand over says so on the File row, in English', async ({ glance }) => {
  const page = await run(glance, 'en', 'dr-en', 'application/pdf:board.pdf:' + URL_, unreadable);
  const file = page.locator('li[data-step-id="file"]');
  await expect(file).toContainText('Could not read the attachment from Gmail', { timeout: 15000 });
  await expect(page.locator('li[data-step-id="draft"]')).toContainText('earlier step');
  expect(uploads()).toHaveLength(0);
});

test('an attachment Gmail will not hand over says so on the File row, in Hebrew', async ({ glance }) => {
  const page = await run(glance, 'he', 'dr-he', 'application/pdf:board.pdf:' + URL_, unreadable);
  await expect(page.locator('li[data-step-id="file"]')).toContainText('לא הצלחתי לקרוא את הקובץ המצורף', { timeout: 15000 });
  const draft = page.locator('li[data-step-id="draft"]');
  await expect(draft).not.toContainText('Skipped');
  await expect(draft).not.toContainText('earlier step');
  await expect(draft).toContainText('דולג');
  expect(uploads()).toHaveLength(0);
});

test('a file over the Drive limit says so before anything is sent', async ({ glance }) => {
  const big = (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.alloc(5 * 1024 * 1024, 1) });
  const page = await run(glance, 'en', 'dr-big', 'application/pdf:board.pdf:' + URL_, big);
  await expect(page.locator('li[data-step-id="file"]')).toContainText('over 4 MB', { timeout: 15000 });
  expect(uploads()).toHaveLength(0);
});

test('a file name with a colon still saves to Drive', async ({ glance }) => {
  const page = await run(glance, 'en', 'dr-colon', 'application/pdf:Q3: board pack.pdf:' + URL_, pdf);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(uploads()).toHaveLength(1);
});
