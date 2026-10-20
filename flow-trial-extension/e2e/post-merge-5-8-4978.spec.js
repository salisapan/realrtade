// Post-merge items (5)–(8) after #178 @ 5effbaa.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const INTENT_ROOT = path.join(__dirname, '..');
const SELF = 'ai.local.flow@gmail.com';
const BOARD = 'application/pdf:board.pdf:https://mail.google.com/e2e/att/board.pdf';
const ASK = 'Please save the attached pdf to Drive.';

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

function selfTitle(body, subject) {
  const J = vm.runInContext('FlowIncomingJudge', intentEngine());
  const out = J.judge({
    text: body,
    subject: subject || 'note',
    sender: { name: 'Sali Sapan', email: SELF },
    surface: 'gmail',
    to: [SELF],
    cc: [],
    ownAddresses: [SELF],
    userName: 'Sali',
    ownNames: ['Sali', 'Sali Sapan'],
    direction: 'self',
    inbound: false,
    now: new Date('2026-10-16T12:00:00Z')
  });
  const steps = (out.process && out.process.steps) || [];
  const stepTitle = steps[0] && steps[0].params && steps[0].params.title;
  return String((out.intent && out.intent.label) || stepTitle || '');
}

function inboundShows(body) {
  const J = vm.runInContext('FlowIncomingJudge', intentEngine());
  const out = J.judge({
    text: body,
    subject: 'בדיקה',
    sender: { name: 'Dana Levi', email: 'dana@acme.io' },
    surface: 'gmail',
    to: [SELF],
    cc: [],
    ownAddresses: [SELF],
    userName: 'Sali',
    ownNames: ['Sali'],
    direction: 'inbound',
    inbound: true,
    now: new Date('2026-10-16T12:00:00Z')
  });
  return out;
}

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  if (!server) return;
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

test('(5) self card title is verb plus object, not לטפל בהערה', () => {
  const sign = selfTitle('פעולה נדרשת מצד: חתימה על ה-deck\nבתודה', 'הקבלה');
  const save = selfTitle('תשמרי את המצורף בוואן דרייב', 'דוח ההוצאות מצורף');
  expect(sign).toBe('לחתום על ה-deck');
  expect(save).toBe('לשמור את המצורף בוואן דרייב');
  expect(sign).not.toBe('לטפל בהערה');
  expect(save).not.toBe('לטפל בהערה');
});

test('(6) Hebrew verify-and-update inbound ask gets a card', () => {
  const rows = [
    'תוודא שהחשבונית שולמה ותעדכן אותי עד יום שישי.',
    'תבדוק את הסטטוס במערכת ותעדכני אותי.',
    'תוודאי שהמסמך נחתם ותודיע לי.',
    'ותעדכן אותי אחרי שתסיים את הבדיקה.'
  ];
  for (const body of rows) {
    const out = inboundShows(body);
    expect(out.show).toBe(true);
    expect(out.intent && out.intent.type).toBe('request');
  }
});

test('(7) Hebrew draft preview receipt and undo toast have no English UI strings', async ({ glance }) => {
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-58-he-ui', threadId: 't-58-he-ui', subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: 'he',
    body: ASK, downloadUrl: BOARD,
    composeReply: true, composeTo: 'dana@acme.io', composeSubject: 'Re: Board pack'
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await expect(chip).toBeVisible({ timeout: 20000 });
  await chip.click();
  const receipt = page.locator('div[role="main"] .flow-chip-done');
  await expect(receipt).toBeVisible({ timeout: 20000 });
  const text = await receipt.innerText();
  expect(text).not.toMatch(/\b(Undo|Undone|Compose filled|Handled)\b/i);
  expect(text).toMatch(/מולאה|שולח|בטל/);
  const undo = receipt.locator('button.flow-chip-undo');
  await undo.click();
  await expect.poll(async () => receipt.innerText(), { timeout: 15000 }).toMatch(/בוטל|לא נשלח/);
  const after = await receipt.innerText();
  expect(after).not.toMatch(/\b(Undo|Undone|Nothing was sent)\b/i);
});

test('(8) flow-chip-undo looks like a secondary button in light and dark', async ({ glance }) => {
  await glance.context.route('https://mail.google.com/e2e/**', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'page fetch' }));
  await glance.seedGmail({ glanceUiLanguage: 'he' });
  const page = await glance.openGmail({
    messageId: 'm-58-undo-style', threadId: 't-58-undo-style', subject: 'Board pack',
    senderEmail: 'dana@acme.io', senderName: 'Dana', ownEmail: SELF, to: [SELF], lang: 'he',
    body: ASK, downloadUrl: BOARD,
    composeReply: true, composeTo: 'dana@acme.io', composeSubject: 'Re: Board pack'
  });
  const chip = page.locator('div[role="main"] button.flow-chip');
  await chip.click();
  const undo = page.locator('div[role="main"] button.flow-chip-undo');
  await expect(undo).toBeVisible({ timeout: 20000 });

  async function assertUndoButtonLooksLikeChip() {
    const style = await undo.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        textDecoration: cs.textDecorationLine || cs.textDecoration,
        borderWidth: cs.borderTopWidth,
        borderRadius: cs.borderRadius,
        paddingLeft: cs.paddingLeft,
        background: cs.backgroundColor
      };
    });
    expect(style.textDecoration).toBe('none');
    expect(parseFloat(style.borderWidth)).toBeGreaterThan(0);
    expect(parseFloat(style.borderRadius)).toBeGreaterThanOrEqual(6);
    expect(parseFloat(style.paddingLeft)).toBeGreaterThanOrEqual(10);
  }

  await assertUndoButtonLooksLikeChip();
  await page.emulateMedia({ colorScheme: 'dark' });
  await assertUndoButtonLooksLikeChip();
});
