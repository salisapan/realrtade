// G8 Google Contacts on the Gmail card: GOOGLE_CONTACTS off/on, People search stub, compose DOM read-back.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const ASK = "What's Dana's email?";
const FWD = 'send this to Dana';
const CARD_ANSWER = "Answer with Dana's address";
const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
const BASE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
];

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

function granted(extra) {
  const scopes = BASE_SCOPES.concat(extra || []).slice().sort();
  return {
    version: scopes.join('\n'),
    status: 'granted',
    source: 'chrome',
    at: Date.now()
  };
}

async function open(glance, switches, body, id) {
  const scopes = switches && switches.GOOGLE_CONTACTS ? [CONTACTS_SCOPE] : [];
  await glance.seedGmail({
    glanceSwitches: switches || {},
    googleGrantedScopes: granted(scopes)
  });
  return glance.openGmail({
    messageId: 'm-' + id,
    threadId: 't-' + id,
    subject: 'Question',
    senderEmail: 'asker@example.com',
    senderName: 'Asker',
    body,
    composeReply: true,
    composeTo: 'asker@example.com',
    composeSubject: 'Re: Question'
  });
}

const peopleCalls = () => server.calls.filter((c) => c.method === 'GET' && /people:searchContacts/.test(c.path));

test('GOOGLE_CONTACTS off: no card and People is not read', async ({ glance }) => {
  const page = await open(glance, null, ASK, 'off');
  await page.waitForTimeout(4000);
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD_ANSWER);
  expect(peopleCalls()).toHaveLength(0);
});

test('GOOGLE_CONTACTS on: answer card fills compose To and body, Copy is shown, Undo clears', async ({ glance }) => {
  const page = await open(glance, { GOOGLE_CONTACTS: true }, ASK, 'answer');
  await expect(page.locator('div[role="main"] .flow-chip-host')).toContainText(CARD_ANSWER, { timeout: 20000 });
  expect(peopleCalls().length).toBeGreaterThan(0);
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-written')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('textarea[name="to"]')).toHaveValue('asker@example.com');
  await expect(page.locator('div[aria-label="Message Body"]')).toContainText('dana.cohen@example.com');
  await expect(page.locator('button.flow-chip-copy')).toBeVisible();
  await page.locator('button.flow-chip-undo').click();
  await expect(page.locator('div[aria-label="Message Body"]')).not.toContainText('dana.cohen@example.com');
});

test('GOOGLE_CONTACTS on: forward fills To with Dana only', async ({ glance }) => {
  const page = await open(glance, { GOOGLE_CONTACTS: true }, FWD, 'fwd');
  await expect(page.locator('div[role="main"] .flow-chip-host')).toContainText('Forward to Dana', { timeout: 20000 });
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('textarea[name="to"]')).toHaveValue('dana.cohen@example.com', { timeout: 20000 });
});

test('GOOGLE_CONTACTS on: two Danas ask which one; no match shows not-found without a card', async ({ glance }) => {
  server.setContactAmbiguous(true);
  let page = await open(glance, { GOOGLE_CONTACTS: true }, ASK, 'amb');
  await expect(page.locator('.flow-chip-contact-choose')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD_ANSWER);
  page = await open(glance, { GOOGLE_CONTACTS: true }, "What's Zorro's email?", 'none');
  await page.waitForTimeout(4000);
  await expect(page.locator('.flow-chip-contact-miss')).toContainText(/contact/i);
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD_ANSWER);
});
