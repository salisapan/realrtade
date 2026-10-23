// Post-merge item (5) inbound deck / OneDrive — Outlook livedom + Gmail livedom (#179 on #184).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');
const { startGoogleLaneServer } = require('./support/google-lane-server');
const { liveGmailPage } = require('./support/live-gate-livedom');

const INTENT_ROOT = path.join(__dirname, '..');
const OUTLOOK_SELF = 'glance.salisapan@outlook.com';
const GMAIL_SELF = 'ai.local.flow@gmail.com';
const PDF = 'application/pdf';

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

function inboundJudge(body, subject, surface, self) {
  const J = vm.runInContext('FlowIncomingJudge', intentEngine());
  return J.judge({
    text: body,
    subject,
    sender: { name: 'Dana Levi', email: 'dana@acme.io' },
    surface,
    to: [self],
    cc: [],
    ownAddresses: [self],
    userName: 'Sali',
    ownNames: ['Sali'],
    direction: 'inbound',
    inbound: true,
    attachmentCount: 1,
    now: new Date('2026-10-20T12:20:00Z')
  });
}

const b5a = 'היי סלי,\nמצורף ה-deck המעודכן לסבב A.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה';
const b5b = 'היי, תשמרי את המצורף בוואן דרייב בבקשה. תודה!';

test('(5) inbound gate — Outlook + Gmail judge titles', () => {
  for (const surface of ['outlook', 'gmail']) {
    const self = surface === 'outlook' ? OUTLOOK_SELF : GMAIL_SELF;
    const j5a = inboundJudge(b5a, 'Deck סבב A (179)', surface, self);
    const j5b = inboundJudge(b5b, 'מסמכי ספק (179)', surface, self);
    expect(j5a.show).toBe(true);
    expect(j5b.show).toBe(true);
    expect(j5a.intent && j5a.intent.label).toBe('לחתום על ה-deck');
    expect(j5b.intent && j5b.intent.label).toBe('לשמור את המצורף בוואן דרייב');
  }
});

test.beforeAll(async () => { server = await startGoogleLaneServer(); });
test.afterAll(async () => { if (server) await server.close(); });
test.beforeEach(async ({ glance }) => {
  if (!server) return;
  server.reset();
  await glance.evaluateWorker((origin) => { globalThis.__glanceE2e.httpOrigin = origin; }, server.origin);
});

test('(5) Outlook fixture — Hebrew inbound mail shows PDF attachment and card titles', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook({
    glanceUiLanguage: 'he',
    glanceOwnNames: ['סלי', 'Sali', 'Sali Sapan']
  });
  const cases = [
    {
      id: 'AQMkM1Deck179',
      subject: 'Deck סבב A (179)',
      body: b5a,
      attachName: 'Deck-סבב-A.pdf',
      title: 'לחתום על ה-deck'
    },
    {
      id: 'AQMkM1OneDrive179',
      subject: 'מסמכי ספק (179)',
      body: b5b,
      attachName: 'מסמכי-ספק.pdf',
      title: 'לשמור את המצורף בוואן דרייב'
    }
  ];
  for (const row of cases) {
    await glance.setScenario({
      inbox: [{
        id: row.id,
        conversationId: row.id,
        subject: row.subject,
        from: { emailAddress: { name: 'Dana Levi', address: S.SENDER } },
        hasAttachments: true,
        internetMessageId: '<' + row.id + '@mail.test>'
      }],
      sent: [],
      messages: {},
      attachments: { [row.id]: [{ id: 'att-' + row.id, name: row.attachName, contentType: PDF, size: 4096, isInline: false }] },
      conversation: []
    });
    const page = await glance.openOutlook({
      confirmConversation: true,
      live: true,
      id: row.id,
      subject: row.subject,
      senderEmail: S.SENDER,
      senderName: 'Dana Levi',
      body: row.body,
      hebrewTo: true,
      toName: 'sali sapan',
      attachments: [{ shownName: row.attachName, titleName: row.attachName, sizeLabel: '4 KB' }]
    });
    const pane = page.locator('#ReadingPaneContainerId');
    await expect(pane.getByText(row.attachName)).toBeVisible({ timeout: 15000 });
    const title = pane.locator('.flow-chip-host .flow-chip-process-name');
    await expect(title).toHaveText(row.title, { timeout: 25000 });
    await page.close();
  }
});

test('(5) Gmail livedom — PDF chip and inbound card titles', async ({ glance }) => {
  test.setTimeout(120000);
  const cases = [
    {
      messageId: '1a15941d8c653905',
      subject: 'Deck סבב A (179)',
      body: 'היי סלי,\nמצורף ה-deck המעודכן לסבב A. המשקיעים מחכים לגרסה החתומה עד סוף השבוע.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה',
      attachName: 'Deck-סבב-A.pdf',
      title: 'לחתום על ה-deck'
    },
    {
      messageId: '1a15941e778affc5',
      subject: 'מסמכי ספק (179)',
      body: b5b,
      attachName: 'מסמכי-ספק.pdf',
      title: 'לשמור את המצורף בוואן דרייב'
    }
  ];
  await glance.seedGmail({
    onboarded: true,
    connectorId: 'googleTasks',
    glanceUiLanguage: 'he',
    googleProfile: { displayName: 'Sali', givenName: 'Sali' }
  });
  for (const row of cases) {
    const html = liveGmailPage({
      liveDom: 'item7-collapsed',
      detailsFrom: 'item7-details',
      liveMutate: 'selfPdfAttach',
      messageId: row.messageId,
      attachName: row.attachName,
      bodyText: row.body,
      subjectText: row.subject,
      title: row.subject + ' - ai.local.flow@gmail.com - Gmail'
    });
    const page = await glance.openGmailHtml(html, { messageId: row.messageId });
    const msgSel = '[data-legacy-message-id="' + row.messageId + '"]';
    const host = page.locator(msgSel + ' .flow-chip-host, div[role="main"] .flow-chip-host').first();
    await expect(host).toBeVisible({ timeout: 25000 });
    await expect(host.locator('.flow-chip-process-name')).toHaveText(row.title, { timeout: 5000 });
    await page.close();
  }
});
