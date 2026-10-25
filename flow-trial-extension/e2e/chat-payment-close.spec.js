// The loop of a payment chased in WhatsApp, closed for real: the person asks Dana to transfer 500 NIS ("Waiting on Dana: Payment 500 NIS"
// task, CHAT_PROMISE_CARD), Dana writes that she transferred it, the card offers to mark the task done (CHAT_TASK_CARD), Do It completes the
// Google Task, reads it back as completed, Undo reopens it, and a task the person changed is left alone. Unpacked extension, the production
// WhatsApp lane registration, the local Google lane server. Nothing is sent and no key is pressed.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { whatsappHtml, registerWhatsApp } = require('./support/rehearsal');

const CARD = '#glance-chat-task .flow-chip-host';
let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});
const tasks = () => Object.values(server.tasks());

async function setup(glance) {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedGmail({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' }, glanceSwitches: { CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true } });
  const page = await glance.openWhatsApp(whatsappHtml('Please transfer 500 NIS to my account by Thursday', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toBe('Waiting on Dana: Payment 500 NIS');
  expect(tasks()[0].status).toBe('needsAction');
}

test('Dana says she transferred it: the card marks the waiting task done, read back as completed, and Undo reopens it', async ({ glance }) => {
  await setup(glance);
  const page = await glance.openWhatsApp(whatsappHtml('I transferred 500 NIS', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(CARD)).not.toContainText('transferred');
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].status).toBe('completed');
  expect(tasks()[0].title).toBe('Waiting on Dana: Payment 500 NIS');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks()[0].status).toBe('needsAction');
});

test('a task the person changed is left alone and the card says so', async ({ glance }) => {
  await setup(glance);
  const id = Object.keys(server.tasks())[0];
  server.editTask(id, { title: 'Waiting on Dana: Payment 500 NIS (half paid)' });
  const page = await glance.openWhatsApp(whatsappHtml('העברתי לך 500 ש"ח', { id: 'CCC' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' [data-glance-chip-state="flow-chip-error"]')).toHaveAttribute('data-glance-chip-label', /שינית את המשימה|changed this task/, { timeout: 15000 });
  expect(server.tasks()[id].status).toBe('needsAction');
  expect(server.tasks()[id].title).toBe('Waiting on Dana: Payment 500 NIS (half paid)');
});

test('a promise to pay later, another amount and a denial show no close card', async ({ glance }) => {
  await setup(glance);
  for (const text of ['I will pay tomorrow', 'I transferred 900 NIS', "I haven't paid yet", 'לא שילמתי עדיין']) {
    const page = await glance.openWhatsApp(whatsappHtml(text, { id: 'Z' + text.length }));
    await page.waitForTimeout(2500);
    await expect(page.locator(CARD + ' button.flow-chip')).toHaveCount(0);
  }
  expect(tasks()[0].status).toBe('needsAction');
});

// The same loop for a person on Microsoft only (the Graph stand-in): the waiting task is a To Do task.
const todo = (glance) => glance.evaluateWorker(() => Object.values(globalThis.__glanceE2e.todoTasks));

async function setupOutlook(glance) {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedOutlook({ glanceSwitches: { CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true } }, { calendar: true });
  const page = await glance.openWhatsApp(whatsappHtml('Please transfer 500 NIS to my account by Thursday', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(list[0].title).toBe('Waiting on Dana: Payment 500 NIS');
}

test('Microsoft To Do: Dana says she transferred it, the card marks the waiting To Do task done, read back as completed, and Undo reopens it', async ({ glance }) => {
  await setupOutlook(glance);
  const page = await glance.openWhatsApp(whatsappHtml('I transferred 500 NIS', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  let list = await todo(glance);
  expect(list).toHaveLength(1);
  expect(list[0].status).toBe('completed');
  expect(list[0].title).toBe('Waiting on Dana: Payment 500 NIS');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => (await todo(glance))[0].status).toBe('notStarted');
});

test('Microsoft To Do: a task the person changed is left alone and the card says so', async ({ glance }) => {
  await setupOutlook(glance);
  await glance.evaluateWorker(() => { const t = Object.values(globalThis.__glanceE2e.todoTasks)[0]; t.title = 'Waiting on Dana: Payment 500 NIS (half paid)'; });
  const page = await glance.openWhatsApp(whatsappHtml('העברתי לך 500 ש"ח', { id: 'CCC' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' [data-glance-chip-state="flow-chip-error"]')).toHaveAttribute('data-glance-chip-label', /שינית את המשימה|changed this task/, { timeout: 15000 });
  const list = await todo(glance);
  expect(list[0].status).toBe('notStarted');
  expect(list[0].title).toBe('Waiting on Dana: Payment 500 NIS (half paid)');
});
