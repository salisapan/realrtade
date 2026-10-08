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
