// A Meet link on an event already on the calendar, on the real Gmail card, behind the owner's off switch
// EVENT_CALL_LINK in glanceSwitches. Unpacked extension, real Gmail page flow, local Google lane server
// seeded with events. Off: no card and no calendar read. On: the canonical Do It card, only the conference
// request is patched (sendUpdates=none), the link is read back by id, a receipt that survives a reload,
// Undo removes only the link and refuses after the person edited the event.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const DAY = new Date(Date.now() + 5 * 24 * 3600 * 1000);
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const startOf = (d, h) => iso(d) + 'T' + String(h).padStart(2, '0') + ':00:00+00:00';
const ASK = 'Can you add a Google Meet link to the weekly sync?';
const ASK_NONE = 'Can you add a Google Meet link to the retreat?';
const ASK_LINKED = 'Can you add a Google Meet link to the planning call?';
const CARD = 'Glance can close this in 1 step · Calendar';

let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

function seed() {
  return {
    sync: server.seedEvent({ summary: 'Weekly sync', start: { dateTime: startOf(DAY, 10) }, end: { dateTime: startOf(DAY, 11) }, attendees: [{ email: 'dana@example.com' }] }),
    other: server.seedEvent({ summary: 'Board review', start: { dateTime: startOf(DAY, 14) }, end: { dateTime: startOf(DAY, 15) } }),
    linked: server.seedEvent({ summary: 'Planning call', start: { dateTime: startOf(DAY, 16) }, end: { dateTime: startOf(DAY, 17) }, hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc' })
  };
}

async function open(glance, switches, body, id) {
  await glance.seedGmail(switches ? { glanceSwitches: switches } : {});
  return glance.openGmail({ messageId: 'm-' + id, threadId: 't-' + id, subject: 'Sync', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const patches = () => server.calls.filter((c) => c.method === 'PATCH' && /\/calendar\/v3\/calendars\/primary\/events\//.test(c.path));
const listed = () => server.calls.some((c) => c.method === 'GET' && /\/calendar\/v3\/calendars\/primary\/events$/.test(c.path));

test('EVENT_CALL_LINK off: no card and the calendar is not read', async ({ glance }) => {
  seed();
  const page = await open(glance, null, ASK, 'off');
  await page.waitForTimeout(5000);
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD);
  expect(listed()).toBe(false);
  expect(patches()).toHaveLength(0);
});

test('EVENT_CALL_LINK on: the card names the one event, Do It adds only the Meet link, reads it back, and Undo removes it', async ({ glance }) => {
  const ids = seed();
  const page = await open(glance, { EVENT_CALL_LINK: true }, ASK, 'on');
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await expect(page.locator('div[role="main"] .flow-chip-host')).toContainText('Weekly sync');
  await expect(page.locator('div[role="main"] .flow-chip-host')).toContainText('Calendar');
  await chip.click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const sent = patches().filter((c) => c.body && c.body.conferenceData && c.body.conferenceData.createRequest);
  expect(sent).toHaveLength(1);
  expect(sent[0].path).toContain(ids.sync);
  expect(sent[0].search || '').toContain('conferenceDataVersion=1');
  expect(sent[0].search || '').toContain('sendUpdates=none');
  expect(Object.keys(sent[0].body)).toEqual(['conferenceData']);
  expect(server.event(ids.sync).hangoutLink).toBe('https://meet.google.com/abc-defg-hij');
  expect(server.event(ids.sync).attendees).toHaveLength(1);
  expect(server.event(ids.other).hangoutLink).toBeUndefined();
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.event(ids.sync).hangoutLink).toBeUndefined();
  expect(server.event(ids.sync).summary).toBe('Weekly sync');
});

test('EVENT_CALL_LINK on: no event of that name, or an event that already has a link, shows no event-link card and patches nothing', async ({ glance }) => {
  seed();
  let page = await open(glance, { EVENT_CALL_LINK: true }, ASK_NONE, 'none');
  await page.waitForTimeout(5000);
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD);
  page = await open(glance, { EVENT_CALL_LINK: true }, ASK_LINKED, 'linked');
  await page.waitForTimeout(5000);
  await expect(page.locator('div[role="main"]')).not.toContainText(CARD);
  expect(patches()).toHaveLength(0);
});

test('EVENT_CALL_LINK on: Undo refuses after the person edited the event, and the link stays', async ({ glance }) => {
  const ids = seed();
  const page = await open(glance, { EVENT_CALL_LINK: true }, ASK, 'edit');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  server.editEvent(ids.sync, { description: 'Agenda: pricing' });
  const before = server.calls.length;
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect(page.locator('div[role="main"]')).toContainText('You edited this. Undo left it alone.');
  expect(server.calls.slice(before).some((c) => c.method === 'PATCH')).toBe(false);
  expect(server.event(ids.sync).hangoutLink).toBe('https://meet.google.com/abc-defg-hij');
});

test('EVENT_CALL_LINK on: after a reload the event with its link is a receipt, not a second offer', async ({ glance }) => {
  seed();
  const page = await open(glance, { EVENT_CALL_LINK: true }, ASK, 'reload');
  await page.locator('div[role="main"] button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(patches().filter((c) => c.body && c.body.conferenceData && c.body.conferenceData.createRequest)).toHaveLength(1);
});
