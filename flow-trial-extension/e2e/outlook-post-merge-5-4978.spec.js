// M1: mirror post-merge-5-8-4978.spec.js item (5) on Outlook — judge baseline + fixture shape.
// Inbound card titles for 5a/5b need #179 core/intent.js (C1); this spec does not assert a card yet.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const INTENT_ROOT = path.join(__dirname, '..');
const SELF = 'glance.salisapan@outlook.com';
const PDF = 'application/pdf';

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

function inboundJudgeOutlook(body, subject) {
  const J = vm.runInContext('FlowIncomingJudge', intentEngine());
  return J.judge({
    text: body,
    subject,
    sender: { name: 'Dana Levi', email: 'dana@acme.io' },
    surface: 'outlook',
    to: [SELF],
    cc: [],
    ownAddresses: [SELF],
    userName: 'Sali',
    ownNames: ['Sali'],
    direction: 'inbound',
    inbound: true,
    attachmentCount: 1,
    now: new Date('2026-10-20T12:20:00Z')
  });
}

test('(5) inbound gate — Outlook judge baseline until #179 intent (no card yet)', () => {
  const b5a = 'היי סלי,\nמצורף ה-deck המעודכן לסבב A.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה';
  const b5b = 'היי, תשמרי את המצורף בוואן דרייב בבקשה. תודה!';
  const j5a = inboundJudgeOutlook(b5a, 'Deck סבב A (179)');
  const j5b = inboundJudgeOutlook(b5b, 'מסמכי ספק (179)');
  expect(j5a.show).toBe(false);
  expect(j5b.show).toBe(false);
});

test('(5) Outlook fixture — Hebrew inbound mail shows PDF attachment, no inbound card yet', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook({
    glanceUiLanguage: 'he',
    glanceOwnNames: ['סלי', 'Sali', 'Sali Sapan']
  });
  const id = 'AQMkM1Deck179';
  const attachName = 'Deck-סבב-A.pdf';
  const body = 'היי סלי,\nמצורף ה-deck המעודכן לסבב A.\nפעולה נדרשת מצד: חתימה על ה-deck\nתודה, דנה';
  await glance.setScenario({
    inbox: [{
      id,
      conversationId: id,
      subject: 'Deck סבב A (179)',
      from: { emailAddress: { name: 'Dana Levi', address: S.SENDER } },
      hasAttachments: true,
      internetMessageId: '<' + id + '@mail.test>'
    }],
    sent: [],
    messages: {},
    attachments: { [id]: [{ id: 'att-deck', name: attachName, contentType: PDF, size: 4096, isInline: false }] },
    conversation: []
  });
  const page = await glance.openOutlook({
    confirmConversation: true,
    live: true,
    id,
    subject: 'Deck סבב A (179)',
    senderEmail: S.SENDER,
    senderName: 'Dana Levi',
    body,
    hebrewTo: true,
    toName: 'sali sapan',
    attachments: [{ shownName: attachName, titleName: attachName, sizeLabel: '4 KB' }]
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText(attachName)).toBeVisible({ timeout: 15000 });
  const title = pane.locator('.flow-chip-host .flow-chip-process-name');
  await page.waitForTimeout(5000);
  if (await title.count()) {
    await expect(title).not.toHaveText('לחתום על ה-deck');
  }
  await page.close();
});
