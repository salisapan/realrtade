const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

async function judgeOnPage(glance, page) {
  return glance.evaluateWorker(async (url) => {
    const tabs = await chrome.tabs.query({ url: 'https://outlook.live.com/*' });
    const tab = (tabs || []).find((t) => t.url === url) || (tabs || [])[0];
    if (!tab || typeof tab.id !== 'number') return { error: 'no-tab' };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const J = globalThis.FlowIncomingJudge;
          const G = typeof FlowGraphMail !== 'undefined' ? FlowGraphMail : globalThis.FlowGraphMail;
          if (!J || !G) return { error: 'engine-missing', judge: typeof J, graph: typeof G };
          const ask = 'Could you confirm the transfer by Friday?';
          const sender = { email: 'ai.local.flow@gmail.com', name: 'flow' };
          const base = { subject: 'Transfer', sender: sender, attachmentCount: 0, surface: 'outlook' };
          const rlm = J.prepareForJudge('\u200F' + ask);
          const sameLine = J.judge(Object.assign({}, base, { text: 'Sent from my iPhone. ' + ask }));
          const ownLine = J.judge(Object.assign({}, base, { text: ask + '\nSent from my iPhone' }));
          const onlySig = J.judge(Object.assign({}, base, { text: 'Sent from my iPhone' }));
          const heAsk = 'תוכל לשלוח לי את החוזה עד יום חמישי?';
          const heOwn = J.judge(Object.assign({}, base, { text: heAsk + '\nנשלח מהאייפון שלי' }));
          const heBare = J.judge(Object.assign({}, base, { text: heAsk }));
          const heSame = J.judge(Object.assign({}, base, { text: 'נשלח מהאייפון שלי: ' + heAsk }));
          const preview = 'Could you confirm the transfer by Friday? '.repeat(12);
          return {
            rlmStripped: rlm.indexOf('\u200F') < 0 && rlm.indexOf(ask) >= 0,
            sameLine: sameLine.show === true,
            ownLine: ownLine.show === true,
            onlySig: onlySig.show === false && onlySig.reason === 'too-short',
            heOwnMatchesAsk: heOwn.show === heBare.show && (heOwn.reason || null) === (heBare.reason || null),
            heSameShow: heSame.show === true,
            heKinds: ((heSame.process && heSame.process.steps) || []).map((s) => s.kind),
            previewOnly: G.truncatedPreviewOnly({ body: { content: '  ' }, bodyPreview: preview }) === true,
            fullBodyWins: G.truncatedPreviewOnly({ body: { content: ask }, bodyPreview: preview }) === false,
            shortPreview: G.truncatedPreviewOnly({ body: { content: '' }, bodyPreview: 'short note' }) === false
          };
        }
      });
      return (results && results[0] && results[0].result) || { error: 'empty' };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }, page.url());
}

test('normalize and the narrowed phone-signature strip before judge', async ({ glance }) => {
  await glance.seedOutlook();
  const page = await glance.openOutlook({
    id: S.MSG_PHONE,
    subject: 'Transfer',
    senderEmail: S.SENDER,
    body: S.SAME_LINE_PHONE
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
  const judged = await judgeOnPage(glance, page);
  expect(judged).toMatchObject({
    rlmStripped: true,
    sameLine: true,
    ownLine: true,
    onlySig: true,
    heOwnMatchesAsk: true,
    heSameShow: true,
    heKinds: ['outlookTask']
  });
});

test('resolver refuses a Graph sender that is not the open pane', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: {},
    conversation: [{
      id: 'AQMkGlanceE2EMismatchHit',
      conversationId: S.CONV_MISMATCH,
      receivedDateTime: new Date().toISOString(),
      subject: 'Transfer',
      from: { emailAddress: { name: 'Other', address: S.OTHER } }
    }]
  });
  const page = await glance.openOutlook({
    id: S.CONV_MISMATCH,
    subject: 'Transfer',
    senderEmail: 'dana@acme.com',
    senderName: 'Dana',
    body: S.SHOW
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = bag.outlookPageDiag || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    return {
      chips,
      mismatch: diags.some((d) => d && d.reason === 'page:sender-mismatch')
    };
  }).toEqual({ chips: 0, mismatch: true });
});

function conversationScenario(convId, messageId, from, sender) {
  const row = {
    id: messageId,
    conversationId: convId,
    receivedDateTime: new Date().toISOString(),
    subject: 'Transfer',
    from: { emailAddress: { name: 'From', address: from } }
  };
  if (sender) row.sender = { emailAddress: { name: 'Sender', address: sender } };
  return {
    inbox: [],
    sent: [],
    messages: {},
    attachments: {},
    conversation: [row]
  };
}

test('a case-only sender difference still shows the card', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario(conversationScenario('AQQkGlanceE2ECaseConv', 'AQMkGlanceE2ECaseHit', 'dana@acme.com'));
  const page = await glance.openOutlook({
    id: 'AQQkGlanceE2ECaseConv',
    subject: 'Transfer',
    senderEmail: 'Dana@Acme.com',
    senderName: 'Dana',
    body: S.SHOW
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('external otherMails does not count as own-sender on Graph from', async ({ glance }) => {
  await glance.seedOutlook();
  const scenario = conversationScenario('AQQkGlanceE2EExtOtherConv', 'AQMkGlanceE2EExtOtherHit', 'dana@acme.com');
  scenario.me = {
    mail: S.ME,
    userPrincipalName: S.ME,
    proxyAddresses: ['SMTP:' + S.ME],
    otherMails: ['external@gmail.com']
  };
  await glance.setScenario(scenario);
  const page = await glance.openOutlook({
    id: 'AQQkGlanceE2EExtOtherConv',
    subject: 'Transfer',
    senderEmail: 'dana@acme.com',
    senderName: 'Dana',
    body: S.SHOW
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('the user alias agrees with Graph and shows the card', async ({ glance }) => {
  await glance.seedOutlook();
  const scenario = conversationScenario('AQQkGlanceE2EAliasConv', 'AQMkGlanceE2EAliasHit', 'sali.alias@glance.test');
  scenario.me = {
    mail: S.ME,
    userPrincipalName: S.ME,
    proxyAddresses: ['SMTP:' + S.ME, 'smtp:sali.alias@glance.test']
  };
  await glance.setScenario(scenario);
  const page = await glance.openOutlook({
    id: 'AQQkGlanceE2EAliasConv',
    subject: 'Transfer',
    senderEmail: 'sali.alias@glance.test',
    senderName: 'Sali',
    body: S.SHOW
  });
  await expect(page.locator('#ReadingPaneContainerId .flow-chip-host button.flow-chip')).toBeVisible();
});

test('a forwarded mail stays a sender mismatch', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario(conversationScenario('AQQkGlanceE2EForwardConv', 'AQMkGlanceE2EForwardHit', 'original@acme.com'));
  const page = await glance.openOutlook({
    id: 'AQQkGlanceE2EForwardConv',
    subject: 'Transfer',
    senderEmail: 'forwarder@elsewhere.com',
    senderName: 'Forwarder',
    body: S.SHOW
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = bag.outlookPageDiag || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    return {
      chips,
      mismatch: diags.some((d) => d && d.reason === 'page:sender-mismatch')
    };
  }).toEqual({ chips: 0, mismatch: true });
});

test('a delegate send stays a sender mismatch', async ({ glance }) => {
  await glance.seedOutlook();
  await glance.setScenario(conversationScenario('AQQkGlanceE2EDelegateConv', 'AQMkGlanceE2EDelegateHit', 'boss@acme.com', 'delegate@acme.com'));
  const page = await glance.openOutlook({
    id: 'AQQkGlanceE2EDelegateConv',
    subject: 'Transfer',
    senderEmail: 'boss@acme.com',
    senderName: 'Boss',
    body: S.SHOW
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = bag.outlookPageDiag || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    return {
      chips,
      mismatch: diags.some((d) => d && d.reason === 'page:sender-mismatch')
    };
  }).toEqual({ chips: 0, mismatch: true });
});

test('a failed profile read keeps the exact sender comparison', async ({ glance }) => {
  await glance.seedOutlook();
  const scenario = conversationScenario('AQQkGlanceE2EMeFailConv', 'AQMkGlanceE2EMeFailHit', 'sali.other@glance.test');
  scenario.meFail = true;
  await glance.setScenario(scenario);
  const page = await glance.openOutlook({
    id: 'AQQkGlanceE2EMeFailConv',
    subject: 'Transfer',
    senderEmail: 'sali.alias@glance.test',
    senderName: 'Sali',
    body: S.SHOW
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = bag.outlookPageDiag || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    return {
      chips,
      mismatch: diags.some((d) => d && d.reason === 'page:sender-mismatch')
    };
  }).toEqual({ chips: 0, mismatch: true });
});

test('a truncated bodyPreview is outlook:body-preview-only and not a card', async ({ glance }) => {
  const preview = ('Could you confirm the transfer by Friday? ').repeat(12);
  expect(preview.length).toBeGreaterThanOrEqual(255);
  await glance.seedOutlook();
  await glance.setScenario({
    inbox: [{
      id: 'AQMkGlanceE2EPreviewMsg',
      conversationId: 'AQQkGlanceE2EPreviewConv',
      subject: 'Preview only',
      receivedDateTime: new Date().toISOString(),
      isDraft: false,
      hasAttachments: false,
      body: { contentType: 'text', content: '' },
      bodyPreview: preview,
      from: { emailAddress: { name: 'Other', address: S.OTHER } },
      toRecipients: [{ emailAddress: { address: S.ME } }]
    }],
    sent: [],
    messages: {},
    attachments: {},
    conversation: []
  });
  const page = await glance.openOutlook({
    id: S.MSG_PREVIEW_PANE,
    subject: 'Thanks',
    senderEmail: S.SENDER,
    body: S.SILENT
  });
  await expect.poll(async () => {
    const bag = await glance.storage();
    const diags = (bag.outlookSync && bag.outlookSync.diagnostics) || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    return {
      chips,
      preview: diags.some((d) => d && d.reason === 'outlook:body-preview-only')
    };
  }).toEqual({ chips: 0, preview: true });
  const onPage = await judgeOnPage(glance, page);
  expect(onPage.previewOnly).toBe(true);
  expect(onPage.fullBodyWins).toBe(true);
  expect(onPage.shortPreview).toBe(true);
});

// Dates are a week ahead of the real clock, so the spec does not go stale.
const AHEAD = new Date(Date.now() + 7 * 24 * 3600 * 1000);
// Month names, not 2/11: a slash date whose day and month both fit either way is unresolved on purpose, so these were red on days 1 to 12.
const AHEAD_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][AHEAD.getMonth()] + ' ' + AHEAD.getDate();
const AHEAD_HE = AHEAD.getDate() + ' ב' + ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'][AHEAD.getMonth()];
const SELF_SAVE = 'please save the report to Drive by ' + AHEAD_EN;
const SELF_HOLD = 'תשמור לי את הזמן לפגישה ב-' + AHEAD_HE + ' ב-14:00';

function reportFile() {
  return [{ id: 'att-report', name: 'report.pdf', contentType: 'application/pdf', size: 4096, isInline: false }];
}

async function quietReason(glance, page) {
  const bag = await glance.storage();
  const diags = bag.outlookPageDiag || [];
  return {
    chips: await page.locator('#ReadingPaneContainerId .flow-chip-host').count(),
    silenced: diags.some((d) => d && (d.reason === 'note-to-self' || d.reason === 'own-sender' || d.reason === 'page:sender-mismatch'))
  };
}

test('Outlook self-sent save and Hebrew meeting get a card', async ({ glance }) => {
  await glance.seedOutlook({}, { ownAddresses: [S.ME, S.SENDER] });
  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: { AQMkGlanceSelfSaveGmail: reportFile() },
    conversation: [],
    me: {
      mail: S.ME,
      userPrincipalName: S.ME,
      proxyAddresses: ['SMTP:' + S.ME],
      otherMails: [S.SENDER]
    }
  });
  const save = await glance.openOutlook({
    id: 'AQMkGlanceSelfSaveGmail',
    subject: 'Report',
    senderEmail: S.SENDER,
    senderName: 'Sali',
    to: [S.SENDER],
    body: SELF_SAVE,
    attachments: reportFile()
  });
  await expect(save.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);
  await expect.poll(async () => quietReason(glance, save)).toEqual({ chips: 1, silenced: false });

  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: { AQMkGlanceSelfSaveOutlook: reportFile() },
    conversation: [],
    me: { mail: S.ME, userPrincipalName: S.ME, displayName: 'Glance' }
  });
  const saveOutlook = await glance.openOutlook({
    id: 'AQMkGlanceSelfSaveOutlook',
    subject: 'Report',
    senderEmail: S.ME,
    senderName: 'Glance',
    to: [S.ME],
    body: SELF_SAVE,
    attachments: reportFile()
  });
  await expect(saveOutlook.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);

  const hold = await glance.openOutlook({
    id: 'AQMkGlanceSelfHoldGmail',
    subject: 'פגישה',
    senderEmail: S.SENDER,
    senderName: 'Sali',
    to: [S.SENDER],
    body: SELF_HOLD
  });
  await expect(hold.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);

  const holdOutlook = await glance.openOutlook({
    id: 'AQMkGlanceSelfHoldOutlook',
    subject: 'פגישה',
    senderEmail: S.ME,
    senderName: 'Glance',
    to: [S.ME],
    body: SELF_HOLD
  });
  await expect(holdOutlook.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);

  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: {},
    conversation: [],
    me: {
      mail: S.ME,
      userPrincipalName: 'sali.upn@glance.test',
      proxyAddresses: ['SMTP:' + S.ME, 'smtp:sali.alias@glance.test'],
      otherMails: ['sali.other@glance.test']
    }
  });
  const alias = await glance.openOutlook({
    id: 'AQMkGlanceSelfHoldAlias',
    subject: 'פגישה',
    senderEmail: 'sali.alias@glance.test',
    senderName: 'Sali',
    to: [S.ME],
    body: SELF_HOLD
  });
  await expect(alias.locator('#ReadingPaneContainerId .flow-chip-host')).toHaveCount(1);

  const outbound = await glance.openOutlook({
    id: 'AQMkGlanceSelfOutbound',
    subject: 'פגישה',
    senderEmail: S.ME,
    senderName: 'Glance',
    to: ['dana@acme.com'],
    body: SELF_HOLD
  });
  await expect.poll(async () => quietReason(glance, outbound)).toEqual({ chips: 0, silenced: true });
});

test('Gmail self-sent save and Hebrew meeting get a card', async ({ glance }) => {
  await glance.seedGmail();
  const save = await glance.openGmail({
    messageId: 'm-self-save',
    threadId: 't-self-save',
    subject: 'Report',
    senderEmail: S.SENDER,
    senderName: 'Sali',
    ownEmail: S.SENDER,
    to: [S.SENDER],
    body: SELF_SAVE,
    attachments: [{ name: 'report.pdf', mimeType: 'application/pdf' }]
  });
  await expect(save.locator('div[role="main"] .flow-chip-host')).toHaveCount(1);

  const hold = await glance.openGmail({
    messageId: 'm-self-hold',
    threadId: 't-self-hold',
    subject: 'פגישה',
    senderEmail: S.SENDER,
    senderName: 'Sali',
    ownEmail: S.SENDER,
    to: [S.SENDER],
    body: SELF_HOLD
  });
  await expect(hold.locator('div[role="main"] .flow-chip-host')).toHaveCount(1);

  const outbound = await glance.openGmail({
    messageId: 'm-self-out',
    threadId: 't-self-out',
    subject: 'פגישה',
    senderEmail: S.SENDER,
    senderName: 'Sali',
    ownEmail: S.SENDER,
    to: ['dana@acme.com'],
    body: SELF_HOLD
  });
  await expect(outbound.locator('div.a3s')).toContainText(SELF_HOLD);
  await expect.poll(async () => outbound.locator('div[role="main"] .flow-chip-host').count()).toBe(0);
});
