// Booking notices, invitations, pickups and payment asks on the real Gmail card, behind the owner's off switches
// BOOKING_NOTICE and PAYMENT_ASK in glanceSwitches, in the unpacked extension against the local Google lane server. Switch off: no
// card. On: the existing Hold It card (one event, no guest) or the existing task card (one Google Task due that day),
// read back by id; Undo deletes. Nothing is paid or sent.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const S = require('./support/sentences');

const APPT = 'Hi, your appointment is confirmed for tomorrow at 14:00. See you then.';
const PICKUP = 'Hi, your order is ready for pickup until tomorrow.';
const PAY = 'Hi Sali, please transfer 500 NIS to my account by tomorrow. Thanks!';
const MAIN = 'div[role="main"]';
let server;
let n = 0;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function open(glance, switches, body) {
  await glance.seedGmail(switches ? { glanceSwitches: switches } : {});
  n += 1;
  return glance.openGmail({ messageId: 'm-bk-' + n, threadId: 't-bk-' + n, subject: 'Your booking', senderEmail: 'hello@nofar.example', senderName: 'Studio Nofar', body: body, detailsTable: { to: ['me@x.com'], cc: [], expanded: true, hebrew: false } });
}
const tasks = () => Object.values(server.tasks());
const events = () => Object.values(server.events());

test('switches off: a pickup and a payment request show no card', async ({ glance }) => {
  for (const body of [PICKUP, PAY]) {
    const page = await open(glance, null, body);
    await page.waitForTimeout(2500);
    await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
  }
  expect(events()).toHaveLength(0);
  expect(tasks()).toHaveLength(0);
});

test('BOOKING_NOTICE on: a confirmed appointment is one calendar event, no guest, read back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, APPT);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
  expect(events()[0].summary).toMatch(/^Hold /);
  expect(events()[0].attendees || []).toEqual([]);
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => events().length).toBe(0);
});

test('BOOKING_NOTICE on: a pickup with a last day is one Google Task, read back, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, PICKUP);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toMatch(/Pick up the order/);
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks().length).toBe(0);
});

test('PAYMENT_ASK on: a payment request is one Google Task Pay 500 NIS, nothing is paid, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { PAYMENT_ASK: true }, PAY);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toMatch(/Pay 500 NIS/);
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks().length).toBe(0);
});

const REMIND = "Hi Sali, don't forget to bring the signed form tomorrow. Thanks!";

test('TASK_ASK on: a reminder asked without a question is one Google Task, Undo deletes it; off: no card', async ({ glance }) => {
  let page = await open(glance, null, REMIND);
  await page.waitForTimeout(2500);
  await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
  page = await open(glance, { TASK_ASK: true }, REMIND);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toMatch(/bring the signed form/i);
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks().length).toBe(0);
});

test('BOOKING_NOTICE on: the reminder mail of an appointment already on the calendar is not offered a second event', async ({ glance }) => {
  let page = await open(glance, { BOOKING_NOTICE: true }, APPT);
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
  // Another thread from the same sender, a later mail that says the same thing.
  n += 1;
  const reminder = { messageId: 'm-bk-' + n, threadId: 't-bk-' + n, subject: 'Reminder: your booking', senderEmail: 'hello@nofar.example', senderName: 'Studio Nofar', body: 'Hi, a reminder: your appointment is confirmed for tomorrow at 14:00. See you then.', detailsTable: { to: ['me@x.com'] } };
  page = await glance.openGmail(reminder);
  await page.waitForTimeout(3000);
  await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
  expect(events()).toHaveLength(1);
});

test('PAYMENT_ASK on: the reminder of a bill already on the task list is not offered a second Pay task', async ({ glance }) => {
  let page = await open(glance, { PAYMENT_ASK: true }, 'Hi Sali, your invoice of 1,200 NIS is due by tomorrow. Thank you for working with us!');
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  n += 1;
  page = await glance.openGmail({ messageId: 'm-bk-' + n, threadId: 't-bk-' + n, subject: 'Reminder: invoice', senderEmail: 'hello@nofar.example', senderName: 'Studio Nofar', body: 'Hi Sali, a reminder: your invoice of 1,200 NIS is due by tomorrow. Thank you!', detailsTable: { to: ['me@x.com'] } });
  await page.waitForTimeout(3000);
  await expect(page.locator(MAIN + ' button.flow-chip')).toHaveCount(0);
  expect(tasks()).toHaveLength(1);
});

test('BOOKING_NOTICE on: a delivery window told in a mail is one Google Calendar hold at the start of the window, no guest, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, 'Your package will be delivered tomorrow between 14:00 and 18:00. Thanks for your order.');
  const chip = page.locator(MAIN + ' button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  await expect(page.locator(MAIN + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(events()).toHaveLength(1);
  expect(events()[0].summary).toMatch(/^Hold .*14:00/);
  expect(JSON.stringify(events()[0].end)).toContain('18:00');
  expect(events()[0].attendees || []).toEqual([]);
  await page.locator(MAIN + ' button.flow-chip-undo').click();
  await expect.poll(() => events().length).toBe(0);
});
