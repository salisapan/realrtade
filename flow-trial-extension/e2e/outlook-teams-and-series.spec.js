// The Teams link and the repeat on the real Outlook meeting Hold It, and the repeating To Do task on
// the real Outlook To Do card, in the unpacked extension against the Graph mock in support/launch.js.
// All three are behind the owner's off switches in glanceSwitches: nothing changes with the switches
// off. With them on, the event or task carries the link or the rule, is read back by id, the receipt
// says so, Undo still deletes it (Microsoft's own join block is not an edit), and nothing is invited
// or sent. A link or a rule the server does not return means the event is removed and no Handled.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WHEN = new Date(Date.now() + 9 * 24 * 3600 * 1000);
const DM = WHEN.getDate() + '/' + (WHEN.getMonth() + 1);
const DAY = WEEKDAYS[WHEN.getDay()];
const BASE = 'Pricing meeting ' + DM + ' at 14:00, please confirm.';
const CALL = BASE + ' Can we do a Teams video call?';
const SERIES = 'Pricing meeting ' + DM + ' at 14:00, every ' + DAY + ' at 14:00, please confirm.';
const REPEAT_TASK = 'Please remember to renew your gym membership every Monday at 9:00';
const PANE = '#ReadingPaneContainerId';

let n = 0;
async function openHold(glance, switches, body, scenario) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {}, { calendar: true });
  if (scenario) await glance.setScenario(Object.assign({ inbox: [], sent: [], messages: {}, attachments: {}, conversation: [] }, scenario));
  n += 1;
  const page = await glance.openOutlook({ id: 'AQMk-ts-' + n, subject: 'Pricing', senderEmail: S.SENDER, senderName: 'flow', body: body });
  await expect(page.locator(PANE + ' .chip-hold')).toBeVisible({ timeout: 20000 });
  return page;
}
const events = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.outlookEvents));
const eventPosts = async (glance) => (await glance.apiCalls()).filter((c) => c.method === 'POST' && /\/me\/events$/.test(c.url));

test('With every switch off a meeting hold is one plain event: no Teams link, no rule', async ({ glance }) => {
  const page = await openHold(glance, null, CALL + ' Every ' + DAY + ' at 14:00.');
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].isOnlineMeeting).toBeFalsy();
  expect(list[0].recurrence).toBeNull();
  expect(list[0].attendees || []).toEqual([]);
});

test('TEAMS_MEETING on: the hold carries a Teams link, no guest, read back, Undo deletes it', async ({ glance }) => {
  const page = await openHold(glance, { TEAMS_MEETING: true }, CALL);
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].isOnlineMeeting).toBe(true);
  expect(list[0].onlineMeetingProvider).toBe('teamsForBusiness');
  expect(list[0].attendees || []).toEqual([]);
  expect(list[0].onlineMeeting.joinUrl).toMatch(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /\/me\/events\/e2e-event-/.test(c.url))).toBe(true);
  expect(calls.some((c) => /sendMail|\/send\b/.test(c.url))).toBe(false);
  await expect(page.locator(PANE)).toContainText('Teams');
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('TEAMS_MEETING on but the server returns no link: the event is removed and nothing is Handled', async ({ glance }) => {
  const page = await openHold(glance, { TEAMS_MEETING: true }, CALL, { eventNoTeams: true });
  await page.locator(PANE + ' .chip-hold').click();
  await expect.poll(async () => (await glance.apiCalls()).some((c) => c.method === 'DELETE' && /\/me\/events\//.test(c.url)), { timeout: 30000 }).toBe(true);
  expect((await events(glance)).length).toBe(0);
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(0);
});

test('RECURRING_HOLD on: the hold becomes the series, the rule is read back, Undo deletes it', async ({ glance }) => {
  const page = await openHold(glance, { RECURRING_HOLD: true }, SERIES);
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].recurrence.pattern.type).toBe('weekly');
  expect(list[0].recurrence.pattern.daysOfWeek).toEqual([DAY.toLowerCase()]);
  expect(list[0].attendees || []).toEqual([]);
  await expect(page.locator(PANE)).toContainText('repeats');
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('RECURRING_HOLD on but the server drops the rule: the event is removed and nothing is Handled', async ({ glance }) => {
  const page = await openHold(glance, { RECURRING_HOLD: true }, SERIES, { eventDropsRule: true });
  await page.locator(PANE + ' .chip-hold').click();
  await expect.poll(async () => (await glance.apiCalls()).some((c) => c.method === 'DELETE' && /\/me\/events\//.test(c.url)), { timeout: 30000 }).toBe(true);
  expect((await events(glance)).length).toBe(0);
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(0);
});

// A day that does not fit the rule is covered in test/recurring-hold-outlook-corpus.cjs: the card itself
// stays quiet when the weekday and the date in the mail disagree, so there is no Hold It to click.

async function todoWith(glance, switches, body, id) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {});
  return glance.openOutlook({ id: id, subject: 'Report', senderEmail: S.SENDER, body: body });
}
const tasks = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));

test('RECURRING_TODO off: a repeating ask is the one-off task it always was', async ({ glance }) => {
  const page = await todoWith(glance, null, REPEAT_TASK, 'AQMk-todo-off');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await tasks(glance);
  expect(list).toHaveLength(1);
  expect(list[0].recurrence).toBeUndefined();
});

test('RECURRING_TODO on: the To Do task repeats, is read back with its rule, and Undo deletes it', async ({ glance }) => {
  const page = await todoWith(glance, { RECURRING_TODO: true }, REPEAT_TASK, 'AQMk-todo-on');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await tasks(glance);
  expect(list).toHaveLength(1);
  expect(list[0].recurrence.pattern.type).toBe('weekly');
  expect(list[0].recurrence.pattern.daysOfWeek).toEqual(['monday']);
  expect(list[0].dueDateTime.dateTime).toBe(list[0].recurrence.range.startDate + 'T00:00:00.0000000');
  await expect(page.locator(PANE)).toContainText('repeats');
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await tasks(glance)).length).toBe(0);
});
