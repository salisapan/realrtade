// Booking notices on the real Outlook card, behind the owner's off switch BOOKING_NOTICE in glanceSwitches: "Your
// appointment is confirmed for tomorrow at 14:00" is one calendar hold and "Your order is ready for pickup until
// tomorrow" one To Do task. Unpacked extension, Graph stand-in. Switch off: the mail shows nothing, as before. With it on,
// Do It writes the event or task, reads it back by id, nobody is invited, and Undo deletes it.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PANE = '#ReadingPaneContainerId';
const APPT = 'Hi, your appointment is confirmed for tomorrow at 14:00. See you then.';
const INVITE = "Hi, you're invited to our product launch on tomorrow at 19:00. We'd love to see you.";
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

test('BOOKING_NOTICE on: an invitation to an event is one calendar hold titled Invitation, no guest, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, INVITE, true);
  await expect(page.locator(PANE + ' .chip-hold')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].subject).toMatch(/Invitation/);
  expect(list[0].attendees || []).toEqual([]);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

const PAY = 'Hi Sali, please transfer 500 NIS to my account by tomorrow. Thanks!';

test('PAYMENT_ASK off: a payment request shows no card; on: one To Do task Pay 500 NIS, read back, Undo deletes it, nothing is paid', async ({ glance }) => {
  let page = await open(glance, null, PAY, false);
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(0);
  page = await open(glance, { PAYMENT_ASK: true }, PAY, false);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/Pay 500 NIS/);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});

test('BOOKING_NOTICE on: a long, ordinary mail (greeting, directions, signature) still finds its one booking line', async ({ glance }) => {
  const long = 'Hi Sali,\n\nHope you are well. Quick note from the studio: your appointment is confirmed for tomorrow at 14:00 at our Tel Aviv branch, please arrive ten minutes early and bring your ID card with you. If anything changes we will let you know.\n\nBest regards,\nStudio Nofar\nwww.nofar.example | 03-1234567 | Rothschild 1, Tel Aviv';
  const page = await open(glance, { BOOKING_NOTICE: true }, long, true);
  await expect(page.locator(PANE + ' .chip-hold')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(await events(glance)).toHaveLength(1);
});

const REMIND = 'Hi Sali, one small thing: do not forget to bring the signed form tomorrow. Thanks!';
const REMIND2 = "Hi Sali, don't forget to bring the signed form tomorrow. Thanks!";

test('TASK_ASK off: a reminder asked without a question shows no card; on: one To Do task Bring the signed form, Undo deletes it', async ({ glance }) => {
  let page = await open(glance, null, REMIND2, false);
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  page = await open(glance, { TASK_ASK: true }, REMIND2, false);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/bring the signed form/i);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});

test('TASK_ASK on but the person is only on Cc: no card', async ({ glance }) => {
  await glance.seedOutlook({ glanceSwitches: { TASK_ASK: true } }, {});
  n += 1;
  const page = await glance.openOutlook({ id: 'AQMk-booking-cc-' + n, subject: 'Quick one', senderEmail: 'hello@nofar.example', senderName: 'Studio Nofar', body: REMIND2, to: ['someone.else@example.com'], cc: ['ai.local.flow@gmail.com'] });
  await page.waitForTimeout(3000);
  await expect(page.locator(PANE + ' .flow-chip-host')).toHaveCount(0);
  expect(await todo(glance)).toHaveLength(0);
});

test('TASK_ASK on, Hebrew with a relative span: «אל תשכח להביא את הטופס החתום בעוד יומיים» is one To Do task due in two days', async ({ glance }) => {
  const page = await open(glance, { TASK_ASK: true }, 'שלום סלי, אל תשכח להביא את הטופס החתום בעוד יומיים. תודה!', false);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  const due = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  const iso = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0');
  expect(JSON.stringify(list[0])).toContain(iso);
  expect(JSON.stringify(list[0])).toContain('הטופס החתום');
});

test('BOOKING_NOTICE on: a flight told in a mail is one calendar hold titled Trip, no guest, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { BOOKING_NOTICE: true }, 'Hi Sali, your flight LY001 to Paris departs tomorrow at 06:30. Please arrive at the airport two hours before.', true);
  await expect(page.locator(PANE + ' .chip-hold')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' .chip-hold').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await events(glance);
  expect(list).toHaveLength(1);
  expect(list[0].subject).toMatch(/Trip/);
  expect(list[0].attendees || []).toEqual([]);
  expect(JSON.stringify(list[0].start)).toContain('06:30');
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await events(glance)).length).toBe(0);
});

test('PAYMENT_ASK on: a bill that states what is due is one To Do task Pay 1200 NIS, nothing is paid, and Undo deletes it', async ({ glance }) => {
  const page = await open(glance, { PAYMENT_ASK: true }, 'Hi Sali, your invoice of 1,200 NIS is due by tomorrow. Thank you for working with us!', false);
  await expect(page.locator(PANE + ' button.flow-chip')).toBeVisible({ timeout: 20000 });
  await page.locator(PANE + ' button.flow-chip').click();
  await expect(page.locator(PANE + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(JSON.stringify(list[0])).toMatch(/Pay 1200 NIS/);
  await page.locator(PANE + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance)).length).toBe(0);
});
