// A mail that asks for a document becomes one Google Doc. The same ask again
// updates the Doc Glance already made in that thread. An attachment of the
// document, or an FYI that only mentions one, does not create anything.
// drive.file only. Nothing is sent.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const DOC_MIME = 'application/vnd.google-apps.document';
let server;
let n = 0;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount(SELF);
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
  await glance.seedGmail({
    glanceSwitches: { WORKSPACE_FILE: true, FULL_DOCUMENT_CLOSE: true },
    googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' }
  });
});

function watch(glance) {
  const logs = [];
  glance.context.on('page', (p) => {
    p.on('console', (msg) => logs.push(msg.text()));
  });
  return logs;
}

function openMail(glance, opts) {
  n += 1;
  return glance.openGmail(Object.assign({
    liveSelf: true,
    lang: 'he',
    messageId: 'm-kind-' + n,
    threadId: 't-kind-' + n,
    ownEmail: SELF,
    senderName: 'רוני',
    toSelfText: 'אליי',
    accountLabel: 'Google Account: רוני (' + SELF + ')'
  }, opts || {}));
}

const docCreates = () => server.calls.filter((c) => c.method === 'POST' && c.path.indexOf('/upload/drive/v3/files') === 0 && c.body && c.body.mimeType === DOC_MIME && !c.denied);

async function clickDo(host) {
  await host.locator('button.flow-chip').click();
}

test('quote, meeting summary, and agreement each create one Doc', async ({ glance }) => {
  const cases = [
    {
      subject: 'בקשה להצעת מחיר לאתר חדש',
      body: 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר ובלוג. תודה!',
      card: 'טיוטת הצעת מחיר',
      bits: ['הצעת מחיר', '5 עמודים', '[לא צוין לקוח]', 'בברכה,']
    },
    {
      subject: 'סיכום פגישה — תקציב רבעון',
      body: 'נא להכין סיכום פגישה. משתתפים: דנה כהן ורוני לוי. סוכם להתחיל ביום ראשון.',
      card: 'טיוטת סיכום פגישה',
      bits: ['סיכום פגישה — תקציב רבעון', 'דנה כהן', 'משתתפים:']
    },
    {
      subject: 'הסכם שכירות למשרד',
      body: 'נא לנסח טיוטת הסכם שכירות בין דנה כהן לבין רוני לוי. תקופה: שנה.',
      card: 'טיוטת הסכם',
      bits: ['הסכם — שכירות למשרד', 'דנה כהן', '[להשלים: חתימות]']
    }
  ];
  for (const row of cases) {
    server.reset();
    const page = await openMail(glance, { subject: row.subject, body: row.body, threadId: 't-' + row.card });
    const host = page.locator('.flow-chip-host');
    await expect(host).toContainText(row.card, { timeout: 20000 });
    await clickDo(host);
    await expect(page.locator('div[role="main"] .flow-chip-done')).toBeVisible({ timeout: 20000 });
    expect(docCreates()).toHaveLength(1);
    const created = docCreates()[0];
    expect(created.media).toContain('<html dir="rtl" lang="he">');
    row.bits.forEach((bit) => expect(created.media).toContain(bit));
    expect(created.body.appProperties && created.body.appProperties.glanceDoc).toBe('1');
    expect(created.body.appProperties.glanceThread).toBe('t-' + row.card);
    expect(server.calls.some((c) => /docs\.googleapis|\/v1\/documents\//.test(c.path))).toBe(false);
    expect(server.calls.some((c) => /\/gmail\/v1\/users\/me\/messages\/send|\/drafts\/send/.test(c.path))).toBe(false);
    await page.close();
  }
});

test('the same request a second time updates the existing Doc and does not create another', async ({ glance }) => {
  const subject = 'בקשה להצעת מחיר לאתר חדש';
  const body = 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר ובלוג. תודה!';
  const first = await openMail(glance, { subject: subject, body: body, threadId: 't-again', messageId: 'm-again-1' });
  const host = first.locator('.flow-chip-host');
  await expect(host).toContainText('טיוטת הצעת מחיר', { timeout: 20000 });
  await clickDo(host);
  await expect(first.locator('.flow-chip-done')).toBeVisible({ timeout: 20000 });
  expect(docCreates()).toHaveLength(1);
  const id = server.last.doc;
  await first.close();

  const second = await openMail(glance, { subject: subject, body: body, threadId: 't-again', messageId: 'm-again-2' });
  const again = second.locator('.flow-chip-host');
  await expect(again).toContainText('כבר קיים מסמך מהשרשור הזה', { timeout: 20000 });
  await expect(again.getByRole('button', { name: 'עדכן' })).toBeVisible();
  await again.getByRole('button', { name: 'עדכן' }).click();
  await expect(second.locator('.flow-chip-done')).toBeVisible({ timeout: 20000 });
  expect(docCreates()).toHaveLength(1);
  const patches = server.calls.filter((c) => c.method === 'PATCH' && c.path.indexOf('/upload/drive/v3/files/' + id) === 0);
  expect(patches.length).toBeGreaterThan(0);
  expect(server.calls.some((c) => /\/gmail\/v1\/users\/me\/messages\/send/.test(c.path))).toBe(false);
});

test('a created Doc keeps its receipt and Undo when the same message is scanned again', async ({ glance }) => {
  const subject = 'בקשה להצעת מחיר לאתר חדש';
  const body = 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק: 5 עמודים, טופס יצירת קשר ובלוג. תודה!';
  const first = await openMail(glance, { subject: subject, body: body, threadId: 't-receipt', messageId: 'm-receipt' });
  const logs = [];
  first.on('console', (msg) => logs.push(msg.text()));
  const host = first.locator('.flow-chip-host');
  await expect(host).toContainText('טיוטת הצעת מחיר', { timeout: 20000 });
  await clickDo(host);
  await expect(first.getByRole('button', { name: 'בטל' })).toBeVisible({ timeout: 20000 });
  await expect(first.getByRole('button', { name: 'עדכן מסמך קיים' })).toBeVisible();
  await expect.poll(() => logs.some((line) => line.indexOf('full-document receipt stored') >= 0)).toBe(true);
  await first.close();

  const again = await openMail(glance, { subject: subject, body: body, threadId: 't-receipt', messageId: 'm-receipt' });
  const card = again.locator('.flow-chip-host');
  await expect(card.getByRole('button', { name: 'בטל' })).toBeVisible({ timeout: 20000 });
  await expect(card.getByRole('button', { name: 'עדכן מסמך קיים' })).toBeVisible();
  await expect(card).not.toContainText('כבר קיים מסמך מהשרשור הזה');
  await expect(card.getByRole('button', { name: 'עדכן' })).toHaveCount(0);
  expect(docCreates()).toHaveLength(1);
});

test('a mail that already attaches the document does not create one', async ({ glance }) => {
  const logs = watch(glance);
  const page = await openMail(glance, {
    subject: 'בקשה להצעת מחיר',
    body: 'נא להכין הצעת מחיר לאתר.',
    attachments: [{ name: 'הצעת מחיר.pdf', mimeType: 'application/pdf' }]
  });
  await expect.poll(() => logs.some((line) => /\[Glance\] full-document plan silence already-attached/.test(line))).toBe(true);
  await expect(page.locator('.flow-chip-host')).not.toContainText('טיוטת');
  expect(docCreates()).toHaveLength(0);
});

test('an FYI that only mentions a document has no Do It', async ({ glance }) => {
  const logs = watch(glance);
  const page = await openMail(glance, {
    subject: 'דוח חודשי',
    body: 'לידיעתך, הדוח החודשי מצורף. אין צורך בפעולה.'
  });
  await expect.poll(() => logs.some((line) => /\[Glance\] full-document plan silence not-a-request/.test(line))).toBe(true);
  await expect(page.locator('.flow-chip-host')).toHaveCount(0);
  expect(docCreates()).toHaveLength(0);
});
