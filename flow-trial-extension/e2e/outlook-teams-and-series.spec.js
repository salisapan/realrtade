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

// ---- An empty Word or Excel file from a request (switch ONEDRIVE_NEW_FILE) ---------------------------------
async function newFileMail(glance, switches, body, id) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {});
  return glance.openOutlook({ id: id, subject: 'Supplier', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const drive = (glance) => glance.evaluateWorker(() => ({ items: Object.values(globalThis.__glanceE2e.driveItems), puts: globalThis.__glanceE2e.drivePuts || [] }));
const ASK_DOC = 'Could you create a Word document called Supplier onboarding?';

test('ONEDRIVE_NEW_FILE off: the ask gets no card and nothing is made', async ({ glance }) => {
  const page = await newFileMail(glance, null, ASK_DOC, 'AQMk-nf-off');
  await page.waitForTimeout(3000);
  // The ordinary card for the ask may show; the new-file card must not.
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="new-file"]')).toHaveCount(0);
  await expect(page.locator(PANE)).not.toContainText('Create the file in OneDrive');
  expect((await drive(glance)).items).toHaveLength(0);
});

test('ONEDRIVE_NEW_FILE on: Do It makes an empty .docx in OneDrive > Glance, read back, Undo deletes it', async ({ glance }) => {
  const page = await newFileMail(glance, { ONEDRIVE_NEW_FILE: true }, ASK_DOC, 'AQMk-nf-on');
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await expect(page.locator(PANE)).toContainText('Supplier onboarding.docx');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const made = await drive(glance);
  expect(made.items).toHaveLength(1);
  expect(made.items[0].name).toBe('Supplier onboarding.docx');
  // drivePuts accumulates across specs in one run; this mail's file is the one named here, once.
  expect(made.puts.filter((k) => /Supplier onboarding/.test(k))).toEqual(['Glance/Supplier onboarding.docx']);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => c.method === 'GET' && /\/me\/drive\/items\/e2e-file-/.test(c.url))).toBe(true);
  expect(calls.some((c) => /sendMail|\/send\b/.test(c.url))).toBe(false);
  // the receipt survives a reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(1);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await drive(glance)).items.length).toBe(0);
});

test('ONEDRIVE_NEW_FILE on: Undo leaves a file the person edited', async ({ glance }) => {
  const page = await newFileMail(glance, { ONEDRIVE_NEW_FILE: true }, ASK_DOC, 'AQMk-nf-edit');
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => { Object.values(globalThis.__glanceE2e.driveItems).forEach((i) => { i.eTag = '"edited,2"'; i.lastModifiedDateTime = '2026-10-21T09:30:00Z'; }); });
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await page.waitForTimeout(2500);
  expect((await drive(glance)).items).toHaveLength(1);
});

test('ONEDRIVE_NEW_FILE on: a name that is already taken is refused and nothing is replaced', async ({ glance }) => {
  const page = await newFileMail(glance, { ONEDRIVE_NEW_FILE: true }, ASK_DOC, 'AQMk-nf-taken');
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => {
    const e = globalThis.__glanceE2e;
    const item = { id: 'e2e-file-existing', name: 'Supplier onboarding.docx', file: {}, size: 10, eTag: '"x"', lastModifiedDateTime: '2026-10-01T00:00:00Z', __key: 'Glance/Supplier onboarding.docx' };
    e.driveItems['e2e-file-existing'] = item;
    e.driveByName['Glance/Supplier onboarding.docx'] = item;
  });
  await page.locator(PANE + ' button.flow-chip').click();
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="new-file"] .flow-chip-handled')).toHaveCount(0);
  const made = await drive(glance);
  expect(made.items).toHaveLength(1);
  expect(made.items[0].id).toBe('e2e-file-existing');
});

test('ONEDRIVE_NEW_FILE on: a mail that asks for the content to be written gets no card', async ({ glance }) => {
  const page = await newFileMail(glance, { ONEDRIVE_NEW_FILE: true }, 'Please create a Word document called Offer and write a one-page summary of the call.', 'AQMk-nf-content');
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' button.flow-chip')).toHaveCount(0);
  expect((await drive(glance)).items).toHaveLength(0);
});

// ---- A Teams link on an event already on the calendar (switch OUTLOOK_EVENT_CALL_LINK) ---------------------
// "Thursday" in the mail means the nearest coming Thursday, so the event is on that one.
const NEXT_THURSDAY = (() => {
  const d = new Date(Date.now() + 1 * 24 * 3600 * 1000);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  return d;
})();
const THURSDAY_ISO = NEXT_THURSDAY.getFullYear() + '-' + String(NEXT_THURSDAY.getMonth() + 1).padStart(2, '0') + '-' + String(NEXT_THURSDAY.getDate()).padStart(2, '0');
const ASK_LINK = 'Can you add a Teams link to the Thursday sync?';

async function eventLinkMail(glance, switches, body, id, seed) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {}, { calendar: true });
  await glance.evaluateWorker((day) => {
    globalThis.__glanceE2e.outlookEvents['e2e-existing-sync'] = {
      id: 'e2e-existing-sync', subject: 'Thursday sync', isOrganizer: true, isOnlineMeeting: false, onlineMeeting: null, isCancelled: false,
      start: { dateTime: day + 'T10:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: day + 'T10:30:00.0000000', timeZone: 'UTC' },
      attendees: [], body: { contentType: 'text', content: 'Weekly sync' }, location: { displayName: '' }, webLink: 'https://outlook.office.com/calendar/item/e2e-existing-sync', recurrence: null
    };
  }, THURSDAY_ISO);
  if (seed) await glance.evaluateWorker(seed);
  return glance.openOutlook({ id: id, subject: 'Sync', senderEmail: S.SENDER, senderName: 'flow', body: body });
}
const syncEvent = (glance) => glance.evaluateWorker(() => globalThis.__glanceE2e.outlookEvents['e2e-existing-sync'] || null);

test('OUTLOOK_EVENT_CALL_LINK off: the ask gets no event-link card and the event is untouched', async ({ glance }) => {
  const page = await eventLinkMail(glance, null, ASK_LINK, 'AQMk-el-off');
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="event-link"]')).toHaveCount(0);
  expect((await syncEvent(glance)).isOnlineMeeting).toBe(false);
});

test('OUTLOOK_EVENT_CALL_LINK on: Do It turns on only the Teams meeting of that event, read back; Undo turns it off', async ({ glance }) => {
  const page = await eventLinkMail(glance, { OUTLOOK_EVENT_CALL_LINK: true }, ASK_LINK, 'AQMk-el-on');
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="event-link"] button.flow-chip')).toBeVisible({ timeout: 20000 });
  await expect(page.locator(PANE)).toContainText('Thursday sync');
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const ev = await syncEvent(glance);
  expect(ev.isOnlineMeeting).toBe(true);
  expect(ev.onlineMeeting.joinUrl).toMatch(/teams\.microsoft\.com\/l\/meetup-join/);
  expect(ev.subject).toBe('Thursday sync');
  expect(ev.attendees).toEqual([]);
  const patches = (await glance.apiCalls()).filter((c) => c.method === 'PATCH');
  expect(patches.length).toBeGreaterThan(0);
  expect((await glance.apiCalls()).some((c) => /sendMail|\/send\b/.test(c.url))).toBe(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(PANE + ' .flow-chip-handled')).toHaveCount(1);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await syncEvent(glance)).isOnlineMeeting).toBe(false);
});

test('OUTLOOK_EVENT_CALL_LINK on: Undo leaves an event the person edited', async ({ glance }) => {
  const page = await eventLinkMail(glance, { OUTLOOK_EVENT_CALL_LINK: true }, ASK_LINK, 'AQMk-el-edit');
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="event-link"] button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await glance.evaluateWorker(() => { globalThis.__glanceE2e.outlookEvents['e2e-existing-sync'].subject = 'Thursday sync (moved)'; });
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await page.waitForTimeout(2500);
  expect((await syncEvent(glance)).isOnlineMeeting).toBe(true);
});

test('OUTLOOK_EVENT_CALL_LINK on: an event that already has a call is never touched', async ({ glance }) => {
  const page = await eventLinkMail(glance, { OUTLOOK_EVENT_CALL_LINK: true }, ASK_LINK, 'AQMk-el-has', () => {
    const ev = globalThis.__glanceE2e.outlookEvents['e2e-existing-sync'];
    ev.isOnlineMeeting = true; ev.onlineMeeting = { joinUrl: 'https://teams.microsoft.com/l/meetup-join/already' };
  });
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="event-link"]')).toHaveCount(0);
  expect((await glance.apiCalls()).filter((c) => c.method === 'PATCH')).toHaveLength(0);
});

test('OUTLOOK_EVENT_CALL_LINK on: Zoom named is the other side\'s choice and gets no card', async ({ glance }) => {
  const page = await eventLinkMail(glance, { OUTLOOK_EVENT_CALL_LINK: true }, 'Can you add a Zoom link to the Thursday sync?', 'AQMk-el-zoom');
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host[data-glance-chain="event-link"]')).toHaveCount(0);
});
