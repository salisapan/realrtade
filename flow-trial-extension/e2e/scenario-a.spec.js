// Holistic close map §4 Scenario A, with Graph mocked in the service worker.
// One sitting: a To Do proof, a suggest-save OneDrive proof, and a draft that
// stays a draft. Both proofs undo. Nothing is sent.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const DANA = "I'll send Dana the numbers by Thursday.";
const PDF = [{
  id: 'att-board',
  name: 'board-pack.pdf',
  contentType: 'application/pdf',
  size: 4096,
  isInline: false
}];
const MSG_DANA = 'AQMkGlanceE2EScenarioDana';
const MSG_FILE = 'AQMkGlanceE2EScenarioFile';
const MSG_REPLY = 'AQMkGlanceE2EScenarioReply';

test('Scenario A closes the task and the file, and the reply stays a draft', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: { [MSG_FILE]: PDF },
    conversation: []
  });

  const dana = await glance.openOutlook({
    id: MSG_DANA,
    subject: 'Numbers for Dana',
    senderEmail: S.SENDER,
    body: DANA
  });
  await dana.locator('#ReadingPaneContainerId button.flow-chip').click();
  await expect(dana.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveText('Handled.');
  const created = await glance.apiCalls();
  expect(created.some((c) => c.method === 'POST' && c.url.indexOf('/me/todo/lists/') >= 0)).toBe(true);
  expect(created.some((c) => c.method === 'GET' && /\/me\/todo\/lists\/[^/]+\/tasks\/e2e-todo-/.test(c.url))).toBe(true);
  await dana.reload({ waitUntil: 'domcontentloaded' });
  await expect(dana.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(1);
  await expect(dana.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);

  const file = await glance.openOutlook({
    id: MSG_FILE,
    subject: 'Board pack',
    senderEmail: S.SENDER,
    body: S.SUGGEST_BODY
  });
  await expect(file.locator('#ReadingPaneContainerId .flow-chip-process-name')).toHaveText('Save the file?');
  await file.locator('#ReadingPaneContainerId button.flow-chip').click();
  await expect(file.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveText('Handled.');
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'GET' && c.url.indexOf('/me/drive/items/e2e-file-') >= 0);
  }).toBe(true);

  const reply = await glance.openOutlook({
    id: MSG_REPLY,
    subject: 'Transfer',
    senderEmail: S.SENDER,
    body: S.SHOW
  });
  await expect(reply.locator('#ReadingPaneContainerId .flow-step-list')).toBeVisible();
  await reply.locator('#ReadingPaneContainerId .ss-add-btn').click();
  await reply.locator('#ReadingPaneContainerId .ss-add-input').fill('reply to Dana Thursday');
  await reply.locator('#ReadingPaneContainerId .ss-add-input').press('Enter');
  await expect(reply.locator('#ReadingPaneContainerId .act-tag', { hasText: 'Added' })).toBeVisible();
  await reply.locator('#ReadingPaneContainerId button.flow-chip').click();
  await expect(reply.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveText('Draft ready.');
  await expect(reply.locator('#ReadingPaneContainerId').getByText('Not sent.')).toBeVisible();
  await expect(reply.locator('#ReadingPaneContainerId').getByText('Handled.')).toHaveCount(0);
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'POST' && c.url.indexOf('/createReply') >= 0);
  }).toBe(true);

  const loops = await glance.openPopup();
  await loops.locator('button[data-tab="open"]').click();
  await expect(loops.locator('#open-list .log-kind').filter({ hasText: 'Handled' })).toHaveCount(2);
  await expect(loops.locator('#open-list .log-kind').filter({ hasText: 'Draft' })).toHaveCount(1);

  await dana.locator('#ReadingPaneContainerId button.flow-chip-undo').click();
  await file.locator('#ReadingPaneContainerId button.flow-chip-undo').click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    const task = calls.some((c) => c.method === 'DELETE' && /\/me\/todo\/lists\/[^/]+\/tasks\//.test(c.url));
    const drive = calls.some((c) => c.method === 'DELETE' && c.url.indexOf('/me/drive/items/e2e-file-') >= 0);
    return task && drive;
  }).toBe(true);

  const activity = await glance.openPopup();
  await activity.locator('button[data-tab="log"]').click();
  await expect(activity.locator('#log-list .log-kind').filter({ hasText: 'Handled' })).toHaveCount(0);
  await expect(activity.locator('#log-list .log-kind').filter({ hasText: 'Draft' })).toHaveCount(1);

  await reply.locator('#ReadingPaneContainerId button.flow-chip-undo').click();
  await expect.poll(async () => {
    const calls = await glance.apiCalls();
    return calls.some((c) => c.method === 'DELETE' && /\/me\/messages\/e2e-draft-/.test(c.url));
  }).toBe(true);
  const calls = await glance.apiCalls();
  expect(calls.some((c) => /\/sendMail|\/microsoft\.graph\.sendMail|\/me\/sendMail/.test(c.url))).toBe(false);
});
