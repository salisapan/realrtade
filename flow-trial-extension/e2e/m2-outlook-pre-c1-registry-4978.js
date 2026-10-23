// pre-C1 registry: modules injected by test (M2 Outlook e2e only).
// Production stays quiet until C1 adds SURFACES.outlook.extra + WRITERS/UNDOERS
// (exact diff: test/m2-outlook-c1-requests-4978.md). Not used in launch.js.
const fs = require('fs');
const path = require('path');
const { outlookUrl } = require('./support/fixtures');

function patchPreC1Registry(dest) {
  const bgPath = path.join(dest, 'src/background.js');
  let bg = fs.readFileSync(bgPath, 'utf8');
  if (!bg.includes('outlook-m2-close.js')) {
    bg = bg.replace(
      "'core/outlook-sync.js', 'src/outlook.js', 'src/chip-host.js', 'src/content-outlook.js']",
      "'core/outlook-sync.js', 'core/onedrive-find.js', 'core/local-file.js', 'core/onedrive-file.js', 'src/outlook.js', 'src/chip-host.js', 'src/outlook-m2-close.js', 'src/content-outlook.js']"
    );
    if (!bg.includes('outlook-m2-close.js')) {
      bg = bg.replace(
        /'core\/outlook-sync\.js', 'src\/outlook\.js', 'src\/chip-host\.js', 'src\/content-outlook\.js'\]/,
        "'core/outlook-sync.js', 'core/onedrive-find.js', 'core/local-file.js', 'core/onedrive-file.js', 'src/outlook.js', 'src/chip-host.js', 'src/outlook-m2-close.js', 'src/content-outlook.js']"
      );
    }
  }
  if (!bg.includes("import '../src/outlook-m2-close.js'")) {
    bg = bg.replace(
      "import '../core/onedrive-new-file.js'; // classic: sets globalThis.FlowOnedriveNewFile (switch ONEDRIVE_NEW_FILE, off)",
      "import '../core/onedrive-new-file.js'; // classic: sets globalThis.FlowOnedriveNewFile (switch ONEDRIVE_NEW_FILE, off)\nimport '../core/onedrive-find.js';\nimport '../core/local-file.js';\nimport '../core/onedrive-file.js';\nimport '../src/outlook-m2-close.js';"
    );
  }
  const hook = 'const WRITERS = {';
  if (bg.includes(hook) && !bg.includes('onedriveFindAttach:')) {
    const insert = `
async function onedriveFindAttachWrite(p) {
  const M2 = globalThis.FlowOutlookM2Close;
  if (!M2) return { ok: false, reason: 'not-configured' };
  const on = await glanceSwitchOn('ONEDRIVE_FIND');
  const r = await M2.onedriveFindAttachWrite(outlookFetch, { flags: { ONEDRIVE_FIND: on }, params: (p && p.params) || {} });
  return r && r.ok ? Object.assign({}, r, { fetchedBack: true }) : (r || { ok: false, reason: 'write-failed' });
}
async function onedriveFindUndo(ref) {
  const M2 = globalThis.FlowOutlookM2Close;
  if (!M2) return { ok: false };
  return M2.onedriveFindUndo(outlookFetch, ref);
}
`;
    bg = bg.replace(hook, insert + hook);
    bg = bg.replace(
      'onedriveNewFile: onedriveNewFileWrite, outlookEventCallLink: eventLinkWrite,',
      'onedriveNewFile: onedriveNewFileWrite, onedriveFindAttach: onedriveFindAttachWrite, outlookEventCallLink: eventLinkWrite,'
    );
    bg = bg.replace(
      'onedriveNewFile: onedriveNewFileUndo, outlookEventCallLink: eventLinkUndo,',
      'onedriveNewFile: onedriveNewFileUndo, onedriveFindAttach: onedriveFindUndo, outlookEventCallLink: eventLinkUndo,'
    );
  }
  fs.writeFileSync(bgPath, bg);
}

function copyExtensionPreC1() {
  const launch = require('./support/launch');
  const dest = launch.copyExtension();
  patchPreC1Registry(dest);
  return dest;
}

async function installM2GraphFetchHook(harness) {
  await harness.evaluateWorker(() => {
    const e2e = globalThis.__glanceE2e;
    if (!e2e || e2e.__m2GraphPatched) return { ok: true, already: true };
    e2e.__m2GraphPatched = true;
    e2e.draftAttachments = e2e.draftAttachments || {};
    const inner = globalThis.fetch;
    globalThis.fetch = function m2GraphFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      let parsed;
      try { parsed = new URL(url); } catch (err) { return inner(input, init); }
      if (parsed.hostname !== 'graph.microsoft.com') return inner(input, init);
      const method = String((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      e2e.calls.push({ url: url, method: method, at: Date.now() });
      const path = decodeURIComponent(parsed.pathname);
      const scenario = e2e.scenario || {};
      function json(status, body) {
        return new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } });
      }
      function empty(status) { return new Response(null, { status: status }); }

      const attItem = path.match(/\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/);
      if (attItem) {
        const messageId = attItem[1];
        const attachmentId = attItem[2];
        const dyn = (e2e.draftAttachments && e2e.draftAttachments[messageId]) || [];
        const list = ((scenario.attachments && scenario.attachments[messageId]) || []).concat(dyn);
        if (method === 'DELETE') {
          if (e2e.draftAttachments && e2e.draftAttachments[messageId]) {
            e2e.draftAttachments[messageId] = e2e.draftAttachments[messageId].filter((a) => a && a.id !== attachmentId);
          }
          return Promise.resolve(empty(204));
        }
        const row = list.find((a) => a && a.id === attachmentId);
        if (method === 'GET' && !row) return Promise.resolve(json(404, { error: { code: 'ErrorItemNotFound' } }));
        const use = row || { id: attachmentId, name: 'file.bin' };
        return Promise.resolve(json(200, {
          id: attachmentId,
          name: use.name || 'file.bin',
          contentType: use.contentType || 'application/octet-stream',
          size: use.size || 3,
          contentBytes: use.contentBytes || 'ZTJlLXBkZg=='
        }));
      }
      const att = path.match(/\/me\/messages\/([^/]+)\/attachments$/);
      if (att && method === 'POST') {
        const msgId = att[1];
        let posted = {};
        try { posted = JSON.parse((init && init.body) || '{}'); } catch (err) { posted = {}; }
        const attId = 'e2e-att-' + (e2e.seq++);
        const bytes = posted.contentBytes ? atob(posted.contentBytes) : 'x';
        const row = {
          id: attId,
          name: posted.name || 'file.bin',
          contentType: posted.contentType || 'application/octet-stream',
          size: bytes.length,
          contentBytes: posted.contentBytes
        };
        e2e.draftAttachments[msgId] = (e2e.draftAttachments[msgId] || []).concat([row]);
        return Promise.resolve(json(201, { id: attId }));
      }
      if (/\/me\/drive\/root\/search/.test(path) && method === 'GET') {
        const items = Object.values(e2e.driveItems || {}).filter((it) => it && it.file);
        return Promise.resolve(json(200, { value: items }));
      }
      const driveItemContent = path.match(/\/me\/drive\/items\/([^/]+)\/content$/);
      if (driveItemContent && method === 'GET') {
        const item = e2e.driveItems[driveItemContent[1]];
        const body = (item && item.__content) || '%PDF-1.7 e2e-contract';
        return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }));
      }
      return inner(input, init);
    };
    return { ok: true };
  });
}

function extendM2Harness(harness) {
  async function ensureOutlookM2(page) {
    const pageUrl = page.url();
    await harness.evaluateWorker(async (wantUrl) => {
      const tabs = await chrome.tabs.query({ url: ['https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'] });
      const tab = (tabs || []).find((t) => t && t.url && wantUrl && t.url.split('#')[0] === wantUrl.split('#')[0]) || (tabs || [])[tabs.length - 1];
      if (!tab || tab.id == null) return { ok: false, reason: 'no-tab' };
      const files = ['core/onedrive-find.js', 'core/local-file.js', 'core/onedrive-file.js', 'src/outlook-m2-close.js'];
      for (const f of files) {
        try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [f] }); } catch (e) { /* already in bundle */ }
      }
      try { await chrome.tabs.sendMessage(tab.id, { type: 'flow:outlook-rescan' }); } catch (e) { /* scan will follow */ }
      return { ok: true, tabId: tab.id };
    }, pageUrl);
    await page.waitForTimeout(500);
  }

  const origOpenOutlook = harness.openOutlook.bind(harness);
  harness.openOutlook = async function openOutlookM2(opts) {
    const page = await origOpenOutlook(opts);
    await ensureOutlookM2(page);
    return page;
  };

  harness.openOutlookHtml = async function openOutlookHtml(html, opts) {
    const o = opts || {};
    const id = o.messageId || o.id || 'AQMkM2Html';
    const url = outlookUrl(id);
    harness.documents.set(url.split('#')[0], html);
    const page = await harness.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    harness.page = page;
    await ensureOutlookM2(page);
    return page;
  };
}

async function bootM2PreC1() {
  const launchPath = require.resolve('./support/launch');
  delete require.cache[launchPath];
  const Module = require('module');
  const compile = Module.prototype._compile;
  const hook = 'const extDir = copyExtension();';
  const hooked = 'const extDir = (globalThis.__glanceM2CopyExtension || copyExtension)();';
  Module.prototype._compile = function patchedCompile(content, filename) {
    if (filename === launchPath && content.includes(hook)) {
      content = content.replace(hook, hooked);
    }
    return compile.call(this, content, filename);
  };
  globalThis.__glanceM2CopyExtension = copyExtensionPreC1;
  let bootFn;
  try {
    bootFn = require('./support/launch').boot;
  } finally {
    Module.prototype._compile = compile;
  }
  try {
    const harness = await bootFn();
    await installM2GraphFetchHook(harness);
    extendM2Harness(harness);
    return harness;
  } finally {
    delete globalThis.__glanceM2CopyExtension;
  }
}

module.exports = {
  bootM2PreC1,
  patchPreC1Registry,
  copyExtensionPreC1
};
