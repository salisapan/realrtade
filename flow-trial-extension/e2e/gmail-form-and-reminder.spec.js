// A Google Form from a request (switch WORKSPACE_FILE) and a repeating reminder from a repeating
// commitment (switch RECURRING_REMINDER), on the real Gmail card in the unpacked extension, against the local
// Google lane server. Both off by default. On: the canonical Do It card, one write read back by id, a
// receipt, and Undo that leaves anything the person edited alone. Nothing is sent and nobody is invited.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const FORM = 'Can you create a feedback form for the Q4 launch?';
const SERIES = 'Please send the sales report every Monday at 9:00.';
const PLAIN = 'Please send me the Q4 numbers by Friday.';

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function open(glance, switches, body, id) {
  await glance.seedGmail(switches ? { glanceSwitches: switches } : {});
  return glance.openGmail({ messageId: 'm-' + id, threadId: 't-' + id, subject: 'Ask', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const formPosts = () => server.calls.filter((c) => c.method === 'POST' && /\/v1\/forms$/.test(c.path));
const eventPosts = () => server.calls.filter((c) => c.method === 'POST' && /\/calendar\/v3\/calendars\/primary\/events/.test(c.path));

test('WORKSPACE_FILE off: a request for a form shows no card and writes nothing', async ({ glance }) => {
  const page = await open(glance, null, FORM, 'form-off');
  await page.waitForTimeout(5000);
  await expect(page.locator('div[role="main"]')).not.toContainText('empty form');
  expect(formPosts()).toHaveLength(0);
});

test('WORKSPACE_FILE on: Do It creates an empty Form, reads it back by id, and Undo trashes it', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true }, FORM, 'form');
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"]')).toContainText('Q4 launch feedback form');
  await chip.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const posts = formPosts();
  expect(posts).toHaveLength(1);
  expect(posts[0].body.info.title).toBe('Q4 launch feedback form');
  expect(Object.keys(posts[0].body)).toEqual(['info']);
  const id = server.last.form;
  expect(server.calls.some((c) => c.method === 'GET' && c.path === '/v1/forms/' + id)).toBe(true);
  expect(server.calls.some((c) => /responses|publish|permissions/.test(c.path))).toBe(false);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'PATCH' && c.path.indexOf('/drive/v3/files/' + id) >= 0 && c.body && c.body.trashed === true)).toBe(true);
});

test('WORKSPACE_FILE on: Undo leaves a form the person edited, and the form stays', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true }, FORM, 'form-edit');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  server.editForm(server.last.form);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  expect(server.calls.some((c) => c.method === 'PATCH' && c.body && c.body.trashed === true)).toBe(false);
});

test('RECURRING_REMINDER off: a repeating commitment shows no reminder card', async ({ glance }) => {
  const page = await open(glance, null, SERIES, 'series-off');
  await page.waitForTimeout(5000);
  expect(eventPosts().filter((c) => c.body && c.body.recurrence)).toHaveLength(0);
});

test('RECURRING_REMINDER on: Do It adds one repeating event with no guest, read back, and Undo deletes the series', async ({ glance }) => {
  const page = await open(glance, { RECURRING_REMINDER: true }, SERIES, 'series');
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"]')).toContainText('send the sales report');
  await chip.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled, div[role="main"] .flow-chip-done-icon').first()).toBeVisible({ timeout: 20000 });
  const posts = eventPosts();
  expect(posts).toHaveLength(1);
  expect(posts[0].body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  expect(posts[0].body.attendees || []).toHaveLength(0);
  expect(posts[0].search || posts[0].path).toContain('sendUpdates=none');
  const id = server.last.event;
  expect(server.calls.some((c) => c.method === 'GET' && c.path.indexOf('/calendar/v3/calendars/primary/events/' + id) >= 0)).toBe(true);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
});

test('both on: an ordinary mail is neither a form nor a reminder', async ({ glance }) => {
  const page = await open(glance, { WORKSPACE_FILE: true, RECURRING_REMINDER: true }, PLAIN, 'plain');
  await page.waitForTimeout(5000);
  expect(formPosts()).toHaveLength(0);
  expect(eventPosts().filter((c) => c.body && c.body.recurrence)).toHaveLength(0);
});
