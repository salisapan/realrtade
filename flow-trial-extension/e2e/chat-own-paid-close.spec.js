// The loop of an invoice told in WhatsApp, closed for real: a vendor writes that invoice 2231 is due Thursday (a "Pay invoice 2231" Google Task,
// CHAT_TASK_CARD), the person later writes (their own message, CHAT_PROMISE_CARD) that they paid it, the card offers to mark that task done, Do It completes the Google Task and reads
// it back as completed, Undo reopens it, and a task the person changed is left alone. A payment promise, a different invoice and a question show no
// card. Unpacked extension, the production WhatsApp lane registration, the local Google lane server. Nothing is paid or sent.
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

async function setup(glance, notice, titleRe) {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedGmail({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' }, glanceSwitches: { CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true } });
  const page = await glance.openWhatsApp(whatsappHtml(notice));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].title).toMatch(titleRe);
  expect(tasks()[0].status).toBe('needsAction');
}
const NOTICE = 'Reminder: your invoice 2231 is due on Thursday';

test('the person writes that they paid the invoice: the card marks the task done, read back as completed, and Undo reopens it', async ({ glance }) => {
  await setup(glance, NOTICE, /^Pay invoice 2231/);
  const page = await glance.openWhatsApp(whatsappHtml('I paid invoice 2231', { own: true, id: 'PAID1' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(CARD)).toContainText('Mark done');
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].status).toBe('completed');
  expect(await page.evaluate(() => window.__glanceSendClicks || 0)).toBe(0);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(() => tasks()[0].status).toBe('needsAction');
});

test('a Hebrew invoice notice and a Hebrew "I paid" close the same way', async ({ glance }) => {
  await setup(glance, 'חשבונית מספר 2231 לתשלום עד יום חמישי', /^לשלם חשבונית 2231/);
  const page = await glance.openWhatsApp(whatsappHtml('שילמתי את חשבונית מספר 2231', { own: true, id: 'PAID2' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()[0].status).toBe('completed');
});

test('a task the person changed is left alone and the card says so', async ({ glance }) => {
  await setup(glance, NOTICE, /^Pay invoice 2231/);
  const id = Object.keys(server.tasks())[0];
  server.editTask(id, { title: tasks()[0].title + ' (v2 only)' });
  const page = await glance.openWhatsApp(whatsappHtml('I paid invoice 2231', { own: true, id: 'PAID3' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' [data-glance-chip-state="flow-chip-error"]')).toHaveAttribute('data-glance-chip-label', /שינית את המשימה|changed this task/, { timeout: 15000 });
  expect(server.tasks()[id].status).toBe('needsAction');
});

test('a promise to pay later, another invoice and a question show no Mark done card', async ({ glance }) => {
  await setup(glance, NOTICE, /^Pay invoice 2231/);
  for (const [text, id] of [['I will pay invoice 2231 tomorrow', 'N1'], ['I paid invoice 9999', 'N2'], ['Did I pay invoice 2231?', 'N3']]) {
    const page = await glance.openWhatsApp(whatsappHtml(text, { own: true, id: id }));
    await page.waitForTimeout(2500);
    await expect(page.locator(CARD + ':has-text("Mark done")')).toHaveCount(0);
  }
  expect(tasks()[0].status).toBe('needsAction');
});
