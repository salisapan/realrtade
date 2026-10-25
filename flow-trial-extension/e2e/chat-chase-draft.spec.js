// A payment chased in WhatsApp that is late (CHAT_CHASE_DRAFT, off, beside CHAT_TASK_CARD and CHAT_PROMISE_CARD): the person asked Dana for 500 NIS
// by Thursday ("Waiting on Dana: Payment 500 NIS" task), the day has passed, and Dana writes something that is not the payment. The card offers
// a short, polite reminder; Do It puts it in the chat's box and nowhere else. Nothing is sent, no key is pressed, the waiting task stays open
// (the loop closes when Dana pays), a box that already has text is left alone, Undo empties the box only while it holds exactly those words, and
// a reminder is not offered twice in three days. Unpacked extension, the production WhatsApp lane registration, the local Google lane server.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { whatsappHtml, registerWhatsApp } = require('./support/rehearsal');

const CARD = '#glance-chat-task .flow-chip-host';
const BOX = '[data-glance-composer="1"]';
let server;
test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount('me@x.com');
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});
const tasks = () => Object.values(server.tasks());

function isoDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// The waiting task is written from the person's own message; then its due day is moved into the past, as if the days had gone by.
async function waitingTask(glance, switches, own, dueDaysAgo) {
  expect(await registerWhatsApp(glance)).toBe(true);
  await glance.seedGmail({ googleConnectedAccount: { email: 'me@x.com', at: Date.now(), source: 'web' }, glanceSwitches: Object.assign({ CHAT_TASK_CARD: true, CHAT_PROMISE_CARD: true }, switches || {}) });
  const page = await glance.openWhatsApp(whatsappHtml(own || 'Please transfer 500 NIS to my account by Thursday', { own: true }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  expect(tasks()).toHaveLength(1);
  const due = isoDaysAgo(dueDaysAgo);
  await glance.evaluateWorker((iso) => new Promise((resolve) => chrome.storage.local.get('log', (bag) => {
    const log = (bag.log || []).map((e) => {
      const st = e && e.kind === 'written' && e.process && e.process.steps && e.process.steps[0];
      if (st && st.params && /^Waiting on|^מחכים/.test(String(st.params.title || ''))) {
        const steps = e.process.steps.map((s, k) => (k === 0 ? Object.assign({}, s, { params: Object.assign({}, s.params, { dateIso: iso }) }) : s));
        return Object.assign({}, e, { process: Object.assign({}, e.process, { steps: steps }) });
      }
      return e;
    });
    chrome.storage.local.set({ log: log }, resolve);
  })), due);
}

const SEND = (page) => page.evaluate(() => window.__glanceSendClicks || 0);

test('CHAT_CHASE_DRAFT off: a late payment and an unrelated reply show no reminder card', async ({ glance }) => {
  await waitingTask(glance, null, null, 3);
  const page = await glance.openWhatsApp(whatsappHtml('ok, I will check', { id: 'BBB' }));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await page.locator(BOX).innerText()).toBe('');
});

test('CHAT_CHASE_DRAFT on: the card puts a polite reminder in the box, sends nothing, keeps the task open, and Undo empties the box', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true }, null, 3);
  const page = await glance.openWhatsApp(whatsappHtml('ok, I will check', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(CARD)).toContainText('Reminder to Dana in the chat');
  expect(await page.locator(BOX).innerText()).toBe('');
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const text = await page.locator(BOX).innerText();
  expect(text).toMatch(/^Hi Dana, a quick reminder: I'm still waiting on the 500 NIS payment \(it was due [A-Z][a-z]+day\)\./);
  expect(text).toMatch(/Thanks!$/);
  expect(await SEND(page)).toBe(0);
  expect(tasks()).toHaveLength(1);
  expect(tasks()[0].status).toBe('needsAction');
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await expect.poll(async () => page.locator(BOX).innerText()).toBe('');
  expect(await SEND(page)).toBe(0);
});

test('CHAT_CHASE_DRAFT on: Undo leaves a draft the person edited', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true }, null, 3);
  const page = await glance.openWhatsApp(whatsappHtml('ok, I will check', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  await page.evaluate((sel) => { document.querySelector(sel).textContent = document.querySelector(sel).textContent + ' Also, any news on the invoice?'; }, BOX);
  await page.locator(CARD + ' button.flow-chip-undo').click();
  await page.waitForTimeout(2000);
  expect(await page.locator(BOX).innerText()).toMatch(/any news on the invoice\?$/);
});

test('CHAT_CHASE_DRAFT on: a box that already has text is left alone and the card says so', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true }, null, 3);
  const page = await glance.openWhatsApp(whatsappHtml('ok, I will check', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.evaluate((sel) => { document.querySelector(sel).textContent = 'something I am typing'; }, BOX);
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' [data-glance-chip-state="flow-chip-error"]')).toHaveAttribute('data-glance-chip-label', /already has text/, { timeout: 15000 });
  expect(await page.locator(BOX).innerText()).toBe('something I am typing');
});

test('CHAT_CHASE_DRAFT on: a task that is not late yet, and a reminder drafted a day ago, show no card', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true }, null, 0);
  let page = await glance.openWhatsApp(whatsappHtml('ok, I will check', { id: 'BBB' }));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  const taskRowKey = await glance.evaluateWorker(() => new Promise((resolve) => chrome.storage.local.get('log', (bag) => {
    const row = (bag.log || []).find((e) => e && e.kind === 'written' && e.process && e.process.steps && e.process.steps[0] && /^Waiting on/.test(String(e.process.steps[0].params.title || '')));
    resolve(row && row.chatKey);
  })));
  const due = isoDaysAgo(4);
  await glance.evaluateWorker((args) => new Promise((resolve) => chrome.storage.local.get('log', (bag) => {
    const log = (bag.log || []).map((e) => {
      const st = e && e.kind === 'written' && e.process && e.process.steps && e.process.steps[0];
      if (st && /^Waiting on/.test(String(st.params.title || ''))) {
        const steps = e.process.steps.map((s, k) => (k === 0 ? Object.assign({}, s, { params: Object.assign({}, s.params, { dateIso: args.due }) }) : s));
        return Object.assign({}, e, { process: Object.assign({}, e.process, { steps: steps }) });
      }
      return e;
    });
    log.unshift({ kind: 'nudge', label: 'Reminder drafted in the chat. Not sent.', app: 'chat', connectorId: 'chatChase', chatKey: 'x', nudgeFor: args.key, at: Date.now() - 86400000 });
    chrome.storage.local.set({ log: log }, resolve);
  })), { due: due, key: taskRowKey });
  page = await glance.openWhatsApp(whatsappHtml('hello?', { id: 'CCC' }));
  await page.waitForTimeout(3000);
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await page.locator(BOX).innerText()).toBe('');
});

test('CHAT_CHASE_DRAFT on: Dana saying she paid still offers to mark the task done, not a reminder', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true }, null, 3);
  const page = await glance.openWhatsApp(whatsappHtml('I transferred 500 NIS', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(CARD)).not.toContainText('Remind');
  expect(await page.locator(BOX).innerText()).toBe('');
});

test('CHAT_CHASE_DRAFT on: a Hebrew payment ask gets a Hebrew reminder', async ({ glance }) => {
  await waitingTask(glance, { CHAT_CHASE_DRAFT: true }, 'תעביר לי 500 ש"ח עד יום חמישי', 3);
  expect(tasks()[0].title).toMatch(/^מחכים/);
  const page = await glance.openWhatsApp(whatsappHtml('בסדר, אבדוק', { id: 'BBB' }));
  await expect(page.locator(CARD)).toBeVisible({ timeout: 20000 });
  await page.locator(CARD + ' button.flow-chip').click();
  await expect(page.locator(CARD + ' .flow-chip-handled')).toBeVisible({ timeout: 20000 });
  const text = await page.locator(BOX).innerText();
  expect(text).toMatch(/^היי Dana, תזכורת קטנה: עדיין מחכה לתשלום של 500 NIS \(היה אמור להגיע עד יום /);
  expect(await SEND(page)).toBe(0);
});
