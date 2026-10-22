// #179 items 5a/5b — inbound Gmail task cards for פעולה נדרשת and OneDrive save asks.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./support/harness');
const { liveGmailPage } = require('./support/live-gate-livedom');

const INTENT_ROOT = path.join(__dirname, '..');
const SELF = 'ai.local.flow@gmail.com';

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

function inboundJudge(body, subject) {
  const J = vm.runInContext('FlowIncomingJudge', intentEngine());
  return J.judge({
    text: body,
    subject,
    sender: { name: 'Dana Levi', email: 'dana@meridian.com' },
    surface: 'gmail',
    to: [SELF],
    cc: [],
    ownAddresses: [SELF],
    userName: 'Sali',
    ownNames: ['Sali', 'Sali Sapan'],
    readerEmail: SELF,
    direction: 'inbound',
    inbound: true,
    attachmentCount: 1,
    namesWaitDone: true,
    now: new Date('2026-10-20T12:20:00Z')
  });
}

test('(5a/5b) inbound gate titles — פעולה נדרשת and OneDrive save', () => {
  const b5a = 'היי סלי,\nמצורף ה-deck המעודכן לסבב A.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה';
  const b5b = 'היי, תשמרי את המצורף בוואן דרייב בבקשה. תודה!';
  const j5a = inboundJudge(b5a, 'Deck סבב A (179)');
  const j5b = inboundJudge(b5b, 'מסמכי ספק (179)');
  expect(j5a.show).toBe(true);
  expect(j5b.show).toBe(true);
  expect(j5a.intent && j5a.intent.label).toBe('לחתום על ה-deck');
  expect(j5b.intent && j5b.intent.label).toBe('לשמור את המצורף בוואן דרייב');
  expect(j5a.intent.label).not.toBe('לטפל בהערה');
  expect(j5b.intent.label).not.toBe('לטפל בהערה');
});

test('(5a/5b) live-shaped Gmail DOM — PDF chip, Hebrew subject, inbound card titles', async ({ glance }) => {
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
      body: 'היי, תשמרי את המצורף בוואן דרייב בבקשה. תודה!',
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
    const chip = page.locator('[data-legacy-message-id="' + row.messageId + '"] .flow-chip-host, div[role="main"] .flow-chip-host').first();
    await expect(chip).toBeVisible({ timeout: 20000 });
    await expect(chip).toContainText(row.title, { timeout: 20000 });
  }
});
