// Gate 2f98b2d4 (b): a self-sent Hebrew quote with FULL_DOCUMENT_CLOSE on is
// one Google Doc when Do It is pressed. Live, «בצע» left the step on
// «חבר מחדש את Google · נסה שוב» and "Still open · unconfirmed"; Reconnect
// came straight back without a consent screen and the next «בצע» failed the
// same way. The Gate profile's own record shows drive.file was granted each
// time: the 403 was not a missing scope, but every 403 was flagged as one.
// Here: the granted path writes one Doc through a Drive multipart upload
// (no Docs API) and Undo trashes it; an API that is
// off in the Cloud project names itself and does not offer Reconnect; a
// real missing drive.file names the Drive permission, offers Reconnect, and
// Reconnect asks Google with prompt=consent, include_granted_scopes and
// drive.file; a consent that still lacks drive.file is not a connection.
// Unpacked extension against the local Google lane server. Nothing is sent.
const { test, expect } = require('./support/harness');
const { startGoogleLaneServer, GOOGLE_403_SCOPE, GOOGLE_403_DRIVE_DISABLED } = require('./support/google-lane-server');

const SELF = 'ai.local.flow@gmail.com';
const SUBJECT = '[G-Quote] בקשה להצעת מחיר לאתר חדש 14/11';
const BODY = 'שלום, נשמח לקבל הצעת מחיר לבניית אתר חדש לעסק. 5 עמודים, טופס יצירת קשר ובלוג. תודה';
const DOC_MIME = 'application/vnd.google-apps.document';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
const ALL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  DRIVE_FILE,
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];
let server;
let n = 0;

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  server.reset();
  server.setAccount(SELF);
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

async function openQuote(glance, seed) {
  await glance.seedGmail(Object.assign({
    glanceSwitches: { WORKSPACE_FILE: true, FULL_DOCUMENT_CLOSE: true },
    googleConnectedAccount: { email: SELF, at: Date.now(), source: 'web' }
  }, seed || {}));
  n += 1;
  const id = 'm-gdoc-' + n;
  const page = await glance.openGmail({
    liveSelf: true, lang: 'he', messageId: id, threadId: 't-gdoc-' + n, ownEmail: SELF, senderName: 'רוני',
    subject: SUBJECT, body: BODY, toSelfText: 'אליי',
    accountLabel: 'Google Account: רוני (' + SELF + ')'
  });
  const lines = [];
  page.on('console', (m) => { const t = m.text(); if (t.indexOf('[Glance] full-document') === 0) lines.push(t); });
  await glance.evaluateWorker(() => { if (globalThis.__glanceE2e) globalThis.__glanceE2e.fullDocumentLogs = []; });
  const workerLines = () => glance.evaluateWorker(() => (globalThis.__glanceE2e && globalThis.__glanceE2e.fullDocumentLogs) || []);
  const host = page.locator('[data-legacy-message-id="' + id + '"] .flow-chip-host');
  await expect(host).toContainText('טיוטת הצעת מחיר', { timeout: 20000 });
  return { page, host, lines, workerLines };
}

const creates = () => server.calls.filter((c) => c.method === 'POST' && (c.path === '/drive/v3/files' || c.path.indexOf('/upload/drive/v3/files') === 0));
// A create Google refused (403) is recorded with `denied`; it made no file.
const docCreates = () => creates().filter((c) => c.body && c.body.mimeType === DOC_MIME && !c.denied);
const trashes = (id) => server.calls.filter((c) => c.method === 'PATCH' && c.path === '/drive/v3/files/' + id && c.body && c.body.trashed === true);

// Reconnect's Google window: getAuthToken (Chrome sign-in) is off on the Gate
// profile, so the web flow opens. The stand-in records the URL and answers
// with the scopes the test grants.
async function armWebConsent(glance, grantedScopes) {
  await glance.evaluateWorker((scope) => {
    const e2e = globalThis.__glanceE2e;
    e2e.consentUrls = [];
    e2e.googleAuthToken = function (interactive) {
      e2e.authCalls.push({ interactive: Boolean(interactive), at: Date.now() });
      if (interactive) return Promise.reject(new Error('The user is not signed in.'));
      return Promise.resolve('ya29.e2e');
    };
    e2e.launchWebAuthFlow = function (details) {
      const url = new URL(details.url);
      e2e.consentUrls.push(details.url);
      e2e.flows.push({ url: details.url, interactive: details.interactive, at: Date.now() });
      if (!details.interactive) return Promise.reject(new Error('e2e-no-window'));
      const hash = new URLSearchParams({ access_token: 'ya29.e2e', token_type: 'Bearer', expires_in: '3599', scope: scope, state: url.searchParams.get('state') || '' });
      return Promise.resolve(url.searchParams.get('redirect_uri') + '#' + hash.toString());
    };
  }, grantedScopes.join(' '));
}

test('granted: Do It creates one Google Doc with the quote, verified, and Undo trashes it', async ({ glance }) => {
  const { page, host, lines, workerLines } = await openQuote(glance);
  await host.locator('button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-done')).toBeVisible({ timeout: 20000 });
  expect(docCreates()).toHaveLength(1);
  const created = docCreates()[0];
  expect(created.path.indexOf('/upload/drive/v3/files')).toBe(0);
  expect(created.search).toContain('uploadType=multipart');
  expect(created.media).toContain('charset="UTF-8"');
  expect(created.media).toContain('<html dir="rtl" lang="he">');
  expect(created.media).toContain('<p>');
  expect(created.media).toContain('<h1>');
  expect(created.media).toContain('הצעת מחיר');
  expect(created.media).toContain('5 עמודים');
  expect(created.media).toContain('טופס יצירת קשר');
  expect(created.media).toContain('בלוג');
  expect(created.media).toContain('לקוח:');
  expect(created.media).toContain('[לא צוין לקוח]');
  expect(created.media).not.toContain('Party:');
  expect(created.media).not.toContain('Amount:');
  expect(created.media).not.toContain('Title:');
  expect(created.media).not.toContain('[לקוח / party]');
  expect(created.media).not.toContain('[מחיר / price]');
  const id = server.last.doc;
  expect(server.calls.some((c) => /docs\.googleapis|\/v1\/documents\//.test(c.path))).toBe(false);
  expect(server.calls.filter((c) => c.method === 'GET' && c.path === '/drive/v3/files/' + id + '/export' && /mimeType=text%2Fplain/.test(c.search))).toHaveLength(1);
  const plain = server.doc(id).body.content[0].paragraph.elements[0].textRun.content;
  expect(plain.length).toBeGreaterThan(20);
  expect(plain).toContain('הצעת מחיר');
  const open = page.locator('div[role="main"] a.flow-chip-written');
  await expect(open).toHaveText('פתח ב-Docs');
  await expect(open).toHaveAttribute('href', 'https://docs.google.com/document/d/' + id + '/edit');
  await expect.poll(() => lines).toContain('[Glance] full-document write created verified');
  await expect.poll(workerLines).toContain('[Glance] full-document write created verified');
  await expect(host.locator('.flow-chip-hold-error')).toHaveCount(0);
  expect(server.calls.some((c) => /\/gmail\/v1\/users\/me\/messages\/send|\/drafts\/send/.test(c.path))).toBe(false);
  await page.locator('div[role="main"] button.flow-chip-undo').click();
  await expect.poll(() => trashes(id).length).toBe(1);
  expect(server.file(id).trashed).toBe(true);
  await expect(page.locator('div[role="main"] .flow-chip-done')).toContainText('בוטל · המסמך הועבר לאשפה');
  await expect.poll(workerLines).toContain('[Glance] full-document undo trashed');
  await expect.poll(() => lines).toContain('[Glance] full-document undo trashed');
});

test('Drive API off in the Cloud project: a Hebrew line names it, no Reconnect loop, no leftover file', async ({ glance }) => {
  server.forbid('drive/v3', '', GOOGLE_403_DRIVE_DISABLED);
  const { host, lines, workerLines } = await openQuote(glance);
  await host.locator('button.flow-chip').click();
  const alert = host.locator('.flow-chip-hold-error');
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(alert).toHaveAttribute('role', 'alert');
  await expect(alert).toHaveAttribute('data-glance-hold-reason', 'drive-api-disabled');
  await expect(alert).toContainText('לא נוצר מסמך ב-Google');
  await expect(alert).toContainText('שירות Drive של Google לא מופעל');
  await expect(host.locator('.flow-chip-reconnect')).toHaveCount(0);
  await expect(host.locator('.approve-title')).toHaveText('עדיין פתוח · לא נוצר דבר');
  await expect(host).not.toContainText('unconfirmed');
  expect(docCreates()).toHaveLength(0);
  expect(Object.keys(server.files()).filter((id) => server.file(id).mimeType === DOC_MIME)).toEqual([]);
  expect(server.calls.some((c) => /docs\.googleapis|\/v1\/documents\//.test(c.path))).toBe(false);
  await expect.poll(() => lines).toContain('[Glance] full-document write failed drive-api-disabled');
  await expect.poll(() => lines).toContain('[Glance] full-document google SERVICE_DISABLED');
  await expect.poll(workerLines).toContain('[Glance] full-document write failed drive-api-disabled');
  await expect.poll(workerLines).toContain('[Glance] full-document google SERVICE_DISABLED');
  const bag = await glance.storage();
  expect(bag.googleReconnect || null).toBe(null);
  expect(bag.googleLastDenial && bag.googleLastDenial.kind).toBe('api-disabled');
  expect(bag.googleLastDenial && bag.googleLastDenial.service).toBe('drive.googleapis.com');
});

test('missing drive.file: the line names the Drive permission, Reconnect asks Google consent for drive.file, then one Doc', async ({ glance }) => {
  server.forbid('/drive/v3/files', 'POST', GOOGLE_403_SCOPE);
  const { page, host, lines, workerLines } = await openQuote(glance);
  await host.locator('button.flow-chip').click();
  const alert = host.locator('.flow-chip-hold-error');
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(alert).toHaveAttribute('data-glance-hold-reason', 'drive-scope-missing');
  await expect(alert).toHaveAttribute('data-glance-missing-scope', 'drive.file');
  await expect(alert).toContainText('אין הרשאה ליצור קבצים ב-Google Drive');
  await expect(host.locator('.approve-title')).toHaveText('עדיין פתוח · לא נוצר דבר');
  const reconnect = host.locator('.flow-chip-reconnect');
  await expect(reconnect).toHaveText('חבר מחדש את Google');
  await expect.poll(() => lines).toContain('[Glance] full-document write failed drive-scope-missing');
  await expect.poll(workerLines).toContain('[Glance] full-document write failed drive-scope-missing');
  expect(docCreates()).toHaveLength(0);
  expect(creates().filter((c) => c.denied === 403).length).toBeGreaterThan(0);
  expect(Object.keys(server.files()).filter((id) => server.file(id).mimeType === DOC_MIME)).toEqual([]);
  expect(server.calls.some((c) => /docs\.googleapis|\/v1\/documents\//.test(c.path))).toBe(false);
  const flagged = await glance.storage();
  expect(flagged.googleReconnect && flagged.googleReconnect.reason).toBe('missing scope');

  server.clearForbids();
  await armWebConsent(glance, ALL_SCOPES);
  await reconnect.click();
  await expect(alert).toContainText('החיבור התחדש', { timeout: 20000 });
  const urls = await glance.evaluateWorker(() => globalThis.__glanceE2e.consentUrls.slice());
  const asked = urls.map((u) => new URL(u)).filter((u) => u.searchParams.get('prompt') !== 'none');
  expect(asked).toHaveLength(1);
  const q = asked[0].searchParams;
  expect(q.get('prompt')).toContain('consent');
  expect(q.get('include_granted_scopes')).toBe('true');
  const wanted = String(q.get('scope') || '').split(' ');
  expect(wanted).toContain(DRIVE_FILE);
  // Narrow: Drive is asked only as drive.file, never full Drive or Drive read.
  expect(wanted.filter((s) => /\/auth\/drive(\.readonly)?$/.test(s))).toEqual([]);
  expect(wanted.filter((s) => /\/auth\/drive/.test(s))).toEqual([DRIVE_FILE]);
  const after = await glance.storage();
  expect(after.googleReconnect || null).toBe(null);
  expect(after.googleGrantedScopes.granted).toContain(DRIVE_FILE);
  expect((after.glanceAuthLog || []).some((l) => l.indexOf('"call":"launchWebAuthFlow"') >= 0 && l.indexOf('consent') >= 0 && l.indexOf('drive.file') >= 0 && l.indexOf('"result":"ok"') >= 0)).toBe(true);
  expect((after.glanceAuthLog || []).every((l) => l.indexOf('ya29') < 0)).toBe(true);

  await host.locator('button.flow-chip').click();
  await expect(page.locator('div[role="main"] .flow-chip-done')).toBeVisible({ timeout: 20000 });
  expect(docCreates()).toHaveLength(1);
  expect(creates().filter((c) => c.denied === 403).length).toBeGreaterThan(0);
  await expect.poll(() => lines).toContain('[Glance] full-document write created verified');
  await expect.poll(workerLines).toContain('[Glance] full-document write created verified');
});

test('a grant known to lack drive.file never calls Drive, and a consent that still leaves Drive unticked is not a connection', async ({ glance }) => {
  const { host, lines, workerLines } = await openQuote(glance);
  const partial = ALL_SCOPES.filter((s) => s !== DRIVE_FILE);
  await glance.evaluateWorker((granted) => chrome.storage.local.set({
    googleGrantedScopes: { version: granted.concat(['https://www.googleapis.com/auth/drive.file']).sort().join('\n'), granted: granted, missing: ['https://www.googleapis.com/auth/drive.file'], status: 'asked', source: 'web', at: Date.now() }
  }), partial);
  await host.locator('button.flow-chip').click();
  const alert = host.locator('.flow-chip-hold-error');
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(alert).toHaveAttribute('data-glance-hold-reason', 'drive-scope-missing');
  await expect.poll(() => lines).toContain('[Glance] full-document write failed drive-scope-missing');
  await expect.poll(workerLines).toContain('[Glance] full-document write failed drive-scope-missing');
  expect(creates()).toHaveLength(0);

  await armWebConsent(glance, partial);
  await host.locator('.flow-chip-reconnect').click();
  await expect(host).toContainText('Google לא אישר את הגישה ל-Drive', { timeout: 20000 });
  const urls = await glance.evaluateWorker(() => globalThis.__glanceE2e.consentUrls.slice());
  const asked = urls.map((u) => new URL(u)).filter((u) => u.searchParams.get('prompt') !== 'none');
  expect(asked.length).toBeGreaterThan(0);
  expect(asked[0].searchParams.get('prompt')).toContain('consent');
  expect(String(asked[0].searchParams.get('scope') || '').split(' ')).toContain(DRIVE_FILE);
  const bag = await glance.storage();
  expect(bag.googleGrantedScopes.missing).toContain(DRIVE_FILE);
  expect((bag.glanceAuthLog || []).some((l) => l.indexOf('"result":"partial"') >= 0 && l.indexOf('missing: drive.file') >= 0)).toBe(true);
  expect(creates()).toHaveLength(0);
});
