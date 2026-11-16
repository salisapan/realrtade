// Live Gate e4490caf (b). A self-sent Hebrew quote, with FULL_DOCUMENT_CLOSE
// and WORKSPACE_FILE already on, must be the Doc preview card. A self-task
// titled משימה is the miss. The real page asks the worker
// (flow:google-full-document-plan). Nothing is sent.
const { test, expect } = require('./support/harness');

const SELF = 'ai.local.flow@gmail.com';
const SUBJECT = '[G-Quote] בקשה להצעת מחיר לאתר חדש 13/11';
const BODY = 'היי, אפשר לקבל הצעת מחיר מסודרת לבניית אתר תדמית של 5 עמודים? תודה, רוני';

function watch(glance) {
  const logs = [];
  glance.context.on('page', (p) => {
    p.on('console', (msg) => logs.push(msg.text()));
  });
  return logs;
}

function openQuote(glance) {
  return glance.openGmail({
    liveSelf: true,
    lang: 'he',
    messageId: 'm-gquote-self',
    threadId: 't-gquote-self',
    ownEmail: SELF,
    senderName: 'רוני',
    subject: SUBJECT,
    body: BODY,
    toSelfText: 'אליי',
    accountLabel: 'Google Account: רוני (' + SELF + ')'
  });
}

test('self-sent Hebrew quote is a Doc card, not a task', async ({ glance }) => {
  const logs = watch(glance);
  await glance.seedGmail({
    glanceSwitches: { WORKSPACE_FILE: true, FULL_DOCUMENT_CLOSE: true },
    googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' }
  });
  const page = await openQuote(glance);
  const card = page.locator('[data-legacy-message-id="m-gquote-self"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('טיוטת הצעת מחיר');
  await expect(card.locator('.flow-chip-process-name')).not.toHaveText('משימה');
  await expect.poll(() => logs.some((line) => /\[Glance\] full-document plan offer /.test(line))).toBe(true);
});

test('a missing Drive grant asks to reconnect and does not offer a task', async ({ glance }) => {
  const logs = watch(glance);
  await glance.seedGmail({
    glanceSwitches: { WORKSPACE_FILE: true, FULL_DOCUMENT_CLOSE: true },
    googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' },
    googleGrantedScopes: {
      version: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/tasks'
      ].join('\n'),
      status: 'granted',
      source: 'chrome',
      at: Date.now()
    }
  });
  const page = await openQuote(glance);
  const card = page.locator('[data-legacy-message-id="m-gquote-self"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.locator('.flow-chip-reconnect')).toBeVisible();
  await expect(card).not.toContainText('משימה');
  await expect.poll(() => logs.some((line) => /\[Glance\] full-document plan reconnect drive-scope/.test(line))).toBe(true);
});

test('turning FULL_DOCUMENT_CLOSE on rescans the open mail', async ({ glance }) => {
  await glance.seedGmail({
    glanceSwitches: { WORKSPACE_FILE: true },
    googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' }
  });
  const page = await openQuote(glance);
  const card = page.locator('[data-legacy-message-id="m-gquote-self"] .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).not.toContainText('טיוטת הצעת מחיר');
  await glance.evaluateWorker(async () => {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    await chrome.storage.local.set({
      glanceSwitches: Object.assign({}, bag.glanceSwitches, { WORKSPACE_FILE: true, FULL_DOCUMENT_CLOSE: true })
    });
  });
  await expect(card).toContainText('טיוטת הצעת מחיר');
  await expect(card.locator('.flow-chip-process-name')).not.toHaveText('משימה');
});
