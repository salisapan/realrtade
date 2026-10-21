// The ask can be inside the Word or Excel file. Outlook reads the attachment
// on this device, with the mail's own sign-in, and judges that text beside the
// mail's. Headless Chromium, mocked Graph, fixtures only.
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const office = require('./support/office-files');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function open(glance, id, file, body, auth) {
  await glance.seedOutlook({ glanceUiLanguage: 'he' }, auth || { files: false });
  await glance.setScenario({ inbox: [], sent: [], messages: {}, attachments: { [id]: [file] }, conversation: [] });
  return glance.openOutlook({ id, subject: 'Terms', senderEmail: S.SENDER, body, attachments: [{ name: file.name, size: file.size }] });
}

test('a request inside a Word file is a reply card', async ({ glance }) => {
  const id = 'AQMkAskDocx';
  const file = { id: 'att-d', name: 'terms.docx', contentType: DOCX, size: 9000, isInline: false,
    contentBytes: office.docx(['Terms for Q3', 'Please confirm the totals by Thursday.']) };
  const page = await open(glance, id, file, 'Figures attached.');
  const card = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('מענה ומעקב');
});

test('a request inside an Excel file is a reply card', async ({ glance }) => {
  const id = 'AQMkAskXlsx';
  const file = { id: 'att-x', name: 'q3.xlsx', contentType: XLSX, size: 9000, isInline: false,
    contentBytes: office.xlsx(['Item', 'Please confirm the totals by Thursday.']) };
  const page = await open(glance, id, file, 'Figures attached.');
  const card = page.locator('#ReadingPaneContainerId .flow-chip-host');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('מענה ומעקב');
});

test('a Word file with no request in it stays quiet', async ({ glance }) => {
  const id = 'AQMkAskNone';
  const file = { id: 'att-n', name: 'notes.docx', contentType: DOCX, size: 9000, isInline: false,
    contentBytes: office.docx(['Meeting notes', 'Thanks all, good session.']) };
  const page = await open(glance, id, file, 'Figures attached.');
  await page.waitForTimeout(4000);
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(0);
});
