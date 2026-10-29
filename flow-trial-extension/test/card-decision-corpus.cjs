// One decision record for the card and for Why not shown.
// Run: node test/card-decision-corpus.cjs
// Needs jsdom. Missing jsdom is a failed run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.error('FAIL: jsdom is not installed. The card-decision regression cannot run.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const { FlowDisplay } = require(path.join(ROOT, 'core/display-copy.js'));
const ME = 'glance.salisapan@outlook.com';
const FLOW = 'ai.local.flow@gmail.com';
const AVI = 'avi.mizrahi@northwind.example';
const CONV = 'AQQkCONV-OLD-111';
const PICKED = 'MSG-PICKED-999';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('PASS:', name);
  else {
    failures++;
    console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail).slice(0, 900) : '');
  }
}

function registeredFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const bg = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');
  const only = JSON.parse(bg.match(/const GMAIL_ONLY_SCRIPTS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const table = bg.match(/const SURFACES = \{([\s\S]*?)\n\};/)[1];
  const outlook = table.slice(table.indexOf('outlook:'));
  const extra = (outlook.match(/extra: \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  return (manifest.content_scripts[0].js || []).filter((f) => only.indexOf(f) < 0).concat(extra);
}

function lines(text) {
  return String(text || '').split('\n').map((line) => '<div>' + line + '</div>').join('');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function boot(opts) {
  const o = opts || {};
  const graph = o.graph || (() => ({ value: [] }));
  const files = registeredFiles();
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/owa-reading-pane-he.html'), 'utf8');
  const dom = new JSDOM(html, { url: o.url || ('https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(o.id || 'MSG-Q3-SUMMARY-111')), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() {
      return this.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
    }
  });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (!w.crypto || !w.crypto.subtle) Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  const logs = [];
  w.console = Object.assign({}, console, {
    log: (...a) => logs.push(a.map(String).join(' ')),
    info: (...a) => logs.push(a.map(String).join(' ')),
    debug: () => {},
    warn: (...a) => logs.push(a.map(String).join(' ')),
    error: (...a) => logs.push('ERROR ' + a.map(String).join(' '))
  });
  const store = Object.assign({
    outlookAuth: {
      token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, rtIssuedAt: Date.now() },
      account: { address: ME, name: 'Glance' },
      ownAddresses: [ME]
    },
    outlookSync: { stateVersion: 3, diagnostics: o.diagnostics || [] },
    outlookPageDiag: []
  }, o.store || {});
  const sent = [];
  w.chrome = {
    runtime: {
      id: 'ext', lastError: null, getURL: (s) => 'chrome-extension://x/' + s,
      getManifest: () => ({ version: 'test' }),
      onMessage: { addListener() {} },
      sendMessage: (msg, cb) => {
        sent.push(msg);
        let body = { value: [] };
        if (msg.type === 'flow:outlook-fetch') {
          try { body = graph(String(msg.url || '')) || { value: [] }; } catch (e) { body = { value: [] }; }
        }
        const r = msg.type === 'flow:outlook-session'
          ? { ok: true, token: store.outlookAuth.token, changed: false, how: 'fresh' }
          : (msg.type === 'flow:outlook-fetch'
            ? { ok: true, status: 200, body: JSON.stringify(body) }
            : (msg.type === 'flow:execute-action' ? { ok: true, ref: 'draft-1', where: 'drafts' } : { ok: true }));
        setTimeout(() => cb && cb(r), 5);
      }
    },
    storage: {
      local: {
        get: (k, cb) => {
          const snap = JSON.parse(JSON.stringify(store));
          let r;
          if (k && typeof k === 'object' && !Array.isArray(k)) r = Object.assign({}, k, snap);
          else if (typeof k === 'string') r = { [k]: snap[k] };
          else r = snap;
          if (cb) setTimeout(() => cb(r), 1);
        },
        set: (p, cb) => { Object.assign(store, JSON.parse(JSON.stringify(p))); if (cb) setTimeout(cb, 1); return Promise.resolve(); },
        remove: (k, cb) => { [].concat(k).forEach((x) => { delete store[x]; }); if (cb) cb(); return Promise.resolve(); }
      },
      onChanged: { addListener() {} },
      sync: { get: (k, cb) => cb && cb({}) }
    },
    i18n: { getUILanguage: () => 'en' }
  };
  const ctx = dom.getInternalVMContext();
  for (const f of files) new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }).runInContext(ctx);
  return { w, doc: w.document, logs, sent, store, ctx };
}

function showMail(doc, win, mail) {
  win.history.pushState({}, '', mail.url || ('https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(mail.id)));
  const heading = doc.querySelector('#ReadingPaneContainerId [role="heading"] span');
  if (heading) {
    heading.textContent = mail.subject;
    heading.setAttribute('title', mail.subject);
  }
  const to = doc.querySelector('#ReadingPaneContainerId .to');
  if (to) to.innerHTML = mail.toHtml;
  let cc = doc.querySelector('#ReadingPaneContainerId .cc');
  if (mail.ccHtml) {
    if (!cc) {
      cc = doc.createElement('div');
      cc.className = 'cc';
      if (to && to.parentNode) to.parentNode.insertBefore(cc, to.nextSibling);
    }
    cc.innerHTML = mail.ccHtml;
  } else if (cc) cc.remove();
  const body = doc.querySelector('#ReadingPaneContainerId [role="document"]');
  if (body) body.innerHTML = mail.bodyHtml;
  const persona = doc.querySelector('#ReadingPaneContainerId .persona span');
  if (persona && mail.fromTitle) {
    persona.setAttribute('title', mail.fromTitle);
    persona.setAttribute('aria-label', 'מאת: ' + mail.fromTitle);
  }
}

async function settle(page) {
  page.ctx && vm.runInContext('if (globalThis.__glanceOutlookPage) __glanceOutlookPage.rescan()', page.ctx);
  await sleep(1200);
}

function records(store) {
  return (store.outlookPageDiag || []).filter(Boolean);
}

function panel(store) {
  return FlowDisplay.whyNotShownRows(store.outlookPageDiag, store.outlookSync && store.outlookSync.diagnostics);
}

(async () => {
  const listed = FlowDisplay.whyNotShownRows(
    [{ id: 'm1', verdict: 'quiet', reason: 'quiet:hedge', conversationId: 'c1', subject: 'Move' }, { id: 'm2', verdict: 'show', reason: 'shown', conversationId: 'c2' }],
    [{ reason: 'intent-null', conversationId: 'c1', subject: 'Move' }, { reason: 'own-sender', conversationId: 'c9', subject: 'Other' }]
  );
  check('Why not shown keeps the page quiet and drops the sync line for that mail',
    listed.length === 2 && listed[0].reason === 'quiet:hedge' && listed.every((d) => d.reason !== 'intent-null' && d.verdict !== 'show') && listed.some((d) => d.reason === 'own-sender' && d.source === 'sync'),
    listed.map((d) => d.reason));

  const hedge = await boot({
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    diagnostics: [{ reason: 'intent-null', conversationId: CONV, subject: 'Office move' }]
  });
  showMail(hedge.doc, hedge.w, {
    id: CONV,
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    subject: 'Office move — can you confirm the date?',
    toHtml: 'אל: <span>' + AVI + '</span>',
    ccHtml: 'עותק: <span>' + ME + '</span>',
    bodyHtml: lines('Hi Avi,\nCan you reply and confirm whether the office move is still on for October 20?\nThanks,\nFlow'),
    fromTitle: 'Flow <' + FLOW + '>'
  });
  await settle(hedge);
  const hedgeRow = records(hedge.store).find((d) => d.verdict === 'quiet');
  const hedgePanel = panel(hedge.store);
  check('open-text quiet:hedge is the stored page reason',
    hedgeRow && hedgeRow.source === 'page' && hedgeRow.reason === 'quiet:hedge' && hedgeRow.cardHash == null,
    hedgeRow);
  check('Why not shown does not show the sync intent-null beside that quiet',
    hedgePanel.some((d) => d.reason === 'quiet:hedge') && !hedgePanel.some((d) => d.reason === 'intent-null') && !hedge.doc.querySelector('.flow-chip-host'),
    { panel: hedgePanel.map((d) => d.reason), sync: (hedge.store.outlookSync.diagnostics || []).map((d) => d.reason) });
  hedge.w.close();

  const self = await boot({
    id: 'MSG-SELF-BOOT',
    diagnostics: [{ reason: 'own-sender', conversationId: CONV, subject: 'Note' }]
  });
  const selfHdr = self.doc.querySelector('#ReadingPaneContainerId .hdr');
  if (selfHdr) {
    const mark = self.doc.createElement('span');
    mark.setAttribute('data-convid', CONV);
    mark.setAttribute('title', CONV);
    selfHdr.appendChild(mark);
  }
  showMail(self.doc, self.w, {
    id: CONV,
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    subject: 'Note to myself',
    toHtml: 'אל: <span>' + ME + '</span>',
    ccHtml: '',
    bodyHtml: lines('Remember the office move on October 20.'),
    fromTitle: 'Glance <' + ME + '>'
  });
  await settle(self);
  const selfRow = records(self.store).find((d) => d.verdict === 'quiet');
  check('a mail the user sent to themself is judged, and the sync own-sender line is dropped',
    selfRow && selfRow.reason !== 'note-to-self' && selfRow.reason !== 'own-sender' && !self.doc.querySelector('.flow-chip-host') && !panel(self.store).some((d) => d.reason === 'own-sender' || d.reason === 'note-to-self'),
    { row: selfRow && selfRow.reason, panel: panel(self.store).map((d) => d.reason) });
  self.w.close();

  const unconfirmed = await boot({
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    diagnostics: [{ reason: 'own-sender', conversationId: CONV, subject: 'Pilot proposal' }],
    graph: (url) => {
      if (/\/me\?/.test(url)) return { mail: ME, displayName: 'Glance' };
      if (/messages/.test(url)) {
        return { value: [{
          id: 'MSG-OWN-1',
          conversationId: CONV,
          subject: 'Pilot proposal',
          isDraft: false,
          from: { emailAddress: { name: 'Glance', address: ME } },
          toRecipients: [],
          receivedDateTime: new Date().toISOString(),
          body: { contentType: 'text', content: "Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?" }
        }] };
      }
      return { value: [] };
    }
  });
  showMail(unconfirmed.doc, unconfirmed.w, {
    id: CONV,
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    subject: 'Pilot proposal',
    toHtml: 'אל: <span>' + ME + '</span>',
    ccHtml: '',
    bodyHtml: lines("Could you send me the Q4 pricing sheet (glance-pricing-q4) before tomorrow's meeting?"),
    fromTitle: 'flow <' + FLOW + '>'
  });
  await settle(unconfirmed);
  const unconfirmedWhy = records(unconfirmed.store).map((d) => d.reason);
  check('an unconfirmed conversation URL still records note-to-self, not page:no-message-id',
    unconfirmedWhy.indexOf('note-to-self') >= 0 && unconfirmedWhy.indexOf('page:no-message-id') < 0 && !unconfirmed.doc.querySelector('.flow-chip-host'),
    { page: unconfirmedWhy, sync: ((unconfirmed.store.outlookSync && unconfirmed.store.outlookSync.diagnostics) || []).map((d) => d.reason) });
  unconfirmed.w.close();

  const file = await boot({
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    diagnostics: [{ reason: 'drive-not-granted', conversationId: CONV, subject: 'File' }]
  });
  showMail(file.doc, file.w, {
    id: CONV,
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    subject: 'Please send the pricing file',
    toHtml: 'אל: <span>' + ME + '</span>',
    ccHtml: '',
    bodyHtml: lines('Hi,\nCan you reply and confirm whether you can send the pricing file by October 20?\nThanks'),
    fromTitle: 'Flow <' + FLOW + '>'
  });
  await settle(file);
  const fileRow = records(file.store).find((d) => d && d.reason);
  check('a file chain that did not run does not store the sync drive-not-granted',
    fileRow && fileRow.reason !== 'drive-not-granted' && !panel(file.store).some((d) => d.reason === 'drive-not-granted'),
    { reason: fileRow && fileRow.reason, panel: panel(file.store).map((d) => d.reason) });
  file.w.close();

  const shown = await boot({
    id: 'MSG-SHOW-111',
    diagnostics: [{ reason: 'intent-null', conversationId: 'MSG-SHOW-111', messageId: 'MSG-SHOW-111', subject: 'Q3' }]
  });
  showMail(shown.doc, shown.w, {
    id: 'MSG-SHOW-111',
    subject: 'Q3 summary confirm',
    toHtml: 'אל: <span>' + ME + '</span>',
    ccHtml: '',
    bodyHtml: lines('Hi,\nCan you reply and confirm whether the Q3 summary will include the October numbers?\nThanks,\nFlow'),
    fromTitle: 'Flow <' + FLOW + '>'
  });
  await settle(shown);
  const host = shown.doc.querySelector('.flow-chip-host');
  const showRow = records(shown.store).find((d) => d.verdict === 'show');
  check('a painted card commits a show record and drops the sync quiet',
    Boolean(host) && showRow && showRow.cardHash && host.getAttribute('data-glance-card') === showRow.cardHash
      && host.getAttribute('data-glance-decision') === showRow.id
      && String(host.getAttribute('data-glance-epoch')) === String(showRow.epoch)
      && !panel(shown.store).some((d) => d.reason === 'intent-null' || d.verdict === 'show'),
    { hash: host && host.getAttribute('data-glance-card'), row: showRow && { id: showRow.id, reason: showRow.reason, hash: showRow.cardHash }, panel: panel(shown.store).map((d) => d.reason) });

  const oldHost = host;
  const oldHash = host && host.getAttribute('data-glance-card');
  if (oldHost) oldHost.remove();
  showMail(shown.doc, shown.w, {
    id: 'MSG-SHOW-111',
    subject: 'Q3 summary confirm',
    toHtml: 'אל: <span>' + ME + '</span>',
    ccHtml: '',
    bodyHtml: lines('Hi,\nCan you reply and confirm whether the board pack will be ready by November 2?\nThanks,\nFlow'),
    fromTitle: 'Flow <' + FLOW + '>'
  });
  await settle(shown);
  const next = shown.doc.querySelector('.flow-chip-host');
  const nextHash = next && next.getAttribute('data-glance-card');
  check('a different label or step list changes cardHash', Boolean(oldHash) && Boolean(nextHash) && oldHash !== nextHash && next !== oldHost, { oldHash, nextHash });
  const before = shown.sent.filter((m) => m.type === 'flow:execute-action').length;
  const oldBtn = oldHost && oldHost.querySelector('button.flow-chip');
  if (oldBtn) oldBtn.click();
  await sleep(300);
  check('a click whose host hash is the old one is ignored',
    shown.sent.filter((m) => m.type === 'flow:execute-action').length === before,
    { sent: shown.sent.filter((m) => m.type === 'flow:execute-action').length });

  const live = next && next.querySelector('button.flow-chip');
  if (live) live.click();
  showMail(shown.doc, shown.w, {
    id: 'MSG-OTHER-222',
    subject: 'Other mail',
    toHtml: 'אל: <span>' + AVI + '</span>',
    ccHtml: '',
    bodyHtml: lines('Hi Avi,\nNo action needed.'),
    fromTitle: 'Flow <' + FLOW + '>'
  });
  await sleep(400);
  check('Do It checked again after await does not write on the next mail',
    shown.sent.filter((m) => m.type === 'flow:execute-action').length === before,
    { sent: shown.sent.map((m) => m.type) });

  const bare = shown.doc.querySelector('.flow-chip-host');
  if (bare) bare.removeAttribute('data-glance-open');
  const bareBtn = bare && bare.querySelector('button.flow-chip');
  const beforeBare = shown.sent.filter((m) => m.type === 'flow:execute-action').length;
  if (bareBtn) bareBtn.click();
  await sleep(200);
  check('a card with no open-mail token does not execute',
    shown.sent.filter((m) => m.type === 'flow:execute-action').length === beforeBare);
  shown.w.close();

  const pickedBody = lines('Hi,\nCan you reply and confirm whether the office move is still on for October 20?\nThanks,\nNoa');
  const fallback = await boot({
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    diagnostics: [{ reason: 'intent-null', conversationId: CONV, subject: 'Office move confirm' }],
    graph: (url) => {
      if (/\$filter=conversationId/i.test(url)) return { value: [] };
      if (/\$filter=subject/i.test(url) || /startswith\(subject/i.test(url)) {
        return { value: [{
          id: PICKED,
          subject: 'Office move confirm',
          conversationId: 'AQQkCONV-NEW-222',
          from: { emailAddress: { address: 'noa.levi@northwind.example', name: 'Noa' } },
          toRecipients: [{ emailAddress: { address: ME, name: 'Glance' } }],
          ccRecipients: [],
          receivedDateTime: '2026-10-14T09:00:00Z'
        }] };
      }
      return { value: [] };
    }
  });
  showMail(fallback.doc, fallback.w, {
    id: CONV,
    url: 'https://outlook.live.com/mail/0/inbox/id/' + encodeURIComponent(CONV),
    subject: 'Office move confirm',
    toHtml: 'אל: <span></span>',
    ccHtml: '',
    bodyHtml: pickedBody,
    fromTitle: 'Noa <noa.levi@northwind.example>'
  });
  const hdr = fallback.doc.querySelector('#ReadingPaneContainerId .hdr');
  if (hdr) {
    const mark = fallback.doc.createElement('span');
    mark.setAttribute('data-convid', CONV);
    mark.setAttribute('title', CONV);
    hdr.appendChild(mark);
  }
  await settle(fallback);
  const adopted = records(fallback.store).filter((d) => d && (d.id === PICKED || d.messageId === PICKED || d.hydrateHow === 'subject-fallback'));
  check('Graph lag does not adopt another message as this open mail',
    adopted.length === 0,
    { adopted: adopted.map((d) => ({ id: d.id, how: d.hydrateHow, prior: d.priorConversationId, verdict: d.verdict })),
      panel: panel(fallback.store).map((d) => d.reason) });
  fallback.w.close();

  let generation = 'one';
  const hyd = await boot({
    id: 'MSG-HYDRATE-1',
    graph: (url) => {
      if (generation === 'other-sender') {
        if (/conversationId/i.test(url)) {
          return { value: [{
            id: 'AQMkOther',
            subject: 'Transfer',
            conversationId: CONV,
            from: { emailAddress: { address: 'other@elsewhere.com', name: 'Other' } },
            toRecipients: [],
            ccRecipients: [],
            receivedDateTime: '2026-10-15T09:00:00.000Z'
          }] };
        }
        return { value: [] };
      }
      if (generation === 'wrong-file' || generation === 'same-conv') {
        if (/\$filter=conversationId/i.test(url)) return { value: [] };
        if (/\$filter=subject/i.test(url) || /startswith\(subject/i.test(url)) {
          if (generation === 'wrong-file') {
            return { value: [{
              id: 'AQMkADAwATM0MDAAB9WFY02AAAA=',
              subject: 'Signed agreement',
              conversationId: 'AQQkBobHartConv',
              from: { emailAddress: { address: 'bob.hart@contoso.example', name: 'Bob Hart' } },
              toRecipients: [{ emailAddress: { address: ME } }],
              ccRecipients: [],
              receivedDateTime: '2026-10-08T12:20:00.000Z'
            }] };
          }
          return { value: [{
            id: 'm-nw',
            subject: 'Northwind agreement - signed PDF',
            conversationId: 'AQQkNw',
            from: { emailAddress: { address: FLOW, name: 'flow' } },
            toRecipients: [{ emailAddress: { address: ME } }],
            ccRecipients: [],
            receivedDateTime: '2026-10-08T14:01:00.000Z'
          }] };
        }
        return { value: [] };
      }
      if (generation === 'two-same') {
        if (/\$filter=subject/i.test(url) || /startswith\(subject/i.test(url)) {
          return { value: [
            { id: 'MSG-A', subject: 'Same subject', conversationId: 'AQQkOTHER-1', from: { emailAddress: { address: 'a@x.com', name: 'A' } }, toRecipients: [{ emailAddress: { address: 'a-to@x.com' } }], ccRecipients: [], receivedDateTime: '2026-10-14T09:00:00Z' },
            { id: 'MSG-B', subject: 'Same subject', conversationId: 'AQQkOTHER-2', from: { emailAddress: { address: 'b@x.com', name: 'B' } }, toRecipients: [{ emailAddress: { address: 'b-to@x.com' } }], ccRecipients: [], receivedDateTime: '2026-10-14T09:01:00Z' }
          ] };
        }
        return { value: [] };
      }
      if (/\/me\/messages\/MSG-HYDRATE-1/.test(url)) {
        return { id: 'MSG-HYDRATE-1', subject: 'Cached', from: { emailAddress: { address: generation + '@x.com', name: generation } }, toRecipients: [], ccRecipients: [], conversationId: CONV };
      }
      if (/conversationId/.test(url)) return { value: [] };
      return { value: [] };
    }
  });
  const first = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    itemId: 'MSG-HYDRATE-1', subject: 'Cached', to: [], cc: [], text: 'Hi'
  }) + ')', hyd.ctx);
  generation = 'changed';
  const cached = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    itemId: 'MSG-HYDRATE-1', subject: 'Cached', to: [], cc: [], text: 'Hi'
  }) + ')', hyd.ctx);
  check('hydrate cache applies inside the same epoch', first && first.senderEmail === 'one@x.com' && cached && cached.senderEmail === 'one@x.com', { first: first && first.senderEmail, cached: cached && cached.senderEmail });
  await vm.runInContext('__glanceOutlookPage.bumpMailEpoch("test")', hyd.ctx);
  const bumped = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    itemId: 'MSG-HYDRATE-1', subject: 'Cached next', to: [], cc: [], text: 'Hi there'
  }) + ')', hyd.ctx);
  check('a hydrate patch is not applied after the epoch moves', bumped && bumped.senderEmail === 'changed@x.com', bumped && bumped.senderEmail);

  generation = 'two-same';
  const none = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    conversationId: CONV, subject: 'Same subject', to: [], cc: [], text: 'Hi'
  }) + ')', hyd.ctx);
  check('two subject rows are not picked and their recipients are not copied',
    none && none.hydrateHow === 'none' && (!none.to || none.to.length === 0) && (!none.cc || none.cc.length === 0) && none.itemId !== 'MSG-A' && none.itemId !== 'MSG-B',
    { how: none && none.hydrateHow, to: none && none.to, item: none && none.itemId });

  generation = 'wrong-file';
  await vm.runInContext('__glanceOutlookPage.bumpMailEpoch("wrong-file")', hyd.ctx);
  const lag = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    conversationId: 'AQQkADAwATM0MDAAq3rD0aGn5Ks',
    idKind: 'conversation',
    idSource: 'open-mail',
    subject: 'Signed agreement',
    receivedDateTime: '2026-10-08T12:20:00.000Z',
    to: [ME],
    cc: [],
    text: 'Hi, The signed agreement is attached. Best, Dana',
    attachments: [{ name: 'agreement-signed.pdf', size: 3072, sizeLabel: '3 KB' }]
  }) + ')', hyd.ctx);
  check('Graph lag does not put agreement-signed.pdf from the other message on this pane',
    lag && lag.itemId !== 'AQMkADAwATM0MDAAB9WFY02AAAA=' && lag.conversationId === 'AQQkADAwATM0MDAAq3rD0aGn5Ks' && lag.hydrateHow === 'none',
    { item: lag && lag.itemId, conv: lag && lag.conversationId, how: lag && lag.hydrateHow });

  generation = 'same-conv';
  await vm.runInContext('__glanceOutlookPage.bumpMailEpoch("same-conv")', hyd.ctx);
  const kept = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    conversationId: 'AQQkNw',
    idKind: 'conversation',
    idSource: 'open-mail',
    subject: 'Northwind agreement - signed PDF',
    receivedDateTime: '2026-10-08T14:01:00.000Z',
    to: [],
    cc: [],
    text: 'Please find the signed Northwind agreement attached.'
  }) + ')', hyd.ctx);
  check('subject fallback still names the open conversation when that message is the subject hit',
    kept && kept.itemId === 'm-nw' && kept.conversationId === 'AQQkNw' && kept.hydrateHow === 'subject-fallback',
    { item: kept && kept.itemId, conv: kept && kept.conversationId, how: kept && kept.hydrateHow });

  generation = 'other-sender';
  await vm.runInContext('__glanceOutlookPage.bumpMailEpoch("other-sender")', hyd.ctx);
  const refused = await vm.runInContext('__glanceOutlookPage.hydratePane(' + JSON.stringify({
    conversationId: CONV,
    idKind: 'conversation',
    idSource: 'open-mail',
    subject: 'Transfer',
    senderEmail: 'dana@acme.com',
    senderName: 'Dana',
    to: [ME],
    cc: [],
    text: 'Could you confirm the transfer by Friday?'
  }) + ')', hyd.ctx);
  check('a confirmed conversation does not replace the open sender with a different Graph sender',
    refused && refused.senderEmail === 'dana@acme.com' && refused.senderName === 'Dana' && refused.itemId !== 'AQMkOther',
    { email: refused && refused.senderEmail, name: refused && refused.senderName, item: refused && refused.itemId });
  hyd.w.close();

  const outlookSrc = fs.readFileSync(path.join(ROOT, 'src/content-outlook.js'), 'utf8');
  const specPath = path.join(ROOT, '..', 'docs/glance-ai/card-whynotshown-single-source-spec.md');
  check('the page writes the card decision with commitDecision',
    outlookSrc.indexOf('async function commitDecision') > 0 && outlookSrc.indexOf('function whyNotShownRows') < 0);
  if (!fs.existsSync(specPath)) {
    console.log('SKIP: card-whynotshown spec is not beside this extension (' + specPath + ')');
  } else {
    const spec = fs.readFileSync(specPath, 'utf8');
    check('the card and Why not shown share commitDecision',
      spec.indexOf('Nothing in this commit wires the decision record') < 0 &&
      spec.indexOf('commitDecision') > 0 &&
      /another conversation is not adopted/.test(spec) &&
      /does not cross messages/.test(spec));
  }

  check('paintWhyNot strips page: before reason-code hide set',
    /raw\.indexOf\('page:'\) === 0/.test(outlookSrc) && /code === 'intent-null'/.test(outlookSrc));
  {
    const dom = new JSDOM('<div id="slot"></div>', { pretendToBeVisual: true, runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    const fn = outlookSrc.match(/function paintWhyNot\([\s\S]*?\n  \}/);
    vm.runInContext(
      'var paintDepth = 1;\n'
      + 'function whyNotText() { return "לא זוהתה בקשה"; }\n'
      + (fn ? fn[0] : '') + '\n'
      + 'const slot = document.createElement("div");\n'
      + 'paintWhyNot(slot, "page:intent-null");\n'
      + 'const line = slot.querySelector(".flow-why-not");\n'
      + 'if (!line || line.textContent !== "") throw new Error("page:intent-null visible: " + (line && line.textContent));\n'
      + 'if (!line || line.getAttribute("data-glance-why") !== "page:intent-null") throw new Error("attr");\n'
      + 'paintWhyNot(slot, "page:unknown-reason");\n'
      + 'if (!slot.querySelector(".flow-why-not").textContent) throw new Error("unknown hidden");\n',
      ctx
    );
    check('paintWhyNot functional: page:intent-null hidden, unknown reasons visible (Q1 guard)', true);
    dom.window.close();
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
