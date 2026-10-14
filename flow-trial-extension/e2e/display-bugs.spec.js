const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

function writtenRow(externalId, ts) {
  return {
    kind: 'written',
    messageId: S.MSG_A,
    itemId: S.MSG_A,
    system: 'microsoft/todo',
    externalId: externalId,
    connectorId: 'outlookTask',
    fetchedBack: true,
    verifiedAt: '2026-10-07T12:00:00.000Z',
    ref: { taskId: externalId, externalId: externalId, taskListId: 'todo-list' },
    ts: ts,
    app: 'outlook'
  };
}

test('Undone banner is scoped to its message id', async ({ glance }) => {
  const line = 'Undone for AQMkGlanceE2EMessageA only.';
  await glance.seedOutlook({
    glanceUndoneBanners: {
      [S.MSG_A]: { line: line, ids: [S.MSG_A], at: Date.now() }
    }
  });
  const other = await glance.openOutlook({
    id: S.MSG_B,
    subject: 'Other',
    senderEmail: S.SENDER,
    body: S.SILENT
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const scanned = (bag.outlookPageDiag || []).length > 0 || await other.locator('.flow-chip-host').count() > 0;
    const leaked = await other.getByText(line).count();
    return scanned && leaked === 0;
  }).toBe(true);

  const page = await glance.openOutlook({
    id: S.MSG_A,
    subject: 'The one',
    senderEmail: S.SENDER,
    body: S.SILENT
  });
  await expect(page.getByText(line)).toBeVisible();
  await expect(page.locator('.flow-chip-host')).toHaveCount(1);
});

test('exactly one Handled receipt after two written rows', async ({ glance }) => {
  await glance.seedOutlook({
    log: [writtenRow('todo-a', 2), writtenRow('todo-b', 1)]
  });
  const page = await glance.openOutlook({
    id: S.MSG_A,
    subject: 'Transfer',
    senderEmail: S.SENDER,
    body: S.SHOW
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-handled')).toHaveCount(1);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);
});

test('Why-not-shown drops the message once its card is showing', async ({ glance }) => {
  await glance.seedOutlook({
    outlookPageDiag: [
      {
        key: 'page:intent-null|' + S.MSG_A,
        reason: 'page:intent-null',
        messageId: S.MSG_A,
        subject: 'Show me',
        at: 2
      },
      {
        key: 'page:intent-null|' + S.MSG_B,
        reason: 'page:intent-null',
        messageId: S.MSG_B,
        subject: 'Stay quiet',
        at: 1
      }
    ]
  });
  const page = await glance.openOutlook({
    id: S.MSG_A,
    subject: 'Show me',
    senderEmail: S.SENDER,
    body: S.SHOW
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = bag.outlookPageDiag || [];
    return {
      show: diags.some((d) => d && (d.messageId === S.MSG_A || d.subject === 'Show me')),
      stay: diags.some((d) => d && (d.messageId === S.MSG_B || d.subject === 'Stay quiet'))
    };
  }).toEqual({ show: false, stay: true });

  const popup = await glance.openPopup();
  const list = popup.locator('#surface-list');
  const why = list.getByText(/Why not shown/);
  await expect(why).toBeVisible();
  await why.click();
  await expect(list.getByText('Stay quiet')).toBeVisible();
  await expect(list.getByText('Show me')).toHaveCount(0);
});
