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

async function run(glance, lang, id, download) {
  await glance.seedGmail(lang === 'he' ? { glanceUiLanguage: 'he' } : {});
  const page = await glance.openGmail({
    messageId: 'm-' + id, threadId: 't-' + id, subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: lang,
    body: ASK, downloadUrl: download,
    composeReply: true, composeTo: 'dana@acme.io', composeSubject: 'Re: Board pack'
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  return page;
}

const uploads = () => server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/upload/drive/v3/files') >= 0);
const GONE = 'https://mail.google.com/e2e/att/gone.pdf';
const BOARD = 'https://mail.google.com/e2e/att/board.pdf';
const BIG = 'https://mail.google.com/e2e/att/big.pdf';

test('an attachment Gmail will not hand over says so on the File row, in English', async ({ glance }) => {
  const page = await run(glance, 'en', 'dr-en', 'application/pdf:board.pdf:' + GONE);
  const file = page.locator('li[data-step-id="file"]');
  await expect(file).toContainText('Could not read the attachment from Gmail', { timeout: 15000 });
  await expect(page.locator('li[data-step-id="draft"]')).toContainText('earlier step');
  expect(uploads()).toHaveLength(0);
});

test('an attachment Gmail will not hand over says so on the File row, in Hebrew', async ({ glance }) => {
  const page = await run(glance, 'he', 'dr-he', 'application/pdf:board.pdf:' + GONE);
  await expect(page.locator('li[data-step-id="file"]')).toContainText('לא הצלחתי לקרוא את הקובץ המצורף', { timeout: 15000 });
  const draft = page.locator('li[data-step-id="draft"]');
  await expect(draft).not.toContainText('Skipped');
  await expect(draft).not.toContainText('earlier step');
  await expect(draft).toContainText('דולג');
  expect(uploads()).toHaveLength(0);
});

test('a file over the Drive limit says so before anything is sent', async ({ glance }) => {
  const page = await run(glance, 'en', 'dr-big', 'application/pdf:board.pdf:' + BIG);
  await expect(page.locator('li[data-step-id="file"]')).toContainText('over 4 MB', { timeout: 15000 });
  expect(uploads()).toHaveLength(0);
});

test('a file name with a colon still saves to Drive', async ({ glance }) => {
  const page = await run(glance, 'en', 'dr-colon', 'application/pdf:Q3: board pack.pdf:' + BOARD);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(uploads()).toHaveLength(1);
});

test('a Drive save receipt is Hebrew in a Hebrew UI, with no English status line', async ({ glance }) => {
  const page = await run(glance, 'he', 'dr-he-ok', 'application/pdf:board.pdf:' + BOARD);
  const done = page.locator('div[role="main"] .flow-chip-done');
  await expect(done).toBeVisible({ timeout: 20000 });
  const text = await done.innerText();
  expect(text).toContain('נסגר — נשמר הקובץ.');
  expect(text).not.toContain('Closed');
  const latin = (text.replace(/[\w.+-]+@[\w.-]+/g, ' ').replace(/Glance|Google|Gmail|Drive|OneDrive|Outlook|board\.pdf/g, ' ').match(/[A-Za-z][A-Za-z'’]{3,}/g) || []);
  expect(latin).toEqual([]);
});
