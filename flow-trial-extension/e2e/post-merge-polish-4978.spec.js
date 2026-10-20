// Post-merge polish (a)–(d) after #165 @ 8e0682f.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { liveGmailPage } = require('./support/live-gate-livedom');

const INTENT_ROOT = path.join(__dirname, '..');
const SELF = 'ai.local.flow@gmail.com';
const BOARD = 'application/pdf:board.pdf:https://mail.google.com/e2e/att/board.pdf';
const ASK = 'Please save the attached pdf to Drive.';
const MSG7 = '1a151c5bd0b21864';

let server;
let intentVm;

function intentEngine() {
  if (intentVm) return intentVm;
  const engine = { module: undefined, console };
  vm.createContext(engine);
  for (const f of ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'close-families.js', 'fact-reply.js', 'intent.js', 'actions.js', 'file-attach.js', 'resolution.js', 'draft-reply.js', 'incoming-judge.js', 'commitment-title.js', 'display-copy.js']) {
    vm.runInContext(fs.readFileSync(path.join(INTENT_ROOT, 'core', f), 'utf8'), engine, { filename: f });
  }
  intentVm = engine;
  return engine;
}

function selfRenewLabel(body) {
  const J = vm.runInContext('FlowIncomingJudge', intentEngine());
  const out = J.judge({
    text: body,
    subject: 'Domain renewal – Ofek',
    sender: { name: 'flow', email: SELF },
    surface: 'gmail',
    to: [SELF],
    cc: [],
    ownAddresses: [SELF],
    userName: 'flow',
    ownNames: ['flow'],
    direction: 'self',
    inbound: false,
    now: new Date('2026-10-16T12:00:00Z')
  });
  return String((out && out.intent && out.intent.label) || '');
}

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  if (!server) return;
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

test('(a) item7 audience probe leaves Gmail details closed after one open', async ({ glance }) => {
  await glance.seedGmail({ onboarded: true, connectorId: 'googleTasks', glanceUiLanguage: 'he' });
  const html = liveGmailPage({
    liveDom: 'item7-collapsed',
    detailsFrom: 'item7-details',
    messageId: MSG7,
    threadId: MSG7,
    title: 'חוזה חתום – ברוש - ai.local.flow@gmail.com - Gmail'
  });
  const page = await glance.openGmailHtml(html, { messageId: MSG7 });
  const msgSel = '[data-legacy-message-id="' + MSG7 + '"]';
  const stats = await page.evaluate(({ msgSel }) => {
    return new Promise((resolve) => {
      const root = document.querySelector(msgSel) || document;
      let toggleClicks = 0;
      root.querySelectorAll('.ajy').forEach((btn) => {
        btn.addEventListener('click', () => { toggleClicks++; }, true);
      });
      setTimeout(() => {
        const detailsOpen = !!(root.querySelector && root.querySelector('.ajB table.ajC, table.ajC'));
        resolve({ toggleClicks, detailsOpen });
      }, 8000);
    });
  }, { msgSel });
  await expect(page.locator(msgSel + ' .flow-chip-host, div[role="main"] .flow-chip-host').first()).toBeVisible({ timeout: 5000 });
  expect(stats.toggleClicks).toBeGreaterThanOrEqual(1);
  expect(stats.toggleClicks).toBeLessThanOrEqual(2);
  expect(stats.detailsOpen).toBe(false);
});

test('(b) verified Drive save and draft show full handled, not partly handled', async ({ glance }) => {
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-polish-b', threadId: 't-polish-b', subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: 'he',
    body: ASK, downloadUrl: BOARD,
    composeReply: true, composeTo: 'dana@acme.io', composeSubject: 'Re: Board pack'
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  const receipt = page.locator('div[role="main"] .flow-chip-done');
  await expect(receipt).toBeVisible({ timeout: 20000 });
  await expect(receipt.locator('.flow-chip-handled')).toContainText('טופל');
  await expect(receipt).not.toContainText('טופל חלקית');
  await expect(receipt.locator('.flow-chip-handled-partial')).toHaveCount(0);
});

test('(b) one closed step of two still yields partly handled copy', () => {
  const engine = { module: undefined, console };
  vm.createContext(engine);
  vm.runInContext(fs.readFileSync(path.join(INTENT_ROOT, 'src/receipt-copy.js'), 'utf8'), engine, { filename: 'receipt-copy.js' });
  const R = vm.runInContext('FlowReceipt', engine);
  const copy = R.confirmation({ succeeded: 1, total: 2, priorCloses: 0, lang: 'he' });
  expect(copy.full).toBe(false);
  expect(copy.status).toBe('Partly handled.');
});

test('(c) receipt undo is a real button with a short label and rolls back', async ({ glance }) => {
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-polish-undo', threadId: 't-polish-undo', subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: 'he',
    body: ASK, downloadUrl: BOARD,
    composeReply: true, composeTo: 'dana@acme.io', composeSubject: 'Re: Board pack'
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await chip.click();
  const undo = page.locator('div[role="main"] button.flow-chip-undo');
  await expect(undo).toBeVisible({ timeout: 20000 });
  await expect(undo).toHaveAttribute('type', 'button');
  const label = await undo.innerText();
  expect(label.length).toBeLessThan(24);
  expect(label).toMatch(/בטל|Undo/i);
  expect(label).not.toMatch(/ביטול הכל/);
  const id = server.last.file;
  await undo.click();
  await expect.poll(() => server.file(id).trashed, { timeout: 15000 }).toBe(true);
});

test('(d) google.com/url without q= is stripped from the self-renew title', () => {
  const poison = 'https://www.google.com/url?' + Array(30).fill('sa=E').join('&');
  const body = 'Remind me to renew the ' + poison + ' on Friday';
  const t0 = Date.now();
  const label = selfRenewLabel(body);
  const ms = Date.now() - t0;
  expect(ms).toBeLessThan(500);
  expect(label).toBe('Remind me to renew on Friday');
  expect(label).not.toMatch(/google\.com\/url/);
});
