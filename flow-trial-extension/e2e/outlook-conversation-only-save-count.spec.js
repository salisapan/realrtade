// Regression for the 11bc360 live Outlook Gate (Supplier contract – OneDrive, P/A FAIL).
// Live-shaped 09:44 Supplier mail: conversation-only address, no Graph message id
// handed to the harness, zero pane-parsed attachments (the chip shows the file
// name but no size label, so FlowOwaParse.attachmentsOf finds nothing — matching
// the live probe's attachmentCount 0 while the PDF is visibly rendered).
const { test, expect } = require('./support/harness');
// Live URL id AQQKADAWATM0MDAAMS0wZTAwAi0wMAoAEDKphHFxg%2FaTZsc1nPjS5xa, decoded (%2F is /).
const URL_ID = 'AQQKADAWATM0MDAAMS0wZTAwAi0wMAoAEDKphHFxg/aTZsc1nPjS5xa';
const BODY = 'Hi,\nPlease save the attached contract to OneDrive by Sunday.\nThanks';
const SUBJECT = 'Supplier contract – OneDrive';
const FILE = 'supplier-contract-nov.pdf';
// The live Gate mail arrived Thu 5 Nov 2026 09:44 Asia/Jerusalem. Here it is today 09:44 local,
// like the other file-ask specs, so "by Sunday" stays a live ask whatever day the suite runs.
const { testDay } = require('./support/fixtures');
const TD = testDay();
const RECEIVED = new Date(TD.y, TD.m - 1, TD.d, 9, 44, 0, 0).toISOString();
const LATER_RECEIVED = new Date(TD.y, TD.m - 1, TD.d, 18, 12, 0, 0).toISOString();
// REST-alphabet Graph ids (no slash), so the shared mock routes them unchanged.
const MSG = 'AQMkADAwATM0MDAAMS0wZTAwAi0wMAoARgAAA_Supplier0944-AAAA';
const LATER = 'AQMkADAwATM0MDAAMS0wZTAwAi0wMAoARgAAA_Supplier1812-AAAA';
const rest = (s) => s.replace(/\//g, '_').replace(/\+/g, '-');

async function setup(glance, opts = {}) {
  const subject = opts.subject || SUBJECT;
  const body = opts.body || BODY;
  const graphConv = opts.graphConv || rest(URL_ID);
  await glance.seedOutlook({ glanceDebug: true, glanceUiLanguage: 'he' }, { files: opts.files !== false, tasks: false });
  const row = { id: MSG, conversationId: graphConv, subject, receivedDateTime: RECEIVED, hasAttachments: true,
    from: { emailAddress: { name: 'moshe', address: 'moshe@example.test' } },
    sender: { emailAddress: { name: 'moshe', address: 'moshe@example.test' } },
    toRecipients: [{ emailAddress: { address: 'glance.salisapan@outlook.com' } }], ccRecipients: [],
    body: { contentType: 'text', content: body } };
  // 18:12 same-subject mail in a DIFFERENT conversation.
  const later = { ...row, id: LATER, conversationId: 'AQQkADAwATM0MDAAMS0wZTAwAi0wMAoAEOtherSignedConv_x',
    receivedDateTime: LATER_RECEIVED,
    body: { contentType: 'text', content: 'Hi, Attached is the signed supplier contract for November. Thanks' } };
  const pdf = { id: 'att-pdf', name: FILE, contentType: 'application/pdf', size: 985, isInline: false, '@odata.type': '#microsoft.graph.fileAttachment' };
  await glance.setScenario({ inboxFilterFails: true, inbox: [later, row], sent: [], messages: { [MSG]: row, [LATER]: later },
    conversation: [row], attachments: { [MSG]: [pdf], [LATER]: [{ ...pdf, id: 'att-signed', name: 'supplier-contract-nov-signed.pdf' }] },
    mailboxSettings: { timeFormat: 'HH:mm', timeZone: 'Israel Standard Time' } });
  // Test-only Graph faults, read per call from the current scenario so they never
  // leak into the next test (the service worker and its fetch persist across tests).
  await glance.evaluateWorker((faults) => {
    const e = globalThis.__glanceE2e;
    e.scenario.liveFaults = faults;
    if (globalThis.__liveNoItemIdWrapped) return;
    globalThis.__liveNoItemIdWrapped = true;
    const previous = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const f0 = (globalThis.__glanceE2e.scenario && globalThis.__glanceE2e.scenario.liveFaults) || {};
      const u = new URL(String(url));
      const f = decodeURIComponent(u.search || '');
      const convFilter = u.host === 'graph.microsoft.com' && /\/me\/messages$/.test(u.pathname) && /conversationId\s+eq/i.test(f);
      const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      // Documented live reality (content-outlook.js messageIdForConversation): a
      // $filter on conversationId comes back empty; only the inbox list matches.
      if (convFilter && f0.convFilterEmpty) {
        globalThis.__glanceE2e.calls.push({ url: String(url), method: 'GET', note: 'conv-filter-empty' });
        return json(200, { value: [] });
      }
      // Graph refuses $filter on conversationId combined with $orderby on another
      // property (400 "restriction or sort order too complex", the refusal the shared
      // mock models for the inbox list). The plain conversation filter still works,
      // as fce113d's live hydrateHow "conversation" on this mail shows.
      if (convFilter && f0.threadOrderbyRefused && /\$orderby=/i.test(f)) {
        globalThis.__glanceE2e.calls.push({ url: String(url), method: 'GET', note: 'conv-orderby-400' });
        return json(400, { error: { code: 'InefficientFilter', message: 'The restriction or sort order is too complex for this operation.' } });
      }
      return previous(url, init);
    };
  }, { convFilterEmpty: Boolean(opts.convFilterEmpty), threadOrderbyRefused: Boolean(opts.threadOrderbyRefused) });
  // No graphMessageId: the harness must not hand the pane or the mock an item id.
  const page = await glance.openOutlook({ id: URL_ID, convId: graphConv, live: true,
    subject, senderName: 'moshe', senderEmail: 'moshe@example.test', body,
    receivedDateTime: RECEIVED, receivedLabel: '09:44 ' + TD.dmy, lang: 'he',
    attachments: [{ shownName: FILE, titleName: FILE, sizeLabel: '' }] });
  return page;
}

async function paneProbe(glance) {
  return glance.evaluateWorker(async () => {
    const [tab] = await chrome.tabs.query({ url: ['https://outlook.live.com/*'] });
    // Same read-only snapshot the live SW probe used (__flowDiag.readPane).
    const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', func: () => {
      try {
        const d = globalThis.__flowDiag && globalThis.__flowDiag.readPane ? globalThis.__flowDiag.readPane() : null;
        // readPane's itemId is FlowOwaParse.urlIds(href).itemId: null whenever the
        // address id is AQQk/AAQk (case-insensitive). Same rule, applied to this URL.
        const m = location.href.match(/\/id\/([^/?#&]+)/i);
        const urlId = m ? decodeURIComponent(m[1]) : '';
        return { hasItemId: Boolean(urlId) && !/^A[AQ]Qk/i.test(urlId), urlId,
          hasConversationId: Boolean(d && d.conversationId), idSource: d && d.idSource,
          attachmentCount: d ? (d.attachments || []).length : -1, chars: d ? String(d.text || '').length : -1 };
      } catch (e) { return { error: String(e && e.message || e) }; }
    } });
    return r[0].result;
  });
}
async function observation(glance, page) {
  const diag = ((await glance.storage()).outlookPageDiag || []).map((d) => ({ reason: d.reason, verdict: d.verdict, hydrateHow: d.hydrateHow }));
  return { why: await page.locator('.flow-why-not').evaluateAll((els) => els.map((e) => e.getAttribute('data-glance-why'))),
    cards: await page.locator('.flow-chip-host').count(), diag,
    gets: (await glance.apiCalls()).map((c) => (c.note ? '[' + c.note + '] ' : '') + c.method + ' ' + decodeURIComponent(String(c.url).replace('https://graph.microsoft.com/v1.0', '')).slice(0, 110)).filter((g) => /attachments\?\$select=id,isInline$|conversationId eq|inbox\/messages/.test(g)).slice(0, 12) };
}
async function noWrites(glance) {
  expect((await glance.apiCalls()).filter((c) => c.method !== 'GET')).toEqual([]);
  expect(await glance.flows()).toEqual([]);
}

const CASES = [
  { label: 'conversation filter works, Graph conv in URL spelling', graphConv: URL_ID },
  { label: 'conversation filter works, Graph conv in REST spelling' },
  { label: 'conversation filter empty -> inbox list + canonId (REST spelling)', convFilterEmpty: true },
  { label: 'conversation filter empty, Files not granted', convFilterEmpty: true, files: false },
  { label: 'thread read $filter+$orderby refused, plain conversation filter works', threadOrderbyRefused: true },
  { label: 'thread read $orderby refused, Graph conv in URL spelling', threadOrderbyRefused: true, graphConv: URL_ID },
];
for (const opts of CASES) {
  test('no-itemId live shape paints save card: ' + opts.label, async ({ glance }) => {
    const page = await setup(glance, opts);
    try {
      await expect.poll(() => paneProbe(glance)).toMatchObject({ hasItemId: false, hasConversationId: true, idSource: 'open-mail', attachmentCount: 0, chars: BODY.length, urlId: URL_ID });
      await expect(page.locator('[data-glance-dest]').first()).toHaveText('OneDrive > Glance', { timeout: 30000 });
      await page.waitForTimeout(4000);
      await expect(page.locator('.flow-chip-host')).toHaveCount(1);
      await expect(page.locator('.flow-chip-host')).toHaveAttribute('data-glance-message', new RegExp(MSG));
      await expect(page.locator('[data-glance-consent="files"]')).toHaveCount(opts.files === false ? 1 : 0);
      const counts = (await glance.apiCalls()).map((c) => decodeURIComponent(String(c.url))).filter((u) => /\/attachments\?\$select=id,isInline$/.test(u));
      // The save count read files on the real 09:44 Graph message, never on a conversation id.
      expect(counts.some((u) => u.indexOf('/me/messages/' + MSG + '/attachments') >= 0)).toBe(true);
      expect(counts.filter((u) => /\/me\/messages\/A[AQ]Qk/i.test(u))).toEqual([]);
      await noWrites(glance);
    } finally { console.log('OBSERVATION', opts.label, JSON.stringify(await observation(glance, page))); }
  });
}
for (const fyi of [{ convFilterEmpty: true }, { threadOrderbyRefused: true }]) test('no-itemId FYI stays quiet: ' + Object.keys(fyi)[0], async ({ glance }) => {
  const page = await setup(glance, { ...fyi, subject: 'Vendor agreement – FYI', body: "Hi,\nPlease don't save the attachment, it's for reference only.\nThanks" });
  await expect.poll(async () => (await glance.storage()).outlookPageDiag || []).not.toEqual([]);
  await page.waitForTimeout(4000);
  await expect(page.locator('.flow-chip-host')).toHaveCount(0);
  await noWrites(glance);
  console.log('OBSERVATION FYI', JSON.stringify(await observation(glance, page)));
});
