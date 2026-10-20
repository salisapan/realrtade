// A Word or Excel file on an Outlook mail is a Save the file? card when
// OneDrive is on. When it is off, the page says that, and does not say no
// request was found. Headless Chromium, mocked Graph, fixtures only.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const KINDS = {
  word: { id: 'AQMkReasonWord', file: { id: 'att-w', name: 'contract.docx', contentType: DOCX, size: 20480, isInline: false } },
  excel: { id: 'AQMkReasonExcel', file: { id: 'att-x', name: 'budget.xlsx', contentType: XLSX, size: 30720, isInline: false } }
};
const BODY = 'Thanks, attaching the board pack for your records today.';

async function open(glance, kind, auth) {
  const k = KINDS[kind];
  await glance.seedOutlook({ glanceUiLanguage: 'he' }, auth);
  await glance.setScenario({ inbox: [], sent: [], messages: {}, attachments: { [k.id]: [k.file] }, conversation: [] });
  return glance.openOutlook({ id: k.id, subject: 'Files', senderEmail: S.SENDER, body: BODY });
}

for (const kind of ['word', 'excel']) {
  test('a ' + kind + ' file without OneDrive says OneDrive is needed, not that no request was found', async ({ glance }) => {
    const page = await open(glance, kind, { files: false });
    const line = page.locator('#ReadingPaneContainerId .flow-why-not');
    await expect(line).toContainText('OneDrive', { timeout: 15000 });
    await expect(line).not.toContainText('לא זוהתה בקשה');
    await expect(page.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(0);
  });

  test('a ' + kind + ' file with OneDrive on is a Save the file? card in Hebrew', async ({ glance }) => {
    const page = await open(glance, kind, {});
    const card = page.locator('#ReadingPaneContainerId .flow-chip-host');
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText('לשמור את הקובץ?');
    await expect(card).toContainText(KINDS[kind].file.name);
  });
}
