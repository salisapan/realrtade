// Scenario rehearsal D — the meeting they named (holistic-close-map.md §4, slice 2, catalog C1/C6/M7).
// Gmail against the local Google lane server, Outlook against mocked Graph, WhatsApp through the
// production lane. The hold is one event with nobody invited, read back by id, Handled only after the
// read-back, remounted after reload, and Undo deletes it. The confirmation reply as a preview with an
// approved send does not exist yet (open-tasks row 53).
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { whatsappHtml, registerWhatsApp, expectedMissing, SEND_URL } = require('./support/rehearsal');
const S = require('./support/sentences');

const MEET = 'Can we meet Thursday at 16:00 about the quote, and reply to confirm?';
const MAIN = 'div[role="main"]';

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
    globalThis.__glanceE2e.tokenAccounts = { 'ya29.e2e': 'me@x.com' };
  }, server.origin);
});

const eventPosts = () => server.calls.filter((c) => c.method === 'POST' && /\/calendar\/v3\/calendars\/[^/]+\/events$/.test(c.path));

async function gmail(glance, id, body) {
  await glance.seedGmail({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' } });
  return glance.openGmail({ messageId: 'm-d-' + id, threadId: 't-d-' + id, subject: 'Quote', senderEmail: S.SENDER, senderName: 'Dana', body: body });
}

test('D1 Gmail: one hold with no guest, read back by id, Handled after it, remounted after reload, Undo deletes it', async ({ glance }, testInfo) => {
  const page = await gmail(glance, 'hold', MEET);
  await expect(page.locator(MAIN + ' .flow-chip-host')).toContainText('16:00', { timeout: 20000 });
  await page.locator(MAIN + ' button.flow-chip').click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(eventPosts()).toHaveLength(1);
  const post = eventPosts()[0];
  expect(post.body.attendees || []).toEqual([]);
  const id = server.last.event;
  expect(id).toBeTruthy();
  const created = server.calls.findIndex((c) => c === post);
  expect(server.calls.slice(created + 1).some((c) => c.method === 'GET' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
  expect(new Date(server.event(id).start.dateTime).getHours()).toBe(16);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator(MAIN + ' .flow-chip-host')).toHaveCount(1);
  expect(eventPosts()).toHaveLength(1);

  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0), { timeout: 20000 }).toBe(true);
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toHaveCount(0);
  expect(server.calls.some((c) => SEND_URL.test(c.path))).toBe(false);

  expectedMissing(testInfo, 'row 53, slice 2', 'the confirmation sits on the steps list as a preview; approve sends it; the sent message is read back and names Thursday 16:00; it remounts after reload; its Undo says unavailable');
});

test('D2 WhatsApp the same morning, "Thursday at 4 still good?": no second event', async ({ glance }) => {
  const page = await gmail(glance, 'cross', MEET);
  await page.locator(MAIN + ' button.flow-chip').click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(eventPosts()).toHaveLength(1);
  expect(await registerWhatsApp(glance)).toBe(true);
  const chat = await glance.openWhatsApp(whatsappHtml('Thursday at 4 still good?'));
  await chat.waitForTimeout(7000);
  expect(eventPosts()).toHaveLength(1);
  expect(await chat.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
});

test('D3 Outlook with no calendar permission: the card asks for it and never says Handled', async ({ glance }) => {
  await glance.seedOutlook({}, { calendar: false });
  const page = await glance.openOutlook({ id: 'AQMkGlanceE2ERehearsalD3', subject: 'Quote', senderEmail: S.SENDER, body: MEET });
  const host = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(host).toContainText('16:00', { timeout: 20000 });
  await page.locator('#ReadingPaneContainerId button.flow-chip').first().click();
  await page.waitForTimeout(4000);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(0);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'POST' && /\/me\/(calendar\/)?events/.test(c.url))).toBe(false);
});

test('D4 Outlook with the calendar permission: one event, read back by id, then Handled', async ({ glance }) => {
  await glance.seedOutlook({}, { calendar: true });
  const page = await glance.openOutlook({ id: 'AQMkGlanceE2ERehearsalD4', subject: 'Quote', senderEmail: S.SENDER, body: MEET });
  await page.locator('#ReadingPaneContainerId button.flow-chip').first().click({ timeout: 20000 });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const calls = await glance.apiCalls();
  const post = calls.findIndex((c) => c.method === 'POST' && /\/me\/(calendar\/)?events/.test(c.url));
  expect(post).toBeGreaterThanOrEqual(0);
  expect(calls.slice(post + 1).some((c) => c.method === 'GET' && /\/me\/(calendar\/)?events\/[^/?]+/.test(c.url))).toBe(true);
});

test('D5 Gate: a mail that asks to find a time shows nothing', async ({ glance }) => {
  test.fail(true, 'Today it is a Reply & Track card (draft plus task) on purpose: core/intent.js:1656 "the card is a reply that offers times, not a hold". The Gate says nothing. Owner decision.');
  const page = await gmail(glance, 'find', 'Can you find us 30 minutes next week to go over the quote?');
  await page.waitForTimeout(7000);
  await expect(page.locator(MAIN + ' .flow-chip-host')).toHaveCount(0, { timeout: 1000 });
});
