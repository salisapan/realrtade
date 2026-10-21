// The Meet link and the repeat on the real Gmail Hold It card, in the unpacked extension, against the
// local Google lane server. Both are behind the owner's off switches in glanceSwitches: nothing
// changes with the switches off. With them on, the create carries a conference request and the
// repeat rule, the receipt reads Meet, and Undo still deletes the event. No guest, no email.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = new Date(Date.now() + 9 * 24 * 3600 * 1000);
const WHEN = MONTHS[WEEK.getMonth()] + ' ' + WEEK.getDate() + ', ' + WEEK.getFullYear() + ' at 10:00';
const DAY = WEEKDAYS[WEEK.getDay()];
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][WEEK.getDay()];
const CALL = 'Let us hold the pricing meeting on ' + WHEN + '. Can we do a Google Meet video call?';
const SERIES = 'Pricing meeting on ' + WHEN + ', every ' + DAY + ' at 10:00. Please hold it.';
const PLAIN = 'Pricing meeting on ' + WHEN + '. Please hold it.';

let server;

test.beforeAll(async () => {
  server = await startGoogleLaneServer();
});

test.afterAll(async () => {
  if (server) await server.close();
});

test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => {
    globalThis.__glanceE2e.httpOrigin = origin;
  }, server.origin);
});

function posts() {
  return server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/calendar/v3/calendars/primary/events') >= 0);
}

async function holdWith(glance, switches, body, id) {
  await glance.seedGmail(switches ? { glanceSwitches: switches } : {});
  return glance.openGmail({ messageId: 'm-' + id, threadId: 't-' + id, subject: 'Pricing', senderEmail: S.SENDER, senderName: 'flow', body: body });
}

async function doIt(page) {
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
}

test('With both switches off a meeting hold is one plain event: no conference, no rule', async ({ glance }) => {
  const page = await holdWith(glance, null, CALL + ' Every ' + DAY + ' at 10:00.', 'off');
  await doIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(posts()).toHaveLength(1);
  const body = posts()[0].body;
  expect(body.conferenceData).toBeUndefined();
  expect(body.recurrence).toBeUndefined();
  expect(posts()[0].search || '').not.toContain('conferenceDataVersion');
});

test('MEET_LINK on: the hold carries a Meet request, the Meet link is read back, no guest, and Undo deletes the event', async ({ glance }) => {
  const page = await holdWith(glance, { MEET_LINK: true }, CALL, 'meet');
  await doIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(posts()).toHaveLength(1);
  const post = posts()[0];
  expect(post.search || '').toContain('conferenceDataVersion=1');
  expect(post.search || '').toContain('sendUpdates=none');
  expect(post.body.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
  expect(post.body.attendees || []).toEqual([]);
  const id = server.last.event;
  expect(server.event(id).hangoutLink).toBe('https://meet.google.com/abc-defg-hij');
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
});

test('MEET_LINK on but Google makes no link: the event is deleted again and the card does not say Handled', async ({ glance }) => {
  server.setNoMeetLink(true);
  const page = await holdWith(glance, { MEET_LINK: true }, CALL, 'nolink');
  await doIt(page);
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE')).toBe(true);
  expect(Object.keys(server.events())).toHaveLength(0);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toHaveCount(0);
});

test('RECURRING_HOLD on: a meeting that states "every <weekday>" on that weekday becomes one series, master read back', async ({ glance }) => {
  const page = await holdWith(glance, { RECURRING_HOLD: true }, SERIES, 'series');
  await doIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(posts()).toHaveLength(1);
  const post = posts()[0];
  expect(post.body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY]);
  expect(post.body.attendees || []).toEqual([]);
  const id = server.last.event;
  expect(server.event(id).recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY]);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => server.calls.some((c) => c.method === 'DELETE' && c.path.indexOf('/events/' + id) >= 0)).toBe(true);
});

test('RECURRING_HOLD on but the mail states no repeat: still one plain event', async ({ glance }) => {
  const page = await holdWith(glance, { RECURRING_HOLD: true }, PLAIN, 'plain');
  await doIt(page);
  await expect(page.locator('div[role="main"] .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(posts()).toHaveLength(1);
  expect(posts()[0].body.recurrence).toBeUndefined();
});
