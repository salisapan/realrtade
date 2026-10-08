// 0.9.45: the live Outlook page (clock text, attachment chip, unread list,
// AQQK conversation id) reaches Save the file?. Undo returns one Do It.
// Loops and Activity count the same list. The side panel keeps its scroll.
const { test, expect } = require('./support/harness');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('./support/sentences');

const DANA = "I'll send Dana the numbers by Thursday.";
const NORTHWIND = 'The signed Northwind Supplies agreement is attached.';
const Q3 = 'The Q3 statement is attached.';
const LIVE = 'AQQKGlanceE2ELiveNorthwind';
const LIVE_MSG = 'AQMkGlanceE2ELiveNorthwindMsg';
const SKIP_LIVE = 'AQQKGlanceE2ELiveSkip';
const SKIP_MSG = 'AQMkGlanceE2ELiveSkipMsg';
const Q3_CONV = 'AQQKGlanceE2EQ3Fund';
const ALPHA_MSG = 'AQMkGlanceE2EQ3Alpha';
const BETA_MSG = 'AQMkGlanceE2EQ3Beta';
const PROMISE = 'AQMkGlanceE2EPromise0945';
const LEGACY = 'AQMkGlanceE2ELegacyUndo';

function localIso(y, month, day, hour, minute) {
  return new Date(y, month - 1, day, hour, minute, 0, 0).toISOString();
}

function pdf(id, name, size) {
  return [{
    id: id,
    name: name,
    contentType: 'application/pdf',
    size: size,
    isInline: false
  }];
}

function inboxRow(id, conversationId, subject, when) {
  return {
    id: id,
    conversationId: conversationId,
    subject: subject,
    receivedDateTime: when,
    from: { emailAddress: { name: 'flow', address: S.SENDER } },
    hasAttachments: true,
    internetMessageId: '<' + id + '@mail.test>'
  };
}

function loadCores() {
  const sandbox = { console: console };
  vm.createContext(sandbox);
  const core = path.join(__dirname, '..', 'core');
  const files = ['domains.js', 'extract.js', 'judgment.js', 'google-closes.js', 'fact-reply.js', 'close-families.js', 'intent.js', 'actions.js', 'commitment-title.js', 'still-open.js'];
  files.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(core, file), 'utf8'), sandbox, { filename: file });
  });
  return {
    intent: vm.runInContext('FlowIntent', sandbox),
    actions: vm.runInContext('FlowActions', sandbox)
  };
}

function shownRow(text, id, intent, process, ts) {
  return {
    kind: 'shown',
    messageId: id,
    threadId: 't-' + id,
    app: 'outlook',
    ts: ts,
    sender: { name: 'flow', email: S.SENDER },
    subject: 'Numbers for Dana',
    text: text,
    intent: intent,
    process: process
  };
}

test('a live unread pane names the open PDF, and a small chip is a skipped row', async ({ glance }) => {
  test.setTimeout(90000);
  const when = localIso(2026, 10, 8, 14, 1);
  const whenSkip = localIso(2026, 10, 8, 13, 46);
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [
      inboxRow(LIVE_MSG, LIVE, 'Northwind agreement - signed PDF', when),
      inboxRow(SKIP_MSG, SKIP_LIVE, 'Northwind agreement - small PDF', whenSkip)
    ],
    sent: [],
    messages: {},
    attachments: {
      [LIVE_MSG]: pdf('att-live', 'northwind-agreement-signed.pdf', 3072),
      [SKIP_MSG]: pdf('att-skip', 'northwind-agreement-signed.pdf', 800)
    },
    conversation: []
  });

  const page = await glance.openOutlook({
    live: true,
    unread: true,
    id: LIVE,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 14:01',
    attachments: [{ name: 'northwind-agreement-signed.pdf', sizeLabel: '3 KB' }]
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.getByText('Save northwind-agreement-signed.pdf to OneDrive?')).toBeVisible();
  await expect(pane.locator('.flow-chip-process-name')).toHaveText('Save the file?');

  const skipped = await glance.openOutlook({
    live: true,
    unread: true,
    id: SKIP_LIVE,
    subject: 'Northwind agreement - small PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 13:46',
    attachments: [{ name: 'northwind-agreement-signed.pdf', sizeLabel: '800 B' }]
  });
  const skipPane = skipped.locator('#ReadingPaneContainerId');
  await expect(skipPane.getByText('northwind-agreement-signed.pdf · skipped · small-doc')).toBeVisible();
  await expect(skipPane.getByText('Save the file?')).toHaveCount(0);
});

test('a no-ask attachment mail shows the file that is open', async ({ glance }) => {
  test.setTimeout(90000);
  const alphaWhen = localIso(2026, 10, 8, 14, 37);
  const betaWhen = localIso(2026, 10, 8, 14, 38);
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [
      inboxRow(ALPHA_MSG, Q3_CONV, 'Q3 fund statement', alphaWhen),
      inboxRow(BETA_MSG, Q3_CONV, 'Q3 fund statement', betaWhen)
    ],
    sent: [],
    messages: {},
    attachments: {
      [ALPHA_MSG]: pdf('att-alpha', 'statement-q3-alpha.pdf', 3072),
      [BETA_MSG]: pdf('att-beta', 'statement-q3-beta.pdf', 4096)
    },
    conversation: []
  });

  const alpha = await glance.openOutlook({
    live: true,
    unread: true,
    id: Q3_CONV,
    subject: 'Q3 fund statement',
    senderEmail: S.SENDER,
    body: Q3,
    receivedLabel: '08/10/2026 14:37',
    attachments: [{ name: 'statement-q3-alpha.pdf', sizeLabel: '3 KB' }]
  });
  const alphaPane = alpha.locator('#ReadingPaneContainerId');
  await expect(alphaPane.getByText('Save statement-q3-alpha.pdf to OneDrive?')).toBeVisible();
  await expect(alphaPane.getByText('statement-q3-beta.pdf')).toHaveCount(0);

  const beta = await glance.openOutlook({
    live: true,
    unread: true,
    id: Q3_CONV,
    subject: 'Q3 fund statement',
    senderEmail: S.SENDER,
    body: Q3,
    receivedLabel: '08/10/2026 14:38',
    attachments: [{ name: 'statement-q3-beta.pdf', sizeLabel: '4 KB' }]
  });
  const betaPane = beta.locator('#ReadingPaneContainerId');
  await expect(betaPane.getByText('Save statement-q3-beta.pdf to OneDrive?')).toBeVisible();
  await expect(betaPane.getByText('statement-q3-alpha.pdf')).toHaveCount(0);
});

test('a live pane with no Graph candidate records suggest:no-candidate', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [],
    sent: [],
    messages: {},
    attachments: {},
    conversation: []
  });
  await glance.openOutlook({
    live: true,
    unread: true,
    id: LIVE,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 14:01',
    attachments: [{ name: 'northwind-agreement-signed.pdf', sizeLabel: '3 KB' }]
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    return (bag.outlookPageDiag || []).some((d) => d && d.reason === 'suggest:no-candidate');
  }).toBe(true);
});

test('Undo returns one Do It on the mail and in Loops, including a legacy undone row', async ({ glance }) => {
  test.setTimeout(90000);
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: PROMISE,
    subject: 'Numbers for Dana',
    senderEmail: S.SENDER,
    body: DANA
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.locator('button.flow-chip')).toHaveCount(1);
  await pane.locator('button.flow-chip').click();
  await expect(pane.locator('.flow-chip-handled')).toBeVisible();
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  await popup.locator('#open-list').getByRole('button', { name: 'Undo' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(pane.locator('button.flow-chip')).toHaveCount(1);
  await expect(pane.getByText('Undone — the To Do task was removed.')).toHaveCount(0);
  await popup.locator('button[data-tab="open"]').click();
  await expect(popup.locator('#open-list').getByRole('button', { name: 'Do It' })).toHaveCount(1);

  const line = 'Undone — the To Do task was removed.';
  await glance.seedOutlook({
    glanceUndoneBanners: {
      [LEGACY]: { line: line, ids: [LEGACY], at: Date.now() }
    },
    log: [
      {
        kind: 'undone',
        messageId: LEGACY,
        itemId: LEGACY,
        text: DANA,
        subject: 'Renew the passport application',
        app: 'outlook',
        connectorId: 'outlookTask',
        system: 'microsoft/todo',
        ts: 3
      },
      {
        kind: 'written',
        messageId: LEGACY,
        itemId: LEGACY,
        text: DANA,
        subject: 'Renew the passport application',
        app: 'outlook',
        connectorId: 'outlookTask',
        system: 'microsoft/todo',
        fetchedBack: true,
        verifiedAt: '2026-10-07T12:00:00.000Z',
        ref: { taskId: 'legacy-todo', externalId: 'legacy-todo', taskListId: 'todo-list' },
        externalId: 'legacy-todo',
        ts: 2
      }
    ]
  });
  const legacy = await glance.openOutlook({
    id: LEGACY,
    subject: 'Renew the passport application',
    senderEmail: S.SENDER,
    body: DANA
  });
  const legacyPane = legacy.locator('#ReadingPaneContainerId');
  await expect(legacyPane.locator('button.flow-chip')).toHaveCount(1);
  await expect(legacyPane.getByText(line)).toHaveCount(0);
  const loops = await glance.openPopup();
  await loops.locator('button[data-tab="open"]').click();
  await expect(loops.locator('#open-list').getByRole('button', { name: 'Do It' })).toHaveCount(1);
});

test('Activity shown matches the Loops card count', async ({ glance }) => {
  test.setTimeout(60000);
  const cores = loadCores();
  const intent = cores.intent.classify(DANA, { now: new Date() });
  const process = cores.actions.planFor(intent, { threadUrl: 'https://outlook.live.com/mail/', hasThreadAttachment: false });
  const now = Date.now();
  await glance.seedOutlook({
    stillOpenMetrics: { shown: 3, doIt: 2, undo: 1, falseClose: 0 },
    log: [
      shownRow(DANA, 'dup-a', intent, process, now),
      shownRow(DANA, 'dup-b', intent, process, now - 1000),
      shownRow(DANA, 'dup-c', intent, process, now - 2000)
    ]
  });
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="open"]').click();
  await expect(popup.locator('#open-list > .log-item')).toHaveCount(1);
  await popup.locator('button[data-tab="log"]').click();
  await expect(popup.locator('#stillOpenQuality')).toContainText('Still open — shown 1');
  await expect(popup.locator('#stillOpenQuality')).toContainText('Do It 2');
  await expect(popup.locator('#stillOpenQuality')).toContainText('undo 1');
});

test('the side panel keeps its scroll across a re-render', async ({ glance }) => {
  test.setTimeout(60000);
  const rows = [];
  for (let i = 0; i < 25; i++) {
    rows.push({
      kind: 'written',
      messageId: 'scroll-' + i,
      label: 'Renew the passport application and file the signed copy with the office ' + i,
      actionTitle: 'Renew the passport application and file the signed copy with the office ' + i,
      app: 'outlook',
      connectorId: 'outlookTask',
      system: 'microsoft/todo',
      ts: Date.now() - i * 1000,
      where: 'Microsoft To Do'
    });
  }
  await glance.seedOutlook({ log: rows });
  const popup = await glance.openPopup();
  await popup.setViewportSize({ width: 380, height: 420 });
  await popup.locator('button[data-tab="log"]').click();
  await expect(popup.locator('#log-list .log-item').first()).toBeVisible();
  const before = await popup.locator('main').evaluate((el) => {
    el.scrollTop = 160;
    return el.scrollTop;
  });
  expect(before).toBe(160);
  await popup.evaluate(() => new Promise((resolve) => {
    chrome.storage.local.get({ log: [] }, (bag) => {
      const log = Array.isArray(bag.log) ? bag.log.slice() : [];
      log.unshift({
        kind: 'written',
        messageId: 'scroll-new',
        label: 'One more passport row',
        actionTitle: 'One more passport row',
        app: 'outlook',
        ts: Date.now()
      });
      chrome.storage.local.set({ log: log }, () => resolve());
    });
  }));
  await expect.poll(async () => popup.locator('#log-list').getByText('One more passport row').count()).toBe(1);
  await expect.poll(async () => popup.locator('main').evaluate((el) => el.scrollTop)).toBe(160);
});

test('3:05 PM saves the afternoon file, and a bare 3:05 does not', async ({ glance }) => {
  test.setTimeout(90000);
  const conv = 'AQQKGlanceE2EClock';
  const morningId = 'AQMkGlanceE2EMorning';
  const afternoonId = 'AQMkGlanceE2EAfternoon';
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [
      inboxRow(morningId, conv, 'Clock check', localIso(2026, 10, 8, 3, 5)),
      inboxRow(afternoonId, conv, 'Clock check', localIso(2026, 10, 8, 15, 5))
    ],
    sent: [],
    messages: {},
    attachments: {
      [morningId]: pdf('att-am', 'morning.pdf', 3072),
      [afternoonId]: pdf('att-pm', 'afternoon.pdf', 4096)
    },
    conversation: []
  });
  const page = await glance.openOutlook({
    live: true,
    id: conv,
    subject: 'Clock check',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 3:05 PM',
    attachments: [{ name: 'afternoon.pdf', sizeLabel: '4 KB' }]
  });
  await expect(page.locator('#ReadingPaneContainerId').getByText('Save afternoon.pdf to OneDrive?')).toBeVisible();
  await expect(page.locator('#ReadingPaneContainerId').getByText('morning.pdf')).toHaveCount(0);

  const bare = await glance.openOutlook({
    live: true,
    id: conv,
    subject: 'Clock check',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: '08/10/2026 3:05',
    attachments: [{ name: 'afternoon.pdf', sizeLabel: '4 KB' }]
  });
  await expect(bare.locator('#ReadingPaneContainerId').getByText('Save the file?')).toHaveCount(0);
  await expect.poll(async () => {
    const bag = await glance.storage();
    return (bag.outlookPageDiag || []).some((d) => d && d.reason === 'suggest:unresolved');
  }).toBe(true);
});

test('a Hebrew 24-hour pane links one subject, and 14:37 is not 14:38', async ({ glance }) => {
  test.setTimeout(90000);
  const northConv = 'AQQKGlanceE2EHebrewNorth';
  const northMsg = 'AQMkGlanceE2EHebrewNorth';
  await glance.seedOutlook();
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [inboxRow(northMsg, northConv, 'Northwind agreement - signed PDF', localIso(2026, 10, 8, 14, 1))],
    sent: [],
    messages: {},
    attachments: { [northMsg]: pdf('att-nw', 'northwind-agreement-signed.pdf', 3072) },
    conversation: []
  });
  const north = await glance.openOutlook({
    live: true,
    id: northConv,
    subject: 'Northwind agreement - signed PDF',
    senderEmail: S.SENDER,
    body: NORTHWIND,
    receivedLabel: 'ה 08/10/2026 14:01',
    attachments: [{ shownName: '…hwind-agreement-signed.pdf', titleName: 'northwind-agreement-signed.pdf', sizeLabel: '3 KB' }]
  });
  await expect(north.locator('#ReadingPaneContainerId').getByText('Save northwind-agreement-signed.pdf to OneDrive?')).toBeVisible();

  const alphaWhen = localIso(2026, 10, 8, 14, 37);
  const betaWhen = localIso(2026, 10, 8, 14, 38);
  await glance.setScenario({
    inboxFilterFails: true,
    inbox: [
      inboxRow(ALPHA_MSG, Q3_CONV, 'Q3 fund statement', alphaWhen),
      inboxRow(BETA_MSG, Q3_CONV, 'Q3 fund statement', betaWhen)
    ],
    sent: [],
    messages: {},
    attachments: {
      [ALPHA_MSG]: pdf('att-alpha', 'statement-q3-alpha.pdf', 3072),
      [BETA_MSG]: pdf('att-beta', 'statement-q3-beta.pdf', 4096)
    },
    conversation: []
  });
  const alpha = await glance.openOutlook({
    live: true,
    id: Q3_CONV,
    subject: 'Q3 fund statement',
    senderEmail: S.SENDER,
    body: Q3,
    receivedLabel: '08/10/2026 14:37',
    attachments: [{ shownName: '…t-q3-alpha.pdf', sizeLabel: '3 KB' }]
  });
  await expect(alpha.locator('#ReadingPaneContainerId').getByText('Save statement-q3-alpha.pdf to OneDrive?')).toBeVisible();
  await expect(alpha.locator('#ReadingPaneContainerId').getByText('statement-q3-beta.pdf')).toHaveCount(0);

  const beta = await glance.openOutlook({
    live: true,
    id: Q3_CONV,
    subject: 'Q3 fund statement',
    senderEmail: S.SENDER,
    body: Q3,
    receivedLabel: '08/10/2026 14:38',
    attachments: [{ shownName: '…nt-q3-beta.pdf', sizeLabel: '4 KB' }]
  });
  await expect(beta.locator('#ReadingPaneContainerId').getByText('Save statement-q3-beta.pdf to OneDrive?')).toBeVisible();
  await expect(beta.locator('#ReadingPaneContainerId').getByText('statement-q3-alpha.pdf')).toHaveCount(0);
});

test('a Hebrew To line that names the user offers the Q3 draft', async ({ glance }) => {
  test.setTimeout(60000);
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: 'AQMkGlanceE2EHebrewTo',
    subject: 'Gate A 0.9.41 - quick question on the Q3 summary',
    senderEmail: S.SENDER,
    body: 'Can you reply and confirm whether the Q3 summary will include the October numbers?',
    hebrewTo: true,
    to: [S.ME],
    toName: 'sali sapan'
  });
  await expect(page.locator('#ReadingPaneContainerId button.flow-chip')).toHaveCount(1);
});

test('an older undone promise shows one Do It on a mail with the same words', async ({ glance }) => {
  test.setTimeout(60000);
  const cores = loadCores();
  const intent = cores.intent.classify(DANA, { now: new Date() });
  const process = cores.actions.planFor(intent, { threadUrl: 'https://outlook.live.com/mail/', hasThreadAttachment: false });
  const line = 'Undone — the To Do task was removed.';
  await glance.seedOutlook({
    glanceUndoneBanners: {
      AQMkPassport35: { line: line, ids: ['AQMkPassport35'], at: Date.now() }
    },
    log: [{
      kind: 'undone',
      messageId: 'AQMkPassport35',
      itemId: 'AQMkPassport35',
      text: DANA,
      subject: 'Gate 0.9.35 To Do title',
      app: 'outlook',
      ts: Date.now()
    }, {
      kind: 'shown',
      messageId: 'AQMkPassport35',
      itemId: 'AQMkPassport35',
      app: 'outlook',
      ts: Date.now() - 1000,
      sender: { name: 'flow', email: S.SENDER },
      subject: 'Gate 0.9.35 To Do title',
      text: DANA,
      intent: intent,
      process: process
    }]
  });
  const page = await glance.openOutlook({
    id: 'AQMkPassport34',
    subject: 'Gate 0.9.34 To Do title',
    senderEmail: S.SENDER,
    body: DANA
  });
  const pane = page.locator('#ReadingPaneContainerId');
  await expect(pane.locator('button.flow-chip')).toHaveCount(1);
  await expect(pane.getByText(line)).toHaveCount(0);
});

test('Show all keeps the side panel scroll', async ({ glance }) => {
  test.setTimeout(60000);
  const diags = [];
  for (let i = 0; i < 25; i++) {
    diags.push({ key: 'page:quiet|' + i, reason: 'page:quiet-' + i, subject: 'Quiet mail ' + i, at: i });
  }
  await glance.seedOutlook({ outlookPageDiag: diags });
  const popup = await glance.openPopup();
  await popup.locator('button[data-tab="setup"]').click();
  await popup.setViewportSize({ width: 380, height: 420 });
  const before = await popup.locator('main').evaluate((el) => {
    el.scrollTop = 140;
    return el.scrollTop;
  });
  expect(before).toBe(140);
  await popup.locator('#surface-list summary').evaluate((el) => el.click());
  await expect.poll(async () => popup.locator('main').evaluate((el) => el.scrollTop)).toBe(140);
  await popup.locator('#surface-list').getByRole('button', { name: 'Show all' }).evaluate((el) => el.click());
  await expect.poll(async () => popup.locator('main').evaluate((el) => el.scrollTop)).toBe(140);
  await expect(popup.locator('#surface-list').getByText('page:quiet-24')).toBeVisible();
});
