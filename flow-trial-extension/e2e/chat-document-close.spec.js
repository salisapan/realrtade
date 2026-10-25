// The loop of a document chased in WhatsApp, closed for real: the person asks Dana for the signed contract by Thursday ("Waiting on Dana: Send me
// the signed contract" task, CHAT_PROMISE_CARD), Dana writes that she sent it, the card offers to mark the task done (CHAT_TASK_CARD), Do It
// completes the Google Task, reads it back as completed, Undo reopens it, and a task the person changed is left alone. A thing nobody waits for,
// a promise to send later and a payment-shaped message show no document card; "I sent you the contract" no longer offers to close a payment task.
// Unpacked extension, the production WhatsApp lane registration, the local Google lane server. Nothing is sent and no key is pressed.
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

async function setup(glance, ask, title) {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedGmail({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' }, glanceSwitches: { CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true } });
  const page = await glance.openWhatsApp(whatsappHtml(ask, { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toBe(title);
  expect(tasks()[0].status).toBe('needsAction');
}
const ASK = 'Please send me the signed contract by Thursday';
const TITLE = 'Waiting on Dana: Send me the signed contract';

test('Dana says she sent it: the card marks the waiting task done, read back as completed, and Undo reopens it', async ({ glance }) => {
  await setup(glance, ASK, TITLE);
  const page = await glance.openWhatsApp(whatsappHtml('I just sent you the signed contract', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(CARD)).toContainText('Mark done');
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].status).toBe('completed');
  expect(tasks()[0].title).toBe(TITLE);
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks()[0].status).toBe('needsAction');
});

test('a Hebrew ask and a Hebrew "I sent it" close the same way', async ({ glance }) => {
  expect(await registerWhatsApp(glance)).toBe(true);
  await setup(glance, 'תשלח לי את החוזה החתום עד יום חמישי', 'מחכים ל-Dana: תשלח לי את החוזה החתום');
  const page = await glance.openWhatsApp(whatsappHtml('שלחתי לך את החוזה החתום', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()[0].status).toBe('completed');
});

test('a task the person changed is left alone and the card says so', async ({ glance }) => {
  await setup(glance, ASK, TITLE);
  const id = Object.keys(server.tasks())[0];
  server.editTask(id, { title: TITLE + ' (v2 only)' });
  const page = await glance.openWhatsApp(whatsappHtml('Just sent the signed contract', { id: 'CCC' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' [data-glance-chip-state="flow-chip-error"]')).toHaveAttribute('data-glance-chip-label', /שינית את המשימה|changed this task/, { timeout: 15000 });
  expect(server.tasks()[id].status).toBe('needsAction');
});

test('a thing nobody waits for, a promise to send later and a question show no Mark done card', async ({ glance }) => {
  await setup(glance, ASK, TITLE);
  for (const [text, id] of [['I sent you the logo', 'D1'], ["I'll send the contract tomorrow", 'D2'], ['Did you get the contract?', 'D3'], ['Here is the invoice', 'D4']]) {
    const page = await glance.openWhatsApp(whatsappHtml(text, { id: id }));
    await page.waitForTimeout(2500);
    await expect(page.locator(CARD + ':has-text("Mark done")')).toHaveCount(0); // a promise to send is its own card (a task), never the close
  }
  expect(tasks()[0].status).toBe('needsAction');
});

test('"I sent you the contract" no longer offers to close a payment task', async ({ glance }) => {
  await setup(glance, 'Please transfer 500 NIS to my account by Thursday', 'Waiting on Dana: Payment 500 NIS');
  const page = await glance.openWhatsApp(whatsappHtml('I sent you the contract', { id: 'BBB' }));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(tasks()[0].status).toBe('needsAction');
});
