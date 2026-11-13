// A conversation whose newest message is the account's own. An auto-forward copy to
// info@ is not an answer to the asker. A real reply to the asker is. The ask is found
// even when Gmail has folded it to a one-line row. Headless Chromium, fixtures only.
const { test, expect } = require('./support/harness');

const OWN = 'ai.local.flow@gmail.com';
const ASKER = 'salisapan1@gmail.com';
const INFO = 'info@theflow-ai.com';
const THIRD = 'ofer@partner.example';
const ASK = 'פגישת עבודה ביום ד׳ ב-14:30?';
const FWD = '---------- Forwarded message ---------\nמאת: salisapan1 <' + ASKER + '>\n\n' + ASK;

function ask(extra) {
  return Object.assign({ messageId: 'm-ask', senderEmail: ASKER, senderName: 'salisapan1', to: [OWN], body: ASK }, extra || {});
}
function own(extra) {
  return Object.assign({ messageId: 'm-copy', senderEmail: OWN, senderName: 'flow', to: [INFO], body: ASK }, extra || {});
}

// Opens the conversation, then reloads it with the console watched so the skip
// reason the tester sees in devtools is the one asserted.
async function open(glance, thread) {
  await glance.seedGmail();
  const page = await glance.openGmail({ messageId: 'm-copy', threadId: 't-thread', subject: 'G-C פגישה', ownEmail: OWN, thread });
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.reload({ waitUntil: 'domcontentloaded' });
  return { page, logs };
}
const card = (page) => page.locator('[data-legacy-message-id="m-ask"] .flow-chip-host');
const skips = (logs) => logs.filter((l) => l.indexOf('[Glance] scan skip:') === 0);

test('an open ask followed by an auto-forward copy to info@ shows the card on the ask', async ({ glance }) => {
  const { page, logs } = await open(glance, [ask(), own()]);
  await expect(card(page)).toBeVisible({ timeout: 6000 });
  await expect(page.locator('[data-legacy-message-id="m-copy"] .flow-chip-host')).toHaveCount(0);
  expect(skips(logs).join('\n')).not.toContain('no-incoming-message');
});

test('a folded ask followed by an auto-forward copy to info@ is opened and shows the card', async ({ glance }) => {
  const { page } = await open(glance, [ask({ collapsed: true }), own()]);
  await expect(card(page)).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-legacy-message-id="m-copy"] .flow-chip-host')).toHaveCount(0);
});

test('a folded ask followed by a copy to another alias of the account shows the card', async ({ glance }) => {
  const { page } = await open(glance, [ask({ collapsed: true }), own({ to: ['flow.alias@gmail.com'] })]);
  await expect(card(page)).toBeVisible({ timeout: 8000 });
});

test('a Fwd: copy of the account to a third party still shows the card', async ({ glance }) => {
  const open1 = await open(glance, [ask(), own({ to: [THIRD], body: FWD })]);
  await expect(card(open1.page)).toBeVisible({ timeout: 6000 });
});

test('a folded ask followed by a Fwd: copy to a third party shows the card', async ({ glance }) => {
  const { page } = await open(glance, [ask({ collapsed: true }), own({ to: [THIRD], body: FWD })]);
  await expect(card(page)).toBeVisible({ timeout: 8000 });
});

test('a real reply to the asker closes the ask and stays quiet, and says why', async ({ glance }) => {
  const { page, logs } = await open(glance, [ask(), own({ to: [ASKER], body: 'סבבה, מתאים לי' })]);
  await page.waitForTimeout(3000);
  await expect(page.locator('.flow-chip-host')).toHaveCount(0);
  expect(skips(logs).join('\n')).toContain('no-incoming-message');
});

test('a real reply that also copies a third party still closes the ask', async ({ glance }) => {
  const { page, logs } = await open(glance, [ask({ collapsed: true }), own({ to: [ASKER], cc: [INFO], body: 'סבבה' })]);
  await page.waitForTimeout(3000);
  await expect(page.locator('.flow-chip-host')).toHaveCount(0);
  expect(skips(logs).join('\n')).toContain('no-incoming-message');
});

test('a reply of yours that is older than a new ask from the same person does not close it', async ({ glance }) => {
  const thread = [
    ask({ messageId: 'm-old', body: 'מה נשמע?' }),
    own({ messageId: 'm-reply', to: [ASKER], body: 'טוב' }),
    ask({ messageId: 'm-ask', body: ASK })
  ];
  await glance.seedGmail();
  const page = await glance.openGmail({ messageId: 'm-ask', threadId: 't-thread', subject: 'G-C פגישה', ownEmail: OWN, thread });
  await expect(card(page)).toBeVisible({ timeout: 6000 });
});

test('the audience rules are unchanged: a folded ask that only copies the account stays quiet', async ({ glance }) => {
  const ccOnly = await open(glance, [ask({ collapsed: true, to: [THIRD], cc: [OWN] }), own()]);
  await ccOnly.page.waitForTimeout(3500);
  await expect(card(ccOnly.page)).toHaveCount(0);
  await expect(ccOnly.page.locator('.flow-chip-host')).toHaveCount(0);
});

test('with no ask in the thread at all, a copy of the account stays quiet and says so', async ({ glance }) => {
  const { page, logs } = await open(glance, [own()]);
  await page.waitForTimeout(3000);
  await expect(page.locator('.flow-chip-host')).toHaveCount(0);
  expect(skips(logs).join('\n')).toContain('no-incoming-message');
});

// Live Gate 77961fb (9/11): "Can you call the bank before Thursday?" folded under its
// automatic "Fwd:" copy to info@. Gmail ignores a click on the folded row itself, so the
// ask must be opened with a click inside the row, then judged.
test('live Gate D shape: a folded English ask under its Fwd: copy to info@ opens and shows the card', async ({ glance }) => {
  const body = 'Can you call the bank before Thursday?';
  const { page } = await open(glance, [ask({ collapsed: true, body, senderName: 'Sali Sapan' }), own({ body })]);
  await expect(card(page)).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-legacy-message-id="m-copy"] .flow-chip-host')).toHaveCount(0);
});
