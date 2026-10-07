const { test, expect } = require('./support/harness');
const S = require('./support/sentences');

const PDF = [{
  id: 'att-board',
  name: 'board-pack.pdf',
  contentType: 'application/pdf',
  size: 4096,
  isInline: false
}];

async function openSuggest(glance, body, id, authOpts, attachments) {
  await glance.seedOutlook({}, authOpts);
  await glance.setScenario({
    inbox: [],
    sent: [],
    messages: {},
    attachments: { [id]: attachments },
    conversation: []
  });
  return glance.openOutlook({
    id: id,
    subject: 'Board pack',
    senderEmail: S.SENDER,
    body: body
  });
}

// The page adapter asks FlowOnedriveFile.hasWriteScope. That module is loaded
// by the service worker only, so on the page consent stays null and the
// adapter records suggest:no-consent before bulk or eligible. The engine
// contract is asserted in the content-script world with consent passed in.
// Loading the module into the page would change the shipped reason.
async function engineReasons(glance, page) {
  return glance.evaluateWorker(async (bodies) => {
    const tabs = await chrome.tabs.query({ url: 'https://outlook.live.com/*' });
    const tab = (tabs || []).find((t) => t.url === bodies.url) || (tabs || [])[0];
    if (!tab || typeof tab.id !== 'number') return { error: 'no-tab' };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [bodies],
        func: (b) => {
          const Save = globalThis.FlowSuggestSave;
          if (!Save || typeof Save.suggestSave !== 'function') return { error: 'no-suggest' };
          const pdf = [{ id: 'att-board', name: 'board-pack.pdf', contentType: 'application/pdf', size: 4096, isInline: false }];
          const base = { surface: 'outlook', inbound: true, otherCard: false, messageId: 'm-engine' };
          const eligible = Save.suggestSave(Object.assign({}, base, {
            text: b.suggest, body: b.suggest, attachments: pdf, consent: true
          }));
          const bulk = Save.suggestSave(Object.assign({}, base, {
            text: b.bulk, body: b.bulk, attachments: [], consent: true
          }));
          const none = Save.suggestSave(Object.assign({}, base, {
            text: b.suggest, body: b.suggest, attachments: pdf, consent: false
          }));
          return {
            eligible: eligible && eligible.reason,
            bulk: bulk && bulk.reason,
            noConsent: none && none.reason
          };
        }
      });
      return (results && results[0] && results[0].result) || { error: 'empty' };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }, { url: page.url(), suggest: S.SUGGEST_BODY, bulk: S.BULK_BODY });
}

async function pageQuiet(glance, page) {
  await expect.poll(async () => {
    const bag = await glance.storage();
    const log = bag.suggestLog || [];
    const chips = await page.locator('#ReadingPaneContainerId .flow-chip-host').count();
    const save = await page.getByText(/Save .+ to (OneDrive|Drive)/).count();
    return {
      chips,
      save,
      reason: log.map((row) => row && row.reason).filter(Boolean).join(',')
    };
  }).toEqual({ chips: 0, save: 0, reason: 'suggest:no-consent' });
}

test('eligible mail logs suggest:eligible-hidden and draws no card', async ({ glance }) => {
  const page = await openSuggest(glance, S.SUGGEST_BODY, S.MSG_SILENT, {}, PDF);
  await pageQuiet(glance, page);
  const engine = await engineReasons(glance, page);
  expect(engine).toEqual({
    eligible: 'suggest:eligible-hidden',
    bulk: 'suggest:bulk',
    noConsent: 'suggest:no-consent'
  });
  const popup = await glance.openPopup();
  const why = popup.getByText(/Why not shown/);
  await expect(why).toBeVisible();
  await why.click();
  await expect(popup.getByText('suggest:no-consent')).toBeVisible();
  await expect(popup.getByText('suggest:eligible-hidden')).toHaveCount(0);
});

test('bulk mail logs suggest:bulk and draws no card', async ({ glance }) => {
  const page = await openSuggest(glance, S.BULK_BODY, S.MSG_B, {}, []);
  await pageQuiet(glance, page);
  const engine = await engineReasons(glance, page);
  expect(engine.bulk).toBe('suggest:bulk');
  expect(engine.eligible).toBe('suggest:eligible-hidden');
});

test('missing Files.ReadWrite logs suggest:no-consent', async ({ glance }) => {
  const page = await openSuggest(glance, S.SUGGEST_BODY, S.MSG_A, { files: false }, PDF);
  await pageQuiet(glance, page);
  const engine = await engineReasons(glance, page);
  expect(engine.noConsent).toBe('suggest:no-consent');
});
