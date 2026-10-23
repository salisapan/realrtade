// Booking notices on the real Outlook card, behind the owner's off switch BOOKING_NOTICE in glanceSwitches: "Your
// appointment is confirmed for tomorrow at 14:00" is one calendar hold and "Your order is ready for pickup until
// tomorrow" one To Do task. Unpacked extension, Graph stand-in. Switch off: the mail shows nothing, as before. With it on,
// Do It writes the event or task, reads it back by id, nobody is invited, and Undo deletes it.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PANE = '#ReadingPaneContainerId';
const APPT = 'Hi, your appointment is confirmed for tomorrow at 14:00. See you then.';
const PICKUP = 'Hi, your order is ready for pickup until tomorrow.';

let n = 0;
async function open(glance, switches, body, withCalendar) {
  await glance.seedOutlook(switches ? { glanceSwitches: switches } : {}, withCalendar ? { calendar: true } : {});
  n += 1;
  return glance.openOutlook({ id: 'AQMk-booking-' + n, subject: 'Your booking', senderEmail: 'hello@nofar.example', senderName: 'Studio Nofar', body: body });
}
const events = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.outlookEvents));
const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));

test('BOOKING_NOTICE off: a booking confirmation shows no card', async ({ glance }) => {
  const page = await open(glance, null, APPT, true);
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  expect(await events(glance)).toHaveLength(0);
});

test('BOOKING_NOTICE on: the confirmation is one calendar hold, no guest, read back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, APPT, true);
  await expect(page.locator(PANE + ' .chip-hold')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].subject).toMatch(/Appointment/);
  expect(list[0].attendees || []).toEqual([]);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('BOOKING_NOTICE on: a pickup with a last day is one To Do task, read back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, PICKUP, false);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/Pick up the order/);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});
