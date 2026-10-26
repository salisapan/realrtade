// A Do It is checked against the Google API, not against what Glance wrote
// down. A mail that is reopened, undone, deleted from outside, or written
// with a stale list is checked by id. A checkmark appears only for what
// Google returns. Headless Chromium, a local server that behaves like the
// API (opaque ids, 401/404 shapes, per-account events), fixtures only.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const OTHER = 'salisapan1@gmail.com';
const CALL = "Let's have a call Tuesday at 15:00 about the pilot";
let server;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
    globalThis.__glanceE2e.identityToken = '';
    if (globalThis.FlowGoogleLaneAccount && globalThis.FlowGoogleLaneAccount.forget) globalThis.FlowGoogleLaneAccount.forget();
  }, server.origin);
});

const opts = (id, lang) => ({
  messageId: 'm-' + id, threadId: 't-' + id, subject: 'the pilot',
  senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: lang || 'en', body: CALL
});

async function doIt(glance, id, lang, seed) {
  await glance.seedGmail(Object.assign(lang === 'he' ? { glanceUiLanguage: 'he' } : {}, seed || {}));
  const page = await glance.openGmail(opts(id, lang));
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-done')).toBeVisible({ timeout: 20000 });
  return page;
}

const main = (page) => page.locator('div[role="main"]');
const tick = (page) => page.locator('div[role="main"] .flow-chip-done-icon');
const eventIds = () => Object.keys(server.events());
const taskIds = () => Object.keys(server.tasks());

test('Do It: the event and the task exist in Google, on the connected account and in the Glance list, and no list was made', async ({ glance }) => {
  const page = await doIt(glance, 'api', 'en');
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible();
  expect(eventIds()).toHaveLength(1);
  expect(taskIds()).toHaveLength(1);
  const event = server.event(eventIds()[0]);
  expect(event.organizer.email).toBe(SELF);
  const task = server.task(taskIds()[0]);
  expect(task.title).toBe('Call about the pilot');
  const glanceList = server.lists.find((l) => l.title === 'Glance');
  expect(server.calls.some((c) => c.method === 'GET' && c.path === '/tasks/v1/lists/' + glanceList.id + '/tasks/' + task.id)).toBe(true);
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/events/' + event.id) >= 0)).toBe(true);
  expect(server.listCreates).toEqual([]);
  await expect(page.locator('[data-glance-account]')).toHaveAttribute('data-glance-account', SELF);
  const rows = (await page.locator('div[role="main"] .flow-chip-written').allInnerTexts()).join(' | ');
  expect(rows).toContain('Calendar · Call about the pilot · ');
  expect(rows).toContain('Google Task · Call about the pilot');
});

test('Do It, Undo, reopen: Google is empty, so there is no checkmark and no Handled', async ({ glance }) => {
  const page = await doIt(glance, 'undo-reopen', 'en');
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(main(page)).toContainText(/removed|Undone/i, { timeout: 15000 });
  expect(eventIds()).toHaveLength(0);
  expect(taskIds()).toHaveLength(0);
  const stored = await glance.storage();
  expect(Object.keys((stored.glanceLaneUndo) || {})).toHaveLength(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await expect(tick(page)).toHaveCount(0);
  await expect(page.locator('[data-glance-verified="1"]')).toHaveCount(0);
});

test('an external delete in Google: the reopened mail has no checkmark and says it was removed', async ({ glance }) => {
  const page = await doIt(glance, 'ext-delete', 'en');
  eventIds().forEach((id) => server.deleteEvent(id));
  taskIds().forEach((id) => server.deleteTask(id));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(main(page)).toContainText('Removed or deleted', { timeout: 15000 });
  await expect(tick(page)).toHaveCount(0);
  await expect(page.locator('[data-glance-verified="1"]')).toHaveCount(0);
  await expect(page.locator('div[role="main"] button.flow-chip-undo')).toHaveCount(0);
  const stored = await glance.storage();
  expect(Object.keys((stored.glanceLaneUndo) || {})).toHaveLength(0);
});

test('an external delete of the same, in the Hebrew UI, is in Hebrew', async ({ glance }) => {
  const page = await doIt(glance, 'ext-delete-he', 'he');
  eventIds().forEach((id) => server.deleteEvent(id));
  taskIds().forEach((id) => server.deleteTask(id));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(main(page)).toContainText('בוטל / נמחק', { timeout: 15000 });
  await expect(tick(page)).toHaveCount(0);
});

test('only the event deleted outside: partial, no checkmark, never Handled', async ({ glance }) => {
  const page = await doIt(glance, 'ext-half', 'en');
  eventIds().forEach((id) => server.deleteEvent(id));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(main(page)).toContainText('Removed or deleted', { timeout: 15000 });
  await expect(tick(page)).toHaveCount(0);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toContainText('Partly handled');
  await expect(page.locator('[data-glance-verified="1"]')).toHaveCount(0);
});

test('no network or no verified token on reopen: no checkmark, "Can\'t verify"', async ({ glance }) => {
  const page = await doIt(glance, 'offline', 'en');
  await glance.evaluateWorker(() => { globalThis.__glanceE2e.httpOrigin = 'http://127.0.0.1:9'; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(main(page)).toContainText("Can't verify", { timeout: 15000 });
  await expect(tick(page)).toHaveCount(0);
  expect(eventIds()).toHaveLength(1);
});

test('a receipt that was partial stays partial on reopen, and is never given a checkmark it did not have', async ({ glance }) => {
  const created = await fetch(server.origin + '/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: 'Bearer ya29.e2e', 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: 'Call about the pilot', start: { dateTime: '2026-10-20T15:00:00+03:00' }, end: { dateTime: '2026-10-20T15:30:00+03:00' } })
  }).then((r) => r.json());
  expect(created.id).toBeTruthy();
  await glance.seedGmail({
    glanceLaneUndo: {
      'm-partial': {
        expires: Date.now() + 60000,
        ids: ['m-partial'],
        partial: true,
        total: 2,
        steps: [{ connectorId: 'googleHold', ref: { eventId: created.id, externalId: created.id, calendarId: 'primary' }, line: 'Calendar · Call about the pilot · 2026-10-20 15:00', undoLine: 'Calendar event removed.' }]
      }
    }
  });
  const page = await glance.openGmail(opts('partial', 'en'));
  const status = page.locator('div[role="main"] .flow-chip-handled');
  await expect(status).toContainText('Partly handled', { timeout: 15000 });
  await expect(status).not.toHaveText(/^Handled\.$/);
});

test('a stored list id Google no longer knows is replaced by the list titled Glance, and no list is made', async ({ glance }) => {
  const page = await doIt(glance, 'stale', 'en', { googleTasksAuth: { taskListId: 'kabbjogfpbhofjedlkehkai' } });
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible();
  expect(taskIds()).toHaveLength(1);
  expect(server.task(taskIds()[0]).title).toBe('Call about the pilot');
  expect(server.listCreates).toEqual([]);
  const stored = await glance.storage();
  expect(stored.googleTasksAuth.taskListId).toBe(server.lists.find((l) => l.title === 'Glance').id);
});

test('an account with no Glance list gets exactly one list, titled Glance, and nothing else is ever created', async ({ glance }) => {
  server.lists.splice(0, server.lists.length, server.lists.find((l) => l.title === 'My Tasks'));
  const page = await doIt(glance, 'nolist', 'en', { googleTasksAuth: {} });
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible();
  expect(server.listCreates).toEqual(['Glance']);
  expect(server.lists.map((l) => l.title).sort()).toEqual(['Glance', 'My Tasks']);
  expect(server.lists.some((l) => /kabbjog|dnjhplgm/i.test(l.title))).toBe(false);
});

test('a token of another account than the connected one: nothing is written and the card says which accounts', async ({ glance }) => {
  await glance.seedGmail({ googleConnectedAccount: { email: SELF, source: 'web', at: Date.now() } });
  server.setAccount(OTHER);
  const page = await glance.openGmail(opts('other', 'en'));
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(main(page)).toContainText(OTHER, { timeout: 20000 });
  await expect(main(page)).toContainText(SELF);
  expect(server.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  await expect(tick(page)).toHaveCount(0);
  expect(eventIds()).toHaveLength(0);
  expect(taskIds()).toHaveLength(0);
});

test('a Chrome token of another account is never used: the write goes to the connected account', async ({ glance }) => {
  await glance.seedGmail({ googleConnectedAccount: { email: SELF, source: 'web', at: Date.now() } });
  server.registerToken('ya29.other', OTHER);
  await glance.evaluateWorker(() => { globalThis.__glanceE2e.identityToken = 'ya29.other'; });
  const page = await glance.openGmail(opts('chrome-other', 'en'));
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(eventIds()).toHaveLength(1);
  expect(server.event(eventIds()[0]).organizer.email).toBe(SELF);
  await expect(page.locator('[data-glance-account]')).toHaveAttribute('data-glance-account', SELF);
});

test('a read-back that fails removes the event again, names the event, and leaves nothing in Google', async ({ glance }) => {
  server.failGet('/calendar/v3/calendars/primary/events/');
  await glance.seedGmail({});
  const page = await glance.openGmail(opts('readback', 'en'));
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(main(page)).toContainText(/event/i, { timeout: 20000 });
  await expect(page.locator('div[role="main"] .flow-chip-handled')).not.toContainText(/^Handled\.$/);
  expect(eventIds()).toHaveLength(0);
  expect(server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/') >= 0)).toBe(true);
});

test('a calendar failure in the Hebrew UI says the event, not the task', async ({ glance }) => {
  server.failGet('/calendar/v3/calendars/primary/events/');
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail(opts('readback-he', 'he'));
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(main(page)).toContainText('האירוע', { timeout: 20000 });
  const calendarNote = (await main(page).innerText()).split('\n').filter((l) => /יומן|Calendar|האירוע/.test(l)).join(' ');
  expect(calendarNote).not.toContain('המשימה');
});
