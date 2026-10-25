// Outlook on the web (outlook.live.com / outlook.office.com): the same Glance Do It
// card, floating in the open message, and the same engine as Gmail
// (core/incoming-judge.js: FlowIntent -> FlowActions -> FlowDraftReply). Only I/O differs:
// the mail is read through Microsoft Graph by the same planner the panel runs
// (src/outlook.js + core/outlook-sync.js, network through the service worker), the
// open message is matched to it, and Do It writes a reply DRAFT via Graph (never sends).
//
// The page does not wait for Glance's panel: on load, and whenever an open message has
// no judged entry yet, it runs one check itself (at most once a minute).
//
// Honesty: OWA markup is not a public interface. Selectors live in core/owa-parse.js
// and are re-checked every pass; if the pane cannot be read, stay silent.
//
// Debug: chrome.storage.local.glanceDebug = true (or localStorage 'glance-debug' = '1' on the Outlook page) logs every
// stage with a "Glance:" prefix: start, injected, parsed, matched, judged, decision, rendered (or the reason it did not).
// Without it the page logs one line ("Glance: outlook content start") and any error.
//
// One file-chain trace, hand-armed, not the always-on debug log. Arm, then open the mail:
//   Service worker console: chrome.storage.local.set({ glanceOutlookFileTrace: 1 })
//   Outlook page console: localStorage.setItem('glance-outlook-file-trace', '1')
// While it stays 1, a file-ask scan logs one "Glance: file-trace" line per open message (what
// decideFromText decided, whether resolveFileChain searched, the gate, the Drive query,
// flow:search-drive ok/status/error/fileCount, the scopes on the Google token, showFilePrepare
// (shown / shown-without-message-id / no-mount / …), messageIdFrom (url / path-rest-id /
// conversation-filter / inbox-list / none), and the final silence or show reason). Do It logs
// another line (phase do-it) and does not clear the flag. Set it back to 0 by hand.
(() => {
  const VERSION = (() => { try { return (chrome.runtime && chrome.runtime.id && chrome.runtime.getManifest().version) || '?'; } catch (e) { return '?'; } })();
  try { console.info('Glance: outlook content start', VERSION, location.host); } catch (e) { /* no console */ }
  // Classic scripts share this isolated world; a file that failed to load leaves its global undefined (no eval: MV3 CSP).
  const missing = [];
  if (typeof FlowChipHost === 'undefined') missing.push('FlowChipHost');
  if (typeof FlowOwaParse === 'undefined') missing.push('FlowOwaParse');
  if (typeof FlowStorage === 'undefined') missing.push('FlowStorage');
  if (typeof FlowIncomingJudge === 'undefined') missing.push('FlowIncomingJudge');
  if (missing.indexOf('FlowChipHost') >= 0 || missing.indexOf('FlowOwaParse') >= 0 || missing.indexOf('FlowStorage') >= 0) {
    console.error('Glance: outlook page cannot start, missing ' + missing.join(', ') + ' (a file before content-outlook.js failed to load)');
    return;
  }
  // Survives a dead context. The service worker reads it from the DOM; it
  // cannot see this world's variables after the extension reloads.
  try { document.documentElement.setAttribute('data-glance-outlook', '1'); } catch (e) { /* the page is still readable */ }
  if (globalThis.__glanceOutlookPage) { try { globalThis.__glanceOutlookPage.rescan(); } catch (e) { /* old copy */ } return; }
  // DevTools in this isolated world does not see the lexical FlowOwaParse
  // binding. Read-only snapshot for a live check. It does not write storage.
  globalThis.__flowDiag = Object.freeze({
    readPane: function () {
      try {
        const pane = FlowOwaParse.readPane(document, location.href, {});
        if (!pane) return null;
        return {
          subject: pane.subject || '',
          text: String(pane.text || '').slice(0, 800),
          conversationId: pane.conversationId || null,
          idSource: pane.idSource || '',
          senderEmail: pane.senderEmail || '',
          to: pane.to || [],
          attachments: (pane.attachments || []).map((a) => (a && (a.name || a.sizeLabel)) || '')
        };
      } catch (e) { return { error: String(e && e.message || e) }; }
    },
    roots: function () {
      try {
        return FlowOwaParse.readingPaneRoots(document).map((n) => ({
          id: (n && n.id) || '',
          role: (n && n.getAttribute && n.getAttribute('role')) || '',
          className: String((n && n.className) || '').slice(0, 80)
        }));
      } catch (e) { return []; }
    }
  });

  const SCAN_EVERY_MS = 800;        // at most one scan per 0.8 s, and at least one 0.8 s after any change
  const PAGE_SYNC_MIN_MS = 60 * 1000;
  const PAGE_DIAG_KEY = 'outlookPageDiag';
  const UNDONE_KEY = 'glanceUndoneBanners';
  let timer = null;
  let lastPaneKey = '';
  let suggestNote = null;
  // One epoch per open mail. A scan that started on the previous mail, and a
  // click on that mail's card, must not land on the mail that is open now.
  let mailEpoch = 0;
  let openMailToken = '';
  let renderEpoch = 0;
  let scanMessageId = '';
  let switchPending = false;
  let scanning = false;
  let scanLogSnap = [];
  let again = false;
  let lastKey = '';
  let lastPageSyncAt = 0;
  let syncing = null;
  let lastReasonKey = '';
  let lastReasonStored = false;
  let openDecisionId = '';
  const decisionMemory = Object.create(null);
  let lastLoggedReason = '';
  let lastHref = location.href;
  // What the last finished scan looked at, and how it ended ('card' or 'reason'). Same open message, same text, and the
  // card still on the page (or its reason already recorded): nothing to do, nothing to log.
  let lastSig = '';
  let lastOutcome = '';
  // Last address and display name that parsed cleanly, per conversation. A later read of the same open message
  // sometimes loses the address (it lives in a hover card) and would otherwise keep a worse sender.
  const senderMemory = Object.create(null);
  let debug = false;
  let traceArmed = false;
  let tracedSig = '';
  let doItInFlight = false;
  let stopped = false;
  let outlookObserver = null;
  let hrefTimer = null;
  let onRuntimeMessage = null;
  let onStorageChanged = null;
  try { debug = window.localStorage && window.localStorage.getItem('glance-debug') === '1'; } catch (e) { /* storage blocked */ }

  function runtimeAlive() {
    try { return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  function invalidatedMessage(err) {
    return /invalidated/i.test(String((err && (err.message || err)) || ''));
  }

  function stopQuietly() {
    if (stopped) return;
    stopped = true;
    // The context is already gone. This paint uses the DOM only.
    try { paintRefreshAsk(); } catch (e) { /* the quiet line is not worth another throw */ }
    try { if (outlookObserver) outlookObserver.disconnect(); } catch (e) { /* already gone */ }
    outlookObserver = null;
    try { if (paneObs) paneObs.disconnect(); } catch (e) { /* already gone */ }
    paneObs = null;
    try { if (hrefTimer) clearInterval(hrefTimer); } catch (e) { /* already gone */ }
    hrefTimer = null;
    try { if (timer) clearTimeout(timer); } catch (e) { /* already gone */ }
    timer = null;
    try { window.removeEventListener('hashchange', schedule); } catch (e) { /* not attached */ }
    try { window.removeEventListener('popstate', schedule); } catch (e) { /* not attached */ }
    try {
      if (onRuntimeMessage && chrome.runtime && chrome.runtime.onMessage) chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    } catch (e) { /* messaging already gone */ }
    try {
      if (onStorageChanged && chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch (e) { /* storage already gone */ }
  }

  function guardContext() {
    if (stopped) return false;
    if (runtimeAlive()) return true;
    stopQuietly();
    return false;
  }

  function storageGet(defaults, cb) {
    const empty = (defaults && typeof defaults === 'object') ? defaults : {};
    if (!guardContext() || !chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== 'function') {
      if (typeof cb === 'function') cb(empty);
      return;
    }
    try {
      chrome.storage.local.get(defaults, (r) => {
        let err = null;
        try { err = chrome.runtime && chrome.runtime.lastError; } catch (e) { stopQuietly(); if (typeof cb === 'function') cb(empty); return; }
        if (!runtimeAlive() || (err && invalidatedMessage(err))) { stopQuietly(); if (typeof cb === 'function') cb(empty); return; }
        if (typeof cb === 'function') cb(r || empty);
      });
    } catch (e) {
      if (invalidatedMessage(e) || !runtimeAlive()) stopQuietly();
      if (typeof cb === 'function') cb(empty);
    }
  }

  let pageUiSetting = null;

  function rememberUi(state) {
    if (state && typeof state === 'object' && Object.prototype.hasOwnProperty.call(state, 'glanceUiLanguage')) {
      pageUiSetting = state.glanceUiLanguage;
    }
  }

  // The card shows the title in the UI language. The To Do and the event
  // written on Do It carry that same title.
  function activityLabel(ctx) {
    const raw = ctx && ctx.intent && ctx.intent.label;
    const p = ctx && ctx.process;
    if (p && (p.id === 'file-it' || p.id === 'suggest-save')) return artifactTitleFor(ctx, raw);
    return raw;
  }

  function artifactTitleFor(ctx, title) {
    if (typeof FlowDisplay === 'undefined' || typeof FlowDisplay.artifactTitle !== 'function') return title;
    return FlowDisplay.artifactTitle(pageUiLang(), ctx, title);
  }

  function pageUiLang() {
    let ui = '';
    try { if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') ui = chrome.i18n.getUILanguage() || ''; } catch (e) {}
    let nav = '';
    try { nav = (typeof navigator !== 'undefined' && navigator.language) || ''; } catch (e) {}
    let host = '';
    try { host = (document.documentElement && document.documentElement.lang) || ''; } catch (e) {}
    const lang = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.uiLangFrom === 'function')
      ? FlowDisplay.uiLangFrom({ setting: pageUiSetting, hostLanguage: host, uiLanguage: ui, navigatorLanguage: nav })
      : 'en';
    if (typeof FlowChipHost !== 'undefined' && typeof FlowChipHost.setUiLang === 'function') FlowChipHost.setUiLang(lang);
    rememberHostLanguage(host);
    return lang;
  }

  // Two Outlook pages can Undo at once. Each mark reads the whole log and
  // writes it back, so the later write would drop the earlier Undo. The
  // lock is held across that read and write. Same-origin pages share it.
  function withActivityLogLock(fn) {
    const locks = (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function')
      ? navigator.locks : null;
    if (!locks) return Promise.resolve().then(fn);
    return locks.request('glance-activity-log', fn);
  }

  function rememberHostLanguage(host) {
    const raw = String(host || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (rememberHostLanguage.last === key) return;
    rememberHostLanguage.last = key;
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function' || typeof FlowStorage.set !== 'function') return;
    FlowStorage.get().then(function (st) {
      if (st && st.glanceHostLanguage === raw) return null;
      return FlowStorage.set({ glanceHostLanguage: raw });
    }).catch(function () {});
  }

  function pageChrome() {
    pageUiLang();
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.chrome === 'function') return FlowDisplay.chrome(pageUiLang());
    return { dismiss: 'Dismiss', doIt: 'Do It', view: 'View', undo: 'Undo', undoing: 'Undoing…', handled: 'Handled.', openEvent: 'Open event', openDraft: 'Open draft', closing: 'Closing…', show: 'View', couldntPlain: "Couldn't confirm", couldntUnchanged: "Couldn't confirm it's unchanged. Undo left it alone.", couldntVerify: "Couldn't verify, try again", youEdited: 'You edited this. Undo left it alone.', stillThere: 'Still there — the To Do task was not removed.', verifyingNow: 'Verifying…', createdUnverified: "Created, couldn't verify" };
  }

  function pageShow(text) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.showChrome === 'function') return FlowDisplay.showChrome(pageUiLang(), text);
    return text == null ? '' : String(text);
  }

  function wrapStorageMethod(name, fn) {
    return function () {
      if (!guardContext()) {
        if (name === 'get') return Promise.resolve({});
        if (/^get/.test(name)) return Promise.resolve([]);
        return Promise.resolve(undefined);
      }
      try {
        const out = fn.apply(this, arguments);
        if (out && typeof out.then === 'function') {
          const chained = name === 'get' ? out.then((state) => { rememberUi(state); return state; }) : out;
          return chained.catch((e) => {
            if (invalidatedMessage(e) || !runtimeAlive()) { stopQuietly(); return undefined; }
            throw e;
          });
        }
        return out;
      } catch (e) {
        if (invalidatedMessage(e) || !runtimeAlive()) { stopQuietly(); return undefined; }
        throw e;
      }
    };
  }

  if (FlowStorage && typeof FlowStorage === 'object') {
    Object.keys(FlowStorage).forEach((name) => {
      if (typeof FlowStorage[name] === 'function') FlowStorage[name] = wrapStorageMethod(name, FlowStorage[name]);
    });
  }

  try {
    storageGet({ glanceDebug: false, glanceOutlookFileTrace: 0, glanceUiLanguage: null }, (r) => {
      rememberUi(r);
      if (r && r.glanceDebug) debug = true;
      traceArmed = (Number(r && r.glanceOutlookFileTrace) || 0) > 0;
      dbg('injected', { version: VERSION, href: location.href });
      if (traceArmed) { lastSig = ''; schedule(); }
    });
  } catch (e) { /* no storage */ }

  function localFileTrace() {
    try { return window.localStorage && window.localStorage.getItem('glance-outlook-file-trace') === '1'; }
    catch (e) { return false; }
  }

  function logFileTrace(payload) {
    try { console.info('Glance: file-trace', JSON.stringify(payload)); } catch (e) { /* console gone */ }
    // The same line in the service worker console. The page console is a different window.
    send({ type: 'flow:outlook-file-trace', payload: payload }).catch(() => {});
  }

  function hashText(t) {
    let h = 0;
    const str = String(t || '');
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return str.length + ':' + h;
  }

  function dbg(stage, data) {
    if (!debug) return;
    try { console.info('Glance: ' + stage, data === undefined ? '' : (typeof data === 'string' ? data : JSON.stringify(data))); } catch (e) { /* console gone */ }
  }

  function tokenMissing(token) {
    const t = String(token || '');
    if (!t || t === '|||') return true;
    const parts = t.split('|');
    if (parts[0] === 'msg') return !parts[1];
    if (parts[0] === 'conv') return !parts[1];
    if (parts[0] === 'pane') return !parts[1] && !parts[2];
    return false;
  }

  function decisionIdFrom(src) {
    const s = src || {};
    const item = s.itemId && !isConversationId(s.itemId) ? String(s.itemId) : '';
    if (item) return item;
    return String(s.messageId || s.conversationId || s.pathId || s.id || '');
  }

  function cardCanonical(ctx) {
    const messageId = String((ctx && (ctx.messageId || ctx.itemId)) || '');
    const label = String((ctx && ctx.intent && ctx.intent.label) || '');
    const processId = String((ctx && ctx.process && ctx.process.id) || '');
    const steps = (ctx && ctx.process && ctx.process.steps) || [];
    const stepPart = steps.map((s) => String((s && s.kind) || '') + ':' + String((s && s.id) || '')).join(',');
    const chain = String((ctx && ctx.glanceChain) || '');
    return messageId + ' | ' + label + ' | ' + processId + ' | ' + stepPart + ' | ' + chain;
  }

  function decisionFor(id) {
    return id ? decisionMemory[String(id)] || null : null;
  }

  function rememberDecision(record) {
    if (!record || !record.id) return;
    decisionMemory[String(record.id)] = record;
    openDecisionId = String(record.id);
  }

  function recordIds(record) {
    return [record && record.id, record && record.priorConversationId, record && record.conversationId, record && record.messageId]
      .filter(Boolean).map(String);
  }

  function sameRecordId(value, ids) {
    return idListed(value, ids);
  }

  // One record for the open mail. A quiet commit upserts it. A show commit
  // upserts it and drops any quiet record, and the sync line, for this id
  // or the conversation hydrate replaced. A commit after the epoch moved
  // is dropped.
  async function commitDecision(record) {
    if (!record || !record.id) return;
    if (typeof record.epoch === 'number' && record.epoch !== mailEpoch) return;
    const stored = {
      id: String(record.id),
      epoch: record.epoch,
      source: record.source || 'page',
      verdict: record.verdict === 'show' ? 'show' : 'quiet',
      reason: record.reason,
      cardHash: record.verdict === 'show' ? (record.cardHash || null) : null,
      hydrateHow: record.hydrateHow || null,
      priorConversationId: record.priorConversationId || null,
      key: String(record.reason || '') + '|' + String(record.id),
      at: Date.now(),
      subject: record.subject || '',
      counterpart: record.counterpart || null,
      conversationId: record.conversationId || null,
      messageId: record.messageId || null
    };
    if (record.extra) Object.assign(stored, record.extra);
    rememberDecision(stored);
    try {
      const bag = await new Promise((resolve) => storageGet({
        [PAGE_DIAG_KEY]: [],
        outlookSync: {},
        glanceWhyCurrent: null,
        glanceWhyByConv: {}
      }, resolve));
      if (stored.epoch !== mailEpoch) return;
      const ids = recordIds(stored);
      let list = (Array.isArray(bag[PAGE_DIAG_KEY]) ? bag[PAGE_DIAG_KEY] : []).filter((d) => {
        if (!d) return false;
        if (sameRecordId(d.id, ids) || sameRecordId(d.messageId, ids) || sameRecordId(d.conversationId, ids)) return false;
        if (stored.verdict === 'show' && d.verdict === 'quiet' && sameRecordId(d.priorConversationId, ids)) return false;
        return true;
      });
      list.unshift(stored);
      const patch = { [PAGE_DIAG_KEY]: list.slice(0, 40) };
      const whyKey = String(stored.conversationId || stored.messageId || '');
      const map = Object.assign({}, bag.glanceWhyByConv || {});
      const entry = {
        reason: stored.reason,
        subject: stored.subject || '',
        messageId: stored.messageId || null,
        conversationId: stored.conversationId || stored.messageId || null,
        at: stored.at
      };
      if (stored.verdict === 'show') {
        if (whyKey && map[whyKey]) delete map[whyKey];
      } else if (whyKey && stored.reason) {
        map[whyKey] = entry;
      }
      patch.glanceWhyByConv = map;
      const current = bag.glanceWhyCurrent;
      const currentKey = current && String(current.conversationId || current.messageId || '');
      if (stored.verdict === 'show') {
        if (!current || !currentKey || currentKey === whyKey) patch.glanceWhyCurrent = null;
      } else if (whyKey && stored.reason) {
        patch.glanceWhyCurrent = entry;
      }
      const sync = bag.outlookSync || {};
      if (Array.isArray(sync.diagnostics)) {
        const diagnostics = sync.diagnostics.filter((d) => {
          if (!d) return false;
          if (sameRecordId(d.conversationId, ids) || sameRecordId(d.messageId, ids) || sameRecordId(d.id, ids)) return false;
          return true;
        });
        if (diagnostics.length !== sync.diagnostics.length) patch.outlookSync = Object.assign({}, sync, { diagnostics: diagnostics });
      }
      if (!guardContext()) return;
      await new Promise((resolve) => {
        try { chrome.storage.local.set(patch, resolve); }
        catch (e) { stopQuietly(); resolve(); }
      });
      lastReasonKey = stored.key;
      lastReasonStored = true;
    } catch (e) {
      lastReasonStored = false;
    }
  }

  function quietReason(reason) {
    const r = String(reason || '');
    if (r === 'third-party' || r === 'page:third-party') return 'third-party';
    if (r === 'outlook:file-found-no-attach' || r === 'outlook-file-found-no-attach') return 'outlook-file-found-no-attach';
    return null;
  }

  // The scan already committed this open mail for this epoch. The suggest
  // note runs after that and must not replace a card, or a quiet reason
  // that already names why. A generic "no request" is only the text scan.
  // The file check replaces that one line with no-candidate or unresolved.
  function pageAlreadyDecided(pane) {
    const id = decisionIdFrom(pane) || openDecisionId;
    const existing = decisionFor(id);
    return Boolean(existing && existing.epoch === renderEpoch);
  }

  function genericTextQuiet(pane) {
    const id = decisionIdFrom(pane) || openDecisionId;
    const existing = decisionFor(id);
    if (!existing || existing.epoch !== renderEpoch || existing.verdict === 'show') return false;
    const reason = String(existing.reason || '');
    return reason === 'page:intent-null' || reason === 'intent-null';
  }

  // Every open message ends in a card or in a reason the panel shows under "Why not shown" (never neither).
  async function pageReason(reason, pane, extra) {
    if (!paneCurrent(pane)) return;
    const epoch = paneEpoch(pane);
    if (epoch != null && epoch !== mailEpoch) return;
    if (!renderLive()) return;
    lastOutcome = 'reason';
    lastLoggedReason = reason;
    try {
      const whyMount = mountPoint();
      if (whyMount && !whyMount.querySelector('.flow-chip-host')) {
        paintIfCurrent(captureMailToken(), function () { return paintWhyNot(whyMount, reason); });
      }
    } catch (e) { /* the quiet line follows the stored reason */ }
    dbg('decision', { shown: false, reason, subject: pane && pane.subject });
    const key = reason + '|' + ((pane && (pane.conversationId || pane.itemId || pane.subject)) || location.pathname);
    if (key === lastReasonKey && lastReasonStored) return;
    const quiet = quietReason(reason);
    const quietId = pane && (pane.itemId || pane.conversationId);
    if (/hedge/.test(String(reason || '')) && pane) {
      const named = (typeof FlowIntent !== 'undefined' && typeof FlowIntent.openingAddressee === 'function')
        ? FlowIntent.openingAddressee(pane.text || '')
        : '';
      extra = Object.assign({
        addresseeName: String(named || '').slice(0, 80),
        toCount: Array.isArray(pane.to) ? pane.to.length : 0,
        ccCount: Array.isArray(pane.cc) ? pane.cc.length : 0,
        rawToLine: String(pane.rawToLine || '').slice(0, 180)
      }, extra || {});
    }
    if (quiet && quietId && typeof FlowStorage !== 'undefined' && typeof FlowStorage.recordSilence === 'function') {
      FlowStorage.recordSilence({ messageId: String(quietId), reason: quiet }).catch(() => {});
    }
    const subject = (typeof FlowDisplay !== 'undefined' && FlowDisplay.sanitizeStoredSubject)
      ? FlowDisplay.sanitizeStoredSubject(pane && pane.subject)
      : String((pane && pane.subject) || '').slice(0, 120);
    await commitDecision({
      id: decisionIdFrom(pane) || String((pane && pane.subject) || location.pathname || 'open'),
      epoch: epoch != null ? epoch : renderEpoch,
      source: 'page',
      verdict: 'quiet',
      reason: reason,
      cardHash: null,
      hydrateHow: (pane && pane.hydrateHow) || 'none',
      priorConversationId: (pane && pane.priorConversationId) || null,
      subject: subject,
      counterpart: (pane && pane.senderEmail) || null,
      conversationId: (pane && pane.conversationId) || null,
      messageId: (pane && (pane.itemId || pane.pathId)) || null,
      extra: extra || null
    });
  }

  function messageIdsOf(pane) {
    if (!pane) return [];
    return [pane.itemId, pane.pathId, pane.conversationId].filter(Boolean).map(String);
  }

  function sameExchangeId(a, b) {
    if (!a || !b) return false;
    if (String(a) === String(b)) return true;
    if (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.canonId === 'function') {
      const ca = FlowOwaParse.canonId(a);
      return Boolean(ca) && ca === FlowOwaParse.canonId(b);
    }
    return false;
  }

  function idListed(id, ids) {
    return (ids || []).some((x) => sameExchangeId(id, x));
  }

  // A visible card is the outcome. Drop the page reason and the mailbox
  // check's earlier quiet line for this message, so Why not shown does not
  // list a mail that has a card.
  async function clearReason(pane, reason) {
    if (!paneCurrent(pane)) return;
    const epoch = paneEpoch(pane);
    lastReasonKey = '';
    const id = openDecisionId || decisionIdFrom(pane);
    if (!id) return;
    const existing = decisionFor(id);
    const subject = (typeof FlowDisplay !== 'undefined' && FlowDisplay.sanitizeStoredSubject)
      ? FlowDisplay.sanitizeStoredSubject(pane && pane.subject)
      : String((pane && pane.subject) || '').slice(0, 120);
    await commitDecision({
      id: id,
      epoch: epoch != null ? epoch : renderEpoch,
      source: 'page',
      verdict: 'show',
      reason: reason || (existing && existing.reason) || 'shown',
      cardHash: existing && existing.cardHash,
      hydrateHow: (pane && pane.hydrateHow) || (existing && existing.hydrateHow) || null,
      priorConversationId: (pane && pane.priorConversationId) || (existing && existing.priorConversationId) || null,
      subject: subject,
      counterpart: (pane && pane.senderEmail) || null,
      conversationId: (pane && pane.conversationId) || null,
      messageId: (pane && (pane.itemId || pane.pathId)) || (existing && existing.messageId) || null
    });
  }

  function send(msg) {
    return new Promise((resolve) => {
      if (!guardContext()) { resolve({ ok: false, reason: 'invalidated' }); return; }
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          let err = null;
          try { err = chrome.runtime && chrome.runtime.lastError; } catch (e) { stopQuietly(); resolve({ ok: false, reason: 'invalidated' }); return; }
          if (!runtimeAlive() || (err && invalidatedMessage(err))) { stopQuietly(); resolve({ ok: false, reason: 'invalidated' }); return; }
          if (err) resolve({ ok: false, reason: err.message });
          else resolve(r || { ok: false });
        });
      } catch (e) {
        if (invalidatedMessage(e) || !runtimeAlive()) stopQuietly();
        resolve({ ok: false, reason: invalidatedMessage(e) ? 'invalidated' : String(e && e.message || e) });
      }
    });
  }

  // ---- the same planner as the panel, run from this page ----------------------------------------------------------
  // Graph reads go through the service worker (flow:outlook-fetch); the session (refresh / silent renewal) is the worker's
  // (flow:outlook-session), so two places never renew at once and the token request carries the extension's own origin.
  function proxyFetch(url, init) {
    return send({ type: 'flow:outlook-fetch', url: String(url), init: { method: (init && init.method) || 'GET', headers: (init && init.headers) || {} } })
      .then((r) => {
        const body = (r && typeof r.body === 'string') ? r.body : '';
        return {
          ok: Boolean(r && r.ok), status: (r && r.status) || 0,
          json: async () => JSON.parse(body || 'null'),
          text: async () => body
        };
      });
  }

  function runner() {
    if (runner.inst) return runner.inst;
    if (typeof FlowOutlook === 'undefined' || typeof FlowOutlookSync === 'undefined' || typeof FlowOutlookConfig === 'undefined' || typeof FlowOutlookAuth === 'undefined') return null;
    const auth = Object.assign({}, FlowOutlookAuth, {
      session: async (_deps, _cfg, _auth, opts) => {
        const r = await send({ type: 'flow:outlook-session', force: Boolean(opts && opts.force) });
        if (r && r.ok) return r;
        // The worker is restarting (a reload of Outlook on the web). That is not a sign-out.
        if (!r || !r.error) return { ok: false, error: 'network', transient: true, needsSignIn: false };
        if (r.needsSignIn) return Object.assign({ ok: false }, r);
        return Object.assign({ ok: false, needsSignIn: false }, r, { transient: r.transient !== false });
      }
    });
    runner.inst = FlowOutlook.create({
      storage: FlowStorage, cfg: FlowOutlookConfig, auth: auth, plan: FlowOutlookSync.plan,
      fetch: proxyFetch,
      redirectUri: () => (guardContext() ? 'https://' + chrome.runtime.id + '.chromiumapp.org/' : ''),
      launch: () => Promise.reject(new Error('panel-only')),
      permissions: { request: async () => false, contains: async () => true, remove: async () => false },
      send: send,
      random: (n) => crypto.getRandomValues(new Uint8Array(n)), sha256: (b) => crypto.subtle.digest('SHA-256', b), now: () => Date.now(),
      planDeps: {
        extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null,
        types: typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null,
        pipeline: typeof FlowIntentPipeline !== 'undefined' ? FlowIntentPipeline : null,
        intent: typeof FlowIntent !== 'undefined' ? FlowIntent : null,
        factReply: typeof FlowFactReply !== 'undefined' ? FlowFactReply : null,
        actions: typeof FlowActions !== 'undefined' ? FlowActions : null
      },
      actions: typeof FlowActions !== 'undefined' ? FlowActions : null,
      identity: typeof FlowIdentity !== 'undefined' ? FlowIdentity : null,
      followUp: typeof FlowFollowUp !== 'undefined' ? FlowFollowUp : null
    });
    return runner.inst;
  }

  // One check from this page, at most once a minute (the runner also refuses more often than that).
  let syncEpoch = -1;
  async function pageSync(reason) {
    // The previous mail's check is still in flight. This mail is judged
    // from the page. Waiting on that check is how a card came back in 3–4s.
    if (syncing && syncEpoch !== mailEpoch) return { ok: true, skipped: true };
    if (syncing) return syncing;
    const now = Date.now();
    if (now - lastPageSyncAt < PAGE_SYNC_MIN_MS) return { ok: true, skipped: true };
    const o = runner();
    if (!o) return { ok: false, error: 'no-runner' };
    lastPageSyncAt = now;
    syncEpoch = mailEpoch;
    syncing = o.sync({ minIntervalMs: PAGE_SYNC_MIN_MS, reason: reason || 'page' })
      .catch((e) => ({ ok: false, error: String(e && e.message || e) }))
      .finally(() => { syncing = null; });
    return syncing;
  }

  // Candidates Glance already judged for Outlook (sync / Still Open).
  async function outlookCandidates() {
    const st = await FlowStorage.get();
    const out = [];
    const pend = (st && st.outlookPending) || {};
    (pend.incoming || []).forEach((e) => { if (e) out.push(e); });
    if (typeof FlowStorage.getStillOpen === 'function') {
      const open = await FlowStorage.getStillOpen();
      (open || []).forEach((e) => {
        if (e && e.app === 'outlook' && !out.some((x) => x.messageId === e.messageId)) out.push(e);
      });
    }
    // Active draft receipts: show receipt chip if matching pane
    if (typeof FlowStorage.getActiveOutlookReceipts === 'function') {
      const receipts = await FlowStorage.getActiveOutlookReceipts();
      (receipts || []).forEach((e) => {
        if (!e || e.connectorId !== 'outlookDraft') return;
        if (!out.some((x) => x.messageId === e.messageId && x.outlookReceipt)) {
          out.push(Object.assign({}, e, { outlookReceipt: true }));
        }
      });
    }
    return out;
  }

  // The ask can sit inside a Word or Excel attachment. It is read on this
  // device (core/docreader.js), with the mail's own Graph sign-in, and only
  // when the mail text alone gave no card. Two files, 2 MB each, 4000
  // characters in all. Nothing leaves the device and nothing is stored.
  const OFFICE_READ_MAX_BYTES = 2 * 1024 * 1024;
  const OFFICE_READ_MAX_FILES = 2;
  const OFFICE_READ_MAX_CHARS = 4000;

  function officeKind(file) {
    const name = String((file && (file.name || file.filename)) || '').toLowerCase();
    const type = String((file && file.contentType) || '').toLowerCase();
    if (/\.docx$/.test(name) || /wordprocessingml\.document/.test(type)) return 'docx';
    if (/\.xlsx$/.test(name) || /spreadsheetml\.sheet/.test(type)) return 'xlsx';
    return '';
  }

  function bytesFromBase64(b64) {
    const bin = atob(String(b64 || '').replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }

  async function officeAttachmentText(pane, mailbox) {
    if (typeof FlowDocReader === 'undefined' || !pane) return '';
    const seen = (pane.attachments || []).length > 0 || Boolean(mailbox && mailbox.hasAttachments === true);
    if (!seen) return '';
    let read = null;
    try { read = await suggestFiles(await hydratePane(pane)); } catch (e) { return ''; }
    if (!read || read.unresolved || !Array.isArray(read.files) || !read.messageId) return '';
    const picks = read.files.filter((f) => f && f.isInline !== true && officeKind(f) && Number(f.size) <= OFFICE_READ_MAX_BYTES && !/itemAttachment/i.test(String(f['@odata.type'] || ''))).slice(0, OFFICE_READ_MAX_FILES);
    let text = '';
    for (const file of picks) {
      try {
        let item = null;
        const spells = idSpellings(read.messageId);
        for (let si = 0; si < spells.length; si++) {
          item = await graphJson('/me/messages/' + encodeURIComponent(spells[si]) + '/attachments/' + encodeURIComponent(file.id), 'office-read');
          if (item && item.contentBytes) break;
          item = null;
        }
        if (!item || !item.contentBytes) continue;
        const bytes = bytesFromBase64(item.contentBytes);
        const got = officeKind(file) === 'docx' ? await FlowDocReader.extractDocxText(bytes) : await FlowDocReader.extractXlsxText(bytes);
        if (got) text += (text ? '\n' : '') + got;
      } catch (e) { /* an unreadable file adds nothing */ }
      if (text.length >= OFFICE_READ_MAX_CHARS) break;
    }
    return text.slice(0, OFFICE_READ_MAX_CHARS);
  }

  function processDropFileSteps(process) {
    if (!process || !Array.isArray(process.steps)) return null;
    const steps = process.steps.filter((s) => s && s.kind !== 'onedriveFile' && s.kind !== 'driveFile' && s.kind !== 'attachmentSave');
    if (!steps.length) return null;
    return Object.assign({}, process, { steps: steps });
  }

  // Same engine as Gmail (core/incoming-judge.js), on the open message's text.
  // A stored process does not win. The page and the mailbox check agree, and a file ask runs the chain.
  async function decideFromText(pane, ownAddresses, mailbox) {
    if (typeof FlowIncomingJudge === 'undefined') return null;
    // The message's own words, as Gmail judges them: quoted history ("From: … Sent: …", "On … wrote:") cut off.
    const prepared = (typeof FlowIncomingJudge !== 'undefined' && FlowIncomingJudge.prepareForJudge)
      ? FlowIncomingJudge.prepareForJudge(pane.text || '')
      : (pane.text || '');
    const own = (typeof FlowGraphMail !== 'undefined' && FlowGraphMail.ownText) ? FlowGraphMail.ownText(prepared) : prepared;
    const from = String(pane.senderEmail || '').toLowerCase();
    // A save-shaped sentence is the only one that asks how many files are
    // on the message. Every other sentence stays at zero, as before.
    // The address often carries only a conversation id. Counting files on that
    // id fails, and a failed read must not become a silent zero.
    let attachmentCount = 0;
    const closes = typeof FlowGoogleCloses !== 'undefined' ? FlowGoogleCloses : null;
    const needsSave = closes && typeof closes.needsOneAttachment === 'function' && closes.needsOneAttachment(own);
    // Signed-copy delivery: one visible file is enough for the judge (file-it on Outlook).
    // Save-shaped asks still use the mailbox count when the pane lists attachments.
    const signedForJudge = closes && typeof closes.attachmentCountForJudge === 'function' &&
      closes.attachmentCountForJudge(own) && !needsSave;
    const localAttachN = ((pane && pane.attachments) || []).filter((a) => {
      if (!a || a.isInline === true) return false;
      return !/itemAttachment/i.test(String(a['@odata.type'] || ''));
    }).length;
    const countGate = needsSave || (signedForJudge && localAttachN >= 2);
    let attachmentsUnread = Boolean(mailbox && mailbox.attachmentsUnread);
    if (countGate) {
      let id = null;
      const restKey = String((pane && (pane.pathId || pane.rawUrlId)) || '').trim();
      if (restKey && !pane.itemId) {
        const pathRest = await messageIdFromPathRest(restKey);
        if (pathRest && pathRest.id) {
          pane.pathRestMessageUrl = true;
          id = pathRest.id;
        }
      }
      if (!id) {
        id = openPaneGraphMessageId(pane);
        if (!id && conversationPanePathKey(pane)) {
          const open = await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail);
          id = open && open.id;
          if (id) rememberExactConvMessageId(pane, id);
        }
        if (!id) {
          let found = null;
          if (conversationPanePathKey(pane)) {
            found = await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail);
          } else if (paneUrlOnlyMessageTarget(pane)) {
            found = await resolveMessageIdForFilePrepare(pane, ownAddresses, pane.senderEmail);
          } else {
            found = await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail);
          }
          if (found && found.unread) return { none: true, reason: found.reason };
          id = found && found.id;
          if (id) rememberExactConvMessageId(pane, id);
        }
      }
      const ev = typeof FlowOutlookAttachmentEvidence !== 'undefined' ? FlowOutlookAttachmentEvidence : null;
      const rows = id ? await attachmentListFor(id) : null;
      const merged = ev && typeof ev.mergeCount === 'function'
        ? ev.mergeCount(rows, pane, mailbox)
        : { count: Array.isArray(rows) ? rows.length : null, unread: !Array.isArray(rows), source: 'graph' };
      if (merged.count == null) {
        attachmentsUnread = true;
        attachmentCount = 0;
      } else {
        attachmentCount = merged.count;
        attachmentsUnread = Boolean(merged.unread);
        if (needsSave && attachmentCount >= 1 && Array.isArray(rows)) {
          attachmentsUnread = false;
        }
      }
    }
    if (signedForJudge && localAttachN >= 1 && !needsSave) attachmentCount = localAttachN;
    if (needsSave && localAttachN >= 1 && attachmentCount < 1) attachmentCount = localAttachN;
    if (!needsSave && localAttachN >= 1 && attachmentCount < 1) attachmentCount = localAttachN;
    const selfAddressed = typeof FlowIntent !== 'undefined' && typeof FlowIntent.addressedToSelf === 'function' && FlowIntent.addressedToSelf({
      senderEmail: pane.senderEmail,
      to: pane.to,
      cc: pane.cc,
      ownAddresses: ownAddresses,
      onBehalfOf: pane.onBehalfOf || null,
      forwarded: pane.onBehalf === true
    });
    const judgeWith = (text) => FlowIncomingJudge.judge({
      text: text, subject: pane.subject || '',
      sender: { name: pane.senderName, email: pane.senderEmail },
      now: new Date(), threadUrl: location.href,
      hasThreadAttachment: attachmentCount >= 1,
      attachmentCount: attachmentCount,
      surface: 'outlook',
      to: pane.to || null,
      cc: pane.cc || null,
      ownAddresses: ownAddresses || null,
      userName: pane.userName || null,
      ownNames: pane.ownNames || null,
      namesPending: pane.namesPending === true,
      onBehalfOf: pane.onBehalfOf || null,
      forwarded: pane.onBehalf === true,
      inbound: Boolean(selfAddressed) || (from ? (ownAddresses || []).indexOf(from) < 0 : true)
    });
    let r = judgeWith(own);
    if (!(r && r.show)) {
      const inside = await officeAttachmentText(pane, mailbox);
      if (inside) {
        const withFile = judgeWith((own ? own + '\n' : '') + inside);
        if (withFile && withFile.show) r = withFile;
      }
    }
    dbg('judged', { show: Boolean(r && r.show), reason: r && r.reason, type: r && r.intent && r.intent.type, label: r && r.intent && r.intent.label, from: 'open text' });
    if (r && r.show && r.process && r.process.id === 'file-it' && signedForJudge && localAttachN === 1 && !needsSave) {
      pane.attachmentsLoading = localAttachN < 1;
      return { none: true, reason: 'signed-save-suggest', intent: r.intent, process: r.process, attachmentsUnread: attachmentsUnread };
    }
    if (r && r.show && localAttachN >= 1) {
      const openMsgId = openPaneGraphMessageId(pane);
      let listId = openMsgId;
      if (!listId && conversationPanePathKey(pane)) {
        const open = await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail);
        listId = open && open.id;
      }
      if (!listId) {
        const found = conversationPanePathKey(pane)
          ? await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail)
          : (paneUrlOnlyMessageTarget(pane)
            ? await resolveMessageIdForFilePrepare(pane, ownAddresses, pane.senderEmail)
            : await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail));
        listId = found && found.id;
        if (listId) rememberExactConvMessageId(pane, listId);
      }
      if (listId) {
        let rows = await attachmentListFor(listId);
        if (!Array.isArray(rows) && !openMsgId && (pane.pathId || pane.conversationId) && !conversationPanePathKey(pane)) {
          const found = paneUrlOnlyMessageTarget(pane)
            ? await resolveMessageIdForFilePrepare(pane, ownAddresses, pane.senderEmail)
            : await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail);
          const alt = found && found.id;
          if (alt && String(alt) !== String(listId)) rows = await attachmentListFor(alt);
        }
        if (!Array.isArray(rows)) attachmentsUnread = true;
        else if (needsSave) {
          const evRows = typeof FlowOutlookAttachmentEvidence !== 'undefined' ? FlowOutlookAttachmentEvidence : null;
          const mergedRows = evRows && typeof evRows.mergeCount === 'function'
            ? evRows.mergeCount(rows, pane, mailbox)
            : { count: rows.length, unread: false, source: 'graph' };
          if (mergedRows.count >= 1) {
            attachmentCount = mergedRows.count;
            attachmentsUnread = false;
            const again = judgeWith(own);
            if (again && again.show) r = again;
          }
        }
      } else {
        attachmentsUnread = true;
      }
    }
    function unreadAttachmentReprobe() {
      if (typeof FlowIncomingJudge === 'undefined') return null;
      const probe = FlowIncomingJudge.judge({
        text: own, subject: pane.subject || '',
        sender: { name: pane.senderName, email: pane.senderEmail },
        now: new Date(), threadUrl: location.href,
        hasThreadAttachment: true,
        attachmentCount: 1,
        surface: 'outlook',
        to: pane.to || null,
        cc: pane.cc || null,
        ownAddresses: ownAddresses || null,
        userName: pane.userName || null,
        ownNames: pane.ownNames || null,
        namesPending: pane.namesPending === true,
        onBehalfOf: pane.onBehalfOf || null,
        forwarded: pane.onBehalf === true,
        inbound: Boolean(selfAddressed) || (from ? (ownAddresses || []).indexOf(from) < 0 : true)
      });
      if (!probe || !probe.show || !probe.process) return null;
      const dropped = processDropFileSteps(probe.process);
      if (!dropped) return null;
      pane.attachmentsUnread = true;
      return { intent: probe.intent, process: dropped, attachmentsUnread: true };
    }
    if (r && r.show) {
      let proc = r.process;
      let fileDroppedForUnread = false;
      if (attachmentsUnread && needsSave && proc && proc.id === 'file-it' && paneUrlOnlyMessageTarget(pane)) {
        if (conversationPanePathKey(pane)) {
          const looseSave = await fileItLooseOpenPaneAmbiguous(pane, pane.senderEmail);
          if (looseSave) return { none: true, reason: 'page:reply-target-unsure' };
        }
        const open = conversationPanePathKey(pane)
          ? await exactConversationPaneMessageId(pane, ownAddresses, pane.senderEmail)
          : await resolveMessageIdForFilePrepare(pane, ownAddresses, pane.senderEmail);
        if (open && open.id) {
          const lateRows = await attachmentListFor(open.id);
          const evLate = typeof FlowOutlookAttachmentEvidence !== 'undefined' ? FlowOutlookAttachmentEvidence : null;
          const lateMerged = evLate && typeof evLate.mergeCount === 'function'
            ? evLate.mergeCount(lateRows, pane, mailbox)
            : { count: Array.isArray(lateRows) ? lateRows.length : null, unread: !Array.isArray(lateRows), source: 'graph' };
          if (lateMerged.count >= 1 && lateMerged.source === 'graph' && !lateMerged.unread) {
            attachmentsUnread = false;
            attachmentCount = lateMerged.count;
            const again = judgeWith(own);
            if (again && again.show) {
              r = again;
              proc = again.process;
            }
          }
        }
      }
      if (attachmentsUnread && proc && proc.id === 'file-it') {
        const dropped = processDropFileSteps(proc);
        if (!dropped) return { none: true, reason: 'page:attachment-count-unread', attachmentsUnread: true };
        fileDroppedForUnread = true;
        proc = dropped;
      }
      if (fileDroppedForUnread && attachmentsUnread) {
        const reprobe = unreadAttachmentReprobe();
        if (reprobe) return reprobe;
        return { none: true, reason: 'page:attachment-count-unread', attachmentsUnread: true };
      }
      const out = { intent: r.intent, process: proc };
      if (attachmentsUnread) {
        out.attachmentsUnread = true;
        pane.attachmentsUnread = true;
      }
      return out;
    }
    if (attachmentsUnread) {
      const reprobe = unreadAttachmentReprobe();
      if (reprobe) return reprobe;
    }
    return { none: true, reason: (r && r.reason) || 'intent-null', attachmentsUnread: attachmentsUnread || undefined };
  }

  function userNameOf(st) {
    const auth = st && st.outlookAuth;
    const account = auth && auth.account;
    const profile = auth && auth.profile;
    return String((account && (account.name || account.displayName)) || (profile && profile.displayName) || '').trim();
  }

  // Display name, profile names, and the names stored for this person.
  // Latin and Hebrew both stay on the list the judge compares.
  function ownNamesOf(st) {
    const auth = st && st.outlookAuth;
    const known = st && st.glanceOwnNames;
    if (typeof FlowIntent !== 'undefined' && typeof FlowIntent.readerNamesFrom === 'function') {
      return FlowIntent.readerNamesFrom({
        displayName: userNameOf(st),
        profile: auth && auth.profile,
        knownNames: known
      });
    }
    return Array.isArray(known) ? known : null;
  }

  // Graph /me names are cached on glanceOwnNames. Until that cache or a
  // real account name exists, a greeting stays unjudged.
  function outlookNamesNotCached(st, userName) {
    const known = st && Array.isArray(st.glanceOwnNames) ? st.glanceOwnNames : [];
    for (let i = 0; i < known.length; i++) {
      const name = String(known[i] || '').trim().toLowerCase();
      if (name && name !== 'glance' && name !== 'me') return false;
    }
    const profile = st && st.outlookAuth && st.outlookAuth.profile;
    if (profile) {
      const given = String(profile.givenName || profile.given_name || '').trim();
      const surname = String(profile.surname || profile.familyName || '').trim();
      const display = String(profile.displayName || profile.name || '').trim().toLowerCase();
      if (given || surname || (display && display !== 'glance' && display !== 'me')) return false;
    }
    const shown = String(userName || '').trim().toLowerCase();
    if (shown && shown !== 'me') return false;
    if (st && st.outlookAuth && (st.outlookAuth.profile || st.outlookAuth.account)) return false;
    return true;
  }

  function ownAddressesOf(st) {
    return ((st && st.outlookAuth && st.outlookAuth.ownAddresses) || [])
      .concat(st && st.outlookAuth && st.outlookAuth.account && st.outlookAuth.account.address ? [st.outlookAuth.account.address] : [])
      .map((a) => String(a || '').toLowerCase());
  }

  function fromAddress(msg) {
    return String((msg && msg.from && msg.from.emailAddress && msg.from.emailAddress.address) || '').toLowerCase();
  }

  function newestOther(list, own, openSender, userSet) {
    const open = String(openSender || '').trim().toLowerCase();
    const rows = (list || []).filter((m) => {
      const a = fromAddress(m);
      if (!a) return false;
      if ((own || []).indexOf(a) < 0) return true;
      if (open && open === a) return true;
      return Boolean(userSet && open && userSet.has(a) && userSet.has(open));
    });
    rows.sort((a, b) => (Date.parse(b.receivedDateTime) || 0) - (Date.parse(a.receivedDateTime) || 0));
    return rows[0] || null;
  }

  function conversationUrlNeedsRestSpelling(pane) {
    const pathKey = String((pane && (pane.pathId || pane.rawUrlId || pane.conversationId)) || '').trim();
    if (!pathKey || !isConversationId(pathKey)) return false;
    const rest = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.canonId) ? FlowOwaParse.canonId(pathKey) : pathKey;
    return rest !== pathKey;
  }

  function needsJudgedReplyTarget(proc) {
    if (!proc) return false;
    if (proc.id === 'file-it') return false;
    const steps = proc.steps || [];
    if (steps.some((s) => s && (s.kind === 'onedriveFile' || s.kind === 'driveFile' || s.kind === 'attachmentSave'))) return false;
    if (proc.id === 'reply-track') return true;
    return steps.some((s) => s && (s.kind === 'outlookDraft' || s.kind === 'gmailDraft'));
  }

  function processNeedsConversationMessageId(proc) {
    if (!proc) return false;
    if (needsJudgedReplyTarget(proc)) return true;
    const steps = proc.steps || [];
    return steps.some((s) => s && (s.kind === 'onedriveFile' || s.kind === 'driveFile' || s.kind === 'attachmentSave' || s.kind === 'outlookDraft' || s.kind === 'gmailDraft'));
  }

  function rememberExactConvMessageId(pane, id) {
    if (pane && id) pane.__exactConvMessageId = String(id);
  }

  async function exactConversationPaneMessageId(pane, own, openSender) {
    if (!pane || pane.itemId || messageUrlPathKey(pane) || !conversationPanePathKey(pane)) return null;
    const found = await messageIdForOpenPane(pane.conversationId || pane.pathId, own, openSender, pane);
    if (!found || !found.id) return null;
    rememberExactConvMessageId(pane, found.id);
    if (found.unread) return found;
    if (!(await sameOpenSender(found.from, openSender, found.sender))) {
      return senderMismatch(found, openSender);
    }
    return found;
  }

  // Open-pane identity for Graph rows: same conversation, same sender, and the same
  // internet message id or received minute. Never pick "newest from sender".
  // Message id from the open pane URL (not a conversation id). Graph REST spelling.
  function openPaneGraphMessageId(pane) {
    if (!pane) return null;
    const parse = typeof FlowOwaParse !== 'undefined' ? FlowOwaParse : null;
    const canon = parse && parse.canonId ? parse.canonId.bind(parse) : (id) => String(id || '');
    const raw = pane.itemId && !isConversationId(pane.itemId) ? String(pane.itemId).trim()
      : (pane.pathId && !isConversationId(pane.pathId) ? String(pane.pathId).trim() : '');
    if (!raw || isConversationId(raw)) return null;
    return canon(raw) || raw;
  }

  const SOLE_BIDI_STRIP = /[\u200E\u200F\u202A-\u202E]/g;
  function normalizeSoleBodyText(s) {
    let t = String(s || '').replace(SOLE_BIDI_STRIP, '').replace(/\s+/g, ' ').trim().toLowerCase();
    t = t.replace(/(?:\u2026|\.{3})\s*$/u, '').trim();
    return t;
  }
  function soleBodyExactMatch(pane, m) {
    const paneBody = normalizeSoleBodyText(pane && pane.text);
    if (!paneBody) return false;
    const preview = normalizeSoleBodyText(m && m.bodyPreview);
    const fullGraph = normalizeSoleBodyText((m && m.body && m.body.content) || '');
    if (preview && preview === paneBody) return true;
    if (fullGraph && fullGraph === paneBody) return true;
    return false;
  }
  function openPaneExactGraphRow(pane, m) {
    if (!pane || !m) return false;
    const parse = typeof FlowOwaParse !== 'undefined' ? FlowOwaParse : null;
    const canon = parse && parse.canonId ? parse.canonId.bind(parse) : (id) => String(id || '');
    const wantConv = canon(pane.conversationId || pane.pathId);
    const gotConv = canon(m.conversationId);
    if (!wantConv || !gotConv || wantConv !== gotConv) return false;
    const paneNet = canon(pane.internetMessageId);
    const msgNet = canon(m.internetMessageId);
    const netOk = paneNet && msgNet && paneNet === msgNet &&
      Boolean(pane.clockFromPane || pane.idSource === 'open-mail');
    const minute = minuteOf(pane.receivedDateTime);
    let minOk = Boolean(pane && pane.clockFromPane === true && minute && minuteOf(m.receivedDateTime) === minute);
    if (!minOk && minute && pane.clockFromPane === true && pane.clockAmbiguous && pane.clockAlt) {
      const alt = minuteOf(pane.clockAlt);
      if (alt && minuteOf(m.receivedDateTime) === alt) minOk = true;
    }
    if (!netOk && !minOk) return false;
    return true;
  }
  async function exactOpenMessageInList(list, pane, openSender) {
    if (!pane) return null;
    const open = String(openSender || pane.senderEmail || '').trim().toLowerCase();
    const hits = [];
    const rows = (list || []).filter(Boolean);
    for (let i = 0; i < rows.length; i++) {
      const m = rows[i];
      const from = fromAddress(m);
      if (behalfSplit(m.from, m.sender)) continue;
      if (!(await sameOpenSender(from, open, senderAddress(m)))) continue;
      if (!openPaneExactGraphRow(pane, m)) continue;
      hits.push(m);
    }
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
    if (!hits.length && rows.length > 1 && pane.clockFromPane === true) {
      const parse = typeof FlowOwaParse !== 'undefined' ? FlowOwaParse : null;
      const canon = parse && parse.canonId ? parse.canonId.bind(parse) : (id) => String(id || '');
      const wantConv = canon(pane.conversationId || pane.pathId);
      const minute = minuteOf(pane.receivedDateTime);
      const alt = pane.clockAmbiguous ? minuteOf(pane.clockAlt) : '';
      if (minute && wantConv) {
        const pin = [];
        for (let i = 0; i < rows.length; i++) {
          const m = rows[i];
          const from = fromAddress(m);
          if (behalfSplit(m.from, m.sender)) continue;
          if (!(await sameOpenSender(from, open, senderAddress(m)))) continue;
          if (canon(m.conversationId) !== wantConv) continue;
          const got = minuteOf(m.receivedDateTime);
          if (got !== minute && (!alt || got !== alt)) continue;
          pin.push(m);
        }
        if (pin.length === 1) return pin[0];
      }
    }
    if (rows.length === 1) {
      const sole = rows[0];
      const from = fromAddress(sole);
      if (behalfSplit(sole.from, sole.sender)) return null;
      if (!(await sameOpenSender(from, open, senderAddress(sole)))) return null;
      const paneMinute = minuteOf(pane && pane.receivedDateTime);
      const paneAnchored = Boolean(
        (pane && pane.internetMessageId && (pane.clockFromPane || pane.idSource === 'open-mail')) ||
        (paneMinute && pane && pane.clockFromPane === true)
      );
      if (!paneAnchored) return null;
      if (openPaneExactGraphRow(pane, sole)) return sole;
      if (pane.clockFromPane === true) return null;
      if (soleBodyExactMatch(pane, sole)) return sole;
    }
    return null;
  }

  function paneFileAttachments(pane) {
    return ((pane && pane.attachments) || []).filter((a) => {
      if (!a || a.isInline === true) return false;
      return !/itemAttachment/i.test(String(a['@odata.type'] || ''));
    });
  }
  function graphAttMatchesPane(paneAtt, graphAtt) {
    const n1 = String((paneAtt && paneAtt.name) || '').trim().toLowerCase();
    const n2 = String((graphAtt && graphAtt.name) || '').trim().toLowerCase();
    if (!n1 || n1 !== n2) return false;
    const s1 = paneAtt && paneAtt.size != null ? Number(paneAtt.size) : null;
    const s2 = graphAtt && graphAtt.size != null ? Number(graphAtt.size) : null;
    if (s1 != null && s2 != null && s1 !== s2) return false;
    if (s1 != null && s2 == null) return false;
    return true;
  }
  async function fileItLooseOpenPaneAmbiguous(pane, openSender) {
    if (!pane || pane.itemId || !conversationPanePathKey(pane)) return false;
    const raw = rawConversationIdForSpells(pane.conversationId, pane.pathId);
    if (!raw) return false;
    const spells = idSpellings(raw);
    const prefers = [null, GRAPH_IMMUTABLE];
    let convList = [];
    for (let p = 0; p < prefers.length; p++) {
      for (let i = 0; i < spells.length; i++) {
        const q = "/me/messages?$filter=" + encodeURIComponent("conversationId eq '" + spells[i].replace(/'/g, "''") + "'") + '&$select=id,conversationId,receivedDateTime,from,sender,subject,internetMessageId,bodyPreview&$top=25';
        const list = await graphValues(q, 'file-it-conv-list', prefers[p]);
        if (Array.isArray(list) && list.length) { convList = list; break; }
      }
      if (convList.length) break;
    }
    if (convList.length <= 1) return false;
    let looseHits = 0;
    for (let li = 0; li < convList.length; li++) {
      const row = convList[li];
      if (!row || !row.id) continue;
      const fromLoose = fromAddress(row);
      const openLoose = String(openSender || pane.senderEmail || '').trim().toLowerCase();
      if (behalfSplit(row.from, row.sender)) continue;
      if (!(await sameOpenSender(fromLoose, openLoose, senderAddress(row)))) continue;
      if (!openPaneExactGraphRow(pane, row)) continue;
      looseHits += 1;
    }
    return looseHits > 1;
  }

  async function fileItPaneAttachmentTargetAmbiguous(pane, own, openSender) {
    if (!pane || pane.itemId || !conversationPanePathKey(pane)) return false;
    const paneAtts = paneFileAttachments(pane);
    if (!paneAtts.length) return false;
    if (pane.__exactConvMessageId) {
      const rows = await attachmentListFor(pane.__exactConvMessageId);
      if (!Array.isArray(rows)) return true;
      for (let a = 0; a < paneAtts.length; a++) {
        const hits = rows.filter((g) => graphAttMatchesPane(paneAtts[a], g));
        if (hits.length !== 1) return true;
      }
      return false;
    }
    const raw = rawConversationIdForSpells(pane.conversationId, pane.pathId);
    if (!raw) return false;
    const spells = idSpellings(raw);
    const prefers = [null, GRAPH_IMMUTABLE];
    let convList = [];
    for (let p = 0; p < prefers.length; p++) {
      for (let i = 0; i < spells.length; i++) {
        const q = "/me/messages?$filter=" + encodeURIComponent("conversationId eq '" + spells[i].replace(/'/g, "''") + "'") + '&$select=id,conversationId,receivedDateTime,from,sender,subject,internetMessageId,bodyPreview&$top=25';
        const list = await graphValues(q, 'file-it-conv-list', prefers[p]);
        if (Array.isArray(list) && list.length) { convList = list; break; }
      }
      if (convList.length) break;
    }
    if (convList.length <= 1) return false;
    let exact = await exactOpenMessageInList(convList, pane, openSender);
    if ((!exact || !exact.id) && pane.clockFromPane === true) {
      const parse = typeof FlowOwaParse !== 'undefined' ? FlowOwaParse : null;
      const canon = parse && parse.canonId ? parse.canonId.bind(parse) : (id) => String(id || '');
      const wantConv = canon(pane.conversationId || pane.pathId);
      const minute = minuteOf(pane.receivedDateTime);
      const alt = pane.clockAmbiguous ? minuteOf(pane.clockAlt) : '';
      const open = String(openSender || pane.senderEmail || '').trim().toLowerCase();
      if (minute && wantConv) {
        const pin = [];
        for (let i = 0; i < convList.length; i++) {
          const m = convList[i];
          const from = fromAddress(m);
          if (behalfSplit(m.from, m.sender)) continue;
          if (!(await sameOpenSender(from, open, senderAddress(m)))) continue;
          if (canon(m.conversationId) !== wantConv) continue;
          const got = minuteOf(m.receivedDateTime);
          if (got !== minute && (!alt || got !== alt)) continue;
          pin.push(m);
        }
        if (pin.length === 1) exact = pin[0];
      }
    }
    if (!exact || !exact.id) return true;
    rememberExactConvMessageId(pane, exact.id);
    const rows = await attachmentListFor(exact.id);
    if (!Array.isArray(rows)) return true;
    for (let a = 0; a < paneAtts.length; a++) {
      const hits = rows.filter((g) => graphAttMatchesPane(paneAtts[a], g));
      if (hits.length !== 1) return true;
    }
    return false;
  }

  function paneUrlOnlyMessageTarget(pane) {
    if (!pane) return false;
    const item = pane.itemId && !isConversationId(pane.itemId) ? String(pane.itemId).trim() : '';
    return !item;
  }

  function senderAddress(msg) {
    return String((msg && msg.sender && msg.sender.emailAddress && msg.sender.emailAddress.address) || '').trim().toLowerCase();
  }

  function plainAddress(raw) {
    const s = String(raw || '').trim().replace(/^smtp:/i, '').toLowerCase();
    if (!s || s.indexOf('@') < 0 || /\s/.test(s)) return '';
    return s;
  }

  // undefined: not loaded. null: /me failed, so compare the two addresses
  // exactly. A Set is the user's mail, userPrincipalName, smtp: proxies, and otherMails.
  let userAddressCache;
  let userAddressFlight = null;

  function profileAddressSet(body) {
    const set = new Set();
    function add(raw) {
      const e = plainAddress(raw);
      if (e) set.add(e);
    }
    const p = body || {};
    add(p.mail);
    add(p.userPrincipalName);
    (Array.isArray(p.otherMails) ? p.otherMails : []).forEach(add);
    (Array.isArray(p.proxyAddresses) ? p.proxyAddresses : []).forEach((raw) => {
      const m = String(raw || '').match(/^smtp:(.+)$/i);
      if (m) add(m[1]);
    });
    return set;
  }

  // Stored own addresses plus /me mail, UPN, smtp proxies, and otherMails.
  // A failed /me read leaves the stored list, so the exact compare stays.
  async function ownWithAliases(own) {
    const list = [];
    function add(raw) {
      const e = String(raw || '').trim().toLowerCase();
      if (!e || e.indexOf('@') < 0 || list.indexOf(e) >= 0) return;
      list.push(e);
    }
    (own || []).forEach(add);
    const known = await loadUserAddresses();
    if (known && typeof known.forEach === 'function') known.forEach(add);
    return list;
  }

  async function loadUserAddresses() {
    if (userAddressCache !== undefined) return userAddressCache;
    if (userAddressFlight) return userAddressFlight;
    userAddressFlight = (async () => {
      try {
        const body = await graphJson('/me?$select=mail,userPrincipalName,proxyAddresses,otherMails', 'own-addresses', null);
        userAddressCache = body ? profileAddressSet(body) : null;
      } catch (e) {
        userAddressCache = null;
      }
      userAddressFlight = null;
      return userAddressCache;
    })();
    return userAddressFlight;
  }

  function behalfSplit(from, sender) {
    const a = String(from || '').trim().toLowerCase();
    const b = String(sender || '').trim().toLowerCase();
    return Boolean(a && b && a !== b);
  }

  // Equal ignoring case, or both addresses are the user's own. A delegate
  // (Graph sender is not Graph from) is a different person either way.
  async function sameOpenSender(from, openEmail, graphSender) {
    if (behalfSplit(from, graphSender)) return false;
    const a = String(from || '').trim().toLowerCase();
    const b = String(openEmail || '').trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    const known = await loadUserAddresses();
    return Boolean(known && known.has(a) && known.has(b));
  }

  // Same session the mailbox check uses. The open-page reads used to send headers: {}
  // and every 401 collapsed to "no message".
  const GRAPH_IMMUTABLE = 'IdType="ImmutableId"';
  let pageBearer = '';
  let graphTrace = { attempts: [] };

  async function outlookBearer(force) {
    if (pageBearer && !force) return pageBearer;
    const r = await send({ type: 'flow:outlook-session', force: Boolean(force) });
    const t = r && r.ok && r.token && r.token.accessToken;
    pageBearer = t ? String(t) : '';
    return pageBearer;
  }

  async function graphCall(path, how, prefer) {
    const headers = {};
    let token = await outlookBearer(false);
    if (token) headers.Authorization = 'Bearer ' + token;
    if (prefer) headers.Prefer = prefer;
    const once = () => send({ type: 'flow:outlook-fetch', url: 'https://graph.microsoft.com/v1.0' + path, init: { method: 'GET', headers: headers } });
    let r = await once();
    if (r && r.status === 401) {
      token = await outlookBearer(true);
      if (token) {
        headers.Authorization = 'Bearer ' + token;
        r = await once();
      }
    }
    if (!graphTrace.attempts) graphTrace.attempts = [];
    graphTrace.attempts.push({
      how: how || 'graph',
      status: r && typeof r.status === 'number' ? r.status : 0,
      prefer: prefer ? 'immutable' : null
    });
    return r;
  }

  async function graphJson(path, how, prefer) {
    const r = await graphCall(path, how, prefer);
    if (!r || !r.ok) return null;
    try { return JSON.parse(r.body || '{}'); } catch (e) { return null; }
  }

  async function graphValues(path, how, prefer) {
    const body = await graphJson(path, how, prefer);
    if (!body) return null;
    return Array.isArray(body.value) ? body.value : [];
  }

  function graphStatus(r) {
    return r && typeof r.status === 'number' ? r.status : 0;
  }

  // Spellings of one Exchange id: Graph REST (- and _) first, then the URL form (+ and /).
  function idSpellings(id) {
    const raw = String(id || '');
    const canon = FlowOwaParse.canonId(raw);
    const out = [];
    if (canon) out.push(canon);
    if (raw && raw !== canon) out.push(raw);
    return out;
  }

  function conversationSpellsAllowInboxFallback(spells, raw) {
    const rest = FlowOwaParse.canonId(raw);
    if (!rest) return true;
    if ((spells || []).indexOf(rest) >= 0) return true;
    return (spells || []).length > 1;
  }

  // OWA may show an EWS-spelled conversation id in the URL while Graph rows use REST spelling.
  function rawConversationIdForSpells(listedConvId, urlPathId) {
    const path = String(urlPathId || '').trim();
    const listed = String(listedConvId || '').trim();
    if (path && isConversationId(path)) {
      const restPath = FlowOwaParse.canonId(path);
      if (restPath && restPath !== path) return path;
    }
    if (listed && isConversationId(listed)) {
      const restListed = FlowOwaParse.canonId(listed);
      if (restListed && restListed !== listed) return listed;
    }
    return listed || path;
  }

  // The /inbox/id/<restId> segment is the Graph message id (EWS alphabet in the URL,
  // REST alphabet on Graph). GET /me/messages/{id} with both spellings. A conversation
  // id that is not a message returns no row, and the conversation fallbacks still run.
  async function messageIdFromPathRest(pathId) {
    const spells = idSpellings(pathId);
    const prefers = [null, GRAPH_IMMUTABLE];
    const select = '?$select=id,conversationId,receivedDateTime,from,sender,subject,internetMessageId';
    for (let p = 0; p < prefers.length; p++) {
      for (let i = 0; i < spells.length; i++) {
        const msg = await graphJson('/me/messages/' + encodeURIComponent(spells[i]) + select, 'path-rest-id', prefers[p]);
        if (msg && msg.id && !Array.isArray(msg.value)) return { id: msg.id, how: 'path-rest-id', immutable: Boolean(prefers[p]), from: fromAddress(msg), sender: senderAddress(msg) };
      }
    }
    return null;
  }

  // The open message's Graph id when the address only carries its conversation.
  // OWA's id and Graph's conversationId match up to alphabet and padding (canonId).
  // A $filter on conversationId often comes back empty on the live mailbox (the
  // filter is refused, or the spelling does not match). The recent inbox list is
  // the same read the mailbox check already uses, matched here instead of on the server.
  function openInboxRows(list, want) {
    return (Array.isArray(list) ? list : []).filter((m) => m && (FlowOwaParse.canonId(m.conversationId) === want || FlowOwaParse.canonId(m.id) === want));
  }

  async function messageIdForConversation(convId, own, openSender, urlPathId) {
    const raw = rawConversationIdForSpells(convId, urlPathId);
    const want = FlowOwaParse.canonId(raw);
    if (!want) return null;
    try {
      const known = await loadUserAddresses();
      const spells = idSpellings(raw);
      const prefers = [null, GRAPH_IMMUTABLE];
      if (!conversationSpellsAllowInboxFallback(spells, raw)) return null;
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const select = '&$select=id,conversationId,receivedDateTime,from,sender,subject,internetMessageId';
      const order = '$top=40&$orderby=' + encodeURIComponent('receivedDateTime desc');
      const filteredPath = '/me/mailFolders/inbox/messages?' + order + '&$filter=' + encodeURIComponent('receivedDateTime ge ' + since) + select;
      const plainPath = '/me/mailFolders/inbox/messages?' + order + select;
      for (let p = 0; p < prefers.length; p++) {
        let list = await graphValues(filteredPath, 'inbox-list', prefers[p]);
        let how = 'inbox-list';
        if (!Array.isArray(list)) {
          list = await graphValues(plainPath, 'inbox-list-plain', prefers[p]);
          how = 'inbox-list-plain';
        }
        const hits = openInboxRows(list, want);
        const fromList = newestOther(hits, own, openSender, known);
        if (fromList && fromList.id) return { id: fromList.id, how: how, immutable: Boolean(prefers[p]), from: fromAddress(fromList), sender: senderAddress(fromList) };
      }
      return null;
    } catch (e) { return null; }
  }

  async function messageIdForOpenPane(convId, own, openSender, pane) {
    if (pane && messageUrlPathKey(pane)) return null;
    const raw = pane ? rawConversationIdForSpells(pane.conversationId, pane.pathId) : String(convId || '');
    const want = FlowOwaParse.canonId(raw);
    if (!want || !pane) return null;
    try {
      const spells = idSpellings(raw);
      const prefers = [null, GRAPH_IMMUTABLE];
      const convFilterTop = 25;
      const pickExactOnly = (list) => exactOpenMessageInList(list, pane, openSender);
      for (let p = 0; p < prefers.length; p++) {
        for (let i = 0; i < spells.length; i++) {
          const q = "/me/messages?$filter=" + encodeURIComponent("conversationId eq '" + spells[i].replace(/'/g, "''") + "'") + '&$select=id,conversationId,receivedDateTime,from,sender,subject,internetMessageId,bodyPreview&$top=' + convFilterTop;
          const convList = await graphValues(q, 'conversation-filter', prefers[p]);
          const fromFilter = await exactOpenMessageInList(convList, pane, openSender);
          if (fromFilter && fromFilter.id) return { id: fromFilter.id, how: 'conversation-filter', immutable: Boolean(prefers[p]), from: fromAddress(fromFilter), sender: senderAddress(fromFilter) };
        }
      }
      if (!conversationSpellsAllowInboxFallback(spells, raw)) return null;
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const select = '&$select=id,conversationId,receivedDateTime,from,sender,subject,internetMessageId';
      const order = '$top=40&$orderby=' + encodeURIComponent('receivedDateTime desc');
      const filteredPath = '/me/mailFolders/inbox/messages?' + order + '&$filter=' + encodeURIComponent('receivedDateTime ge ' + since) + select;
      const plainPath = '/me/mailFolders/inbox/messages?' + order + select;
      for (let p = 0; p < prefers.length; p++) {
        let list = await graphValues(filteredPath, 'inbox-list', prefers[p]);
        let how = 'inbox-list';
        if (!Array.isArray(list)) {
          list = await graphValues(plainPath, 'inbox-list-plain', prefers[p]);
          how = 'inbox-list-plain';
        }
        const hits = openInboxRows(list, want);
        const fromList = await pickExactOnly(hits);
        if (fromList && fromList.id) return { id: fromList.id, how: how, immutable: Boolean(prefers[p]), from: fromAddress(fromList), sender: senderAddress(fromList) };
      }
      return null;
    } catch (e) { return null; }
  }

  // Path RestId first (GET /me/messages/{id}), then open-pane conversation filter
  // (exact clock minute or internetMessageId only), then inbox list (same rule).
  function senderMismatch(found, openSender) {
    dbg('sender-mismatch', { how: found.how, from: found.from || null, sender: found.sender || null, open: String(openSender || '').toLowerCase() || null });
    return { unread: true, reason: 'page:sender-mismatch', from: found.from || null };
  }

  async function resolveOutlookMessageId(pathId, convId, own, openSender) {
    const pathKey = pathId || convId;
    const direct = await messageIdFromPathRest(pathKey);
    if (direct && direct.id) {
      const open = String(openSender || '').trim().toLowerCase();
      const from = String(direct.from || '').trim().toLowerCase();
      if (behalfSplit(direct.from, direct.sender) || (open && from && !(await sameOpenSender(from, open, direct.sender)))) {
        return senderMismatch(direct, openSender);
      }
      return direct;
    }
    const found = await messageIdForConversation(convId || pathId, own, openSender, pathKey);
    if (!found || !found.id) return null;
    if (!(await sameOpenSender(found.from, openSender, found.sender))) {
      return senderMismatch(found, openSender);
    }
    return found;
  }

  async function resolveExactOpenPaneMessageId(pane, own, openSender) {
    if (!pane || !paneUrlOnlyMessageTarget(pane) || !conversationPanePathKey(pane)) return null;
    const msgKey = messageUrlPathKey(pane);
    if (msgKey) {
      const pathRest = await messageIdFromPathRest(msgKey);
      if (pathRest && pathRest.id) {
        pane.pathRestMessageUrl = true;
        return null;
      }
    }
    const convId = pane.conversationId || pane.pathId;
    if (!convId) return null;
    const found = await messageIdForOpenPane(convId, own, openSender, pane);
    if (!found || !found.id) return null;
    if (!(await sameOpenSender(found.from, openSender, found.sender))) {
      return senderMismatch(found, openSender);
    }
    return found;
  }

  // File prepare / needs-you: URL-only targets only. Path REST when the segment is a message id;
  // otherwise an exact open-pane match. Never newest-from-sender (wrong attachment target).
  async function resolveMessageIdForFilePrepare(pane, own, openSender) {
    if (!pane || !paneUrlOnlyMessageTarget(pane)) return null;
    const restKey = String((pane.pathId || pane.rawUrlId) || '').trim();
    if (restKey) {
      const direct = await messageIdFromPathRest(restKey);
      if (direct && direct.id) {
        const open = String(openSender || pane.senderEmail || '').trim().toLowerCase();
        const from = String(direct.from || '').trim().toLowerCase();
        if (behalfSplit(direct.from, direct.sender) || (open && from && !(await sameOpenSender(from, open, direct.sender)))) {
          return senderMismatch(direct, openSender || pane.senderEmail);
        }
        pane.pathRestMessageUrl = true;
        return direct;
      }
    }
    if (conversationPanePathKey(pane)) {
      const found = await messageIdForOpenPane(pane.conversationId || pane.pathId, own, openSender, pane);
      if (!found || !found.id) return null;
      if (found.unread) return found;
      if (!(await sameOpenSender(found.from, openSender, found.sender))) {
        return senderMismatch(found, openSender || pane.senderEmail);
      }
      return found;
    }
    return null;
  }

  function messageUrlPathKey(pane) {
    if (pane && pane.pathRestMessageUrl) {
      return String((pane && (pane.pathId || pane.rawUrlId)) || '').trim();
    }
    const pathKey = String((pane && (pane.pathId || pane.rawUrlId)) || '').trim();
    return pathKey && !isConversationId(pathKey) ? pathKey : '';
  }

  function conversationPanePathKey(pane) {
    if (pane && pane.pathRestMessageUrl) return '';
    const pathKey = String((pane && (pane.pathId || pane.rawUrlId || pane.conversationId)) || '').trim();
    return pathKey && isConversationId(pathKey) ? pathKey : '';
  }

  async function resolveJudgedReplyMessageId(pane, own, openSender) {
    if (!pane) return null;
    if (paneUrlOnlyMessageTarget(pane)) {
      const convId = pane.conversationId || pane.pathId;
      if (conversationPanePathKey(pane) && convId) {
        const found = await messageIdForOpenPane(convId, own, openSender, pane);
        if (!found || !found.id) return null;
        if (found.unread) return found;
        if (!(await sameOpenSender(found.from, openSender || pane.senderEmail, found.sender))) {
          return senderMismatch(found, openSender || pane.senderEmail);
        }
        return found;
      }
      const pinned = await resolveMessageIdForFilePrepare(pane, own, openSender);
      if (pinned && pinned.id) return pinned;
      return null;
    }
    return resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, own, openSender || pane.senderEmail);
  }

  async function ensureOutlookMessageId(ctx) {
    const have = ctx && (ctx.outlookIncomingId || ctx.messageId);
    if (have) return have;
    let own = [];
    try { own = ownAddressesOf(await FlowStorage.get()); } catch (e) { own = []; }
    const openSender = (ctx && ctx.sender && ctx.sender.email) || (ctx && ctx.pane && ctx.pane.senderEmail);
    const pane = ctx && ctx.pane;
    const pathId = ctx && (ctx.pathId || ctx.conversationId);
    const convId = ctx && ctx.conversationId;
    let found = null;
    if (pane && (pane.itemId || pane.pathId || pane.conversationId)) {
      const proc = ctx && ctx.process;
      if (paneUrlOnlyMessageTarget(pane)) {
        found = await resolveMessageIdForFilePrepare(pane, own, openSender);
        if ((!found || !found.id) && needsJudgedReplyTarget(proc)) {
          found = await resolveJudgedReplyMessageId(pane, own, openSender);
        } else if ((!found || !found.id) && conversationPanePathKey(pane) && processNeedsConversationMessageId(proc)) {
          found = await exactConversationPaneMessageId(pane, own, openSender);
        }
      } else {
        found = await resolveJudgedReplyMessageId(pane, own, openSender);
      }
    } else if (pathId || convId) {
      const bareKey = String(pathId || convId || '').trim();
      if (bareKey && isConversationId(bareKey)) return null;
      found = await resolveOutlookMessageId(pathId || convId, convId, own, openSender);
    } else {
      return null;
    }
    if (!found || found.unread || !found.id) return null;
    ctx.messageId = found.id;
    ctx.outlookIncomingId = found.id;
    ctx.messageIdFrom = found.how;
    ctx.outlookImmutableId = found.immutable === true;
    return found.id;
  }

  function graphTraceSnapshot() {
    return (graphTrace.attempts || []).slice(0, 12);
  }

  function paneEpoch(pane) {
    return pane && typeof pane.__epoch === 'number' ? pane.__epoch : null;
  }

  function paneCurrent(pane) {
    const epoch = paneEpoch(pane);
    return epoch == null || epoch === mailEpoch;
  }

  function stampEpoch(ctx, pane) {
    const epoch = paneEpoch(pane);
    if (ctx && epoch != null) ctx.__epoch = epoch;
    return ctx;
  }

  function buildCtx(entry, pane, decided) {
    const intent = (decided && decided.intent) || entry.intent;
    let process = (decided && decided.process) || entry.process;
    if (!intent || !process) return null;
    // In-page Do It writes the Outlook draft only (same as popup). Drop non-draft steps from the chip.
    // A file step is the close (OneDrive, Drive, or a saved attachment). The draft beside it is the
    // share-link step, and dropping the file would turn that Do It into a reply draft.
    const hasOnedrive = (process.steps || []).some((s) => s && (s.kind === 'onedriveFile' || s.kind === 'driveFile' || s.kind === 'attachmentSave'));
    const draftSteps = (process.steps || []).filter((s) => s.kind === 'outlookDraft' || s.kind === 'gmailDraft');
    const taskSteps = (process.steps || []).filter((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
    if (draftSteps.length && !hasOnedrive) {
      const kept = draftSteps.concat(taskSteps).map((s) => s.kind === 'gmailDraft'
        ? Object.assign({}, s, { kind: 'outlookDraft', id: String(s.id || 'draft').replace(/^gmail/i, 'outlook') })
        : (s.kind === 'googleTask' || s.kind === 'googleTasks')
          ? Object.assign({}, s, { kind: 'outlookTask', id: 'outlookTask' })
          : s);
      process = Object.assign({}, process, { steps: kept });
    }
    const sender = entry.sender || (entry.base && entry.base.counterpart) || {
      name: pane && pane.senderName,
      email: pane && pane.senderEmail
    };
    const paneFiles = (pane && pane.attachments || []).map((a) => ({
      id: a && a.id,
      name: a && (a.name || a.filename),
      filename: a && (a.name || a.filename),
      contentType: a && (a.contentType || a.mimeType),
      mimeType: a && (a.contentType || a.mimeType),
      size: a && a.size
    })).filter((a) => a && (a.name || a.filename));
    const attachText = ((entry.subject || (pane && pane.subject) || '') + '\n' + (entry.bodyText || (pane && pane.text) || entry.text || '')).trim();
    const savePick = (typeof FlowFileAttach !== 'undefined' && typeof FlowFileAttach.pickSaveAttachment === 'function' && paneFiles.length)
      ? FlowFileAttach.pickSaveAttachment(attachText, paneFiles)
      : { mode: paneFiles.length === 1 ? 'single' : (paneFiles.length > 1 ? 'choice' : 'none'), file: paneFiles[0] || null, files: paneFiles };
    const pickedAttach = (savePick.mode === 'picked' || savePick.mode === 'single') ? savePick.file : null;
    if (typeof FlowFileAttach !== 'undefined' && typeof FlowFileAttach.enrichFileItChoiceCatalog === 'function') {
      process = FlowFileAttach.enrichFileItChoiceCatalog(process, paneFiles, savePick.mode);
    }
    const saveName = pickedAttach && (pickedAttach.name || pickedAttach.filename);
    let catalogOne = null;
    if (saveName && (savePick.mode === 'single' || savePick.mode === 'picked')) {
      catalogOne = [{
        id: String((pickedAttach && pickedAttach.id) || 'att-0'),
        name: saveName,
        label: saveName,
        on: true,
        skipped: false
      }];
      process = Object.assign({}, process, {
        steps: (process.steps || []).map((s) => {
          if (!s || (s.kind !== 'driveFile' && s.kind !== 'onedriveFile' && s.kind !== 'attachmentSave')) return s;
          const kind = s.kind === 'driveFile' ? 'onedriveFile' : s.kind;
          const params = Object.assign({}, s.params || {}, {
            fileName: saveName,
            selectedAttachment: pickedAttach,
            catalog: catalogOne,
            files: catalogOne
          });
          return Object.assign({}, s, { kind: kind, params: params });
        })
      });
    }
    return {
      app: 'outlook',
      surface: 'outlook-web',
      messageId: entry.messageId || entry.outlookIncomingId,
      outlookIncomingId: entry.outlookIncomingId || entry.messageId,
      itemId: (pane && pane.itemId) || entry.itemId || null,
      pathId: (pane && pane.pathId) || entry.pathId || null,
      conversationId: (pane && pane.conversationId) || entry.outlookConversationId || null,
      threadId: entry.threadId || (pane && pane.conversationId) || (entry.base && entry.base.threadId),
      threadUrl: (entry.base && entry.base.threadUrl) || entry.threadUrl || location.href,
      subject: entry.subject || (pane && pane.subject) || '',
      bodyText: entry.bodyText || (pane && pane.text) || entry.text || '',
      sender: sender,
      intent: intent,
      process: process,
      key: entry.key,
      hydrateHow: (pane && pane.hydrateHow) || null,
      priorConversationId: (pane && pane.priorConversationId) || null,
      attachments: paneFiles,
      attachment: pickedAttach || (savePick.mode === 'choice' ? null : (paneFiles[0] || null)),
      attachmentPickMode: savePick.mode,
      saveAttachmentName: pickedAttach && (pickedAttach.name || pickedAttach.filename) || null,
      attachmentsUnread: Boolean(entry.attachmentsUnread || (pane && pane.attachmentsUnread)),
      noteToSelf: Boolean(pane && pane.noteToSelf) || (function () {
        const from = String((sender && sender.email) || (pane && pane.senderEmail) || '').toLowerCase();
        const own = (pane && pane.ownAddresses) || [];
        const to = (pane && pane.to) || [];
        if (!from || !own.length) return false;
        const isOwn = own.some((a) => String(a || '').toLowerCase() === from);
        if (!isOwn) return false;
        return to.some((a) => String(a || '').toLowerCase() === from);
      })(),
      attachmentsLoading: Boolean(pane && pane.attachmentsLoading),
      __epoch: paneEpoch(pane),
      pane: pane || null
    };
  }

  function preferHumanFrom(auth) {
    if (!auth) return null;
    const opaque = /^outlook_[0-9a-f]+@outlook\.com$/i;
    const candidates = [];
    if (auth.account && auth.account.address) candidates.push(auth.account.address);
    if (auth.account && auth.account.mail) candidates.push(auth.account.mail);
    (auth.ownAddresses || []).forEach((a) => candidates.push(a));
    if (auth.profile) {
      if (auth.profile.mail) candidates.push(auth.profile.mail);
      (auth.profile.otherMails || []).forEach((a) => candidates.push(a));
    }
    const seen = new Set();
    for (const raw of candidates) {
      const e = String(raw || '').trim().toLowerCase();
      if (!e || seen.has(e)) continue;
      seen.add(e);
      if (!opaque.test(e)) return e;
    }
    return candidates.map((a) => String(a || '').trim().toLowerCase()).find(Boolean) || null;
  }

  function faceTitle(ctx) {
    if (typeof FlowDisplay !== 'undefined' && FlowDisplay.cardFace && ctx && ctx.process) {
      const face = FlowDisplay.cardFace(ctx.process, ctx.intent, { bodyText: ctx.bodyText || ctx.text || '' });
      if (face && face.title) return face.title;
    }
    return (ctx && ctx.process && ctx.process.name) || '';
  }

  function actionTitle(entry) {
    if (typeof FlowDisplay !== 'undefined' && FlowDisplay.activityTitle) return FlowDisplay.activityTitle(entry);
    return (entry && (entry.writtenLine || entry.label)) || '';
  }

  function draftUnverifiedStatus(written) {
    return written === "Created, couldn't verify" ? written : undefined;
  }

  async function onDoIt(host, chip, ctx, liveSteps) {
    const token = captureMailToken();
    if (ignoreStaleClick(host)) return;
    const earlySteps = (ctx && ctx.process && ctx.process.steps) || [];
    const earlyTask = earlySteps.find((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
    const earlyDraft = earlySteps.some((s) => s && (s.kind === 'outlookDraft' || s.kind === 'gmailDraft'));
    if (earlyTask && !earlyDraft) {
      let stNow = null;
      try { stNow = await FlowStorage.get(); } catch (e) { stNow = null; }
      if (todoAsk(stNow)) {
        paintIfCurrent(token, function () { paintTodoConsent(host, ctx); });
        return;
      }
    }
    doItInFlight = true;
    try {
    paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-pending', pageChrome().closing); });
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('preparing');
    let resolvedId = null;
    try {
      if (!(ctx && (ctx.outlookIncomingId || ctx.messageId))) graphTrace = { attempts: [] };
      resolvedId = await ensureOutlookMessageId(ctx);
      if (ignoreStaleClick(host)) return;
      if (traceArmed || localFileTrace()) {
        logFileTrace({
          phase: 'do-it',
          messageIdFrom: (resolvedId && ctx.messageIdFrom) || 'none',
          resolved: Boolean(resolvedId),
          pathId: ctx.pathId || null,
          conversationId: ctx.conversationId || null,
          itemId: ctx.itemId || null,
          graph: graphTraceSnapshot()
        });
      }
    } catch (e) {
      resolvedId = null;
    }
    if (!resolvedId) {
      const pane = ctx && ctx.pane;
      const convKey = String((ctx && (ctx.pathId || ctx.conversationId)) || '').trim();
      const convPane = Boolean(pane && conversationPanePathKey(pane)) ||
        (convKey && isConversationId(convKey));
      if (convPane && pane) {
        paintIfCurrent(token, function () { paintRemove(host); });
        await pageReason('page:reply-target-unsure', pane);
      } else {
        paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', 'Could not find that message'); });
      }
      return;
    }
    const fromList = Array.isArray(liveSteps);
    const steps = fromList ? liveSteps : ((ctx.process && ctx.process.steps) || []);
    if (fromList && !steps.length) {
      paintIfCurrent(token, function () { paintRemove(host); });
      return;
    }
    const fileStep = steps.find((s) => s && (s.kind === 'onedriveFile' || s.kind === 'driveFile' || s.kind === 'attachmentSave'));
    if (fileStep) {
      await onOnedriveDoIt(host, chip, ctx, fileStep, token);
      return;
    }
    const hasDraft = steps.some((s) => s && (s.kind === 'outlookDraft' || s.kind === 'gmailDraft'));
    const calendarStep = steps.find((s) => s && s.kind === 'calendar');
    const taskStep = steps.find((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
    // The card already rendered this plan. Do It writes those steps. It does
    // not classify the mail again, and it does not invent a reply draft.
    if (calendarStep && !hasDraft) {
      const preset = calendarParamsFromStep(calendarStep, ctx);
      if (!preset) {
        paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', pageChrome().couldntFind); });
        return;
      }
      await finishMeetingHold(host, ctx, token, preset);
      return;
    }
    if (taskStep && !hasDraft) {
      await onOutlookTodoDoIt(host, chip, ctx, taskStep, token);
      return;
    }
    if (!hasDraft) {
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', pageChrome().somethingWrong); });
      return;
    }
    const askText = ctx.bodyText || ctx.text || '';
    const subject = ctx.subject || '';
    let fromAddress = null;
    try {
      const st = await FlowStorage.get();
      fromAddress = preferHumanFrom(st && st.outlookAuth);
    } catch (e) { /* From resolved again in background */ }
    // Exactly the payload Gmail's Do It sends for its draft step (core/incoming-judge.js draftPayload); background.js
    // writes it with the same composer (FlowDraftReply.draftBodyText). Only the connector differs.
    const base = (typeof FlowIncomingJudge !== 'undefined')
      ? FlowIncomingJudge.draftPayload(ctx.process, { sender: ctx.sender, subject: subject })
      : { params: {}, senderName: ctx.sender && ctx.sender.name, senderEmail: ctx.sender && ctx.sender.email, subject: subject };
    const file = ctx.attachFile && ctx.attachFile.id ? ctx.attachFile : null;
    const payload = Object.assign(base, {
      outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
      messageId: ctx.messageId,
      outlookImmutableId: ctx.outlookImmutableId === true,
      intent: ctx.intent,
      label: ctx.intent && ctx.intent.label,
      text: askText,
      fromAddress: fromAddress
    });
    if (file) {
      payload.driveFileId = file.id;
      payload.driveFileName = file.name || null;
      payload.driveMimeType = file.mimeType || null;
    }
    payload.connectorId = 'outlookDraft';
    if (ignoreStaleClick(host)) return;
    const r = await send({ type: 'flow:execute-action', payload: payload });
    // A file is attached only when Graph returned an attachment id. A success
    // without that id is not a draft we keep, and the receipt never says attached.
    if (!r || !r.ok || (file && !r.attachmentId)) {
      if (r && r.ok && r.ref && file && !r.attachmentId) {
        await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref, created: r.created || null, outlookImmutableId: ctx.outlookImmutableId === true });
      }
      if (file) {
        await pageReason('outlook:file-found-no-attach', {
          itemId: ctx.messageId,
          subject: ctx.subject,
          senderEmail: ctx.sender && ctx.sender.email
        });
      }
      paintIfCurrent(token, function () {
        FlowChipHost.setChipState(chip, 'flow-chip-error', (r && !r.ok && (r.reason || r.error)) || (file ? 'Could not attach that file.' : 'Could not create draft'));
      });
      return;
    }
    const unverified = r.fetchedBack === false || r.reason === 'unverified';
    const written = unverified
      ? "Created, couldn't verify"
      : (file
        ? 'Reply draft ready in Outlook Drafts, with the file attached. Not sent.'
        : (r.written || 'Reply draft ready in Outlook Drafts. Not sent.'));
    await FlowStorage.appendLog({
      kind: 'written',
      label: written,
      messageId: ctx.messageId,
      itemId: ctx.itemId || null,
      pathId: ctx.pathId || null,
      threadId: ctx.threadId || ctx.conversationId || null,
      outlookConversationId: ctx.conversationId || null,
      app: 'outlook',
      connectorId: 'outlookDraft',
      ref: r.ref,
      created: unverified ? null : (r.created || null),
      where: r.where,
      url: r.url || r.where,
      fetchedBack: unverified ? false : undefined,
      outlookIncomingId: ctx.outlookIncomingId,
      outlookReceipt: true,
      intent: ctx.intent,
      process: ctx.process,
      sender: ctx.sender,
      subject: ctx.subject,
      text: ctx.bodyText
    });
    let taskRef = null;
    let taskCreated = null;
    let taskWritten = '';
    if (taskStep && !unverified) {
      const params = (taskStep && taskStep.params) || {};
      const tr = await send({
        type: 'flow:execute-action',
        payload: {
          connectorId: 'outlookTask',
          params: params,
          label: artifactTitleFor(ctx, (ctx.intent && ctx.intent.label) || params.title || 'Task'),
          senderName: ctx.sender && ctx.sender.name,
          senderEmail: ctx.sender && ctx.sender.email,
          subject: ctx.subject || '',
          text: ctx.bodyText || '',
          threadUrl: ctx.threadUrl || null,
          facts: (ctx.intent && ctx.intent.facts) || null,
          entities: (ctx.intent && (ctx.intent.entities || ctx.intent.facts)) || null
        }
      });
      const taskProved = typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.allowsHandled
        ? FlowProofOfClose.allowsHandled({ ok: !!(tr && tr.ok), proof: tr && tr.proof })
        : false;
      if (!taskProved && (!tr || !tr.ok)) {
        taskWritten = (typeof FlowDisplay !== 'undefined' && FlowDisplay.outlookTodoFailedAfterDraftLine
          ? FlowDisplay.outlookTodoFailedAfterDraftLine(pageUiLang())
          : String((tr && (tr.written || tr.error || tr.reason)) || "To Do task wasn't created. The draft is ready."));
      } else if (taskProved || (tr && tr.ref && tr.written === "Created, couldn't verify")) {
        taskRef = tr.ref;
        taskCreated = (tr.ref && tr.ref.created) || null;
        taskWritten = tr.written || pageChrome().handled;
        const taskTitle = actionTitle({
          connectorId: 'outlookTask', process: ctx.process, intent: ctx.intent, text: ctx.bodyText,
          writtenLine: taskWritten, subject: ctx.subject, params: params
        });
        const taskFields = (taskProved && tr.proof && FlowProofOfClose.receiptLogFields)
          ? FlowProofOfClose.receiptLogFields(tr.proof, { writtenLine: taskWritten, processName: faceTitle(ctx), status: pageChrome().handled, created: taskCreated })
          : null;
        await FlowStorage.appendLog(Object.assign({
          kind: 'written',
          label: taskTitle,
          actionTitle: taskTitle,
          messageId: ctx.messageId,
          itemId: ctx.itemId || null,
          pathId: ctx.pathId || null,
          threadId: ctx.threadId || ctx.conversationId || null,
          outlookConversationId: ctx.conversationId || null,
          outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
          app: 'outlook',
          connectorId: 'outlookTask',
          ref: taskRef,
          created: taskCreated,
          where: tr.where || null,
          url: tr.url || null,
          fetchedBack: taskProved ? true : false,
          intent: ctx.intent,
          process: ctx.process,
          sender: ctx.sender,
          subject: ctx.subject,
          text: ctx.bodyText
        }, taskFields || {}));
      }
    }
    const receiptWritten = taskWritten ? (written + '\n' + taskWritten) : written;
    if (!unverified && ctx.messageId) {
      await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
      await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
    }
    paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
      status: draftUnverifiedStatus(written),
      written: receiptWritten,
      url: r.url || r.where,
      onUndo: guardedUndo(host, async () => {
        const undoToken = captureMailToken();
        if (taskRef) {
          const tu = await send({ type: 'flow:undo-action', connectorId: 'outlookTask', ref: taskRef, created: taskCreated });
          if (!(tu && tu.ok)) return { ok: false, written: (tu && tu.written) || pageChrome().stillThere };
          if (typeof FlowStorage.markMicrosoftTodoUndone === 'function') {
            await FlowStorage.markMicrosoftTodoUndone(ctx.messageId, taskRef, ctx.threadId || ctx.conversationId);
          }
        }
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref, created: r.created, outlookImmutableId: ctx.outlookImmutableId === true });
        if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed')) return { ok: false, reason: u.reason, written: u.written };
        if (u && u.ok && typeof FlowStorage.markOutlookDraftUndone === 'function') {
          await FlowStorage.markOutlookDraftUndone(ctx.messageId, r.ref);
        }
        if (u && u.ok) {
          await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: ctx.messageId, draftOnly: !taskRef });
        }
        // Undo reopens the owed ask: drop the settled receipt and let scan
        // re-inject Do It (same eligibility as the popup Still Open list).
        lastKey = '';
        lastSig = '';
        paintIfCurrent(undoToken, function () { paintRemove(host); });
        schedule();
        if (!(u && u.ok)) return { ok: false, written: (u && u.written) || 'Could not remove the draft.' };
        return { ok: true, written: u.written || 'Reply draft removed. Not sent.', reopen: true };
      })
    }); });
    } finally {
      doItInFlight = false;
    }
  }

  function outlookTodoRow(row) {
    if (!row) return false;
    if (row.system === 'microsoft/todo') return true;
    return row.connectorId === 'outlookTask' || row.connectorId === 'microsoftTodo';
  }

  function outlookOnedriveRow(row) {
    if (!row) return false;
    if (row.system === 'microsoft/onedrive') return true;
    return row.connectorId === 'onedriveFile' || row.connectorId === 'attachmentSave';
  }

  function outlookProofRow(row) {
    return outlookTodoRow(row) || outlookOnedriveRow(row);
  }

  function hostIds(el) {
    return String((el && el.getAttribute && el.getAttribute('data-glance-message')) || '').split('|').filter(Boolean);
  }

  function hostMatches(el, ids) {
    const marked = hostIds(el);
    if (!marked.length || !ids.length) return false;
    return marked.some((id) => idListed(id, ids));
  }

  function readingScope(mount) {
    return openMailRoot() || mount || document;
  }

  // One Handled receipt for this message. A second copy, in the header or
  // in the body, is removed. A different message's host is not this receipt.
  function stripDuplicateUndoHosts(mount) {
    if (paintDepth <= 0) return null;
    const scope = readingScope(mount);
    if (!scope || !scope.querySelectorAll) return null;
    const hosts = [];
    scope.querySelectorAll('.flow-chip-host[data-glance-chain="task-proof"]').forEach((el) => hosts.push(el));
    let kept = null;
    hosts.forEach((el) => {
      if (!kept && el.classList.contains('flow-chip-settled')) kept = el;
    });
    if (!kept && hosts.length) kept = hosts[0];
    hosts.forEach((el) => { if (el !== kept) el.remove(); });
    return kept;
  }

  // The open mail, on the layouts OWA actually ships. #ReadingPaneContainerId
  // is one of them. A missing or throwing selector is not "no mail open".
  function openMailRoot() {
    const sels = [
      '#ReadingPaneContainerId',
      '[data-testid="ReadingPane"]',
      '[data-app-section="ReadingPane"]',
      '[data-app-section="ConversationContainer"]',
      '.ReadingPaneContents',
      '[role="main"]'
    ];
    for (let i = 0; i < sels.length; i++) {
      try {
        const n = document.querySelector(sels[i]);
        if (n) return n;
      } catch (e) { /* this layout does not have that selector */ }
    }
    try {
      if (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.readingPaneRoots === 'function') {
        const roots = FlowOwaParse.readingPaneRoots(document) || [];
        const body = roots[0];
        if (!body) return null;
        const up = body.closest && (body.closest('[role="main"]') || body.closest('[data-app-section="ReadingPane"]'));
        return up || body;
      }
    } catch (e) { /* roots unavailable */ }
    return null;
  }

  function headingSubject(root) {
    if (!root || !root.querySelector) return '';
    let heading = null;
    try { heading = root.querySelector('[role="heading"]'); } catch (e) { heading = null; }
    return heading ? String(heading.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180) : '';
  }

  // The message body, not the subject heading. Editing the subject is not
  // a different mail. A different body in the same conversation is.
  function openMailBodyMark(root) {
    if (!root || !root.querySelector) return '';
    let body = null;
    try { body = root.querySelector('div[role="document"]') || root.querySelector('[role="document"]'); } catch (e) { body = null; }
    if (!body) return '';
    let text = String(body.textContent || '');
    const heading = headingSubject(root);
    if (heading) text = text.split(heading).join(' ');
    text = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    return text ? hashText(text) : '';
  }

  // A message id in the address is the open mail. The subject heading is
  // not part of that token: editing the subject is not a mail switch, on a
  // message address, a conversation address, or a pane with no id.
  function openMailTokenNow() {
    let href = '';
    try { href = location.href; } catch (e) { href = ''; }
    const ids = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.urlIds) ? (FlowOwaParse.urlIds(href) || {}) : {};
    if (ids.kind === 'message' && ids.itemId) return 'msg|' + String(ids.itemId);
    const root = openMailRoot();
    const mark = openMailBodyMark(root);
    if (ids.kind === 'conversation' && (ids.conversationId || ids.raw)) {
      return 'conv|' + String(ids.conversationId || ids.raw) + (mark ? '|' + mark : '');
    }
    if (!root && !mark && !ids.raw) return '';
    return 'pane|' + String(ids.raw || '') + (mark ? '|' + mark : '');
  }

  function clearOpenCards() {
    const scope = readingScope(null);
    if (scope && scope.querySelectorAll) scope.querySelectorAll('.flow-chip-host').forEach((el) => el.remove());
    lastKey = '';
  }

  function openTokenKey(token) {
    const t = String(token || '');
    if (t.indexOf('msg|') === 0) return t.slice(4).split('|')[0];
    if (t.indexOf('conv|') === 0) return t.slice(5).split('|')[0];
    return '';
  }

  // Drop this tab's why when the mail it left is the one stored. Another
  // tab's why stays. An empty write never replaces a different conversation.
  function releaseStoredWhy(token) {
    const mine = openTokenKey(token);
    if (!mine) return;
    try {
      chrome.storage.local.get({ glanceWhyCurrent: null, glanceWhyByConv: {} }, (bag) => {
        const map = Object.assign({}, (bag && bag.glanceWhyByConv) || {});
        if (map[mine]) delete map[mine];
        const current = bag && bag.glanceWhyCurrent;
        const curKey = current && String(current.conversationId || current.messageId || '');
        const patch = { glanceWhyByConv: map };
        if (!current || !curKey || curKey === mine) patch.glanceWhyCurrent = null;
        try { chrome.storage.local.set(patch); } catch (e) { /* storage gone */ }
      });
    } catch (e) { /* storage gone */ }
  }

  function bumpMailEpoch(why, keepCard, leftToken) {
    mailEpoch += 1;
    if (!keepCard) {
      clearOpenCards();
      lastOutcome = '';
      try { clearWhyNot(mountPoint()); } catch (e) { /* no pane */ }
      if (leftToken) releaseStoredWhy(leftToken);
    }
    lastSig = '';
    try { console.info('Glance: stale card cleared', why || '', String(mailEpoch)); } catch (e) { /* console gone */ }
    return mailEpoch;
  }

  function urlMessageId() {
    try {
      const ids = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.urlIds) ? (FlowOwaParse.urlIds(location.href) || {}) : {};
      return ids.kind === 'message' && ids.itemId ? String(ids.itemId) : '';
    } catch (e) { return ''; }
  }

  function noteOpenMail() {
    const token = openMailTokenNow();
    if (!token || token === '|||') return false;
    if (!openMailToken) { openMailToken = token; return false; }
    if (token === openMailToken) return false;
    const left = openMailToken;
    openMailToken = token;
    switchPending = true;
    markMailOpened();
    bumpMailEpoch('open-mail', false, left);
    return true;
  }

  function armRender() {
    noteOpenMail();
    renderEpoch = mailEpoch;
    scanMessageId = urlMessageId();
    return renderEpoch;
  }

  function renderLive() {
    if (renderEpoch !== mailEpoch) return false;
    if (scanMessageId) {
      const now = urlMessageId();
      if (now && now !== scanMessageId) return false;
    }
    return true;
  }

  // The open mail this scan started on. mailEpoch and the live pane mark are
  // read here, once, before an await. renderEpoch and scanMessageId are not:
  // the next scan writes those, so a late read of them looks like the new mail.
  function mailGeneration() {
    let token = '';
    let pane = '';
    try { token = openMailTokenNow() || ''; } catch (e) { token = ''; }
    try { pane = readingPaneSignal() || ''; } catch (e) { pane = ''; }
    return { epoch: mailEpoch, conv: token + '|' + pane };
  }

  function mailStill(gen) {
    if (!gen) return false;
    if (gen.epoch !== mailEpoch) return false;
    let token = '';
    let pane = '';
    try { token = openMailTokenNow() || ''; } catch (e) { token = ''; }
    try { pane = readingPaneSignal() || ''; } catch (e) { pane = ''; }
    return gen.conv === token + '|' + pane;
  }

  // The open mail, read now from the address and the reading pane.
  // renderEpoch and scanMessageId are not read: the next scan writes those.
  function readLiveMail() {
    let href = '';
    try { href = location.href || ''; } catch (e) { href = ''; }
    const ids = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.urlIds) ? (FlowOwaParse.urlIds(href) || {}) : {};
    let messageId = (ids.kind === 'message' && ids.itemId) ? String(ids.itemId) : '';
    let convId = ids.conversationId ? String(ids.conversationId) : '';
    if (!convId) {
      try {
        const node = document.querySelector('#ReadingPaneContainerId [id^="CONV_"][id$="_SUBJECT"]')
          || document.querySelector('[role="main"] [id^="CONV_"][id$="_SUBJECT"]');
        convId = node && node.id ? String(node.id) : '';
      } catch (e) { convId = ''; }
    }
    let doc = '';
    try {
      const root = openMailRoot();
      const body = root && root.querySelector ? (root.querySelector('div[role="document"]') || root.querySelector('[role="document"]')) : null;
      doc = body ? hashText(readingText(body).replace(/\s+/g, ' ').trim().slice(0, 240)) : '';
    } catch (e) { doc = ''; }
    if (!messageId && ids.raw && ids.kind !== 'conversation') messageId = String(ids.raw);
    return { epoch: mailEpoch, convId: convId + '|' + doc, messageId: messageId };
  }

  function captureMailToken() {
    const live = readLiveMail();
    return { epoch: live.epoch, convId: live.convId, messageId: live.messageId };
  }

  function mailTokenLive(token) {
    if (!token) return false;
    const live = readLiveMail();
    return token.epoch === live.epoch && token.convId === live.convId && token.messageId === live.messageId;
  }

  // One door for every card mutation. The token is the mail this scan,
  // mail-open, or click started on. The check reads the pane and the URL again.
  let paintDepth = 0;
  function whyNotText(reason) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.whyNotShownLine === 'function') {
      return FlowDisplay.whyNotShownLine(reason, pageUiLang());
    }
    return 'לא זוהתה בקשה';
  }

  // Painted when chrome.runtime.id disappears. No chrome.* call: the dead
  // script can still touch the page. רענן reloads only after a click.
  function paintRefreshAsk() {
    let slot = null;
    try { slot = mountPoint(); } catch (e) { slot = null; }
    if (!slot) {
      try { slot = document.querySelector('#ReadingPaneContainerId') || document.body; } catch (e2) { slot = null; }
    }
    if (!slot || typeof slot.appendChild !== 'function') return null;
    let line = null;
    try { line = slot.querySelector('.flow-why-not') || slot.querySelector('[data-glance-refresh]'); } catch (e) { line = null; }
    if (!line) {
      line = document.createElement('p');
      line.className = 'flow-why-not';
      if (slot.firstChild) slot.insertBefore(line, slot.firstChild);
      else slot.appendChild(line);
    }
    line.className = 'flow-why-not';
    line.setAttribute('data-glance-why', 'context-dead');
    line.setAttribute('data-glance-refresh', '1');
    while (line.firstChild) line.removeChild(line.firstChild);
    const text = document.createElement('span');
    text.textContent = 'Glance התעדכן — רענן את הדף כדי להתחבר מחדש';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flow-chip-consent-btn capture-secondary';
    btn.setAttribute('data-glance-refresh-btn', '1');
    btn.textContent = 'רענן';
    btn.addEventListener('click', function () {
      try { globalThis.__glanceReloaded = (globalThis.__glanceReloaded || 0) + 1; } catch (e) { /* count is only for the page */ }
      try { location.reload(); } catch (e) { /* the browser refresh is still there */ }
    });
    line.appendChild(text);
    line.appendChild(btn);
    return line;
  }

  function paintWhyNot(slot, reason) {
    if (paintDepth <= 0 || !slot) return null;
    if (slot.querySelector && slot.querySelector('.flow-chip-host')) return null;
    let line = slot.querySelector ? slot.querySelector('.flow-why-not') : null;
    if (!line) {
      line = document.createElement('p');
      line.className = 'flow-why-not';
      if (slot.firstChild) slot.insertBefore(line, slot.firstChild);
      else slot.appendChild(line);
    }
    line.textContent = whyNotText(reason);
    line.setAttribute('data-glance-why', reason || 'quiet');
    return line;
  }

  function clearWhyNot(slot) {
    if (!slot || !slot.querySelectorAll) return;
    const nodes = slot.querySelectorAll('.flow-why-not');
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].getAttribute && nodes[i].getAttribute('data-glance-refresh') === '1') continue;
      try { nodes[i].remove(); } catch (e) { /* already gone */ }
    }
  }

  function paintIfCurrent(token, fn) {
    if (!mailTokenLive(token) || typeof fn !== 'function') return null;
    paintDepth += 1;
    try {
      try { clearWhyNot(mountPoint()); } catch (e) { /* the pane is gone */ }
      return fn();
    } finally { paintDepth -= 1; }
  }

  function paintIfHeldDraft(token, pane, draft, fn) {
    if (typeof fn !== 'function') return null;
    const live = captureMailToken();
    if (!live || live.epoch !== mailEpoch) return null;
    const held = draft && draftMatchesPane(draft, pane);
    if (!held && !mailTokenLive(token || live)) return null;
    paintDepth += 1;
    try {
      try { clearWhyNot(mountPoint()); } catch (e) { /* the pane is gone */ }
      return fn();
    } finally { paintDepth -= 1; }
  }

  function bindMailToken(pane, token) {
    if (pane) pane.__mailToken = token;
    return token;
  }

  // The card records the open mail it was painted for. No token on the
  // card, or no open mail now, never executes. A different token is a
  // click meant for a mail that is no longer open.
  function ignoreStaleClick(host) {
    const bound = host && host.getAttribute && host.getAttribute('data-glance-open');
    const now = openMailTokenNow();
    const tokenOk = Boolean(bound) && !tokenMissing(now) && bound === now;
    const epoch = host && host.getAttribute && host.getAttribute('data-glance-epoch');
    const epochOk = epoch != null && String(epoch) === String(mailEpoch);
    const hash = host && host.getAttribute && host.getAttribute('data-glance-card');
    const id = host && host.getAttribute && host.getAttribute('data-glance-decision');
    const record = decisionFor(id);
    const hashOk = Boolean(record) && record.verdict === 'show' && record.cardHash != null && hash === record.cardHash;
    if (tokenOk && epochOk && hashOk) return false;
    try {
      console.info(bound ? 'Glance: stale card click ignored' : 'Glance: card with no open-mail token ignored', bound || '');
    } catch (e) { /* console gone */ }
    return true;
  }

  function stampCard(host, ctx, reason) {
    if (!host) return null;
    const chain = String((ctx && ctx.glanceChain) || (host.getAttribute && host.getAttribute('data-glance-chain')) || '');
    if (chain) host.setAttribute('data-glance-chain', chain);
    const id = decisionIdFrom(ctx);
    if (!id) return null;
    const cardHash = hashText(cardCanonical(Object.assign({}, ctx, { glanceChain: chain })));
    const token = openMailTokenNow();
    if (token && !tokenMissing(token)) host.setAttribute('data-glance-open', token);
    host.setAttribute('data-glance-epoch', String(mailEpoch));
    host.setAttribute('data-glance-decision', id);
    host.setAttribute('data-glance-card', cardHash);
    const record = {
      id: id,
      epoch: mailEpoch,
      source: 'page',
      verdict: 'show',
      reason: reason || (ctx && ctx.decisionReason) || 'shown',
      cardHash: cardHash,
      hydrateHow: (ctx && ctx.hydrateHow) || null,
      priorConversationId: (ctx && ctx.priorConversationId) || null,
      subject: (ctx && ctx.subject) || '',
      conversationId: (ctx && ctx.conversationId) || null,
      messageId: (ctx && (ctx.itemId || ctx.messageId)) || null
    };
    rememberDecision(record);
    return record;
  }

  function guardedUndo(host, fn) {
    return async function () {
      if (ignoreStaleClick(host)) return { ok: false };
      return fn();
    };
  }

  function injectCard(mount, ctx, handlers) {
    if (paintDepth <= 0) return null;
    clearWhyNot(mount);
    noteOpenMail();
    if (ctx && typeof ctx.__epoch === 'number' && ctx.__epoch !== mailEpoch) return null;
    if (ctx) ctx.uiLang = pageUiLang();
    const src = handlers || {};
    const host = FlowChipHost.inject(mount, ctx, {
      onDoIt: src.onDoIt,
      onDismiss: src.onDismiss,
      onHold: function (held) {
        if (ignoreStaleClick(held)) return false;
        onMeetingHold(held, ctx);
        return true;
      }
    });
    if (host) stampCard(host, ctx, (ctx && ctx.decisionReason) || 'shown');
    return host;
  }

  // The subject header stays on screen when the open message changes.
  // A receipt belongs to the message that wrote it.
  function clearForeignHosts(pane) {
    const ids = messageIdsOf(pane);
    const key = ids.join('|') || ((location && location.pathname) || '');
    const changed = key !== lastPaneKey;
    lastPaneKey = key;
    if (!changed) return;
    const scope = readingScope(null);
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('.flow-chip-host').forEach((el) => {
      if (!hostMatches(el, ids)) el.remove();
    });
  }

  function logHasActiveDraftForMessageId(log, messageId) {
    if (!messageId) return false;
    return (log || []).some((e) => e && e.kind === 'written' && !e.undone && e.connectorId === 'outlookDraft' && String(e.messageId) === String(messageId));
  }

  function paintOutlookTodoReceipt(mount, row) {
    if (paintDepth <= 0) return null;
    const rowMid = row && (row.messageId || row.itemId);
    if (logHasActiveDraftForMessageId(scanLogSnap, rowMid)) return null;
    clearWhyNot(mount);
    noteOpenMail();
    const copy = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.remountCopy)
      ? FlowProofOfClose.remountCopy(row)
      : null;
    if (!mount || !copy) return null;
    const keptSnap = (row.ref && typeof row.ref === 'object' && row.ref.created) || row.created || null;
    if (keptSnap && typeof keptSnap === 'object' && copy.ref) copy.ref.created = keptSnap;
    const deleted = copy.deleted === true || row.glanceDeleted === true || row.deleted === true;
    const deletedLine = copy.deletedLine || row.deletedLine || (deleted ? copy.status : '');
    const undoLine = deleted ? '' : (copy.undoLine || row.undoLine || '');
    const verifyNote = deleted ? '' : (copy.verifyNote || row.verifyNote || '');
    const legacyKeys = row.legacyCase === true
      ? [].concat(row.ids || [], [row.itemId, row.pathId, row.threadId, row.outlookConversationId]).filter(Boolean).map(String)
      : [];
    const ids = [row.messageId, row.itemId, row.pathId, row.threadId, row.outlookConversationId].concat(legacyKeys).filter(Boolean).map(String);
    const scope = (typeof readingScope === 'function' && readingScope(mount)) || mount;
    const hosts = scope.querySelectorAll ? Array.prototype.slice.call(scope.querySelectorAll('.flow-chip-host')) : [];
    let host = hosts.filter((h) => h.getAttribute('data-glance-undone') !== '1').pop() || null;
    if (host && host.classList.contains('flow-chip-settled') && host.getAttribute('data-glance-chain') === 'task-proof' && (!ids.length || hostMatches(host, ids))) {
      const shown = String(host.textContent || '');
      const sameDeleted = deleted && deletedLine && shown.indexOf(pageShow(deletedLine)) >= 0 && !host.querySelector('.flow-chip-undo');
      const sameRefusal = !deleted && undoLine && shown.indexOf(undoLine) >= 0;
      const sameVerify = !verifyNote || shown.indexOf(verifyNote) >= 0;
      if (!deleted && !undoLine && !verifyNote && shown.indexOf('You edited this') < 0 && shown.indexOf("couldn't verify") < 0 && shown.indexOf('Deleted in ') < 0) {
        hosts.forEach((other) => { if (other !== host) other.remove(); });
        return host;
      }
      if ((sameDeleted || sameRefusal) && sameVerify) {
        hosts.forEach((other) => { if (other !== host) other.remove(); });
        return host;
      }
    }
    const el = FlowChipHost.el;
    if (!host) {
      host = el('div', 'flow-chip-host');
      if (mount.firstChild) mount.insertBefore(host, mount.firstChild);
      else mount.appendChild(host);
    }
    const manuals = host.__glanceSteps && host.__glanceSteps.manualCount ? host.__glanceSteps.manualCount() : 0;
    const stateTrail = host.querySelector && host.querySelector('.flow-step-list')
      ? host.querySelector('.flow-step-list').getAttribute('data-glance-states')
      : '';
    host.className = 'flow-chip-host flow-chip-settled';
    host.setAttribute('dir', 'ltr');
    host.setAttribute('data-glance-chain', 'task-proof');
    host.setAttribute('data-glance-message', ids.join('|'));
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    done.appendChild(el('span', 'flow-chip-handled', pageShow(deleted ? deletedLine : copy.status)));
    if (!deleted && copy.writtenLine) done.appendChild(el('span', 'flow-chip-written', pageShow(copy.writtenLine)));
    if (verifyNote) done.appendChild(el('span', 'flow-chip-label', pageShow(verifyNote)));
    if (copy.processName || copy.closedLine) {
      const detail = el('span', 'flow-chip-detail');
      if (copy.processName) detail.appendChild(el('span', 'flow-chip-process-name', pageShow(copy.processName)));
      if (copy.closedLine) detail.appendChild(el('span', 'flow-chip-label', pageShow(copy.closedLine)));
      done.appendChild(detail);
    }
    const chromeWords = pageChrome();
    const undo = el('button', 'flow-chip-undo', undoLine ? chromeWords.undo : (pageShow(copy.undoHint) || chromeWords.undo));
    undo.type = 'button';
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = !undoLine;
    if (undoLine) hint.textContent = pageShow(undoLine);
    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    if (copy.url) {
      const view = el('a', 'flow-chip-link', chromeWords.view);
      view.href = copy.url;
      view.target = '_blank';
      view.rel = 'noopener';
      actionsRow.appendChild(view);
    }
    stampCard(host, {
      messageId: row.messageId || '',
      itemId: row.itemId || row.messageId || legacyKeys[0] || '',
      pathId: row.pathId || '',
      conversationId: row.outlookConversationId || row.threadId || '',
      subject: row.subject || '',
      intent: { label: (copy && copy.status) || 'Handled' },
      process: { id: 'task-proof', steps: [] },
      glanceChain: 'task-proof',
      decisionReason: 'page:receipt-mounted'
    }, 'page:receipt-mounted');
    undo.addEventListener('click', () => {
      if (row.legacyCase === true) {
        hint.hidden = false;
        hint.textContent = pageChrome().couldntPlain;
        hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
        return;
      }
      if (ignoreStaleClick(host)) return;
      undo.textContent = pageChrome().undoing;
      undo.disabled = true;
      const sent = send({
        type: 'flow:undo-action',
        connectorId: copy.connectorId,
        ref: copy.ref,
        created: (copy.ref && copy.ref.created) || null
      });
      readBackOrTimeout(sent).then(async function applyUndo(result) {
        const todoUndo = copy.connectorId === 'outlookTask' || copy.connectorId === 'microsoftTodo' || copy.system === 'microsoft/todo';
        // The 8s clock can fire after Graph already deleted the row. Keep
        // the late success so Activity does not stay Handled.
        if (result && result.reason === 'verify-timeout' && !applyUndo.late) {
          sent.then((late) => {
            if (!late || !late.ok || late.reason === 'verify-timeout') return;
            if (todoUndo && late.fetchedBack !== true) return;
            applyUndo.late = true;
            return applyUndo(late);
          }).catch(() => {});
        }
        if (result && (result.reason === 'verify-timeout' || result.reason === 'user-edited' || result.reason === 'unconfirmed')) {
          undo.textContent = pageChrome().undo;
          undo.disabled = false;
          hint.hidden = false;
          hint.textContent = pageShow(result.written) || (result.reason === 'user-edited' ? pageChrome().youEdited : (result.reason === 'unconfirmed' ? pageChrome().couldntUnchanged : pageChrome().couldntVerify));
          hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
          if (result.reason === 'user-edited' && row.messageId && typeof FlowStorage.patchGlanceProof === 'function') {
            const refused = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.noteUndoRefused)
              ? FlowProofOfClose.noteUndoRefused({ messageId: row.messageId }, hint.textContent)
              : { undoRefused: 'user-edited', undoLine: hint.textContent };
            await FlowStorage.patchGlanceProof(row.messageId, { undoRefused: refused.undoRefused, undoLine: refused.undoLine });
          }
          return;
        }
        if (!(result && result.ok) || (todoUndo && result.fetchedBack !== true)) {
          undo.textContent = pageShow(copy.undoHint) || pageChrome().undo;
          undo.disabled = false;
          hint.hidden = false;
          hint.textContent = pageShow(copy.undoFailed) || pageChrome().stillThere;
          hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
          return;
        }
        // A scan that already read the Handled log must not paint it again
        // after Undo. The Undone line stays on this mail.
        bumpMailEpoch('undo', true);
        const messageId = row.messageId;
        const threadKey = row.threadId || row.outlookConversationId;
        if ((copy.connectorId === 'onedriveFile' || copy.connectorId === 'attachmentSave') && typeof FlowStorage.markOnedriveFileUndone === 'function') {
          await withActivityLogLock(() => FlowStorage.markOnedriveFileUndone(messageId, copy.ref, threadKey));
        } else if (typeof FlowStorage.markMicrosoftTodoUndone === 'function') {
          await withActivityLogLock(() => FlowStorage.markMicrosoftTodoUndone(messageId, copy.ref, threadKey));
          await reopenTaskScan(row);
          if (messageId) await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: messageId });
          try { host.remove(); } catch (e) { /* already gone */ }
          lastKey = '';
          lastSig = '';
          lastOutcome = '';
          schedule();
          return;
        }
        const undoneIds = [row.messageId, row.itemId, row.pathId, row.threadId, row.outlookConversationId].filter(Boolean);
        host.setAttribute('data-glance-undone', '1');
        if (undoneIds.length) host.setAttribute('data-glance-message', undoneIds.join('|'));
        done.replaceChildren(el('span', 'flow-chip-label', pageShow(copy.undoneLine)));
        rememberUndone(undoneIds, copy.undoneLine);
        lastOutcome = 'card';
        lastKey = (row.messageId || 'open') + '|undone';
        lastSig = '';
      });
    });
    if (!deleted) done.appendChild(actionsRow);
    done.appendChild(hint);
    if (manuals) {
      const tpl = manuals === 1 ? (chromeWords.manualOne || '{n} manual step left for you') : (chromeWords.manualMany || '{n} manual steps left for you');
      const left = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.fillChrome === 'function')
        ? FlowDisplay.fillChrome(tpl, { n: manuals })
        : (manuals + (manuals === 1 ? ' manual step left for you' : ' manual steps left for you'));
      done.appendChild(el('span', 'flow-chip-label', left));
    }
    host.__glanceSteps = null;
    host.replaceChildren(done);
    if (stateTrail) host.setAttribute('data-glance-states', stateTrail);
    if (scope.querySelectorAll) {
      Array.prototype.slice.call(scope.querySelectorAll('.flow-chip-host')).forEach((other) => {
        if (other !== host) other.remove();
      });
    }
    lastOutcome = 'card';
    lastKey = (row.messageId || 'open') + '|task-proof';
    return host;
  }

  function rememberUndone(ids, line) {
    const keys = (ids || []).filter(Boolean).map(String);
    if (!keys.length || !line) return;
    storageGet({ [UNDONE_KEY]: {} }, (bag) => {
      if (!guardContext()) return;
      const map = Object.assign({}, (bag && bag[UNDONE_KEY]) || {});
      const at = Date.now();
      keys.forEach((id) => { map[id] = { line: line, ids: keys, at: at }; });
      try { chrome.storage.local.set({ [UNDONE_KEY]: map }); }
      catch (e) { if (invalidatedMessage(e) || !runtimeAlive()) stopQuietly(); }
    });
  }

  async function undoneBannerFor(pane) {
    const ids = messageIdsOf(pane);
    if (!ids.length) return null;
    const bag = await new Promise((resolve) => storageGet({ [UNDONE_KEY]: {} }, resolve));
    const map = (bag && bag[UNDONE_KEY]) || {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      if (idListed(keys[i], ids) && map[keys[i]] && map[keys[i]].line) return map[keys[i]];
    }
    return null;
  }

  function paintUndoneStatus(mount, pane, line) {
    if (paintDepth <= 0) return null;
    noteOpenMail();
    const ids = messageIdsOf(pane);
    const existing = stripDuplicateUndoHosts(mount);
    if (existing && existing.getAttribute('data-glance-undone') === '1' && hostMatches(existing, ids)) {
      lastOutcome = 'card';
      return existing;
    }
    if (existing) existing.remove();
    const el = FlowChipHost.el;
    const host = el('div', 'flow-chip-host flow-chip-settled');
    host.setAttribute('dir', 'ltr');
    host.setAttribute('data-glance-chain', 'task-proof');
    host.setAttribute('data-glance-undone', '1');
    host.setAttribute('data-glance-message', ids.join('|'));
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    done.appendChild(el('span', 'flow-chip-label', pageShow(line)));
    host.appendChild(done);
    if (mount.firstChild) mount.insertBefore(host, mount.firstChild);
    else mount.appendChild(host);
    stripDuplicateUndoHosts(mount);
    stampCard(host, {
      messageId: (pane && (pane.itemId || pane.conversationId)) || '',
      itemId: pane && pane.itemId,
      conversationId: pane && pane.conversationId,
      subject: pane && pane.subject,
      hydrateHow: pane && pane.hydrateHow,
      priorConversationId: pane && pane.priorConversationId,
      intent: { label: line || 'Undone' },
      process: { id: 'task-proof', steps: [] },
      glanceChain: 'task-proof',
      decisionReason: 'page:still-open'
    }, 'page:still-open');
    lastOutcome = 'card';
    return host;
  }

  function paneIdList(pane) {
    const raw = [pane && pane.messageId, pane && pane.itemId, pane && pane.pathId, pane && pane.conversationId];
    try {
      const href = typeof location !== 'undefined' ? String(location.href || '') : '';
      const m = /\/id\/([^?/#]+)/.exec(href);
      if (m) raw.push(decodeURIComponent(m[1]));
    } catch (e) { /* href unreadable */ }
    const out = [];
    raw.filter(Boolean).forEach((id) => {
      const spells = typeof idSpellings === 'function' ? idSpellings(id) : [String(id)];
      spells.forEach((s) => {
        if (!s) return;
        out.push(String(s));
        if (typeof FlowOwaParse !== 'undefined') {
          const c = FlowOwaParse.canonId(s);
          if (c) out.push(c);
        }
      });
    });
    return out;
  }

  function draftRowIdList(row) {
    const raw = [row.messageId, row.outlookIncomingId, row.itemId, row.pathId, row.threadId, row.outlookConversationId];
    const out = [];
    raw.filter(Boolean).forEach((id) => {
      const spells = typeof idSpellings === 'function' ? idSpellings(id) : [String(id)];
      spells.forEach((s) => {
        if (!s) return;
        out.push(String(s));
        if (typeof FlowOwaParse !== 'undefined') {
          const c = FlowOwaParse.canonId(s);
          if (c) out.push(c);
        }
      });
    });
    return out;
  }

  function draftMatchesPane(row, pane) {
    if (!row || row.connectorId !== 'outlookDraft') return false;
    const want = paneIdList(pane);
    const have = draftRowIdList(row);
    if (!want.length || !have.length) return false;
    return want.some((w) => have.some((h) => sameExchangeId(w, h)));
  }

  function activeOutlookDraftRowInLog(log, pane) {
    const activeDrafts = (log || []).filter((e) => e && e.kind === 'written' && !e.undone && e.connectorId === 'outlookDraft');
    const matched = activeDrafts.filter((e) => draftMatchesPane(e, pane));
    if (matched.length) return matched[matched.length - 1];
    return null;
  }

  async function activeOutlookDraftForPane(pane) {
    if (!pane || typeof FlowStorage.get !== 'function') return null;
    let bag = null;
    try { bag = await FlowStorage.get(); } catch (e) { return null; }
    return activeOutlookDraftRowInLog(bag && bag.log, pane);
  }

  async function pairedOutlookTaskRow(draft) {
    if (!draft || !draft.messageId || typeof FlowStorage.get !== 'function') return null;
    let bag = null;
    try { bag = await FlowStorage.get(); } catch (e) { return null; }
    const log = (bag && bag.log) || [];
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (!e || e.kind !== 'written' || e.undone) continue;
      if (e.connectorId !== 'outlookTask' && e.connectorId !== 'microsoftTodo' && e.system !== 'microsoft/todo') continue;
      if (String(e.messageId) !== String(draft.messageId)) continue;
      return e;
    }
    return null;
  }

  // The open page already showed Draft ready. Keep that receipt, with Undo,
  // until the draft is undone. A reload mounts the same receipt from the log.
  async function keepActiveDraftReceipt(pane) {
    if (!pane || typeof FlowStorage.getActiveOutlookReceipts !== 'function') return false;
    const receipts = await FlowStorage.getActiveOutlookReceipts();
    const draft = (receipts || []).filter((r) => draftMatchesPane(r, pane)).pop();
    if (!draft) return false;
    if (pane) pane.__epoch = mailEpoch;
    const token = captureMailToken();
    bindMailToken(pane, token);
    if (!paneCurrent(pane)) return false;
    const mount = mountPoint();
    if (!mount) return false;
    const settled = mount.querySelector('.flow-chip-host.flow-chip-settled');
    if (settled && settled.querySelector('.flow-chip-undo')) {
      lastOutcome = 'card';
      return true;
    }
    const old = mount.querySelector('.flow-chip-host');
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    const host = paintIfCurrent(token, function () { return injectCard(mount, stampEpoch({
      process: { name: 'Reply', steps: [] },
      intent: { label: draft.label || 'Reply draft ready' },
      messageId: draft.messageId
    }, pane), { onDoIt: () => {}, onDismiss: (h) => { if (ignoreStaleClick(h)) return; const clickToken = captureMailToken(); paintIfCurrent(clickToken, function () { paintRemove(h); }); } }); });
    if (!host) return false;
    lastOutcome = 'card';
    const pairedTask = await pairedOutlookTaskRow(draft);
    const draftWritten = draft.writtenLine || draft.label || 'Reply draft ready in Outlook Drafts. Not sent.';
    const taskLine = pairedTask && (pairedTask.writtenLine || pairedTask.label);
    const receiptWritten = taskLine ? (draftWritten + '\n' + taskLine) : draftWritten;
    paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
      status: draftUnverifiedStatus(draftWritten),
      written: receiptWritten,
      url: draft.url || draft.where,
      onUndo: guardedUndo(host, async () => {
        const undoToken = captureMailToken();
        if (pairedTask && pairedTask.ref) {
          const tu = await send({ type: 'flow:undo-action', connectorId: 'outlookTask', ref: pairedTask.ref, created: pairedTask.created });
          if (!(tu && tu.ok)) return { ok: false, written: (tu && tu.written) || pageChrome().stillThere };
          if (typeof FlowStorage.markMicrosoftTodoUndone === 'function') {
            await FlowStorage.markMicrosoftTodoUndone(draft.messageId, pairedTask.ref, draft.threadId || draft.outlookConversationId);
          }
        }
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: draft.ref, created: draft.created });
        if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed')) return { ok: false, reason: u.reason, written: u.written };
        if (u && u.ok && typeof FlowStorage.markOutlookDraftUndone === 'function') {
          await FlowStorage.markOutlookDraftUndone(draft.messageId, draft.ref);
        }
        if (u && u.ok) await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: draft.messageId, draftOnly: true });
        if (!(u && u.ok)) return { ok: false, written: (u && u.written) || 'Could not remove the draft.' };
        lastKey = '';
        lastSig = '';
        paintIfCurrent(undoToken, function () { paintRemove(host); });
        schedule();
        return { ok: true, written: u.written || 'Reply draft removed. Not sent.', reopen: true };
      })
    }); });
    return true;
  }

  function proofIdsForPane(pane, extra) {
    const ids = [pane && pane.itemId, pane && pane.pathId, pane && pane.conversationId];
    (extra || []).forEach((id) => ids.push(id));
    return ids.filter(Boolean);
  }

  async function reconcileProofRecord(record) {
    // Undone is the person's own Undo. A Handled record, and a record already
    // marked deleted, are asked again on every open. A seen conversation is
    // not a reason to keep the cached Handled card.
    if (!record || record.undone === true) return record;
    let result = null;
    try {
      result = await send({
        type: 'flow:reconcile-proof',
        system: record.system,
        connectorId: record.connectorId,
        externalId: record.externalId,
        ref: record.ref,
        objectName: record.objectName
      });
    } catch (e) {
      result = { ok: false, status: 0 };
    }
    if (!result) result = { ok: false, status: 0 };
    const next = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.noteReconcile)
      ? FlowProofOfClose.noteReconcile(record, result)
      : record;
    if (next && record.messageId && typeof FlowStorage.patchGlanceProof === 'function') {
      const changed = next.deleted !== record.deleted || next.verifyNote !== record.verifyNote || next.deletedLine !== record.deletedLine;
      if (changed) {
        try { await FlowStorage.patchGlanceProof(record.messageId, next); } catch (e) { /* the card still shows this read */ }
      }
    }
    return next || record;
  }

  async function paintSharedProof(mount, record, token) {
    const live = await reconcileProofRecord(record);
    const row = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.proofAsLogRow)
      ? FlowProofOfClose.proofAsLogRow(live)
      : live;
    if (!row) return false;
    return Boolean(paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mount, row); }));
  }

  // Handled after a reload or a return to this thread. The match is the
  // Outlook item id, the path id, or the conversation id. A hash of the
  // pane text is not an id. The record is the same one Loops reads.
  async function remountProvedTodoReceipt(pane) {
    if (!pane || typeof FlowProofOfClose === 'undefined' || typeof FlowProofOfClose.taskReceiptFromLog !== 'function') return false;
    const token = pane.__mailToken || null;
    const mount = mountPoint();
    if (!mount || !mailTokenLive(token)) return false;
    let bag = null;
    try { bag = await FlowStorage.get(); } catch (e) { return false; }
    const draftRow = activeOutlookDraftRowInLog(bag && bag.log, pane);
    if (draftRow) {
      if (await keepActiveDraftReceipt(pane)) return true;
      return false;
    }
    if (!mailTokenLive(token)) return false;
    if (typeof FlowProofOfClose !== 'undefined' && typeof FlowProofOfClose.proofForIds === 'function') {
      const shared = FlowProofOfClose.proofForIds(bag && bag.glanceProofs, proofIdsForPane(pane));
      if (shared && await paintSharedProof(mount, shared, token)) {
        lastOutcome = 'card';
        lastKey = (shared.messageId || 'open') + '|task-proof';
        return true;
      }
    }
    const log = (bag && bag.log) || [];
    const todoLog = log.filter((e) => outlookProofRow(e));
    let fileNames = (pane.attachments || []).map((a) => a && (a.name || a.filename)).filter(Boolean);
    if (typeof FlowProofOfClose.savedFileReceipt === 'function' && fileNames.length) {
      const provedFile = FlowProofOfClose.savedFileReceipt(todoLog, {
        messageIds: [pane.itemId, pane.pathId, pane.conversationId].concat(pane.graphMessageId ? [pane.graphMessageId] : []),
        fileNames: fileNames,
        subject: pane.subject || ''
      });
      if (provedFile && paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mount, provedFile); })) {
        lastOutcome = 'card';
        lastKey = (provedFile.messageId || 'open') + '|task-proof';
        return true;
      }
    }
    let graphId = '';
    try {
      const linked = await suggestFiles(pane);
      if (linked && linked.messageId && !linked.unresolved) {
        graphId = linked.messageId;
        if (!fileNames.length && Array.isArray(linked.files)) {
          fileNames = linked.files.map((a) => a && (a.name || a.filename)).filter(Boolean);
        }
      }
    } catch (e) { /* a miss stays on the ids the page already has */ }
    const rowQuery = {
      messageIds: [pane.itemId, pane.pathId, pane.conversationId],
      threadIds: [pane.conversationId],
      fileNames: fileNames
    };
    if (graphId) rowQuery.messageIds.push(graphId);
    if (graphId && typeof FlowProofOfClose.proofForIds === 'function') {
      const later = FlowProofOfClose.proofForIds(bag && bag.glanceProofs, proofIdsForPane(pane, [graphId]));
      if (later && await paintSharedProof(mount, later, token)) {
        lastOutcome = 'card';
        lastKey = (later.messageId || 'open') + '|task-proof';
        return true;
      }
    }
    let row = FlowProofOfClose.taskReceiptFromLog(todoLog, rowQuery);
    if (outlookProofRow(row) && typeof FlowStorage.rememberGlanceProof === 'function') {
      try { await FlowStorage.rememberGlanceProof(row); } catch (e) { /* the log row still paints */ }
    }
    if (outlookProofRow(row)) {
      row = await reconcileMountedRow(row);
      if (!mailTokenLive(token)) return false;
    }
    if (!mailTokenLive(token)) return false;
    const existing = paintIfCurrent(token, function () { return stripDuplicateUndoHosts(mount); });
    // An Undo line is not a close. data-glance-undone stays on the click,
    // then this scan drops it so exactly one Do It can return, including
    // after reload and for a banner stored by an earlier version.
    if (existing && existing.getAttribute('data-glance-undone') === '1') {
      paintIfCurrent(token, function () { paintRemove(existing); });
    }
    if (!outlookProofRow(row)) {
      if (existing && existing.isConnected) paintIfCurrent(token, function () { paintRemove(existing); });
      return false;
    }
    if (activeOutlookDraftRowInLog(bag && bag.log, pane)) {
      if (await keepActiveDraftReceipt(pane)) return true;
      return false;
    }
    if (existing && existing.classList.contains('flow-chip-settled') && row && row.deleted !== true && !row.verifyNote && !row.undoLine) {
      lastOutcome = 'card';
      lastKey = (row.messageId || 'open') + '|task-proof';
      return true;
    }
    return Boolean(paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mount, row); }));
  }

  // A log row is the same proof. Reconcile it on open, including when the
  // shared map was missed. 404/410 drops Undo. Any other miss keeps it.
  async function reconcileMountedRow(row) {
    if (!row) return row;
    const base = (typeof FlowProofOfClose.proofRecordFromRow === 'function' && FlowProofOfClose.proofRecordFromRow(row)) || {
      messageId: row.messageId,
      system: row.system || 'microsoft/todo',
      connectorId: row.connectorId || 'outlookTask',
      externalId: row.externalId || (row.ref && (row.ref.externalId || row.ref.taskId)) || '',
      ref: row.ref,
      objectName: row.objectName || 'To Do',
      deleted: row.deleted === true || row.glanceDeleted === true,
      undoLine: row.undoLine || null,
      undoRefused: row.undoRefused || null,
      verifyNote: row.verifyNote || null
    };
    const live = await reconcileProofRecord(base);
    const view = (live && typeof FlowProofOfClose.proofAsLogRow === 'function') ? FlowProofOfClose.proofAsLogRow(live) : null;
    return view ? Object.assign({}, row, view) : Object.assign({}, row, live || {});
  }

  function promiseItem(ctx, pane) {
    const body = (ctx && (ctx.bodyText || ctx.text)) || (pane && pane.text) || '';
    const sender = (ctx && ctx.sender) || (pane ? { name: pane.senderName, email: pane.senderEmail } : null);
    return {
      text: body,
      intent: ctx && ctx.intent,
      sender: sender,
      threadId: (ctx && (ctx.threadId || ctx.outlookConversationId || ctx.conversationId)) || (pane && pane.conversationId) || '',
      outlookConversationId: (ctx && (ctx.outlookConversationId || ctx.conversationId)) || (pane && pane.conversationId) || '',
      messageId: ctx && ctx.messageId
    };
  }

  async function reopenTaskScan(row) {
    if (!row || !row.messageId || !row.process || typeof FlowStorage.upsertStillOpenScan !== 'function') return;
    await FlowStorage.upsertStillOpenScan({
      messageId: row.messageId,
      threadId: row.threadId || row.outlookConversationId || null,
      outlookConversationId: row.outlookConversationId || null,
      threadUrl: row.threadUrl || null,
      app: row.app || 'outlook',
      ts: Date.now(),
      sender: row.sender || null,
      subject: row.subject || '',
      text: row.text || row.bodyText || '',
      intent: row.intent || null,
      process: row.process
    });
  }

  async function livePromiseProof(item, pane) {
    if (typeof FlowStillOpen === 'undefined' || typeof FlowStillOpen.activeProofFor !== 'function') return null;
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return null;
    let bag = null;
    try { bag = await FlowStorage.get(); } catch (e) { return null; }
    const log = (bag && bag.log) || [];
    const draftRow = pane ? activeOutlookDraftRowInLog(log, pane) : null;
    if (draftRow) return null;
    return FlowStillOpen.activeProofFor(log, item);
  }

  function readBackOrTimeout(promise) {
    const line = (typeof FlowReceipt !== 'undefined' && FlowReceipt.verifyTimeoutLine)
      ? FlowReceipt.verifyTimeoutLine()
      : "Couldn't verify, try again";
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, reason: 'verify-timeout', written: line });
      }, 8000);
      Promise.resolve(promise).then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, reason: 'verify-timeout', written: line });
      });
    });
  }

  function todoWriteFailureLine(r) {
    if (r && r.reason === 'tasks-not-granted') {
      if (typeof FlowReceipt !== 'undefined' && FlowReceipt.missingScopeLine) {
        return FlowReceipt.missingScopeLine('Tasks.ReadWrite', 'To Do');
      }
      return 'Tasks.ReadWrite לא כלול בכניסה. בהגדרות, סמן To Do.';
    }
    if (r && (r.reason === 'token-expired' || r.needsSignIn)) return 'Reconnect Outlook';
    return (r && (r.error || r.reason)) || 'Could not confirm the task';
  }

  async function onOutlookTodoDoIt(host, chip, ctx, taskStep, token) {
    const params = (taskStep && taskStep.params) || {};
    const live = await livePromiseProof(promiseItem(ctx));
    if (ignoreStaleClick(host)) return;
    if (live) {
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('verified');
      return;
    }
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('verifying');
    const r = await send({
      type: 'flow:execute-action',
      payload: {
        connectorId: 'outlookTask',
        params: params,
        label: artifactTitleFor(ctx, (ctx.intent && ctx.intent.label) || params.title || 'Task'),
        senderName: ctx.sender && ctx.sender.name,
        senderEmail: ctx.sender && ctx.sender.email,
        subject: ctx.subject || '',
        text: ctx.bodyText || '',
        threadUrl: ctx.threadUrl || null,
        facts: (ctx.intent && ctx.intent.facts) || null,
        entities: (ctx.intent && (ctx.intent.entities || ctx.intent.facts)) || null
      }
    });
    if (ignoreStaleClick(host)) return;
    const proved = typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.allowsHandled
      ? FlowProofOfClose.allowsHandled({ ok: !!(r && r.ok), proof: r && r.proof })
      : false;
    if (!proved) {
      if (r && r.ref && (r.ref.taskId || r.ref.externalId) && r.written === "Created, couldn't verify") {
        await commitProvedTodo(host, ctx, r, taskStep, false, token);
        return;
      }
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('failed');
      const why = todoWriteFailureLine(r);
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', why); });
      return;
    }
    await commitProvedTodo(host, ctx, r, taskStep, true, token);
  }

  async function commitProvedTodo(host, ctx, r, taskStep, proved, token) {
    const params = (taskStep && taskStep.params) || {};
    if (!proved) {
      const status = "Created, couldn't verify";
      const messageId = (ctx && ctx.messageId) || null;
      await FlowStorage.appendLog({
        kind: 'written',
        label: status,
        messageId: messageId,
        itemId: (ctx && ctx.itemId) || null,
        pathId: (ctx && ctx.pathId) || null,
        threadId: (ctx && (ctx.threadId || ctx.conversationId)) || null,
        outlookConversationId: (ctx && ctx.conversationId) || null,
        outlookIncomingId: (ctx && (ctx.outlookIncomingId || ctx.messageId)) || null,
        app: 'outlook',
        connectorId: 'outlookTask',
        ref: r.ref,
        created: (r.ref && r.ref.created) || null,
        where: r.where || null,
        url: r.url || null,
        fetchedBack: false,
        receiptStatus: status,
        intent: ctx && ctx.intent,
        process: ctx && ctx.process,
        sender: ctx && ctx.sender,
        subject: ctx && ctx.subject,
        text: ctx && ctx.bodyText
      });
      paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
        status: status,
        written: status,
        url: r.url || null,
        linkLabel: pageChrome().view,
        onUndo: () => send({
          type: 'flow:undo-action',
          connectorId: 'outlookTask',
          ref: r.ref,
          created: (r.ref && r.ref.created) || null
        })
      }); });
      return;
    }
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('verified');
    const status = pageChrome().handled;
    const fields = FlowProofOfClose.receiptLogFields
      ? FlowProofOfClose.receiptLogFields(r.proof, {
        writtenLine: r.written,
        processName: faceTitle(ctx),
        closedLine: ctx && ctx.process && ctx.process.closedLine,
        status: status,
        created: (r.ref && r.ref.created) || null
      })
      : null;
    const threadId = (ctx && (ctx.threadId || ctx.conversationId)) || null;
    const taskTitle = actionTitle({
      connectorId: 'outlookTask', process: ctx && ctx.process, intent: ctx && ctx.intent, text: ctx && ctx.bodyText,
      writtenLine: r.written, subject: ctx && ctx.subject, params: params
    });
    await FlowStorage.appendLog(Object.assign({
      kind: 'written',
      label: taskTitle,
      actionTitle: taskTitle,
      messageId: ctx && ctx.messageId,
      itemId: (ctx && ctx.itemId) || null,
      pathId: (ctx && ctx.pathId) || null,
      threadId: threadId,
      outlookConversationId: (ctx && ctx.conversationId) || null,
      outlookIncomingId: (ctx && (ctx.outlookIncomingId || ctx.messageId)) || null,
      app: 'outlook',
      connectorId: 'outlookTask',
      ref: r.ref,
      created: (r.ref && r.ref.created) || null,
      where: r.where,
      url: r.url || null,
      intent: ctx && ctx.intent,
      process: ctx && ctx.process,
      sender: ctx && ctx.sender,
      subject: ctx && ctx.subject,
      text: ctx && ctx.bodyText
    }, fields || {}));
    if (ctx && ctx.messageId) {
      await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
      await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
    }
    const mount = (host && host.parentElement) || mountPoint();
    const row = Object.assign({
      kind: 'written',
      messageId: ctx && ctx.messageId,
      itemId: (ctx && ctx.itemId) || null,
      pathId: (ctx && ctx.pathId) || null,
      threadId: threadId,
      outlookConversationId: (ctx && ctx.conversationId) || null,
      connectorId: 'outlookTask',
      ref: r.ref,
      created: (r.ref && r.ref.created) || null,
      url: r.url || null,
      system: 'microsoft/todo',
      externalId: r.proof && r.proof.externalId,
      verifiedAt: r.proof && r.proof.verifiedAt,
      fetchedBack: true,
      writtenLine: r.written,
      processName: faceTitle(ctx),
      closedLine: ctx && ctx.process && ctx.process.closedLine,
      receiptStatus: status,
      process: ctx && ctx.process,
      intent: ctx && ctx.intent,
      text: ctx && ctx.bodyText,
      sender: ctx && ctx.sender,
      subject: ctx && ctx.subject,
      app: 'outlook'
    }, fields || {});
    if (mount) paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mount, row); });
  }

  async function onOnedriveDoIt(host, chip, ctx, fileStep, token) {
    const params = (fileStep && fileStep.params) || {};
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('verifying');
    const r = await send({
      type: 'flow:execute-action',
      payload: {
        connectorId: 'onedriveFile',
        params: params,
        label: (ctx.intent && ctx.intent.label) || 'File',
        senderName: ctx.sender && ctx.sender.name,
        senderEmail: ctx.sender && ctx.sender.email,
        subject: ctx.subject || '',
        text: ctx.bodyText || '',
        threadUrl: ctx.threadUrl || null,
        outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
        messageId: ctx.messageId,
        facts: (ctx.intent && ctx.intent.facts) || null,
        entities: (ctx.intent && (ctx.intent.entities || ctx.intent.facts)) || null
      }
    });
    const proved = typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.allowsHandled
      ? FlowProofOfClose.allowsHandled({ ok: !!(r && r.ok), proof: r && r.proof })
      : false;
    if (!proved) {
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('failed');
      const why = (r && r.reason === 'files-not-granted')
        ? 'Reconnect Outlook to allow OneDrive'
        : ((r && (r.error || r.reason)) || 'Could not confirm the file');
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', why); });
      return;
    }
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('verified');
    const status = pageChrome().handled;
    const fields = FlowProofOfClose.receiptLogFields
      ? FlowProofOfClose.receiptLogFields(r.proof, {
        writtenLine: r.written,
        processName: faceTitle(ctx),
        closedLine: ctx.process && ctx.process.closedLine,
        status: status
      })
      : null;
    const threadId = ctx.threadId || ctx.conversationId || null;
    const fileTitle = actionTitle({
      connectorId: 'onedriveFile', process: ctx.process, intent: ctx.intent, text: ctx.bodyText,
      writtenLine: r.written, subject: ctx.subject, params: params
    });
    await FlowStorage.appendLog(Object.assign({
      kind: 'written',
      label: fileTitle,
      actionTitle: fileTitle,
      messageId: ctx.messageId,
      itemId: ctx.itemId || null,
      pathId: ctx.pathId || null,
      threadId: threadId,
      outlookConversationId: ctx.conversationId || null,
      outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
      app: 'outlook',
      connectorId: 'onedriveFile',
      ref: r.ref,
      where: r.where,
      url: r.url || null,
      intent: ctx.intent,
      process: ctx.process,
      sender: ctx.sender,
      subject: ctx.subject,
      text: ctx.bodyText
    }, fields || {}));
    if (ctx.messageId) {
      await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
      await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
    }
    const mount = host.parentElement || mountPoint();
    const row = Object.assign({
      kind: 'written',
      messageId: ctx.messageId,
      threadId: threadId,
      outlookConversationId: ctx.conversationId || null,
      connectorId: 'onedriveFile',
      ref: r.ref,
      url: r.url || null,
      system: 'microsoft/onedrive',
      externalId: r.proof && r.proof.externalId,
      verifiedAt: r.proof && r.proof.verifiedAt,
      fetchedBack: true,
      writtenLine: r.written,
      processName: faceTitle(ctx),
      closedLine: ctx.process && ctx.process.closedLine,
      receiptStatus: status
    }, fields || {});
    if (mount) paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mount, row); });
  }

  function holdingLabel() {
    return pageChrome().holdingReply || 'Draft a holding reply';
  }

  function chainLine(chain) {
    const card = (chain && chain.card) || {};
    return [card.line, card.searched, card.why, card.skipped].filter(Boolean).join(' ');
  }

  // OWA does not give attachment names. No chip on the page is an empty thread,
  // the same evidence Gmail passes when the open message has no attachment chips.
  function pageThreadFiles() {
    return [];
  }

  function namedSilence(reason) {
    const r = String(reason || 'file-chain-not-run');
    if (typeof FlowCloseChains !== 'undefined' && FlowCloseChains.isFileSilence && FlowCloseChains.isFileSilence(r)) return r;
    if (r === 'drive-not-granted' || r === 'drive-search-failed' || r === 'file-chain-not-run') return r;
    if (r.indexOf('page:') === 0 || r.indexOf('outlook:') === 0) return r;
    return 'page:' + r;
  }

  function filePendingReason(reason) {
    if (typeof FlowCloseChains !== 'undefined' && FlowCloseChains.isFileChainPending) return FlowCloseChains.isFileChainPending(reason);
    return reason === 'file-chain-not-run' || reason === 'file-needs-drive';
  }

  function fileSilenceReason(reason) {
    if (typeof FlowCloseChains !== 'undefined' && FlowCloseChains.isFileSilence) return FlowCloseChains.isFileSilence(reason);
    return filePendingReason(reason) || reason === 'drive-not-granted' || reason === 'drive-search-failed';
  }

  function plannedRow(bag, pane) {
    const diags = (bag && bag.outlookSync && bag.outlookSync.diagnostics) || [];
    const conv = pane && FlowOwaParse.canonId(pane.conversationId);
    if (!conv) return null;
    return diags.find((d) => d && FlowOwaParse.canonId(d.conversationId) === conv) || null;
  }

  // The URL conversation is not copied onto the pane until the open mail
  // shows that id. The mailbox check still filed its silence under that URL.
  // Own-sender and note-to-self are that row. A URL that names a different
  // mail (url-stale) is not this row, and this row is not a file link.
  function unconfirmedSyncRow(bag, pane) {
    if (!pane || pane.idSource !== 'url-unconfirmed') return null;
    const raw = pane.rawUrlId || pane.pathId;
    if (!raw || typeof FlowOwaParse === 'undefined' || typeof FlowOwaParse.canonId !== 'function') return null;
    const urlConv = FlowOwaParse.canonId(raw);
    if (!urlConv) return null;
    const diags = (bag && bag.outlookSync && bag.outlookSync.diagnostics) || [];
    return diags.find((d) => d && FlowOwaParse.canonId(d.conversationId) === urlConv) || null;
  }

  function ownSender(email, own) {
    const e = String(email || '').trim().toLowerCase();
    return Boolean(e && (own || []).indexOf(e) >= 0);
  }

  // senderOf leaves the person's own address off the pane so it is never the
  // counterpart. The persona title still names that address on a note to self.
  function personaEmails() {
    let node = null;
    try { node = document.querySelector('#ReadingPaneContainerId .persona'); } catch (e) { node = null; }
    if (!node) return [];
    const bits = [];
    if (node.getAttribute) bits.push(node.getAttribute('title') || '', node.getAttribute('aria-label') || '');
    const spans = node.querySelectorAll ? node.querySelectorAll('[title], [aria-label]') : [];
    for (let i = 0; i < spans.length; i++) bits.push(spans[i].getAttribute('title') || '', spans[i].getAttribute('aria-label') || '');
    return bits.join(' ').match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/ig) || [];
  }

  function personaOwnSender(own) {
    return personaEmails().some((email) => ownSender(email, own));
  }

  // A silence replaces whatever card was already floating. The schedule card
  // from an older judgment used to stay up after the check had moved on.
  function dropStuckCard(pane) {
    const token = pane && pane.__mailToken;
    if (!mailTokenLive(token)) return;
    const mount = mountPoint();
    const old = mount && mount.querySelector('.flow-chip-host');
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    lastKey = '';
  }

  // A shown file card is the outcome. Drop the mailbox check's silence for this
  // conversation so Why not shown does not keep an earlier drive-not-granted.
  async function forgetFileSilence(pane) {
    try {
      const bag = await FlowStorage.get();
      const sync = bag && bag.outlookSync;
      if (!sync || !Array.isArray(sync.diagnostics)) return;
      const conv = FlowOwaParse.canonId(pane && pane.conversationId);
      const next = sync.diagnostics.filter((d) => {
        if (!d || !(typeof FlowCloseChains !== 'undefined' && FlowCloseChains.isFileSilence && FlowCloseChains.isFileSilence(d.reason))) return true;
        if (!conv) return true;
        return FlowOwaParse.canonId(d.conversationId) !== conv;
      });
      if (next.length !== sync.diagnostics.length) await FlowStorage.set({ outlookSync: Object.assign({}, sync, { diagnostics: next }) });
    } catch (e) { /* the extension was reloaded under this page */ }
  }

  async function resolveFileChain(text, threadFiles, threadId, trace) {
    const gate = (typeof FlowFileAttach !== 'undefined' && typeof FlowFileAttach.gate === 'function') ? FlowFileAttach.gate(text) : null;
    if (typeof FlowCloseChains === 'undefined' || typeof FlowFileAttach === 'undefined' || !FlowCloseChains.fileEvidence) {
      return { ran: false, gate, query: null, searched: null, chain: null, quiet: 'file-chain-not-run' };
    }
    if (!gate || gate.kind !== 'clear' || !gate.ask) {
      return { ran: false, gate, query: null, searched: null, chain: null, quiet: (gate && gate.reason) || 'file' };
    }
    const query = FlowFileAttach.driveQuery(gate.ask.searchTerms || gate.ask.query);
    const searched = await send({ type: 'flow:search-drive', query, trace: Boolean(trace) });
    const silence = typeof FlowCloseChains.searchSilence === 'function'
      ? FlowCloseChains.searchSilence(searched)
      : (!searched || searched.ok !== true ? 'drive-search-failed' : null);
    if (silence) return { ran: true, gate, query, searched, chain: null, quiet: silence };
    let watching = null;
    try {
      const watches = await FlowStorage.getWatches();
      const open = (watches || []).find((w) => w && threadId && String(w.threadId) === String(threadId) && w.status === 'waiting' && w.requirement && w.requirement.kind);
      if (open) watching = { requirement: open.requirement };
    } catch (e) { watching = null; }
    const chain = FlowCloseChains.resolve({
      text,
      origin: 'outlook',
      now: Date.now(),
      lang: pageUiLang(),
      watching,
      evidence: FlowCloseChains.fileEvidence({
        driveOk: Boolean(searched && searched.ok),
        driveFiles: (searched && searched.files) || [],
        threadFiles: threadFiles
      })
    });
    return { ran: true, gate, query, searched, chain, quiet: null };
  }

  async function onHoldingDoIt(host, chip, ctx) {
    const token = captureMailToken();
    if (ignoreStaleClick(host)) return;
    const chain = ctx.chain || {};
    const holding = chain.holding && chain.holding.text;
    if (!holding || !ctx.sender || !ctx.sender.email) {
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', 'Needs an address'); });
      return;
    }
    paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Working…'); });
    let fromAddress = null;
    try {
      const st = await FlowStorage.get();
      fromAddress = preferHumanFrom(st && st.outlookAuth);
    } catch (e) { /* From resolved again in background */ }
    if (ignoreStaleClick(host)) return;
    const r = await send({
      type: 'flow:execute-action',
      payload: {
        connectorId: 'outlookDraft',
        outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
        messageId: ctx.messageId,
        body: holding,
        params: {},
        senderEmail: ctx.sender.email,
        senderName: ctx.sender.name || null,
        subject: ctx.subject || '',
        fromAddress: fromAddress
      }
    });
    if (!r || !r.ok) {
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', (r && (r.reason || r.error)) || 'Could not create draft'); });
      return;
    }
    if (typeof FlowFollowUp !== 'undefined' && chain.promise && chain.promise.ask && ctx.threadId) {
      const watch = FlowFollowUp.buildWatch({
        ask: chain.promise.ask,
        threadId: ctx.threadId,
        messageId: ctx.messageId,
        subject: ctx.subject,
        counterpart: { email: ctx.sender.email, name: ctx.sender.name || null },
        channel: 'outlook',
        now: Date.now()
      });
      watch.requirement = chain.requirement;
      await FlowStorage.upsertWatch(watch);
    }
    paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
      status: 'Draft ready. Not sent.',
      written: 'Draft ready. Not sent.',
      url: r.url || r.where,
      onUndo: guardedUndo(host, async () => {
        const undoToken = captureMailToken();
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref, created: r.created });
        if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed')) return { ok: false, reason: u.reason, written: u.written };
        if (u && u.ok && ctx.threadId && typeof FlowStorage.updateWatch === 'function') {
          await FlowStorage.updateWatch(ctx.threadId, { status: 'stopped', resolvedBy: 'undo' });
        }
        if (!(u && u.ok)) return { ok: false, written: (u && u.written) || 'Could not remove the draft.' };
        lastKey = '';
        lastSig = '';
        paintIfCurrent(undoToken, function () { paintRemove(host); });
        schedule();
        return { ok: true, written: u.written || 'Reply draft removed. Not sent.', reopen: true };
      })
    }); });
  }

  // A Drive hit is a card. The address often has only a conversation id; a missing
  // Graph message id used to return false here and the scan then called that
  // outlook:file-found-no-attach and removed the card. The id is resolved when
  // it can be, and Do It resolves it again before the draft. Nothing is sent.
  async function showFilePrepare(pane, chain, messageId, messageIdFrom, immutable) {
    if (!paneCurrent(pane)) return { shown: false, why: 'stale' };
    const file = chain && chain.hit && chain.hit.file;
    if (!file || !file.id) return { shown: false, why: 'no-file' };
    if (chain.hit.source !== 'drive') return { shown: false, why: 'not-drive' };
    const mount = mountPoint();
    if (!mount) return { shown: false, why: 'no-mount' };
    const he = chain.requirement && chain.requirement.lang === 'he';
    const line = he ? 'טיוטת תשובה עם הקובץ' : 'Draft reply with the file';
    const ctx = {
      app: 'outlook',
      doLabel: 'Do It',
      pane: pane || null,
      messageId: messageId || null,
      outlookIncomingId: messageId || null,
      pathId: (pane && (pane.pathId || pane.conversationId || pane.itemId)) || null,
      conversationId: (pane && pane.conversationId) || null,
      itemId: (pane && pane.itemId) || null,
      messageIdFrom: messageIdFrom || null,
      outlookImmutableId: immutable === true,
      threadId: (pane && (pane.conversationId || pane.itemId)) || messageId || null,
      subject: (pane && pane.subject) || '',
      bodyText: (pane && pane.text) || '',
      sender: { name: pane && pane.senderName, email: pane && pane.senderEmail },
      attachFile: { id: file.id, name: file.name || null, mimeType: file.mimeType || null },
      glanceChain: 'prepare',
      decisionReason: 'prepare',
      hydrateHow: pane && pane.hydrateHow,
      priorConversationId: pane && pane.priorConversationId,
      intent: { type: 'request', label: line },
      process: {
        id: 'reply-track',
        name: 'Reply & Track',
        closingLine: line,
        steps: [{
          kind: 'outlookDraft',
          id: 'outlookDraft',
          params: {
            what: (chain.requirement && chain.requirement.label) || null,
            includeAttachment: true,
            driveFileId: file.id,
            driveFileName: file.name || null,
            driveMimeType: file.mimeType || null,
            attachSource: 'found'
          }
        }]
      }
    };
    const token = pane && pane.__mailToken;
    if (!mailTokenLive(token)) return { shown: false, why: 'stale' };
    const old = mount.querySelector('.flow-chip-host');
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    const host = paintIfCurrent(token, function () { return injectCard(mount, stampEpoch(ctx, pane), {
      onDoIt: (h, chip, c, steps) => { onDoIt(h, chip, c, steps); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    }); });
    if (!host) return { shown: false, why: 'inject-failed' };
    host.setAttribute('data-glance-chain', 'prepare');
    host.setAttribute('data-glance-message', messageId || '');
    lastOutcome = 'card';
    lastKey = (messageId || (pane && pane.conversationId) || 'open') + '|prepare';
    dbg('decision', { shown: true, chain: 'prepare', fileId: file.id, messageId: messageId || null });
    dbg('rendered', { messageId: messageId || null, chain: 'prepare' });
    await clearReason(pane, 'prepare');
    await forgetFileSilence(pane);
    return { shown: true, why: messageId ? 'shown' : 'shown-without-message-id' };
  }

  async function showHoldingChain(pane, chain, messageId) {
    if (!paneCurrent(pane)) return false;
    if (!chain || chain.move !== 'needs-you' || chain.sends !== false || chain.close !== false) return false;
    if (!chain.holding || !chain.holding.text || chain.holding.claimsFile) return false;
    const mount = mountPoint();
    if (!mount || !messageId) return false;
    const line = chainLine(chain);
    const ctx = {
      app: 'outlook',
      doLabel: holdingLabel(chain),
      messageId: messageId,
      outlookIncomingId: messageId,
      threadId: (pane && (pane.conversationId || pane.itemId)) || messageId,
      subject: (pane && pane.subject) || '',
      bodyText: chain.holding.text,
      sender: { name: pane && pane.senderName, email: pane && pane.senderEmail },
      intent: { type: 'request', label: line },
      process: {
        id: 'reply-track',
        name: 'Reply & Track',
        closingLine: line,
        steps: [{ kind: 'outlookDraft', id: 'outlookDraft', params: {} }]
      },
      chain: chain,
      glanceChain: 'needs-you',
      decisionReason: 'needs-you',
      hydrateHow: pane && pane.hydrateHow,
      priorConversationId: pane && pane.priorConversationId
    };
    const token = pane && pane.__mailToken;
    if (!mailTokenLive(token)) return false;
    const old = mount.querySelector('.flow-chip-host');
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    const host = paintIfCurrent(token, function () { return injectCard(mount, stampEpoch(ctx, pane), {
      onDoIt: (h, chip, c) => { onHoldingDoIt(h, chip, c); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    }); });
    if (!host) return false;
    host.setAttribute('data-glance-chain', 'needs-you');
    lastOutcome = 'card';
    lastKey = messageId + '|needs-you';
    dbg('decision', { shown: true, chain: 'needs-you', label: ctx.doLabel });
    dbg('rendered', { messageId: messageId, chain: 'needs-you' });
    await clearReason(pane, 'needs-you');
    await forgetFileSilence(pane);
    return true;
  }

  async function onDismiss(host, ctx) {
    const token = captureMailToken();
    if (ignoreStaleClick(host)) return;
    paintIfCurrent(token, function () { paintRemove(host); });
    if (!ctx || !ctx.messageId) return;
    if (ignoreStaleClick(host)) return;
    await FlowStorage.appendLog({
      kind: 'dismissed',
      label: (ctx.intent && ctx.intent.label) || 'Dismissed',
      messageId: ctx.messageId,
      app: 'outlook'
    });
    await FlowStorage.recordStillOpenMetric({ kind: 'falseClose', messageId: ctx.messageId, reason: 'dismiss' });
    await FlowStorage.recordCloseQuality({ kind: 'falseDoIt', messageId: ctx.messageId, reason: 'dismiss' });
  }

  function badSenderName(n) {
    return !n || (FlowOwaParse.looksLikeDateTime && FlowOwaParse.looksLikeDateTime(n));
  }

  // Empty sender on a conversation we already read well: keep that sender. A date/time row is never a name.
  function keepSender(pane) {
    if (!pane) return pane;
    const key = String(pane.conversationId || pane.itemId || '');
    if (!key) return pane;
    const prev = senderMemory[key];
    if (!pane.senderEmail && prev && prev.email) {
      pane.senderEmail = prev.email;
      if (badSenderName(pane.senderName) && prev.name) pane.senderName = prev.name;
    } else if (badSenderName(pane.senderName)) {
      pane.senderName = (prev && prev.email === pane.senderEmail && prev.name) || '';
    }
    if (pane.senderEmail) senderMemory[key] = { email: pane.senderEmail, name: pane.senderName || '' };
    return pane;
  }

  function holdTextOf(pane) {
    const raw = (pane && pane.text) || '';
    return (typeof FlowGraphMail !== 'undefined' && FlowGraphMail.ownText) ? FlowGraphMail.ownText(raw) : raw;
  }

  function calendarScopes(st) {
    const token = st && st.outlookAuth && st.outlookAuth.token;
    if (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.scopesFromToken === 'function') {
      return FlowOutlookCalendar.scopesFromToken(token) || [];
    }
    const raw = token && (token.grantedScopes != null ? token.grantedScopes : token.scope);
    if (raw == null || raw === 'unknown') return [];
    return raw;
  }

  function glanceError(where, err) {
    try { console.error('Glance: ' + where, err && err.message ? err.message : err); } catch (e) { /* console gone */ }
  }

  function calendarEventRef(ref) {
    if (!ref || typeof ref !== 'object') return null;
    const id = ref.eventId;
    return typeof id === 'string' && id ? ref : null;
  }

  function canonKey(id) {
    if (!id) return '';
    if (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.canonId) return FlowOwaParse.canonId(id);
    return String(id);
  }

  function calendarHoldKey(params, fileTerm) {
    const p = params || {};
    const term = String(fileTerm || p.fileTerm || '');
    if (!term || p.dateIso == null || p.hour == null || p.minute == null) return '';
    return term + '|' + p.dateIso + '|' + p.hour + '|' + p.minute;
  }

  // Newest calendar row for this thread. A later "shown" line does not reopen
  // a write: that is what put Hold back on the thread after Handled. Only a
  // newer calendar Undo does. Ids match in one spelling (slash or underscore).
  async function findWrittenCalendar(pane, holdKey) {
    const bag = await FlowStorage.get();
    const log = (bag && bag.log) || [];
    const want = new Set([pane && pane.itemId, pane && pane.conversationId, pane && pane.pathId].map(canonKey).filter(Boolean));
    for (const e of log) {
      if (!e || e.connectorId !== 'outlookCalendar') continue;
      const ids = [e.messageId, e.outlookConversationId, e.pathId, e.itemId].map(canonKey).filter(Boolean);
      const idHit = ids.some((id) => want.has(id));
      const keyHit = Boolean(holdKey) && e.calendarHoldKey === holdKey;
      if (!idHit && !keyHit) continue;
      if (e.kind === 'undone' && e.outlookReopen) return null;
      if (e.kind === 'written' && calendarEventRef(e.ref)) return e;
    }
    return null;
  }

  function calendarUndoHandler(host, messageId, ref) {
    return guardedUndo(host, async () => {
      const undoToken = captureMailToken();
      const u = await send({ type: 'flow:undo-action', connectorId: 'outlookCalendar', ref: ref, created: ref && ref.created });
      if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed' || u.reason === 'verify-timeout')) {
        return { ok: false, reason: u.reason, written: u.written };
      }
      if (!(u && u.ok)) return { ok: false, written: (u && u.written) || 'Could not remove the event.' };
      if (typeof FlowStorage.markOutlookCalendarUndone === 'function') {
        await FlowStorage.markOutlookCalendarUndone(messageId, ref);
      } else {
        await FlowStorage.appendLog({
          kind: 'undone',
          label: (u && u.written) || 'Calendar event removed.',
          messageId: messageId,
          app: 'outlook',
          connectorId: 'outlookCalendar',
          outlookReopen: true
        });
      }
      if (messageId) await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: messageId });
      lastKey = '';
      lastSig = '';
      paintIfCurrent(undoToken, function () { paintRemove(host); });
      schedule();
      return { ok: true, written: (u && u.written) || 'Calendar event removed.', reopen: true };
    });
  }

  function clockFrom(bag) {
    if (!bag) return null;
    const time = bag.time || null;
    const date = bag.date || null;
    const dateIso = bag.dateIso || (date && date.iso) || null;
    const hour = bag.hour != null ? bag.hour : (time && time.hour);
    const minute = bag.minute != null ? bag.minute : (time && time.minute);
    if (dateIso == null || hour == null || minute == null) return null;
    return { dateIso: dateIso, hour: hour, minute: minute, what: bag.what || bag.title || bag.quote || null };
  }

  function meetingClock(ctx) {
    const bags = [];
    const steps = (ctx && ctx.process && ctx.process.steps) || [];
    steps.forEach((step) => { if (step && step.params) bags.push(step.params); });
    if (ctx && ctx.intent) bags.push(ctx.intent.entities, ctx.intent.facts, ctx.intent);
    for (let i = 0; i < bags.length; i++) {
      const found = clockFrom(bags[i]);
      if (!found) continue;
      const title = found.what || (ctx.intent && ctx.intent.label) || ctx.subject || 'Meeting';
      return {
        meeting: true,
        dateIso: found.dateIso,
        hour: found.hour,
        minute: found.minute,
        title: String(title).replace(/\s+/g, ' ').trim().slice(0, 200) || 'Meeting',
        quote: found.what || null,
        threadUrl: ctx.threadUrl || null
      };
    }
    return null;
  }

  const CALENDAR_SCOPE = 'Calendars.ReadWrite';
  const TODO_SCOPE = 'Tasks.ReadWrite';

  function calendarAsk(st) {
    const granted = typeof FlowOutlookCalendar !== 'undefined' && FlowOutlookCalendar.hasWriteScope
      ? FlowOutlookCalendar.hasWriteScope(calendarScopes(st))
      : false;
    const policy = (st && st.glanceCalendarConsent) || null;
    if (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.holdConsentAsk === 'function') {
      return FlowOutlookCalendar.holdConsentAsk(granted, policy);
    }
    return !granted;
  }

  async function storeCalendarPolicy(choice) {
    const st = await FlowStorage.get();
    const auth = (st && st.outlookAuth) || {};
    const token = Object.assign({}, auth.token || {});
    const known = (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.normalizeDelegatedScopes === 'function')
      ? FlowOutlookCalendar.normalizeDelegatedScopes(token.grantedScopes)
      : (Array.isArray(token.grantedScopes) ? token.grantedScopes : []);
    const scopes = (known || []).slice();
    if (scopes.indexOf(CALENDAR_SCOPE) < 0) scopes.push(CALENDAR_SCOPE);
    token.grantedScopes = scopes;
    const mode = choice === 'always' ? 'always' : 'once';
    await FlowStorage.set({
      outlookAuth: Object.assign({}, auth, { token: token }),
      glanceCalendarConsent: { mode: mode, scope: CALENDAR_SCOPE, revoked: false, at: Date.now() }
    });
    await logCalendarChoice(mode);
  }

  async function logCalendarChoice(choice) {
    const labels = {
      always: 'הרשאת יומן: תמיד',
      once: 'הרשאת יומן: פעם אחת',
      'not-now': 'הרשאת יומן: לא עכשיו'
    };
    const reasons = {
      always: 'calendar-consent-always',
      once: 'calendar-consent-once',
      'not-now': 'calendar-consent-not-now'
    };
    const label = labels[choice];
    if (!label) return;
    await FlowStorage.appendLog({
      kind: 'shown',
      label: label,
      app: 'outlook',
      reason: reasons[choice],
      messageId: 'calendar-consent'
    });
  }

  function calendarReasonLine(result) {
    const code = String((result && (result.reason || result.error)) || '');
    const lines = {
      'calendar-write-not-granted': 'צריך הרשאה ליומן',
      'token-expired': 'צריך להתחבר מחדש',
      'needs-sign-in': 'צריך להתחבר מחדש',
      'not-connected': 'צריך להתחבר מחדש',
      'user-edited': 'ערכת את זה',
      'unconfirmed': 'לא הצלחתי לאשר',
      'verify-timeout': 'לא הצלחתי לאשר'
    };
    return lines[code] || 'לא הצלחתי לסיים, נסה שוב';
  }

  function paintHint(host, text) {
    if (paintDepth <= 0 || !host || !text) return;
    if (host.querySelector('.flow-chip-undo-hint')) return;
    host.appendChild(FlowChipHost.el('span', 'flow-chip-undo-hint flow-chip-undo-failed', text));
  }

  function paintNoteHint(host, text) {
    if (paintDepth <= 0 || !host || !text) return;
    if (host.querySelector('.flow-chip-note-hint')) return;
    host.appendChild(FlowChipHost.el('span', 'flow-chip-note-hint flow-chip-undo-hint', text));
  }

  function paintCalendarFailure(host, chip, result) {
    if (paintDepth <= 0) return '';
    const why = calendarReasonLine(result);
    if (chip) FlowChipHost.setChipState(chip, 'flow-chip-error', why);
    else if (host && !host.querySelector('.flow-chip-undo-hint')) {
      host.appendChild(FlowChipHost.el('span', 'flow-chip-undo-hint flow-chip-undo-failed', why));
    }
    return why;
  }

  function hasTasksWrite(scopes) {
    const list = (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.normalizeDelegatedScopes === 'function')
      ? FlowOutlookCalendar.normalizeDelegatedScopes(scopes)
      : (Array.isArray(scopes) ? scopes : null);
    if (!list) return false;
    return list.some((s) => String(s).toLowerCase() === 'tasks.readwrite');
  }

  function todoAsk(st) {
    const granted = hasTasksWrite(calendarScopes(st));
    const policy = (st && st.glanceTodoConsent) || null;
    if (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.holdConsentAsk === 'function') {
      return FlowOutlookCalendar.holdConsentAsk(granted, policy);
    }
    return !granted;
  }

  function paintCalendarConsent(host, ctx) {
    if (paintDepth <= 0) return;
    if (!host || host.querySelector('[data-glance-consent="calendar"]')) return;
    const row = FlowChipHost.el('div', 'flow-chip-consent');
    row.setAttribute('data-glance-consent', 'calendar');
    row.setAttribute('dir', 'rtl');
    row.appendChild(FlowChipHost.el('span', 'flow-chip-label', 'צריך הרשאה ליומן'));
    const actions = FlowChipHost.el('span', 'flow-chip-actions');
    [['אפשר פעם אחת', 'once'], ['אפשר תמיד', 'always'], ['לא עכשיו', 'not-now']].forEach((pair) => {
      const button = FlowChipHost.el('button', 'flow-chip-consent-btn capture-secondary', pair[0]);
      button.type = 'button';
      button.setAttribute('data-glance-consent-choice', pair[1]);
      button.addEventListener('click', () => { onCalendarConsent(host, ctx, pair[1]); });
      actions.appendChild(button);
    });
    row.appendChild(actions);
    host.appendChild(row);
  }

  function paintTodoScopeCard(mount, ctx) {
    if (paintDepth <= 0 || !mount || !ctx) return null;
    const host = FlowChipHost.el('div', 'flow-chip-host');
    host.setAttribute('dir', 'rtl');
    host.setAttribute('data-glance-chain', 'todo-consent');
    if (mount.firstChild) mount.insertBefore(host, mount.firstChild);
    else mount.appendChild(host);
    stampCard(host, Object.assign({}, ctx, { decisionReason: 'tasks-not-granted' }), 'tasks-not-granted');
    paintTodoConsent(host, ctx);
    return host;
  }

  function taskOnlyProcess(process) {
    const steps = (process && process.steps) || [];
    return steps.length > 0 && steps.every((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
  }

  function paintTodoConsent(host, ctx) {
    if (paintDepth <= 0) return;
    if (!host || host.querySelector('[data-glance-consent="todo"]')) return;
    const row = FlowChipHost.el('div', 'flow-chip-consent');
    row.setAttribute('data-glance-consent', 'todo');
    row.setAttribute('dir', 'rtl');
    row.appendChild(FlowChipHost.el('span', 'flow-chip-label', 'אין הרשאת To Do'));
    const actions = FlowChipHost.el('span', 'flow-chip-actions');
    [['אפשר פעם אחת', 'once'], ['אפשר תמיד', 'always'], ['לא עכשיו', 'not-now']].forEach((pair) => {
      const button = FlowChipHost.el('button', 'flow-chip-consent-btn capture-secondary', pair[0]);
      button.type = 'button';
      button.setAttribute('data-glance-consent-choice', pair[1]);
      button.addEventListener('click', () => { onTodoConsent(host, ctx, pair[1]); });
      actions.appendChild(button);
    });
    row.appendChild(actions);
    host.appendChild(row);
  }

  async function logTodoChoice(choice) {
    const labels = {
      always: 'הרשאת To Do: תמיד',
      once: 'הרשאת To Do: פעם אחת',
      'not-now': 'הרשאת To Do: לא עכשיו'
    };
    const reasons = {
      always: 'todo-consent-always',
      once: 'todo-consent-once',
      'not-now': 'todo-consent-not-now'
    };
    const label = labels[choice];
    if (!label) return;
    await FlowStorage.appendLog({
      kind: 'shown',
      label: label,
      app: 'outlook',
      reason: reasons[choice],
      messageId: 'todo-consent'
    });
  }

  async function storeTodoPolicy(choice) {
    const st = await FlowStorage.get();
    const auth = (st && st.outlookAuth) || {};
    const token = Object.assign({}, auth.token || {});
    const known = (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.normalizeDelegatedScopes === 'function')
      ? FlowOutlookCalendar.normalizeDelegatedScopes(token.grantedScopes)
      : (Array.isArray(token.grantedScopes) ? token.grantedScopes : []);
    const scopes = (known || []).slice();
    if (scopes.indexOf(TODO_SCOPE) < 0) scopes.push(TODO_SCOPE);
    token.grantedScopes = scopes;
    const mode = choice === 'always' ? 'always' : 'once';
    await FlowStorage.set({
      outlookAuth: Object.assign({}, auth, { token: token }),
      glanceTodoConsent: { mode: mode, scope: TODO_SCOPE, revoked: false, at: Date.now() }
    });
    await logTodoChoice(mode);
  }

  async function onTodoConsent(host, ctx, choice) {
    if (!host || ignoreStaleClick(host)) return;
    if (choice === 'not-now') {
      await logTodoChoice('not-now');
      const ask = host.querySelector('[data-glance-consent="todo"]');
      if (ask) ask.remove();
      return;
    }
    const granted = await send({ type: 'flow:outlook-consent-scope', scope: TODO_SCOPE, policy: choice });
    if (!granted || granted.ok !== true) {
      const token = captureMailToken();
      paintIfCurrent(token, function () { paintHint(host, 'אין הרשאת To Do'); });
      return;
    }
    await storeTodoPolicy(choice);
    const ask = host.querySelector('[data-glance-consent="todo"]');
    if (ask) ask.remove();
  }

  function paintMissingScope(host, ctx, st) {
    if (!host || !ctx || !ctx.process) return;
    const steps = ctx.process.steps || [];
    const hasTask = steps.some((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
    const hold = ctx.process.id === 'hold' || (ctx.intent && ctx.intent.personalClose === 'calendar-hold');
    const needsOnedrive = steps.some((s) => s && (s.kind === 'onedriveFile' || s.kind === 'attachmentSave'));
    if (hold && calendarAsk(st)) paintCalendarConsent(host, ctx);
    if (hasTask && todoAsk(st)) paintTodoConsent(host, ctx);
    if (needsOnedrive && typeof FlowOnedriveFile !== 'undefined' && typeof FlowOnedriveFile.hasWriteScope === 'function') {
      const ok = FlowOnedriveFile.hasWriteScope(calendarScopes(st));
      if (ok === false) {
        const lang = pageUiLang();
        const svc = (lang === 'he' || lang === 'iw') ? 'וואן־דרייב' : 'OneDrive';
        const line = (typeof FlowDisplay !== 'undefined' && FlowDisplay.missingScopeLine)
          ? FlowDisplay.missingScopeLine('Files.ReadWrite', svc, lang)
          : ((typeof FlowReceipt !== 'undefined' && FlowReceipt.missingScopeLine)
            ? FlowReceipt.missingScopeLine('Files.ReadWrite', svc)
            : 'Reconnect OneDrive (Files.ReadWrite).');
        paintHint(host, line);
      }
    }
  }

  async function onCalendarConsent(host, ctx, choice) {
    if (!host || ignoreStaleClick(host)) return;
    if (choice === 'not-now') {
      await logCalendarChoice('not-now');
      await holdAsTodo(host, ctx);
      return;
    }
    const granted = await send({ type: 'flow:outlook-consent-scope', scope: CALENDAR_SCOPE, policy: choice });
    if (!granted || granted.ok !== true) {
      const token = captureMailToken();
      paintIfCurrent(token, function () { paintCalendarFailure(host, null, granted); });
      return;
    }
    await storeCalendarPolicy(choice);
    const ask = host.querySelector('[data-glance-consent="calendar"]');
    if (ask) ask.remove();
    await finishMeetingHold(host, ctx);
  }

  async function holdAsTodo(host, ctx) {
    const token = captureMailToken();
    if (!host || ignoreStaleClick(host)) return;
    let stAsk = null;
    try { stAsk = await FlowStorage.get(); } catch (e) { stAsk = null; }
    if (todoAsk(stAsk)) {
      paintIfCurrent(token, function () { paintTodoConsent(host, ctx); });
      return;
    }
    const clock = meetingClock(ctx);
    const title = (clock && clock.title) || (ctx && ctx.intent && ctx.intent.label) || (ctx && ctx.subject) || 'Hold';
    const params = { title: title };
    if (clock) params.reminder = { dateIso: clock.dateIso, hour: clock.hour, minute: clock.minute };
    const r = await send({
      type: 'flow:execute-action',
      payload: {
        connectorId: 'outlookTask',
        params: params,
        label: title,
        senderName: ctx && ctx.sender && ctx.sender.name,
        senderEmail: ctx && ctx.sender && ctx.sender.email,
        subject: (ctx && ctx.subject) || '',
        text: (ctx && (ctx.bodyText || ctx.text)) || '',
        threadUrl: (ctx && ctx.threadUrl) || null
      }
    });
    if (ignoreStaleClick(host)) return;
    const taskStep = { params: params };
    if (r && r.ref && (r.ref.taskId || r.ref.externalId) && r.written === "Created, couldn't verify") {
      await commitProvedTodo(host, ctx, r, taskStep, false, token);
      return;
    }
    const proved = typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.allowsHandled
      ? FlowProofOfClose.allowsHandled({ ok: !!(r && r.ok), proof: r && r.proof })
      : false;
    if (!proved) {
      paintIfCurrent(token, function () { paintHint(host, todoWriteFailureLine(r)); });
      return;
    }
    await commitProvedTodo(host, ctx, r, taskStep, true, token);
  }

  // Hold It on a meeting mail writes one calendar event and leaves the card
  // on Handled, with Undo. Without calendar scope the card asks once, in one
  // line. Declining holds the same loop as a To Do task.
  async function onMeetingHold(host, ctx) {
    const token = captureMailToken();
    if (!host || ignoreStaleClick(host)) return;
    let st = null;
    try { st = await FlowStorage.get(); } catch (e) { st = null; }
    if (calendarAsk(st)) {
      paintIfCurrent(token, function () { paintCalendarConsent(host, ctx); });
      return;
    }
    await finishMeetingHold(host, ctx, token);
  }

  function calendarParamsFromStep(step, ctx) {
    const p = (step && step.params) || {};
    const dateIso = p.dateIso || null;
    const hour = p.hour != null ? p.hour : null;
    const minute = p.minute != null ? p.minute : null;
    if (dateIso == null || hour == null || minute == null) return null;
    const params = {
      dateIso: dateIso,
      hour: hour,
      minute: minute,
      title: artifactTitleFor(ctx, p.title || (ctx && ctx.intent && ctx.intent.label) || (ctx && ctx.subject) || 'Meeting'),
      quote: p.quote || null,
      threadUrl: p.threadUrl || (ctx && ctx.threadUrl) || null,
      requireTime: p.requireTime === true
    };
    if (p.calendarOp) params.calendarOp = p.calendarOp;
    if (p.fileTerm || p.fileName || p.fileUrl) {
      if (p.fileTerm) params.fileTerm = p.fileTerm;
      if (p.fileName) params.fileName = p.fileName;
      if (p.fileUrl) params.fileUrl = p.fileUrl;
    } else if (!p.calendarOp) {
      params.meeting = true;
    }
    return params;
  }

  async function finishMeetingHold(host, ctx, token, preset) {
    if (!token) token = captureMailToken();
    if (!host || ignoreStaleClick(host)) return;
    let st = null;
    try { st = await FlowStorage.get(); } catch (e) { st = null; }
    // Once means ask on the next Hold, not again inside this one. Re-ask only
    // when Calendars.ReadWrite is still missing from the token.
    const grantedNow = typeof FlowOutlookCalendar !== 'undefined' && FlowOutlookCalendar.hasWriteScope
      ? FlowOutlookCalendar.hasWriteScope(calendarScopes(st))
      : false;
    if (!grantedNow) {
      paintIfCurrent(token, function () { paintCalendarConsent(host, ctx); });
      return;
    }
    const params = preset || meetingClock(ctx);
    if (!params) {
      await holdAsTodo(host, ctx);
      return;
    }
    // The service worker adds a Teams link only when this text asks for a call
    // and the TEAMS_MEETING switch is on (off by default). Text stays local.
    if (params.meeting === true && ctx && ctx.bodyText) params.callText = String(ctx.bodyText).slice(0, 1500);
    const r = await send({
      type: 'flow:execute-action',
      payload: {
        connectorId: 'outlookCalendar',
        params: params,
        messageId: ctx && ctx.messageId,
        threadUrl: (ctx && ctx.threadUrl) || params.threadUrl || null
      }
    });
    if (ignoreStaleClick(host)) return;
    if (r && r.reason === 'calendar-write-not-granted') {
      paintIfCurrent(token, function () { paintCalendarConsent(host, ctx); });
      return;
    }
    if (!r || !r.ok || !r.ref || !r.ref.eventId) {
      paintIfCurrent(token, function () { paintCalendarFailure(host, null, r); });
      return;
    }
    const verified = r.fetchedBack === true;
    const status = verified ? pageChrome().handled : "Created, couldn't verify";
    const written = verified ? (r.written || 'On your calendar.') : status;
    const messageId = (ctx && ctx.messageId) || null;
    await FlowStorage.appendLog({
      kind: 'written',
      label: written,
      messageId: messageId,
      app: 'outlook',
      connectorId: 'outlookCalendar',
      ref: r.ref,
      created: r.ref.created || null,
      where: r.where,
      url: r.url || null,
      fetchedBack: verified,
      receiptStatus: status,
      intent: ctx && ctx.intent,
      process: ctx && ctx.process,
      sender: ctx && ctx.sender,
      subject: ctx && ctx.subject,
      text: ctx && ctx.bodyText,
      outlookConversationId: (ctx && (ctx.outlookConversationId || ctx.conversationId)) || null,
      pathId: (ctx && ctx.pathId) || null,
      itemId: (ctx && ctx.itemId) || null
    });
    if (verified && messageId) {
      await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: messageId });
      await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: messageId });
    }
    host.setAttribute('data-glance-chain', 'calendar-hold');
    host.classList.add('flow-chip-settled');
    lastOutcome = 'card';
    lastKey = (messageId || 'open') + '|calendar-hold';
    paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
      status: status,
      written: written,
      url: r.url || null,
      linkLabel: pageChrome().openEvent,
      onUndo: calendarUndoHandler(host, messageId, r.ref)
    }); });
  }

  // Handled stays on the open message. A settled card from this click is left
  // in place. A reload, or a scan that arrives after the write, mounts it again
  // from the Activity row, with the same Undo.
  async function keepCalendarReceipt(pane, row) {
    if (!row) return false;
    const mount = mountPoint();
    if (!mount) return false;
    const existing = mount.querySelector('.flow-chip-host');
    if (existing && existing.classList.contains('flow-chip-settled') && existing.getAttribute('data-glance-chain') === 'calendar-hold') {
      lastOutcome = 'card';
      lastKey = (row.messageId || 'open') + '|calendar-hold';
      return true;
    }
    await mountCalendarReceipt(pane, row, row.messageId);
    return Boolean(mount.querySelector('.flow-chip-host.flow-chip-settled'));
  }

  async function mountCalendarReceipt(pane, row, messageId) {
    const mount = mountPoint();
    if (!mount) return;
    const token = pane && pane.__mailToken;
    const old = mount.querySelector('.flow-chip-host');
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    const host = paintIfCurrent(token, function () { return injectCard(mount, {
      app: 'outlook',
      doLabel: 'Do It',
      messageId: messageId,
      itemId: pane && pane.itemId,
      conversationId: pane && pane.conversationId,
      hydrateHow: pane && pane.hydrateHow,
      priorConversationId: pane && pane.priorConversationId,
      process: { name: 'File on hold', steps: [{ kind: 'calendar', id: 'calendar' }] },
      intent: { label: row.label || 'On your calendar' },
      glanceChain: 'calendar-hold',
      decisionReason: 'calendar-hold'
    }, { onDoIt: () => {}, onDismiss: (h) => { if (ignoreStaleClick(h)) return; const clickToken = captureMailToken(); paintIfCurrent(clickToken, function () { paintRemove(h); }); } }); });
    if (!host) return;
    host.setAttribute('data-glance-chain', 'calendar-hold');
    host.setAttribute('data-glance-message', messageId || '');
    lastOutcome = 'card';
    lastKey = (messageId || 'open') + '|calendar-hold';
    const status = (row && row.receiptStatus) || (row && row.fetchedBack === false ? "Created, couldn't verify" : pageChrome().handled);
    paintIfCurrent(pane && pane.__mailToken, function () { FlowChipHost.showDraftReceipt(host, {
      status: status,
      written: row.label || status,
      url: row.url || null,
      linkLabel: pageChrome().openEvent,
      onUndo: calendarUndoHandler(host, messageId, row.ref)
    }); });
    await clearReason(pane, 'calendar-hold');
  }

  // Family B on the open page: one named file, one clock, one Outlook event.
  // A note to yourself is the ask (the same gate as Gmail). A meeting with
  // no file is left to the existing judge, which stays quiet. The card is
  // shown only when the token already has Calendars.ReadWrite (the Calendar
  // box on the one Connect screen). Without it the page stays quiet.
  async function settleCalendarHold(pane, probe, st) {
    if (!probe || probe.move === 'ignore') return false;
    if (probe.move === 'silent') {
      dropStuckCard(pane);
      await pageReason('outlook-calendar-silent', pane);
      return true;
    }
    if (probe.move !== 'wait') return false;
    const messageId = (pane && (pane.itemId || pane.conversationId || pane.pathId)) || ('hold:' + (probe.fileTerm || 'file'));
    const shaped = (typeof FlowOutlookCalendar !== 'undefined')
      ? FlowOutlookCalendar.decide({
        text: holdTextOf(pane),
        subject: pane.subject || '',
        senderEmail: pane.senderEmail || null,
        senderName: pane.senderName || null,
        now: new Date(),
        fileMatch: 'one'
      })
      : null;
    const holdKey = shaped && shaped.move === 'hold' ? calendarHoldKey(shaped.params, shaped.fileTerm) : '';
    let writtenRow = null;
    try { writtenRow = await findWrittenCalendar(pane, holdKey); }
    catch (e) { glanceError('calendar receipt', e); writtenRow = null; }
    if (writtenRow) {
      try {
        const kept = await keepCalendarReceipt(pane, writtenRow);
        if (kept) return true;
      } catch (e) { glanceError('calendar receipt', e); }
      // A write is already stored. Do not put Hold back over it.
      lastOutcome = 'card';
      return true;
    }
    const found = await send({ type: 'flow:drive-find-one', term: probe.fileTerm });
    const match = found && found.match;
    const file = found && found.file;
    if (match !== 'one' || !file || !file.url) {
      dropStuckCard(pane);
      await pageReason(match === 'unknown' ? 'drive-search-failed' : 'outlook-calendar-no-file', pane);
      return true;
    }
    const hold = (typeof FlowOutlookCalendar !== 'undefined')
      ? FlowOutlookCalendar.decide({
        text: holdTextOf(pane),
        subject: pane.subject || '',
        senderEmail: pane.senderEmail || null,
        senderName: pane.senderName || null,
        now: new Date(),
        fileMatch: 'one'
      })
      : null;
    if (!hold || hold.move !== 'hold') {
      dropStuckCard(pane);
      await pageReason('outlook-calendar-silent', pane);
      return true;
    }
    if (typeof FlowOutlookCalendar === 'undefined' || !FlowOutlookCalendar.hasWriteScope(calendarScopes(st))) {
      await showCalendarScopeCard(pane, messageId);
      await pageReason('outlook-calendar-write-not-granted', pane);
      lastOutcome = 'card';
      return true;
    }
    await showCalendarHold(pane, hold, file, messageId);
    return true;
  }

  // Missing Calendars.ReadWrite is a card, not a silent drop. One line names
  // the scope and the Setup checkbox. Do It does not write.
  async function showCalendarScopeCard(pane, messageId) {
    const token = pane && pane.__mailToken;
    const mount = mountPoint();
    if (!mount || !mailTokenLive(token)) return;
    const old = mount.querySelector('.flow-chip-host');
    if (old && old.getAttribute('data-glance-chain') === 'calendar-connect') {
      lastOutcome = 'card';
      lastKey = (messageId || 'open') + '|calendar-connect';
      return;
    }
    paintIfCurrent(token, function () {
      if (old) paintRemove(old);
      const host = FlowChipHost.el('div', 'flow-chip-host');
      host.setAttribute('dir', 'ltr');
      host.setAttribute('data-glance-chain', 'calendar-connect');
      host.setAttribute('data-glance-message', messageId || '');
      mount.appendChild(host);
      const ctx = {
        app: 'outlook',
        messageId: messageId || '',
        itemId: (pane && pane.itemId) || messageId || '',
        conversationId: pane && pane.conversationId,
        subject: (pane && pane.subject) || '',
        bodyText: holdTextOf(pane),
        sender: { name: pane && pane.senderName, email: pane && pane.senderEmail },
        glanceChain: 'calendar-connect',
        decisionReason: 'outlook-calendar-write-not-granted',
        intent: { label: 'צריך הרשאה ליומן' },
        process: { id: 'calendar-connect', name: 'צריך הרשאה ליומן', steps: [] }
      };
      stampCard(host, ctx, 'outlook-calendar-write-not-granted');
      paintCalendarConsent(host, ctx);
    });
    lastOutcome = 'card';
    lastKey = (messageId || 'open') + '|calendar-connect';
  }

  async function showCalendarHold(pane, hold, file, messageId) {
    if (doItInFlight) return;
    const mount = mountPoint();
    if (!mount) { await pageReason('page:no-mount', pane); return; }
    const parked = mount.querySelector('.flow-chip-host');
    if (parked && parked.classList.contains('flow-chip-settled') && parked.getAttribute('data-glance-chain') === 'calendar-hold') {
      lastOutcome = 'card';
      return;
    }
    const holdKey = calendarHoldKey(hold && hold.params, hold && hold.fileTerm);
    let already = null;
    try { already = await findWrittenCalendar(pane, holdKey); }
    catch (e) { glanceError('calendar receipt', e); }
    if (already) {
      try { await keepCalendarReceipt(pane, already); } catch (e) { glanceError('calendar receipt', e); }
      lastOutcome = 'card';
      return;
    }
    const g = (hold.intent && hold.intent.googleClose) || {};
    const process = Object.assign({}, hold.process, {
      closingLine: g.lang === 'he' ? (g.cardLineHe || hold.process.closingLine) : (g.cardLine || hold.process.closingLine)
    });
    const params = Object.assign({}, hold.params || {}, {
      fileUrl: file.url,
      fileName: file.name || (hold.params && hold.params.fileTerm) || null,
      quote: holdTextOf(pane) || (hold.params && hold.params.quote) || null
    });
    const holdLine = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.holdWhenLine === 'function')
      ? FlowDisplay.holdWhenLine(params.dateIso, params.hour, params.minute, pageUiLang())
      : '';
    if (!holdLine) {
      await pageReason('page:hold-without-clock', pane);
      return;
    }
    const ctx = {
      app: 'outlook',
      doLabel: 'Do It',
      messageId: messageId,
      outlookIncomingId: messageId,
      outlookConversationId: (pane && pane.conversationId) || null,
      pathId: (pane && pane.pathId) || null,
      itemId: (pane && pane.itemId) || null,
      calendarHoldKey: calendarHoldKey(params, params.fileTerm),
      threadId: (pane && (pane.conversationId || pane.itemId)) || messageId,
      subject: (pane && pane.subject) || '',
      bodyText: holdTextOf(pane),
      sender: { name: pane && pane.senderName, email: pane && pane.senderEmail },
      intent: hold.intent,
      process: process,
      calendarHold: { params: params },
      glanceChain: 'calendar-hold',
      decisionReason: 'calendar-hold',
      hydrateHow: pane && pane.hydrateHow,
      priorConversationId: pane && pane.priorConversationId
    };
    if (doItInFlight) return;
    const old = mount.querySelector('.flow-chip-host');
    if (old && old.classList.contains('flow-chip-settled') && old.getAttribute('data-glance-chain') === 'calendar-hold') {
      lastOutcome = 'card';
      return;
    }
    const token = pane && pane.__mailToken;
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    const host = paintIfCurrent(token, function () { return injectCard(mount, ctx, {
      onDoIt: (h, chip, c) => { onCalendarDoIt(h, chip, c); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    }); });
    if (!host) { await pageReason('page:inject-failed', pane); return; }
    host.setAttribute('data-glance-chain', 'calendar-hold');
    host.setAttribute('data-glance-message', messageId || '');
    lastOutcome = 'card';
    lastKey = (messageId || 'open') + '|calendar-hold';
    dbg('decision', { shown: true, chain: 'calendar-hold', file: file.name || null });
    dbg('rendered', { messageId: messageId || null, chain: 'calendar-hold' });
    await clearReason(pane, 'calendar-hold');
    await forgetFileSilence(pane);
    let lateWrite = null;
    try { lateWrite = await findWrittenCalendar(pane, ctx.calendarHoldKey); }
    catch (e) { glanceError('calendar receipt', e); }
    if (lateWrite) {
      try { await keepCalendarReceipt(pane, lateWrite); } catch (e) { glanceError('calendar receipt', e); }
      return;
    }
    await FlowStorage.appendLog({
      kind: 'shown',
      label: (hold.intent && hold.intent.label) || process.name,
      messageId: messageId,
      process: { id: process.id, name: process.name, steps: process.steps },
      intent: hold.intent,
      app: 'outlook',
      sender: ctx.sender,
      subject: ctx.subject,
      text: ctx.bodyText
    }).catch(() => {});
  }

  async function onCalendarDoIt(host, chip, ctx) {
    const token = captureMailToken();
    if (ignoreStaleClick(host)) return;
    doItInFlight = true;
    paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-pending', pageChrome().closing); });
    let wrote = null;
    try {
      const hold = (ctx && ctx.calendarHold) || {};
      if (ignoreStaleClick(host)) return;
      const r = await send({
        type: 'flow:execute-action',
        payload: { connectorId: 'outlookCalendar', params: hold.params || {}, messageId: ctx.messageId }
      });
      if (!r || !r.ok || !r.ref || !r.ref.eventId) {
        paintIfCurrent(token, function () { paintCalendarFailure(host, chip, r); });
        return;
      }
      const verified = r.fetchedBack === true;
      const status = verified ? pageChrome().handled : "Created, couldn't verify";
      const written = verified ? (r.written || 'On your calendar, with the file.') : status;
      wrote = { ref: r.ref, written: written, url: r.url || null, status: status };
      await FlowStorage.appendLog({
        kind: 'written',
        label: written,
        messageId: ctx.messageId,
        app: 'outlook',
        connectorId: 'outlookCalendar',
        ref: r.ref,
        where: r.where,
        url: r.url || null,
        fetchedBack: verified,
        receiptStatus: status,
        intent: ctx.intent,
        process: ctx.process,
        sender: ctx.sender,
        subject: ctx.subject,
        text: ctx.bodyText,
        outlookConversationId: ctx.outlookConversationId || null,
        pathId: ctx.pathId || null,
        itemId: ctx.itemId || null,
        calendarHoldKey: ctx.calendarHoldKey || calendarHoldKey(hold.params, hold.params && hold.params.fileTerm)
      });
      if (verified && ctx.messageId) {
        await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
        await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
      }
      paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
        status: status,
        written: written,
        url: r.url || null,
        linkLabel: pageChrome().openEvent,
        onUndo: calendarUndoHandler(host, ctx.messageId, r.ref)
      }); });
    } catch (e) {
      glanceError('calendar receipt', e);
      if (wrote && host && host.isConnected) {
        try {
          paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
            status: wrote.status || pageChrome().handled,
            written: wrote.written,
            url: wrote.url,
            linkLabel: pageChrome().openEvent,
            onUndo: calendarUndoHandler(host, ctx.messageId, wrote.ref)
          }); });
        } catch (e2) { glanceError('calendar receipt', e2); }
      }
    } finally {
      doItInFlight = false;
    }
  }

  // ---- Closes the worker offers on a mail, behind their own off switches ---------------------------------
  // Each one is the same shape on the canonical Do It card and its step list: the page asks the worker for a
  // plan (the worker owns the switch and the logic), shows the card on an offer, Do It writes through the
  // worker with a read-back by id, the receipt survives a reload, Undo leaves anything the person edited.
  //   - new-file:   an empty Word or Excel file from a request (ONEDRIVE_NEW_FILE)
  //   - event-link: a Teams link on an event already on the calendar (OUTLOOK_EVENT_CALL_LINK)
  // Both are quiet unless their switch is on and the scope they use is granted.

  function scopeOf(st, name) {
    const list = (typeof FlowOutlookCalendar !== 'undefined' && typeof FlowOutlookCalendar.normalizeDelegatedScopes === 'function')
      ? FlowOutlookCalendar.normalizeDelegatedScopes(calendarScopes(st))
      : null;
    return !!list && list.some((x) => String(x).toLowerCase() === name);
  }

  function openFileLabel() {
    return pageUiLang() === 'he' ? 'פתיחת הקובץ' : 'Open file';
  }

  function closeReasonLine(map, result) {
    const code = String((result && (result.reason || result.error)) || '');
    const he = pageUiLang() === 'he';
    return map[code] || (he ? 'לא הצלחתי לסיים, נסה שוב' : "Couldn't finish, try again");
  }

  function makeCloseChain(cfg) {
    const CHAIN = cfg.chain;

    // Newest row for this mail. A later Undo (outlookReopen) reopens it.
    async function findWritten(pane) {
      const bag = await FlowStorage.get();
      const log = (bag && bag.log) || [];
      const want = new Set([pane && pane.itemId, pane && pane.conversationId, pane && pane.pathId].map(canonKey).filter(Boolean));
      for (const e of log) {
        if (!e || e.connectorId !== cfg.connectorId) continue;
        const ids = [e.messageId, e.outlookConversationId, e.pathId, e.itemId].map(canonKey).filter(Boolean);
        if (!ids.some((id) => want.has(id))) continue;
        if (e.kind === 'undone' && e.outlookReopen) return null;
        if (e.kind === 'written' && e.ref && e.ref[cfg.refKey]) return e;
      }
      return null;
    }

    function undoHandler(host, messageId, ref) {
      return guardedUndo(host, async () => {
        const undoToken = captureMailToken();
        const u = await send({ type: 'flow:undo-action', connectorId: cfg.connectorId, ref: ref });
        if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed' || u.reason === 'verify-timeout' || u.reason === 'link-changed')) {
          return { ok: false, reason: u.reason, written: u.written };
        }
        if (!(u && u.ok)) return { ok: false, written: (u && u.written) || cfg.undoFailed };
        await FlowStorage.appendLog({
          kind: 'undone',
          label: (u && u.written) || cfg.undone,
          messageId: messageId,
          app: 'outlook',
          connectorId: cfg.connectorId,
          outlookReopen: true
        });
        if (messageId) await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: messageId });
        lastKey = '';
        lastSig = '';
        paintIfCurrent(undoToken, function () { paintRemove(host); });
        schedule();
        return { ok: true, written: (u && u.written) || cfg.undone, reopen: true };
      });
    }

    async function mountReceipt(pane, row, messageId) {
      const mount = mountPoint();
      if (!mount) return false;
      const token = pane && pane.__mailToken;
      const old = mount.querySelector('.flow-chip-host');
      if (old && old.classList.contains('flow-chip-settled') && old.getAttribute('data-glance-chain') === CHAIN) {
        lastOutcome = 'card';
        lastKey = (messageId || 'open') + '|' + CHAIN;
        return true;
      }
      if (old) paintIfCurrent(token, function () { paintRemove(old); });
      const host = paintIfCurrent(token, function () { return injectCard(mount, {
        app: 'outlook',
        doLabel: 'Do It',
        messageId: messageId,
        itemId: pane && pane.itemId,
        conversationId: pane && pane.conversationId,
        hydrateHow: pane && pane.hydrateHow,
        priorConversationId: pane && pane.priorConversationId,
        process: { id: CHAIN, name: cfg.name, steps: [{ kind: cfg.stepKind, id: 'close' }] },
        intent: { label: row.label || cfg.name },
        glanceChain: CHAIN,
        decisionReason: CHAIN
      }, { onDoIt: () => {}, onDismiss: (h) => { if (ignoreStaleClick(h)) return; const clickToken = captureMailToken(); paintIfCurrent(clickToken, function () { paintRemove(h); }); } }); });
      if (!host) return false;
      host.setAttribute('data-glance-chain', CHAIN);
      host.setAttribute('data-glance-message', messageId || '');
      lastOutcome = 'card';
      lastKey = (messageId || 'open') + '|' + CHAIN;
      const status = (row && row.receiptStatus) || pageChrome().handled;
      paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
        status: status,
        written: row.label || status,
        url: row.url || null,
        linkLabel: cfg.linkLabel(),
        onUndo: undoHandler(host, messageId, row.ref)
      }); });
      await clearReason(pane, CHAIN);
      return true;
    }

    async function showCard(pane, plan, messageId) {
      if (doItInFlight) return false;
      const mount = mountPoint();
      if (!mount) { await pageReason('page:no-mount', pane); return false; }
      const token = pane && pane.__mailToken;
      const old = mount.querySelector('.flow-chip-host');
      if (old && old.getAttribute('data-glance-chain') === CHAIN) { lastOutcome = 'card'; return true; }
      const label = cfg.cardLabel(plan);
      const process = {
        id: CHAIN,
        name: label,
        steps: (plan.steps || []).map((st) => ({ kind: st.kind, id: st.id, label: st.label, proof: st.proof })),
        closingLine: plan.line
      };
      const ctx = {
        app: 'outlook',
        doLabel: 'Do It',
        messageId: messageId,
        outlookIncomingId: messageId,
        outlookConversationId: (pane && pane.conversationId) || null,
        pathId: (pane && pane.pathId) || null,
        itemId: (pane && pane.itemId) || null,
        threadId: (pane && (pane.conversationId || pane.itemId)) || messageId,
        subject: (pane && pane.subject) || '',
        bodyText: holdTextOf(pane),
        sender: { name: pane && pane.senderName, email: pane && pane.senderEmail },
        intent: { label: label, kind: CHAIN, lang: plan.lang },
        process: process,
        closeChain: { params: cfg.paramsOf(plan) },
        glanceChain: CHAIN,
        decisionReason: CHAIN,
        hydrateHow: pane && pane.hydrateHow,
        priorConversationId: pane && pane.priorConversationId
      };
      if (old) paintIfCurrent(token, function () { paintRemove(old); });
      const host = paintIfCurrent(token, function () { return injectCard(mount, ctx, {
        onDoIt: (h, chip, c) => { onDoIt(h, chip, c); },
        onDismiss: (h, c) => { onDismiss(h, c); }
      }); });
      if (!host) { await pageReason('page:inject-failed', pane); return false; }
      host.setAttribute('data-glance-chain', CHAIN);
      host.setAttribute('data-glance-message', messageId || '');
      lastOutcome = 'card';
      lastKey = (messageId || 'open') + '|' + CHAIN;
      dbg('decision', { shown: true, chain: CHAIN, what: label });
      dbg('rendered', { messageId: messageId || null, chain: CHAIN });
      await clearReason(pane, CHAIN);
      await FlowStorage.appendLog({
        kind: 'shown',
        label: label,
        messageId: messageId,
        process: { id: process.id, name: process.name, steps: process.steps },
        intent: ctx.intent,
        app: 'outlook',
        sender: ctx.sender,
        subject: ctx.subject,
        text: ctx.bodyText
      }).catch(() => {});
      return true;
    }

    async function onDoIt(host, chip, ctx) {
      const token = captureMailToken();
      if (ignoreStaleClick(host)) return;
      doItInFlight = true;
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-pending', pageChrome().closing); });
      let wrote = null;
      try {
        const cc = (ctx && ctx.closeChain) || {};
        if (ignoreStaleClick(host)) return;
        const r = await send({
          type: 'flow:execute-action',
          payload: { connectorId: cfg.connectorId, params: cc.params || {}, messageId: ctx.messageId }
        });
        if (!r || !r.ok || !r.ref || !r.ref[cfg.refKey] || r.fetchedBack !== true) {
          paintIfCurrent(token, function () {
            if (chip) FlowChipHost.setChipState(chip, 'flow-chip-error', closeReasonLine(cfg.reasons(), r));
          });
          return;
        }
        const status = pageChrome().handled;
        const written = r.written || cfg.writtenDefault;
        wrote = { ref: r.ref, written: written, url: r.url || null, status: status };
        await FlowStorage.appendLog({
          kind: 'written',
          label: written,
          messageId: ctx.messageId,
          app: 'outlook',
          connectorId: cfg.connectorId,
          ref: r.ref,
          where: r.where,
          url: r.url || null,
          proof: r.proof || null,
          fetchedBack: true,
          receiptStatus: status,
          intent: ctx.intent,
          process: ctx.process,
          sender: ctx.sender,
          subject: ctx.subject,
          text: ctx.bodyText,
          outlookConversationId: ctx.outlookConversationId || null,
          pathId: ctx.pathId || null,
          itemId: ctx.itemId || null
        });
        if (ctx.messageId) {
          await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
          await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
        }
        paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
          status: status,
          written: written,
          url: r.url || null,
          linkLabel: cfg.linkLabel(),
          onUndo: undoHandler(host, ctx.messageId, r.ref)
        }); });
      } catch (e) {
        glanceError(CHAIN + ' receipt', e);
        if (wrote && host && host.isConnected) {
          try {
            paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
              status: wrote.status,
              written: wrote.written,
              url: wrote.url,
              linkLabel: cfg.linkLabel(),
              onUndo: undoHandler(host, ctx.messageId, wrote.ref)
            }); });
          } catch (e2) { glanceError(CHAIN + ' receipt', e2); }
        }
      } finally {
        doItInFlight = false;
      }
    }

    // Quiet unless the scope is granted and the worker's plan says offer. A receipt already written stays the card.
    async function settle(pane, st) {
      const messageId = (pane && (pane.itemId || pane.conversationId || pane.pathId)) || '';
      const row = await findWritten(pane);
      if (row) return mountReceipt(pane, row, row.messageId || messageId);
      if (!cfg.scopeOk(st)) return false;
      const text = ((pane && pane.subject) ? pane.subject + '. ' : '') + holdTextOf(pane);
      if (!String(text).trim()) return false;
      const plan = await send({ type: cfg.planMessage, text: text });
      if (!plan || plan.action !== 'offer' || !cfg.planOk(plan)) return false;
      return showCard(pane, plan, messageId);
    }

    return { settle: settle, chain: CHAIN };
  }

  const newFileChain = makeCloseChain({
    chain: 'new-file',
    connectorId: 'onedriveNewFile',
    planMessage: 'flow:new-file-plan',
    refKey: 'itemId',
    stepKind: 'drive',
    name: 'New file',
    undone: 'File removed from OneDrive.',
    undoFailed: 'Could not remove the file.',
    writtenDefault: 'New file in OneDrive.',
    linkLabel: openFileLabel,
    scopeOk: (st) => scopeOf(st, 'files.readwrite'),
    planOk: (plan) => Boolean(plan.fileName),
    cardLabel: (plan) => plan.fileName,
    paramsOf: (plan) => ({ fileKind: plan.fileKind, fileName: plan.fileName, name: plan.name }),
    reasons: () => ({
      'name-taken': pageUiLang() === 'he' ? 'כבר יש קובץ בשם הזה ב-OneDrive' : 'A file with that name is already in OneDrive > Glance',
      'files-not-granted': pageUiLang() === 'he' ? 'צריך הרשאה ל-OneDrive' : 'OneDrive needs to be allowed first',
      'not-connected': pageUiLang() === 'he' ? 'צריך להתחבר מחדש' : 'Reconnect Outlook'
    })
  });

  const eventLinkChain = makeCloseChain({
    chain: 'event-link',
    connectorId: 'outlookEventCallLink',
    planMessage: 'flow:event-link-plan',
    refKey: 'eventId',
    stepKind: 'calendar',
    name: 'Teams link',
    undone: 'Teams link removed from the event.',
    undoFailed: 'Could not remove the Teams link.',
    writtenDefault: 'Teams link on your event.',
    linkLabel: () => pageChrome().openEvent,
    scopeOk: (st) => (typeof FlowOutlookCalendar !== 'undefined' && FlowOutlookCalendar.hasWriteScope) ? FlowOutlookCalendar.hasWriteScope(calendarScopes(st)) : false,
    planOk: (plan) => Boolean(plan.event && plan.event.id),
    cardLabel: (plan) => (plan.event && plan.event.summary) || 'Teams link',
    paramsOf: (plan) => ({ event: plan.event }),
    reasons: () => ({
      'not-yours': pageUiLang() === 'he' ? 'האירוע לא שלך' : "That event isn't yours",
      'already-has-link': pageUiLang() === 'he' ? 'כבר יש קישור לאירוע' : 'The event already has a link',
      'event-gone': pageUiLang() === 'he' ? 'האירוע לא נמצא' : 'The event is gone',
      'not-connected': pageUiLang() === 'he' ? 'צריך להתחבר מחדש' : 'Reconnect Outlook'
    })
  });

  async function settleCloseChains(pane, st) {
    if (await newFileChain.settle(pane, st)) return newFileChain.chain;
    if (await eventLinkChain.settle(pane, st)) return eventLinkChain.chain;
    return '';
  }

  async function scan() {
    const token = captureMailToken();
    armRender();
    const st = await FlowStorage.get();
    if (!mailTokenLive(token)) return;
    const own = ownAddressesOf(st);
    let pane = keepSender(FlowOwaParse.readPane(document, location.href, { own: own, userName: userNameOf(st) }));
    if (pane) pane.ownNames = ownNamesOf(st);
    if (pane) pane.namesPending = outlookNamesNotCached(st, userNameOf(st));
    if (pane) {
      pane.text = stripGlanceLines(pane.text);
      pane.__epoch = mailEpoch;
    }
    bindMailToken(pane, token);
    const ids = FlowOwaParse.urlIds(location.href);
    const earlyPlanned = plannedRow(st, pane);
    const fileSig = pane && Array.isArray(pane.attachments)
      ? pane.attachments.map((a) => (a && a.name || '') + ':' + (a && a.size != null ? a.size : (a && a.sizeLabel || ''))).join(',')
      : '';
    const sig = pane
      ? [pane.conversationId || pane.itemId || '', pane.subject, pane.senderName, hashText(pane.text), pane.receivedDateTime || '', fileSig, (earlyPlanned && earlyPlanned.reason) || ''].join('|')
      : 'none|' + location.pathname;
    const armed = traceArmed || localFileTrace();
    // A click rewrites the chip. That must not re-enter the file chain: re-entry was what
    // set glanceOutlookFileTrace back to 0 on Do It. One trace per open message while armed.
    clearForeignHosts(pane);
    if (doItInFlight && document.querySelector('.flow-chip-host')) {
      dbg('decision', { shown: true, reason: 'page:do-it-in-flight' });
      return;
    }
    const earlyHost = document.querySelector('#ReadingPaneContainerId .flow-chip-host');
    const undoneOnly = earlyHost && earlyHost.getAttribute('data-glance-undone') === '1';
    const openGen = mailOpenGen;
    if (sig === lastSig && openGen === reconciledOpenGen && !(armed && tracedSig !== sig) && (lastOutcome === 'reason' || (lastOutcome === 'card' && earlyHost && !undoneOnly))) {
      if (lastOutcome === 'reason') {
        const whyMount = mountPoint();
        if (whyMount && !whyMount.querySelector('.flow-chip-host') && !whyMount.querySelector('.flow-why-not')) {
          paintIfCurrent(token, function () { return paintWhyNot(whyMount, lastLoggedReason || 'page:scan-skipped'); });
        }
        if (!lastReasonStored) {
          await pageReason(lastLoggedReason || 'page:same-signature', pane || { subject: (ids && (ids.raw || ids.conversationId || ids.itemId)) || '' });
        }
      }
      return;
    }
    reconciledOpenGen = openGen;
    lastSig = sig;
    lastOutcome = '';
    suggestNote = (pane && (pane.conversationId || pane.itemId || (pane.text && String(pane.text).trim()))) ? pane : null;
    if (!suggestNote && ids && ids.kind) {
      suggestNote = {
        itemId: ids.itemId || null,
        conversationId: ids.conversationId || null,
        pathId: ids.raw || null,
        subject: ids.raw || '',
        text: '',
        attachments: [],
        receivedDateTime: ''
      };
    }
    if (!pane) {
      // A message is open (its id is in the address) but its body could not be found: say so, with what was on the page.
      // The subject is the id from the address, so Why not shown can name the message.
      if (ids.kind) {
        const report = FlowOwaParse.rootsReport ? FlowOwaParse.rootsReport(document) : {};
        dbg('parsed', { ok: false, ids, anchors: report });
        const named = ids.raw || ids.itemId || ids.conversationId || '';
        await pageReason('page:pane-unreadable', { subject: named, conversationId: ids.conversationId, itemId: ids.itemId }, { anchors: report });
      } else {
        await pageReason('page:no-pane', { subject: (location && location.pathname) || '(no subject)' });
      }
      return;
    }
    dbg('parsed', { subject: pane.subject, sender: pane.senderEmail, senderName: pane.senderName, itemId: pane.itemId, conversationId: pane.conversationId, idSource: pane.idSource, chars: (pane.text || '').length });
    // Outlook must be connected (token present); otherwise no card, and the reason says why.
    if (!st || !st.outlookAuth || !st.outlookAuth.token) { dropStuckCard(pane); await pageReason('page:not-connected', pane); return; }
    try {
      const filled = await hydratePane(pane);
      if (filled) {
        pane = filled;
        pane.text = stripGlanceLines(pane.text);
        bindMailToken(pane, token);
        if (suggestNote) suggestNote = pane;
      }
    } catch (e) { glanceError('pane hydrate', e); }

    let draftHeldRow = null;
    try {
      const bagAfterHydrate = await FlowStorage.get();
      scanLogSnap = (bagAfterHydrate && bagAfterHydrate.log) || [];
      draftHeldRow = activeOutlookDraftRowInLog(scanLogSnap, pane);
    } catch (e) { draftHeldRow = null; scanLogSnap = []; }

    // A draft that is still in Drafts stays the receipt. A later scan (the
    // planned reason changed, another message was undone) must not put Do It
    // back on top of it. Undo is what removes it.
    try {
      if (draftHeldRow && await keepActiveDraftReceipt(pane)) {
        dbg('decision', { shown: true, reason: 'page:draft-receipt', subject: pane.subject });
        await clearReason(pane, 'page:draft-receipt');
        return;
      }
    } catch (e) {
      glanceError('draft receipt', e);
    }
    if (draftHeldRow) {
      schedule();
      return;
    }

    // A proved To Do task is mounted before a quiet return. The ids are the
    // Outlook item, the path, and the conversation — not a hash of the text.
    try {
      if (await remountProvedTodoReceipt(pane)) {
        dbg('decision', { shown: true, reason: 'page:receipt-mounted', subject: pane.subject });
        await clearReason(pane, 'page:receipt-mounted');
        return;
      }
      const earlyProof = await livePromiseProof({
        text: pane.text,
        sender: { name: pane.senderName, email: pane.senderEmail },
        messageId: pane.itemId || pane.pathId || pane.conversationId || '',
        itemId: pane.itemId || null,
        pathId: pane.pathId || null,
        threadId: pane.conversationId || '',
        outlookConversationId: pane.conversationId || ''
      }, pane);
      if (!mailTokenLive(token)) return;
      if (earlyProof) {
        const earlyMount = mountPoint();
        if (earlyMount && paintIfCurrent(token, function () { return paintOutlookTodoReceipt(earlyMount, earlyProof); })) {
          dbg('decision', { shown: true, reason: 'page:promise-proof', subject: pane.subject });
          await clearReason(pane, 'page:promise-proof');
          return;
        }
      }
    } catch (e) {
      glanceError('todo receipt', e);
      await pageReason('page:scan-error', pane);
      return;
    }

    try {
      const heldRow = await findWrittenCalendar(pane, '');
      if (heldRow && await keepCalendarReceipt(pane, heldRow)) {
        dbg('decision', { shown: true, reason: 'calendar-hold', subject: pane.subject });
        return;
      }
    } catch (e) {
      glanceError('calendar receipt', e);
    }

    // A new empty Word or Excel file asked for by name (switch ONEDRIVE_NEW_FILE, off): the worker decides.
    try {
      const closed = await settleCloseChains(pane, st);
      if (closed) {
        dbg('decision', { shown: true, reason: closed, subject: pane.subject });
        return;
      }
    } catch (e) {
      glanceError('new file', e);
    }

    // A file placed on the calendar is judged before note-to-self. The gate
    // mail is a note addressed only to yourself. A reply you sent to someone
    // else does not match this place pattern and still stays quiet below.
    if (typeof FlowOutlookCalendar !== 'undefined') {
      const probe = FlowOutlookCalendar.decide({
        text: holdTextOf(pane),
        subject: pane.subject || '',
        senderEmail: pane.senderEmail || null,
        senderName: pane.senderName || null,
        now: new Date()
      });
      if (probe && probe.move !== 'ignore') {
        await settleCalendarHold(pane, probe, st);
        return;
      }
    }

    let candidates = await outlookCandidates();
    let m = FlowOwaParse.matchEntryHow(pane, candidates);
    // Not judged yet (new mail, or the panel has not been opened): run one check from here, then look again.
    if (!m && !(st.outlookSync && st.outlookSync.needsSignIn)) {
      const r = await pageSync('pane');
      dbg('synced', { ok: r && r.ok, skipped: r && r.skipped, incoming: r && r.incoming, error: r && r.error });
      if (r && r.ok && !r.skipped) {
        candidates = await outlookCandidates();
        m = FlowOwaParse.matchEntryHow(pane, candidates);
      }
    }
    let entry = m ? m.entry : null;
    dbg('matched', m ? { how: m.how, messageId: entry.messageId, label: entry.intent && entry.intent.label, candidates: candidates.length } : { how: 'none', candidates: candidates.length });
    if (entry && pane.senderEmail) {
      const entryFrom = String((entry.sender && entry.sender.email) || (entry.base && entry.base.sender && entry.base.sender.email) || (entry.base && entry.base.counterpart && entry.base.counterpart.email) || '').toLowerCase();
      const openFrom = String(pane.senderEmail).toLowerCase();
      if (entryFrom && openFrom && entryFrom !== openFrom) {
        dbg('sender-mismatch', { how: m && m.how, from: entryFrom, open: openFrom });
        entry = null;
      }
    }

    // The open text and the mailbox check decide together. A stored card from an
    // older judgment (a Scheduling card kept after the mail became a file ask)
    // does not win. A receipt with no process is the draft we already wrote.
    let decided = null;
    const bag = await FlowStorage.get();
    const planned = plannedRow(bag, pane);
    const selfPlanned = planned || unconfirmedSyncRow(bag, pane);
    const receiptOnly = Boolean(entry && entry.outlookReceipt && entry.ref && !entry.process);
    const ownAll = await ownWithAliases(own);
    // The header walk leaves the person's own address off the pane so it is
    // never the counterpart. A mail addressed to that same person still has
    // the address on the persona. Put it back only then, so the judge sees
    // an incoming ask and a mail to someone else stays quiet.
    const headerFrom = String(pane.senderEmail || pane.ownSenderEmail || '').trim().toLowerCase();
    if (!pane.senderEmail && headerFrom && typeof FlowIntent !== 'undefined' && typeof FlowIntent.addressedToSelf === 'function' && FlowIntent.addressedToSelf({
      senderEmail: headerFrom,
      to: pane.to,
      cc: pane.cc,
      ownAddresses: ownAll,
      onBehalfOf: pane.onBehalfOf || null,
      forwarded: pane.onBehalf === true
    })) pane.senderEmail = headerFrom;
    const selfAddressed = typeof FlowIntent !== 'undefined' && typeof FlowIntent.addressedToSelf === 'function' && FlowIntent.addressedToSelf({
      senderEmail: pane.senderEmail || headerFrom,
      to: pane.to,
      cc: pane.cc,
      ownAddresses: ownAll,
      onBehalfOf: pane.onBehalfOf || null,
      forwarded: pane.onBehalf === true
    });
    const selfMail = !receiptOnly && !selfAddressed && (ownSender(pane.senderEmail || headerFrom, ownAll) || personaOwnSender(ownAll) || (selfPlanned && (selfPlanned.reason === 'note-to-self' || selfPlanned.reason === 'own-sender')));
    if (selfMail) {
      dropStuckCard(pane);
      await pageReason('note-to-self', pane);
      return;
    }
    if (selfAddressed) pane.noteToSelf = true;
    if (!receiptOnly) {
      pane.userName = userNameOf(st);
      const preparedScan = (typeof FlowIncomingJudge !== 'undefined' && FlowIncomingJudge.prepareForJudge)
        ? FlowIncomingJudge.prepareForJudge(pane.text || '')
        : (pane.text || '');
      const ownScan = (typeof FlowGraphMail !== 'undefined' && FlowGraphMail.ownText) ? FlowGraphMail.ownText(preparedScan) : preparedScan;
      const closesScan = typeof FlowGoogleCloses !== 'undefined' ? FlowGoogleCloses : null;
      const needsSaveScan = closesScan && typeof closesScan.needsOneAttachment === 'function' && closesScan.needsOneAttachment(ownScan);
      const saveAttachScan = needsSaveScan;
      let replyTrackScan = false;
      if (!needsSaveScan && typeof FlowIncomingJudge !== 'undefined') {
        const probe = FlowIncomingJudge.judge({
          text: ownScan, subject: pane.subject || '',
          sender: { name: pane.senderName, email: pane.senderEmail },
          now: new Date(), surface: 'outlook',
          attachmentCount: 0, hasThreadAttachment: false,
          to: pane.to || null, cc: pane.cc || null,
          ownAddresses: selfAddressed ? ownAll : own,
          inbound: Boolean(selfAddressed) || true
        });
        replyTrackScan = Boolean(probe && probe.show && probe.process && needsJudgedReplyTarget(probe.process));
      }
      if (!saveAttachScan && replyTrackScan && conversationPanePathKey(pane) && !pane.itemId) {
        const exactPinEarly = await exactConversationPaneMessageId(pane, own, pane.senderEmail);
        if (exactPinEarly && exactPinEarly.unread) {
          dropStuckCard(pane);
          await pageReason(exactPinEarly.reason, pane);
          return;
        }
        if (!exactPinEarly || !exactPinEarly.id) {
          dropStuckCard(pane);
          await pageReason('page:reply-target-unsure', pane);
          return;
        }
      }
      decided = await decideFromText(pane, selfAddressed ? ownAll : own, entry);
      if (decided && decided.reason === 'third-party') {
        dropStuckCard(pane);
        await pageReason('page:third-party', pane);
        return;
      }
      if (decided && !decided.none && decided.process && conversationPanePathKey(pane) && !pane.itemId
        && needsJudgedReplyTarget(decided.process) && !saveAttachScan) {
        const exactPin = await exactConversationPaneMessageId(pane, own, pane.senderEmail);
        if (exactPin && exactPin.unread) {
          dropStuckCard(pane);
          await pageReason(exactPin.reason, pane);
          return;
        }
        if (!exactPin || !exactPin.id) {
          dropStuckCard(pane);
          await pageReason('page:reply-target-unsure', pane);
          return;
        }
      }
      // Either side saying this is a file ask is enough to run the chain.
      // A stored schedule process used to skip this and leave the old card up
      // while Why not shown already said drive-search-failed.
      const fileNow = (decided && (filePendingReason(decided.reason) || fileSilenceReason(decided.reason))) || (planned && fileSilenceReason(planned.reason));
      const invitePlan = (typeof FlowIntent !== 'undefined' && typeof FlowIntent.attachToInvitePlan === 'function')
        ? FlowIntent.attachToInvitePlan(pane.text || '') : null;
      if (fileNow && !invitePlan) {
          const tracing = traceArmed || localFileTrace();
          graphTrace = { attempts: [] };
          const askPrepared = (typeof FlowIncomingJudge !== 'undefined' && FlowIncomingJudge.prepareForJudge)
            ? FlowIncomingJudge.prepareForJudge(pane.text || '')
            : (pane.text || '');
          const askText = (typeof FlowGraphMail !== 'undefined' && FlowGraphMail.ownText) ? FlowGraphMail.ownText(askPrepared) : askPrepared;
          let ran = null;
          let finalReason = 'file-chain-not-run';
          let prepareWhy = null;
          let msgIdHow = null;
          try {
            ran = await resolveFileChain(askText, pageThreadFiles(), pane.conversationId || pane.itemId, tracing);
            const chain = ran && ran.chain;
            let msgId = pane.itemId || null;
            let msgImmutable = false;
            msgIdHow = msgId ? 'url' : null;
            if (chain && (chain.move === 'needs-you' || chain.move === 'prepare') && (pane.pathId || pane.conversationId) && !msgId && paneUrlOnlyMessageTarget(pane)) {
              const found = await resolveMessageIdForFilePrepare(pane, own, pane.senderEmail);
              if (found && found.unread) msgIdHow = 'sender-mismatch';
              else if (found && found.id) { msgId = found.id; msgIdHow = found.how; msgImmutable = found.immutable === true; }
              else if (!msgId) msgIdHow = 'none';
            }
            if (chain && chain.move === 'needs-you') {
              const shown = await showHoldingChain(pane, chain, msgId);
              finalReason = shown ? 'needs-you' : 'page:no-message-id';
              if (!shown) { dropStuckCard(pane); await pageReason(finalReason, pane); }
              return;
            }
            if (chain && chain.move === 'prepare') {
              const file = chain.hit && chain.hit.file;
              if (file && file.id && chain.hit.source === 'drive') {
                const shown = await showFilePrepare(pane, chain, msgId, msgIdHow, msgImmutable);
                prepareWhy = shown.why;
                if (shown.shown) { finalReason = 'prepare'; return; }
                finalReason = shown.why === 'no-mount' ? 'page:no-mount' : (shown.why === 'inject-failed' ? 'page:inject-failed' : ('page:' + (shown.why || 'prepare')));
              } else {
                prepareWhy = !file || !file.id ? 'no-file' : 'not-drive';
                finalReason = 'page:' + prepareWhy;
              }
              dropStuckCard(pane);
              await pageReason(finalReason, pane);
              return;
            }
            finalReason = namedSilence((ran && ran.quiet) || (chain && chain.reason) || 'file-chain-not-run');
            dropStuckCard(pane);
            await pageReason(finalReason, pane);
          } finally {
            if (tracing) {
              const searched = ran && ran.searched;
              const files = searched && Array.isArray(searched.files) ? searched.files : [];
              logFileTrace({
                decide: {
                  show: Boolean(decided && !decided.none),
                  reason: (decided && decided.reason) || null,
                  type: decided && decided.intent && decided.intent.type || null,
                  label: decided && decided.intent && decided.intent.label || null
                },
                resolveFileChain: ran ? (ran.ran ? 'searched' : 'not-run') : 'not-called',
                gate: ran && ran.gate ? { kind: ran.gate.kind, reason: ran.gate.reason || null, id: ran.gate.ask && ran.gate.ask.id || null } : null,
                driveQuery: (ran && ran.query) || null,
                search: searched ? {
                  ok: searched.ok === true,
                  status: searched.status || 0,
                  error: searched.error || searched.reason || null,
                  fileCount: searched.ok === true ? (typeof searched.fileCount === 'number' ? searched.fileCount : files.length) : 0
                } : null,
                scopes: (searched && searched.scopes) || null,
                showFilePrepare: prepareWhy,
                messageIdFrom: msgIdHow,
                final: finalReason,
                pathId: pane.pathId || null,
                conversationId: pane.conversationId || null,
                itemId: pane.itemId || null,
                graph: graphTraceSnapshot()
              });
              tracedSig = sig;
            }
          }
          return;
        }
        if (decided && decided.reason === 'names-pending') {
          dropStuckCard(pane);
          return;
        }
        if (!decided || decided.none) {
          try {
            const loop = await openLoopForPane(pane);
            if (loop && await showOpenLoopCard(pane, loop)) {
              dbg('decision', { shown: true, reason: 'page:still-open', subject: pane.subject });
              return;
            }
          } catch (e) {
            glanceError('still open', e);
          }
          if (decided && decided.reason === 'signed-save-suggest') {
            dropStuckCard(pane);
            await clearReason(pane);
            pane.__signedSaveJudge = { intent: decided.intent, process: decided.process };
            pane.attachmentsLoading = !((pane.attachments || []).filter((a) => a && !a.isInline).length);
            suggestNote = pane;
            if (pane.attachmentsLoading) armAttachChipRescan(pane);
            await recordSuggestNote();
            return;
          }
          const keepFile = typeof FlowOutlookSync !== 'undefined' && typeof FlowOutlookSync.keepMailboxFileCard === 'function'
            && FlowOutlookSync.keepMailboxFileCard(decided, entry);
          if (!keepFile) {
            if (decided && (decided.reason === 'page:attachment-count-unread' || decided.attachmentsUnread) && decided.intent && decided.process) {
              decided = { intent: decided.intent, process: decided.process, attachmentsUnread: true };
            } else if (decided && decided.attachmentsUnread) {
              dropStuckCard(pane);
              await pageReason('outlook:attachments-not-read', pane);
              return;
            } else if (decided && decided.reason === 'page:attachment-count-unread' && !decided.intent) {
              const retry = await decideFromText(pane, selfAddressed ? ownAll : own, entry);
              if (retry && !retry.none && retry.intent && retry.process) {
                decided = Object.assign({}, retry, { attachmentsUnread: true });
              } else {
                dropStuckCard(pane);
                await pageReason('outlook:attachments-not-read', pane);
                return;
              }
            } else if (pane.noteToSelf && selfAddressed) {
              const hasTask = entry && entry.process && (entry.process.steps || []).some((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask'));
              if (await paintNoteToSelfAckCard(pane, hasTask)) return;
              dropStuckCard(pane);
              await pageReason('page:intent-null', pane);
              return;
            } else {
              dropStuckCard(pane);
              const named = (decided && decided.reason) || 'intent-null';
              const quiet = named === 'page:attachment-count-unread' || named === 'attachment-count-unread'
                ? 'outlook:attachments-not-read'
                : (/:/.test(String(named)) ? String(named) : ('page:' + named));
              await pageReason(quiet, pane);
              return;
            }
          } else if (decided && decided.none) {
            decided = { intent: entry.intent, process: entry.process };
          }
        }
      if (!entry || (entry.process && decided && decided.process && entry.process.id !== decided.process.id)) {
        // createReply needs a Graph message id. The address gives one, or the conversation it belongs to.
        let msgId = pane.itemId || null;
        let replyId = null;
        if (!msgId && (pane.pathId || pane.conversationId)) {
          if (decided && decided.attachmentsUnread && !pane.itemId) {
            dbg('resolved', { conversationId: pane.conversationId, pathId: pane.pathId || null, messageId: null, attachmentsUnread: true });
          } else {
            const proc = decided && decided.process;
            let replyTarget = null;
            if (proc && proc.id === 'file-it' && !pane.itemId && conversationPanePathKey(pane)) {
              const looseAmbig = await fileItLooseOpenPaneAmbiguous(pane, pane.senderEmail);
              if (looseAmbig) {
                dropStuckCard(pane);
                await pageReason('page:reply-target-unsure', pane);
                return;
              }
              if (!saveAttachScan) {
                const fileAmbig = await fileItPaneAttachmentTargetAmbiguous(pane, own, pane.senderEmail);
                if (fileAmbig) {
                  dropStuckCard(pane);
                  await pageReason('page:reply-target-unsure', pane);
                  return;
                }
              }
            }
            if (conversationPanePathKey(pane) && processNeedsConversationMessageId(proc)) {
              replyTarget = await exactConversationPaneMessageId(pane, own, pane.senderEmail);
            } else {
              const judged = needsJudgedReplyTarget(proc);
              replyTarget = judged
                ? await resolveJudgedReplyMessageId(pane, own, pane.senderEmail)
                : await resolveMessageIdForFilePrepare(pane, own, pane.senderEmail);
            }
            if (replyTarget && replyTarget.unread) {
              dbg('resolved', { conversationId: pane.conversationId, pathId: pane.pathId || null, mismatch: true, from: replyTarget.from || null });
              dropStuckCard(pane);
              await pageReason(replyTarget.reason, pane);
              return;
            }
            replyId = replyTarget && replyTarget.id ? replyTarget.id : null;
            if (!replyId && conversationPanePathKey(pane) && processNeedsConversationMessageId(proc)
              && !(saveAttachScan && proc && proc.id === 'file-it')) {
              dropStuckCard(pane);
              await pageReason('page:reply-target-unsure', pane);
              return;
            }
            msgId = replyId;
            dbg('resolved', { conversationId: pane.conversationId, pathId: pane.pathId || null, messageId: msgId, replyId: replyId, attachmentsUnread: Boolean(decided && decided.attachmentsUnread) });
          }
        }
        if (!msgId && !(decided && decided.attachmentsUnread) && needsJudgedReplyTarget(decided && decided.process)) {
          dropStuckCard(pane);
          await pageReason('page:reply-target-unsure', pane);
          return;
        }
        entry = {
          messageId: msgId,
          outlookIncomingId: replyId || msgId,
          outlookConversationId: pane.conversationId || null,
          subject: pane.subject,
          text: pane.text,
          sender: { name: pane.senderName, email: pane.senderEmail },
          intent: decided.intent,
          process: decided.process,
          attachmentsUnread: Boolean(decided.attachmentsUnread)
        };
      } else {
        if (processNeedsConversationMessageId((decided && decided.process) || (entry && entry.process))
          && conversationPanePathKey(pane) && !pane.itemId) {
          const procHeld = (decided && decided.process) || (entry && entry.process);
          if (procHeld && procHeld.id === 'file-it') {
            const looseHeld = await fileItLooseOpenPaneAmbiguous(pane, pane.senderEmail);
            if (looseHeld) {
              dropStuckCard(pane);
              await pageReason('page:reply-target-unsure', pane);
              return;
            }
          }
          const replyTarget = await exactConversationPaneMessageId(pane, own, pane.senderEmail);
          if (replyTarget && replyTarget.unread) {
            dropStuckCard(pane);
            await pageReason(replyTarget.reason, pane);
            return;
          }
          const exactId = replyTarget && replyTarget.id ? replyTarget.id : null;
          if (!exactId) {
            dropStuckCard(pane);
            await pageReason('page:reply-target-unsure', pane);
            return;
          }
          if (String(exactId) !== String(entry.messageId || '')) {
            entry = Object.assign({}, entry, {
              messageId: exactId,
              outlookIncomingId: exactId
            });
          }
        }
        entry = Object.assign({}, entry, {
          intent: decided.intent,
          process: decided.process,
          attachmentsUnread: Boolean(decided.attachmentsUnread || entry.attachmentsUnread)
        });
      }
    } else {
      dbg('judged', { show: true, type: entry.intent && entry.intent.type, label: entry.intent && entry.intent.label, from: 'mailbox check' });
    }

    // A draft receipt stays on the message that wrote it. A file save is
    // not this card: that one says Handled, and only on its own file.
    if (entry.outlookReceipt && entry.ref && !entry.process && entry.connectorId === 'outlookDraft') {
      const mount = mountPoint();
      if (!mount) { await pageReason('page:no-mount', pane); return; }
      if (mount.querySelector('.flow-chip-host')) {
        lastOutcome = 'card';
        await clearReason(pane, 'page:receipt-mounted');
        return;
      }
      if (!mailTokenLive(token)) return;
      const host = paintIfCurrent(token, function () { return injectCard(mount, stampEpoch({
        process: { name: 'Reply', id: 'reply', steps: [{ kind: 'outlookDraft', id: 'outlookDraft' }] },
        intent: { label: entry.label || 'Reply draft ready' },
        messageId: entry.messageId,
        itemId: pane.itemId,
        conversationId: pane.conversationId,
        hydrateHow: pane.hydrateHow,
        priorConversationId: pane.priorConversationId,
        decisionReason: 'page:receipt-mounted'
      }, pane), { onDoIt: () => {}, onDismiss: (h) => { if (ignoreStaleClick(h)) return; const clickToken = captureMailToken(); paintIfCurrent(clickToken, function () { paintRemove(h); }); } }); });
      if (host) {
        lastOutcome = 'card';
        dbg('rendered', { receipt: true, messageId: entry.messageId });
        const draftWritten = entry.label || 'Reply draft ready in Outlook Drafts. Not sent.';
        paintIfCurrent(token, function () { FlowChipHost.showDraftReceipt(host, {
          status: draftUnverifiedStatus(draftWritten),
          written: draftWritten,
          url: entry.url || entry.where,
          onUndo: guardedUndo(host, async () => {
            const undoToken = captureMailToken();
            const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: entry.ref, created: entry.created });
            if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed')) return { ok: false, reason: u.reason, written: u.written };
            if (u && u.ok && typeof FlowStorage.markOutlookDraftUndone === 'function') {
              await FlowStorage.markOutlookDraftUndone(entry.messageId, entry.ref);
            }
            if (u && u.ok) await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: entry.messageId, draftOnly: true });
            if (!(u && u.ok)) return { ok: false, written: (u && u.written) || 'Could not remove the draft.' };
            lastKey = '';
            paintIfCurrent(undoToken, function () { paintRemove(host); });
            schedule();
            return { ok: true, written: u.written || 'Reply draft removed. Not sent.', reopen: true };
          })
        }); });
      }
      await clearReason(pane, 'page:receipt-mounted');
      return;
    }

    if (!receiptOnly && await promiseOwnedElsewhere(pane, decided && decided.intent, [entry && entry.messageId, entry && entry.outlookIncomingId])) {
      dropStuckCard(pane);
      await pageReason('page:same-promise', pane);
      return;
    }

    pane.ownAddresses = ownAll;
    const ctx = buildCtx(entry, pane, decided);
    if (!ctx || (!ctx.messageId && !ctx.attachmentsUnread)) { await pageReason('page:no-process', pane); return; }
    const receipts = typeof FlowStorage.getActiveOutlookReceipts === 'function'
      ? await FlowStorage.getActiveOutlookReceipts() : [];
    const hasReceipt = ctx.messageId && receipts.some((r) => r.messageId === ctx.messageId);
    const verifyMount = mountPoint();
    if (ctx.messageId && !hasReceipt && typeof FlowStorage.verifyGateFrom === 'function') {
      const gate = FlowStorage.verifyGateFrom(await FlowStorage.get(), ctx.messageId);
      if (gate === 'verifying') {
        if (!mailTokenLive(token)) return;
        paintIfCurrent(token, function () {
          if (verifyMount && !verifyMount.querySelector('[data-glance-verifying]')) {
            const host = document.createElement('div');
            host.className = 'flow-chip-host';
            host.setAttribute('data-glance-verifying', '1');
            const label = document.createElement('span');
            label.className = 'flow-chip-label';
            label.textContent = pageChrome().verifyingNow;
            host.appendChild(label);
            if (verifyMount.firstChild) verifyMount.insertBefore(host, verifyMount.firstChild);
            else verifyMount.appendChild(host);
          }
        });
        lastOutcome = 'card';
        const held = verifyMount && verifyMount.querySelector('[data-glance-verifying]');
        if (held) {
          stampCard(held, {
            messageId: ctx.messageId,
            itemId: pane.itemId,
            conversationId: pane.conversationId,
            subject: pane.subject,
            hydrateHow: pane.hydrateHow,
            priorConversationId: pane.priorConversationId,
            intent: { label: 'Verifying' },
            process: { id: 'verify', steps: [] },
            decisionReason: 'shown'
          }, 'shown');
        }
        await clearReason(pane, 'shown');
        return;
      }
      const verifying = verifyMount && verifyMount.querySelector('.flow-chip-host[data-glance-verifying]');
      if (verifying) paintIfCurrent(token, function () { paintRemove(verifying); });
    }
    // Same still-open rule as the popup: draft-only undo (outlookReopen) is NOT
    // terminal, so Do It must be eligible again after Undo.
    if (ctx.messageId && await FlowStorage.hasTerminalOutcome(ctx.messageId) && !hasReceipt) { await pageReason('page:already-handled', pane); return; }
    if (await activeOutlookDraftForPane(pane)) {
      if (await keepActiveDraftReceipt(pane)) {
        dbg('decision', { shown: true, reason: 'page:draft-receipt', subject: pane.subject });
        await clearReason(pane, 'page:draft-receipt');
        return;
      }
      return;
    }
    const livePromise = await livePromiseProof(promiseItem(ctx, pane), pane);
    if (livePromise) {
      if (!mailTokenLive(token)) return;
      if (mountPoint() && paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mountPoint(), livePromise); })) {
        dbg('decision', { shown: true, reason: 'page:promise-proof', subject: pane.subject });
        await clearReason(pane, 'page:promise-proof');
        return;
      }
      await pageReason('page:same-promise', pane);
      return;
    }

    const key = ctx.messageId + '|' + (ctx.intent && ctx.intent.label);
    const mount = mountPoint();
    if (!mount) { await pageReason('page:no-mount', pane); return; }
    const existing = mount.querySelector('.flow-chip-host');
    const settledUndo = existing && existing.classList.contains('flow-chip-settled') && existing.querySelector('.flow-chip-undo');
    const settledCalendar = existing && existing.classList.contains('flow-chip-settled') && existing.getAttribute('data-glance-chain') === 'calendar-hold';
    const draftStill = (receipts || []).some((row) => draftMatchesPane(row, pane));
    // Settled receipt with no active draft (e.g. Undo from the popup while this
    // pane is open): tear down so Do It can return. A draft or a meeting hold
    // that storage still has stays, including when the scan's key moved.
    if (existing && existing.classList.contains('flow-chip-settled') && !hasReceipt && !draftStill && !settledCalendar) {
      paintIfCurrent(token, function () { paintRemove(existing); });
      lastKey = '';
    }
    if ((settledUndo && (hasReceipt || draftStill)) || settledCalendar) {
      lastOutcome = 'card';
      return;
    }
    if (mount.querySelector('.flow-chip-host') && key === lastKey) { lastOutcome = 'card'; return; }
    if (!mailTokenLive(token)) return;
    const old = mount.querySelector('.flow-chip-host');
    if (old) paintIfCurrent(token, function () { paintRemove(old); });
    lastKey = key;

    const holdCard = ctx.process.id === 'hold' || ctx.glanceChain === 'calendar-hold';
    if (holdCard && !meetingClock(ctx)) {
      await pageReason('page:hold-without-clock', pane);
      return;
    }
    if (taskOnlyProcess(ctx.process) && todoAsk(st)) {
      const asked = paintIfCurrent(token, function () { return paintTodoScopeCard(mount, ctx); });
      if (!asked) { await pageReason('page:inject-failed', pane); return; }
      const askedIds = [ctx.messageId, pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
      if (askedIds.length) asked.setAttribute('data-glance-message', askedIds.join('|'));
      lastOutcome = 'card';
      await clearReason(pane, 'tasks-not-granted');
      return;
    }

    const host = paintIfCurrent(token, function () {
      const painted = injectCard(mount, ctx, {
        onDoIt: (h, chip, c, steps) => { onDoIt(h, chip, c, steps); },
        onDismiss: (h, c) => { onDismiss(h, c); }
      });
      const hasTaskRow = (ctx.process && ctx.process.steps || []).some((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
      if (painted && ctx.attachmentsUnread && typeof FlowOutlookAttachmentEvidence !== 'undefined') {
        paintHint(painted, FlowOutlookAttachmentEvidence.attachUnreadBanner(pageUiLang()));
      }
      if (painted && ctx.attachmentsLoading && typeof FlowOutlookAttachmentEvidence !== 'undefined') {
        paintHint(painted, FlowOutlookAttachmentEvidence.attachmentsLoadingLine(pageUiLang()));
        armAttachChipRescan(pane);
      }
      if (painted && typeof FlowOutlookAttachmentEvidence !== 'undefined') {
        const acct = st && st.outlookAuth && st.outlookAuth.account && st.outlookAuth.account.address;
        const from = ctx.sender && ctx.sender.email ? String(ctx.sender.email).toLowerCase() : '';
        const noteSelf = ctx.noteToSelf === true || (pane && pane.noteToSelf === true) ||
          (ctx.intent && ctx.intent.selfTask === true) ||
          (from && acct && from === String(acct).toLowerCase());
        if (noteSelf) {
          paintNoteHint(painted, FlowOutlookAttachmentEvidence.noteToSelfLine(pageUiLang(), { taskSuggested: hasTaskRow }));
        }
      }
      if (painted) paintMissingScope(painted, ctx, st);
      return painted;
    });
    if (!host) { await pageReason('page:inject-failed', pane); return; }
    const tagged = [ctx.messageId, pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
    if (tagged.length) host.setAttribute('data-glance-message', tagged.join('|'));
    if (pane.noteToSelf && typeof FlowOutlookAttachmentEvidence !== 'undefined') {
      paintIfCurrent(token, function () {
        if (!host.querySelector('.flow-chip-note-hint')) {
          const taskOnCard = (ctx.process && ctx.process.steps || []).some((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
          const noteLine = FlowOutlookAttachmentEvidence.noteToSelfLine(pageUiLang(), { taskSuggested: taskOnCard });
          if (noteLine) paintNoteHint(host, noteLine);
        }
      });
    }
    lastOutcome = 'card';
    dbg('decision', { shown: true, label: ctx.intent && ctx.intent.label });
    dbg('rendered', { messageId: ctx.messageId, label: ctx.intent && ctx.intent.label });
    await clearReason(pane, 'shown');

    await FlowStorage.appendLog({
      kind: 'shown',
      label: activityLabel(ctx),
      messageId: ctx.messageId,
      score: ctx.intent.signals && ctx.intent.signals.score,
      signals: ctx.intent.signals,
      process: { id: ctx.process.id, name: ctx.process.name, steps: ctx.process.steps },
      intent: ctx.intent,
      app: 'outlook',
      sender: ctx.sender,
      subject: ctx.subject,
      text: ctx.bodyText,
      outlookIncomingId: ctx.outlookIncomingId,
      threadId: (pane && pane.conversationId) || ctx.threadId || null,
      outlookConversationId: (pane && pane.conversationId) || ctx.conversationId || null,
      itemId: ctx.itemId || (pane && pane.itemId) || null,
      pathId: ctx.pathId || (pane && pane.pathId) || null,
      threadUrl: ctx.threadUrl
    }).catch(() => {});
  }

  // The open message's body, or the reading pane around it: never the message list.
  function mountPoint() {
    const roots = FlowOwaParse.readingPaneRoots(document);
    const root = typeof FlowOwaParse.openBodyRoot === 'function' ? FlowOwaParse.openBodyRoot(roots) : roots[0];
    if (root) return root.parentElement || root;
    return document.querySelector('#ReadingPaneContainerId') || null;
  }

  // The open message's words, without the card Glance just painted. A Handled
  // line inside the pane is not a different mail.
  function stripGlanceLines(text) {
    return String(text || '')
      .replace(/Glance will look at this mail again when this tab is back\.?/g, '')
      .replace(/Connect Microsoft to close this loop\.?/g, '')
      .replace(/Glance is still reading this mail\.?/g, '')
      .replace(/Glance stayed quiet on this mail\.?/g, '')
      .replace(/Glance התעדכן — רענן את הדף כדי להתחבר מחדש/g, '')
      .replace(/אין הרשאת To Do/g, '')
      .replace(/לא זוהתה בקשה/g, '')
      .replace(/משתמש חיצוני/g, '')
      .replace(/לא מחובר/g, '')
      .replace(/התוסף התעדכן/g, '')
      .replace(/עדיין קורא את המייל/g, '')
      .replace(/צריך הרשאה ליומן/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function readingText(node) {
    if (!node) return '';
    let clone = null;
    try { clone = node.cloneNode(true); } catch (e) { clone = null; }
    if (!clone) return String(node.textContent || '');
    const ours = clone.querySelectorAll ? clone.querySelectorAll('.flow-chip-host, .flow-chip-consent, .flow-why-not') : [];
    for (let i = ours.length - 1; i >= 0; i--) {
      if (ours[i].parentNode) ours[i].parentNode.removeChild(ours[i]);
    }
    return String(clone.textContent || '');
  }

  // Live OWA opens a mail by replacing the reading pane (role=document and
  // the CONV_ subject id) and then the address. The page captured
  // history.pushState before this script, so that wrapper is not the signal.
  let lastPaneSignal = '';
  let paneDirty = false;
  // One number per mail open. The same conversation opened again is a new
  // open. A matching signature must not skip that open's reconcile.
  let mailOpenGen = 0;
  let reconciledOpenGen = -1;
  function markMailOpened() {
    mailOpenGen += 1;
  }
  let paneWatch = null;
  let paneObs = null;
  let attachChipObs = null;
  let attachChipWatchKey = '';
  function readingPaneSignal() {
    let href = '';
    let conv = '';
    let doc = '';
    try { href = location.href || ''; } catch (e) { href = ''; }
    try {
      const node = document.querySelector('#ReadingPaneContainerId [id^="CONV_"][id$="_SUBJECT"]')
        || document.querySelector('[data-testid="ReadingPane"] [id^="CONV_"][id$="_SUBJECT"]')
        || document.querySelector('[data-app-section="ReadingPane"] [id^="CONV_"][id$="_SUBJECT"]')
        || document.querySelector('[role="main"] [id^="CONV_"][id$="_SUBJECT"]');
      conv = node && node.id ? node.id : '';
    } catch (e) { conv = ''; }
    try {
      const root = openMailRoot();
      const body = root && root.querySelector ? (root.querySelector('div[role="document"]') || root.querySelector('[role="document"]')) : null;
      doc = body ? hashText(readingText(body).replace(/\s+/g, ' ').trim().slice(0, 240)) : '';
    } catch (e) { doc = ''; }
    return href + '|' + conv + '|' + doc;
  }

  function noteReadingPaneOpen() {
    const signal = readingPaneSignal();
    const changed = Boolean(signal) && signal !== lastPaneSignal;
    if (changed) lastPaneSignal = signal;
    if (!changed && !paneDirty) return false;
    paneDirty = false;
    lastSig = '';
    lastKey = '';
    // The same conversation opened again is still an open. The signature
    // cache cannot skip its reconcile.
    markMailOpened();
    // A new message in the pane is a mail switch even when pushState was
    // already captured. Bump before the fast scan so A's reconcile cannot draw.
    if (changed) bumpMailEpoch('reading-pane');
    return true;
  }

  // A node Glance painted. Appending the card is not a mail open, or the
  // scan would clear its own key and read the task again forever.
  function glancePaneNode(node) {
    if (!node) return false;
    if (node.nodeType === 3) {
      const parent = node.parentNode;
      return Boolean(parent && parent.closest && parent.closest('.flow-chip-host, .flow-chip-consent, .flow-why-not'));
    }
    if (node.nodeType !== 1) return false;
    const cls = node.classList;
    if (cls && (cls.contains('flow-chip-host') || cls.contains('flow-chip-consent') || cls.contains('flow-skip-host') || cls.contains('flow-why-not'))) return true;
    return Boolean(node.closest && node.closest('.flow-chip-host, .flow-chip-consent, .flow-why-not'));
  }

  // OWA paints attachment chips after the body. One rescan when they appear.
  function armAttachChipRescan(pane) {
    if (!pane || typeof MutationObserver === 'undefined') return;
    const key = String(mailEpoch) + '|' + String(pane.conversationId || '') + '|' + String(pane.itemId || '');
    if (attachChipWatchKey === key) return;
    attachChipWatchKey = key;
    if (attachChipObs) {
      try { attachChipObs.disconnect(); } catch (e) { /* sealed */ }
      attachChipObs = null;
    }
    let tried = false;
    const root = document.querySelector('#ReadingPaneContainerId')
      || document.querySelector('[data-testid="ReadingPane"]')
      || document.body;
    attachChipObs = new MutationObserver(() => {
      if (tried) return;
      let count = 0;
      try {
        const fresh = FlowOwaParse.readPane(document, location.href, {});
        if (fresh && typeof FlowOutlookAttachmentEvidence !== 'undefined' && typeof FlowOutlookAttachmentEvidence.localAttachmentCount === 'function') {
          count = FlowOutlookAttachmentEvidence.localAttachmentCount(fresh);
          if (count >= 1 && fresh.attachments) pane.attachments = fresh.attachments;
        }
      } catch (e) { count = 0; }
      if (count >= 1) {
        tried = true;
        try { attachChipObs.disconnect(); } catch (e2) { /* */ }
        attachChipObs = null;
        pane.attachmentsLoading = false;
        lastSig = '';
        schedule();
      }
    });
    try { attachChipObs.observe(root, { childList: true, subtree: true }); } catch (e) { attachChipObs = null; }
  }

  async function paintNoteToSelfAckCard(pane, taskSuggested) {
    if (!pane) return false;
    const token = pane.__mailToken;
    const mount = mountPoint();
    if (!mount || mount.querySelector('.flow-chip-host')) return false;
    const msgId = pane.itemId || pane.pathId || pane.conversationId || '';
    const host = paintIfCurrent(token, function () {
      const painted = injectCard(mount, stampEpoch({
        process: { id: 'note-self', name: 'Note', steps: [] },
        intent: { type: 'note', label: 'Note to yourself' },
        messageId: msgId,
        noteToSelf: true
      }, pane), {
        onDoIt: () => {},
        onDismiss: (h) => { if (ignoreStaleClick(h)) return; const clickToken = captureMailToken(); paintIfCurrent(clickToken, function () { paintRemove(h); }); }
      });
      if (painted && typeof FlowOutlookAttachmentEvidence !== 'undefined') {
        paintNoteHint(painted, FlowOutlookAttachmentEvidence.noteToSelfLine(pageUiLang(), { taskSuggested: Boolean(taskSuggested) }));
      }
      return painted;
    });
    if (host) {
      lastOutcome = 'card';
      await clearReason(pane);
      await FlowStorage.appendLog({
        kind: 'shown',
        label: 'Note to yourself',
        messageId: msgId,
        app: 'outlook',
        process: { id: 'note-self', name: 'Note', steps: [] },
        intent: { type: 'note', label: 'Note to yourself' }
      });
    }
    return Boolean(host);
  }

  async function paintJudgedCardWithAttachmentsUnread(pane, judged) {
    if (!pane || !judged || !judged.intent || !judged.process) return false;
    const token = pane.__mailToken;
    let msgId = pane.itemId || null;
    let bag = {};
    try { bag = await FlowStorage.get(); } catch (e) { bag = {}; }
    const own = await ownWithAliases(ownAddressesOf(bag));
    if (!msgId && (pane.pathId || pane.conversationId)) {
      const found = await resolveJudgedReplyMessageId(pane, own, pane.senderEmail);
      if (found && found.unread) return false;
      msgId = found && found.id ? found.id : null;
    }
    if (!msgId) return false;
    const entry = {
      messageId: msgId,
      outlookIncomingId: msgId,
      subject: pane.subject,
      text: pane.text,
      sender: { name: pane.senderName, email: pane.senderEmail },
      intent: judged.intent,
      process: judged.process,
      attachmentsUnread: true
    };
    const ctx = buildCtx(entry, pane, judged);
    if (!ctx || !ctx.messageId) return false;
    const mount = mountPoint();
    if (!mount) return false;
    const host = paintIfCurrent(token, function () {
      const painted = injectCard(mount, ctx, {
        onDoIt: (h, chip, c, steps) => { onDoIt(h, chip, c, steps); },
        onDismiss: (h, c) => { onDismiss(h, c); }
      });
      if (painted) {
        paintMissingScope(painted, ctx, bag);
        if (typeof FlowOutlookAttachmentEvidence !== 'undefined') {
          paintHint(painted, FlowOutlookAttachmentEvidence.attachUnreadBanner(pageUiLang()));
        }
      }
      return painted;
    });
    if (host) {
      const tagged = [ctx.messageId, pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
      if (tagged.length) host.setAttribute('data-glance-message', tagged.join('|'));
      lastOutcome = 'card';
      await clearReason(pane);
    }
    return Boolean(host);
  }

  // A replacement of the open message, including the same words, is a mail
  // open. A chip we just painted is not. Ads sit outside this pane.
  function armReadingPaneWatch() {
    let pane = null;
    try {
      pane = document.querySelector('#ReadingPaneContainerId')
        || document.querySelector('[data-testid="ReadingPane"]')
        || document.querySelector('[data-app-section="ReadingPane"]');
    } catch (e) { pane = null; }
    if (!pane || pane === paneWatch) return;
    if (paneObs) paneObs.disconnect();
    paneWatch = pane;
    paneObs = new MutationObserver((records) => {
      let mail = false;
      for (let i = 0; i < (records || []).length; i++) {
        const rec = records[i];
        const t = rec.target;
        if (t && t.closest && t.closest('.flow-chip-host, .flow-chip-consent, .flow-why-not')) continue;
        if (rec.type === 'childList') {
          const nodes = [];
          const added = rec.addedNodes || [];
          const removed = rec.removedNodes || [];
          for (let a = 0; a < added.length; a++) nodes.push(added[a]);
          for (let r = 0; r < removed.length; r++) nodes.push(removed[r]);
          if (!nodes.length) continue;
          let foreign = false;
          for (let n = 0; n < nodes.length; n++) {
            if (!glancePaneNode(nodes[n])) { foreign = true; break; }
          }
          if (!foreign) continue;
        }
        mail = true;
      }
      if (!mail) return;
      paneDirty = true;
      schedule();
    });
    try { paneObs.observe(pane, { childList: true, subtree: true }); } catch (e) { /* pane is sealed */ }
  }

  // OWA never stops changing the page (ads, presence, "x min ago"). A debounce that restarts on every change never fires
  // there, which is how 0.9.14 stayed silent: so this is a throttle. One scan at a time; a change during a scan runs one more.
  function schedule() {
    if (!guardContext()) return;
    armReadingPaneWatch();
    const paneOpened = noteReadingPaneOpen();
    const switched = noteOpenMail();
    // A switch that arrived while a scan was already reading the previous
    // mail has already stored the token. That follow-up is still the fast
    // path. Waiting out the 0.8s throttle is how a card came back in 3–4s.
    if (switched || switchPending || paneOpened) {
      if (timer) { clearTimeout(timer); timer = null; }
      timer = setTimeout(runScan, 40);
      return;
    }
    if (timer) return;
    timer = setTimeout(runScan, SCAN_EVERY_MS);
  }

  async function appendSuggestLog(entry) {
    if (!entry || typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return;
    const bag = await FlowStorage.get();
    const log = Array.isArray(bag.suggestLog) ? bag.suggestLog.slice() : [];
    const key = String(entry.messageId || '') + '|' + String(entry.reason || '');
    if (log[0] && log[0].key === key) return;
    log.unshift({
      key: key, at: Date.now(), messageId: entry.messageId || null, reason: entry.reason,
      detail: entry.detail || '',
      fileCount: entry.fileCount || 0, target: entry.target || null, surface: entry.surface || 'outlook'
    });
    await FlowStorage.set({ suggestLog: log.slice(0, 40) });
  }

  let lastGraphStatus = 0;

  async function attachmentListFor(id) {
    if (!id) return null;
    const wireId = (typeof idSpellings === 'function' ? (idSpellings(id)[0] || id) : id);
    const prefers = [null, GRAPH_IMMUTABLE];
    const paths = [
      '/attachments?$select=id,name,contentType,size,isInline,contentId',
      '/attachments'
    ];
    let saw = 0;
    for (let pathIx = 0; pathIx < paths.length; pathIx++) {
      for (let p = 0; p < prefers.length; p++) {
        const r = await graphCall('/me/messages/' + encodeURIComponent(wireId) + paths[pathIx], 'suggest-list', prefers[p]);
        const status = graphStatus(r);
        if (status) saw = status;
        lastGraphStatus = status || lastGraphStatus;
        if (!r || !r.ok) continue;
        let body = null;
        try { body = JSON.parse(r.body || '{}'); } catch (e) { body = null; }
        if (body && Array.isArray(body.value)) return body.value;
      }
    }
    lastGraphStatus = saw || lastGraphStatus;
    return null;
  }

  // Whole mailbox, not one inbox page. Above this the set is incomplete
  // and the file stays unresolved. A page is 50. Exactly 200 with no
  // nextLink is complete. A nextLink still waiting, or a page that would
  // pass 200, is unresolved. nextLink is followed only on graph.microsoft.com.
  const MAILBOX_MATCH_CEILING = 200;
  const MAILBOX_PAGE = 50;
  let cachedTimeFormat = null;

  function odataQuote(value) {
    return String(value || '').replace(/'/g, "''");
  }

  function graphNextPath(next) {
    let u;
    try { u = new URL(String(next || '')); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'graph.microsoft.com') return null;
    let p = u.pathname || '';
    if (p.indexOf('/v1.0') === 0) p = p.slice('/v1.0'.length);
    if (p.indexOf('/me/') !== 0) return null;
    return p + u.search;
  }

  function isConversationId(id) {
    return /^A[AQ]Qk/i.test(String(id || ''));
  }

  async function mailboxTimeFormat() {
    if (cachedTimeFormat != null) return cachedTimeFormat;
    const r = await graphCall('/me/mailboxSettings?$select=timeFormat', 'suggest-time', null);
    if (!r || !r.ok) { cachedTimeFormat = ''; return ''; }
    try {
      const body = JSON.parse(r.body || '{}');
      cachedTimeFormat = String(body.timeFormat || '');
    } catch (e) { cachedTimeFormat = ''; }
    return cachedTimeFormat;
  }

  function pageHourCycle() {
    try {
      const lang = document.documentElement && document.documentElement.lang;
      const opt = new Intl.DateTimeFormat(lang || undefined, { hour: 'numeric' }).resolvedOptions();
      return (opt && opt.hourCycle) || '';
    } catch (e) { return ''; }
  }

  const hydrateCache = Object.create(null);

  function graphAddress(node) {
    return String(node && node.emailAddress && node.emailAddress.address || '').trim().toLowerCase();
  }

  function minuteOf(value) {
    return (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.minuteKey) ? (FlowOwaParse.minuteKey(value) || '') : '';
  }

  // The reading pane often shows a name and hides the address until hover.
  // Graph already has the sender and the To/Cc lines. Fill only what the
  // page did not. Several messages in one conversation stay unresolved
  // unless the open clock or the subject picks one.
  async function hydratePane(pane) {
    if (!pane) return pane;
    const needSender = !pane.senderEmail;
    // DOM already listed someone. Graph still wins when the same address is
    // in both lists: a To block that also contains Cc used to copy the Cc
    // address into To, and the draft then disagreed with Why not shown.
    const toList = (pane.to || []).map((e) => String(e || '').toLowerCase());
    const ccList = (pane.cc || []).map((e) => String(e || '').toLowerCase());
    const audienceOverlaps = ccList.some((e) => toList.indexOf(e) >= 0);
    const needAudience = (!(toList.length) && !(ccList.length)) || audienceOverlaps;
    const mailKey = [pane.subject || '', ((pane.attachments || []).map((a) => a && (a.name || a.filename)).filter(Boolean).join(',')), String(pane.text || '').slice(0, 48)].join('|');
    if (hydratePane.mailKey && hydratePane.mailKey !== mailKey) {
      Object.keys(hydrateCache).forEach((k) => { delete hydrateCache[k]; });
    }
    hydratePane.mailKey = mailKey;
    const priorConversationId = pane.priorConversationId || pane.conversationId || null;
    const conv = String(pane.conversationId || '').trim();
    const item = pane.itemId && !isConversationId(pane.itemId) ? String(pane.itemId) : '';
    if (!conv && !item) return pane;
    const key = String(mailEpoch) + '|' + item + '|' + conv + '|' + (pane.receivedDateTime || '') + '|' + (pane.subject || '');
    if (hydrateCache[key]) return Object.assign(pane, hydrateCache[key]);
    const select = 'id,subject,from,sender,toRecipients,ccRecipients,receivedDateTime,conversationId';
    let rows = [];
    if (item) {
      let one = null;
      const spells = idSpellings(item);
      const prefers = [null, GRAPH_IMMUTABLE];
      for (let p = 0; p < prefers.length && !one; p++) {
        for (let s = 0; s < spells.length; s++) {
          const got = await graphJson('/me/messages/' + encodeURIComponent(spells[s]) + '?$select=' + encodeURIComponent(select), 'pane-hydrate', prefers[p]);
          if (got && got.id && !Array.isArray(got.value)) { one = got; break; }
        }
      }
      if (one && one.id) rows = [one];
    } else {
      const canonConv = (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.canonId === 'function')
        ? FlowOwaParse.canonId(conv) : '';
      const spells = [];
      if (canonConv) spells.push(canonConv);
      if (conv && spells.indexOf(conv) < 0) spells.push(conv);
      for (let si = 0; si < spells.length && !rows.length; si++) {
        const filter = "conversationId eq '" + odataQuote(spells[si]) + "'";
        const body = await graphJson('/me/messages?$filter=' + encodeURIComponent(filter) + '&$top=20&$select=' + encodeURIComponent(select), 'pane-hydrate', null);
        rows = body && Array.isArray(body.value) ? body.value : [];
      }
    }
    let hydrateHow = item ? 'item' : (rows.length ? 'conversation' : 'none');
    let subjectFallback = false;
    const openConv = (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.canonId === 'function')
      ? FlowOwaParse.canonId(pane.conversationId) : '';
    const identityConfirmed = pane.idSource !== 'url-unconfirmed' && pane.idSource !== 'url-stale' && openConv;
    // The open conversation is not in this result. A subject row is the open
    // message only when it is that conversation at the page's minute.
    // Another message, and an unconfirmed id, stay off this pane.
    if (!rows.length && pane.subject && identityConfirmed) {
      const bySubject = await graphJson('/me/messages?$filter=' + encodeURIComponent(subjectFilter(pane.subject)) + '&$top=20&$select=' + encodeURIComponent(select), 'pane-hydrate-subject', null);
      const raw = bySubject && Array.isArray(bySubject.value) ? bySubject.value : [];
      const narrowed = (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.subjectFallbackRows === 'function')
        ? FlowOwaParse.subjectFallbackRows(pane, raw)
        : [];
      subjectFallback = true;
      if (narrowed.length === 1) {
        rows = narrowed;
        hydrateHow = 'subject-fallback';
      } else {
        hydrateHow = 'none';
      }
    }
    if (!rows.length) {
      const empty = { hydrateHow: hydrateHow, priorConversationId: priorConversationId };
      hydrateCache[key] = empty;
      return Object.assign(pane, empty);
    }
    const minute = minuteOf(pane.receivedDateTime);
    const alt = minuteOf(pane.clockAlt);
    let picked = rows.length === 1 ? rows[0] : null;
    if (!picked && minute && !subjectFallback) {
      const timed = rows.filter((r) => {
        const k = minuteOf(r.receivedDateTime);
        return k && (k === minute || (alt && k === alt));
      });
      if (timed.length === 1) picked = timed[0];
    }
    if (!picked && pane.subject && !subjectFallback) {
      const want = String(pane.subject).trim().toLowerCase();
      const named = rows.filter((r) => String(r.subject || '').trim().toLowerCase() === want);
      if (named.length === 1) picked = named[0];
    }
    const patch = { hydrateHow: hydrateHow, priorConversationId: priorConversationId };
    const froms = rows.map((r) => graphAddress(r.from)).filter(Boolean);
    if (!subjectFallback && needSender && froms.length && froms.every((e) => e === froms[0])) {
      patch.senderEmail = froms[0];
      const name = rows[0] && rows[0].from && rows[0].from.emailAddress && rows[0].from.emailAddress.name;
      if (!pane.senderName && name) patch.senderName = String(name).slice(0, 80);
    }
    if (picked) {
      const one = graphAddress(picked.from);
      const graphSender = graphAddress(picked.sender);
      const pageFrom = String(pane.senderEmail || '').trim().toLowerCase();
      // The open pane already names a person. A Graph row from someone else
      // is not this message. The user's own alias is the same person. A
      // forward, or a delegate whose sender is not the from, is not.
      let senderAgrees = !behalfSplit(one, graphSender) && (!pageFrom || !one || pageFrom === one);
      if (!senderAgrees && pageFrom && one && !behalfSplit(one, graphSender)) {
        const known = await loadUserAddresses();
        senderAgrees = Boolean(known && known.has(pageFrom) && known.has(one));
      }
      if (behalfSplit(one, graphSender)) {
        patch.onBehalf = true;
        patch.onBehalfOf = graphSender;
      }
      if (senderAgrees) {
        if (hydrateHow === 'subject-fallback' && picked.id && !isConversationId(picked.id)) {
          const pickedConv = (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.canonId === 'function')
            ? FlowOwaParse.canonId(picked.conversationId) : '';
          if (pickedConv && openConv && pickedConv === openConv) patch.itemId = String(picked.id);
        }
        if (!pane.subject && picked.subject) patch.subject = String(picked.subject);
        if (needAudience) {
          const gto = (picked.toRecipients || []).map(graphAddress).filter(Boolean);
          const gcc = (picked.ccRecipients || []).map(graphAddress).filter(Boolean);
          if (gto.length || gcc.length) {
            patch.to = gto;
            patch.cc = gcc;
          }
        }
        if (one && (!pageFrom || pageFrom === one)) {
          patch.senderEmail = one;
          const name = picked.from && picked.from.emailAddress && picked.from.emailAddress.name;
          if (name) patch.senderName = String(name).slice(0, 80);
        }
      }
    }
    hydrateCache[key] = patch;
    return Object.assign(pane, patch);
  }

  function subjectFilter(subject) {
    const raw = String(subject || '').trim();
    const stem = raw.replace(/[\u2026\u2025.]{1,3}$/, '').trim();
    if (stem && stem !== raw && stem.length >= 12) return "startswith(subject,'" + odataQuote(stem) + "')";
    return "subject eq '" + odataQuote(raw) + "'";
  }

  // from AND subject when the page has both. A hover card often hides the
  // address: the conversation id, then the subject, still names the set.
  // A failed query is not replaced with one inbox page.
  async function mailboxBySubject(pane) {
    const from = String((pane && pane.senderEmail) || '').trim();
    const subject = String((pane && pane.subject) || '').trim();
    const conv = String((pane && pane.conversationId) || '').trim();
    let filter = '';
    if (from && subject) filter = "from/emailAddress/address eq '" + odataQuote(from) + "' and " + subjectFilter(subject);
    else if (conv) {
      const canonConv = (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.canonId === 'function')
        ? FlowOwaParse.canonId(conv) : '';
      filter = "conversationId eq '" + odataQuote(canonConv || conv) + "'";
    }
    else if (subject) filter = subjectFilter(subject);
    else return { error: 'missing' };
    const select = 'id,conversationId,receivedDateTime,from,subject,internetMessageId';
    let path = '/me/messages?$filter=' + encodeURIComponent(filter) + '&$top=' + MAILBOX_PAGE + '&$select=' + encodeURIComponent(select);
    const all = [];
    let pages = 0;
    while (path && pages < 8) {
      pages++;
      const r = await graphCall(path, 'suggest-mailbox', null);
      lastGraphStatus = graphStatus(r) || lastGraphStatus;
      if (!r || !r.ok) return { error: 'graph', status: graphStatus(r) || 0 };
      let body = null;
      try { body = JSON.parse(r.body || '{}'); } catch (e) { return { error: 'graph', status: 0 }; }
      const rows = body && Array.isArray(body.value) ? body.value : [];
      if (all.length + rows.length > MAILBOX_MATCH_CEILING) return { error: 'ceiling' };
      for (let i = 0; i < rows.length; i++) all.push(rows[i]);
      const next = body && body['@odata.nextLink'];
      if (!next) return { rows: all };
      if (all.length >= MAILBOX_MATCH_CEILING) return { error: 'ceiling' };
      const parsed = graphNextPath(next);
      if (!parsed) return { error: 'nextlink' };
      path = parsed;
    }
    return { error: 'ceiling' };
  }

  function suggestFail(reason, detail) {
    return { unresolved: true, reason: reason || 'suggest:unresolved', detail: detail || '' };
  }

  function sameSubjectRow(pane, m) {
    const norm = (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.norm === 'function')
      ? FlowOwaParse.norm
      : ((s) => String(s || '').toLowerCase().trim());
    const ps = norm(pane && pane.subject);
    const ms = norm(m && m.subject);
    if (!ps || ps !== ms) return false;
    const open = String((pane && pane.senderEmail) || '').toLowerCase();
    const from = fromAddress(m);
    if (open && from && open !== from) return false;
    return true;
  }

  // A message id in the address is that message. A conversation address links
  // only through uniqueGraphMessage, against the whole mailbox. Subject and
  // "newest" are not a link. A failed attachment read stays unknown.
  // Each miss names the stage: no id, Graph status, no candidate, unresolved, empty list.
  async function suggestFiles(pane) {
    if (pane && pane.idSource === 'url-stale') return suggestFail('suggest:pane-stale');
    const convPaneUrl = pane && paneUrlOnlyMessageTarget(pane) && conversationPanePathKey(pane);
    if (pane && pane.idSource === 'url-unconfirmed' && !convPaneUrl) {
      const restKey = String((pane.pathId || pane.rawUrlId) || '').trim();
      if (restKey) {
        const pathRest = await messageIdFromPathRest(restKey);
        if (pathRest && pathRest.id) {
          pane.pathRestMessageUrl = true;
          const direct = await attachmentListFor(pathRest.id);
          if (Array.isArray(direct)) return { files: direct, messageId: pathRest.id };
          const st = lastGraphStatus;
          if (st && st !== 200) return suggestFail('suggest:graph-' + st);
          return suggestFail('suggest:attachments-unread');
        }
      }
      return suggestFail('suggest:unresolved', 'unconfirmed');
    }
    // Subject fallback must not hand this save the other message's id.
    const priorConv = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.canonId) ? FlowOwaParse.canonId(pane && pane.priorConversationId) : '';
    const nowConv = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.canonId) ? FlowOwaParse.canonId(pane && pane.conversationId) : '';
    const crossed = pane && (pane.hydrateHow === 'subject-fallback' || pane.hydrateHow === 'subject-unique')
      && priorConv && nowConv && priorConv !== nowConv;
    const id = crossed ? null : (pane.itemId || null);
    const pathConv = (pane && pane.pathId && isConversationId(pane.pathId)) ? pane.pathId : '';
    const wantConv = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.canonId)
      ? FlowOwaParse.canonId(pane.conversationId || pathConv) : '';
    const wantNet = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.canonId) ? FlowOwaParse.canonId(pane.internetMessageId) : '';
    if (!id && !wantConv && !wantNet && !(pane && pane.subject)) return suggestFail('suggest:no-message-id');
    if (id && !isConversationId(id)) {
      const direct = await attachmentListFor(id);
      if (Array.isArray(direct)) return { files: direct, messageId: id };
      if (!wantConv && !wantNet && !(pane && pane.subject && pane.senderEmail)) {
        const st = lastGraphStatus;
        if (st && st !== 200) return suggestFail('suggest:graph-' + st);
        return suggestFail('suggest:attachments-unread');
      }
    }
    if (typeof FlowOwaParse === 'undefined' || typeof FlowOwaParse.uniqueGraphMessage !== 'function') return suggestFail('suggest:unresolved');
    if (!pane || (!pane.subject && !wantConv && !wantNet)) {
      return suggestFail('suggest:unresolved', 'missing-sender-or-subject');
    }
    const found = await mailboxBySubject(pane);
    if (!found || found.error === 'ceiling') return suggestFail('suggest:unresolved', 'ceiling=' + MAILBOX_MATCH_CEILING);
    if (found.error === 'nextlink') return suggestFail('suggest:unresolved', 'nextlink-offhost');
    if (found.error === 'missing') return suggestFail('suggest:unresolved', 'missing-sender-or-subject');
    if (found.error || !Array.isArray(found.rows)) {
      const st = found.status || lastGraphStatus;
      return suggestFail(st ? ('suggest:graph-' + st) : 'suggest:graph-0');
    }
    const list = found.rows;
    const convPane = pane && paneUrlOnlyMessageTarget(pane) && conversationPanePathKey(pane);
    const hits = [];
    const openSender = pane && pane.senderEmail;
    if (convPane) {
      const cand = list.filter((m) => m && m.id && !isConversationId(m.id));
      const exact = await exactOpenMessageInList(cand, pane, openSender);
      if (!exact || !exact.id) return suggestFail('suggest:unresolved', 'conv-pane-exact=0');
      hits.push(exact);
    } else {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m || !m.id || isConversationId(m.id)) continue;
        const netOk = wantNet && FlowOwaParse.canonId(m.internetMessageId) === wantNet;
        const convOk = wantConv && FlowOwaParse.canonId(m.conversationId) === wantConv;
        if (convOk || netOk || sameSubjectRow(pane, m)) hits.push(m);
      }
    }
    if (!hits.length) return suggestFail('suggest:no-candidate', 'mailbox=' + list.length + ' subject=' + String(pane.subject || '').slice(0, 80));
    const enriched = [];
    let unreadStatus = 0;
    let anyRead = false;
    let anyUnread = false;
    for (let i = 0; i < hits.length; i++) {
      const rows = await attachmentListFor(hits[i].id);
      if (!Array.isArray(rows)) {
        unreadStatus = lastGraphStatus || unreadStatus;
        anyUnread = true;
        enriched.push(Object.assign({}, hits[i], { attachmentsUnread: true, attachments: [] }));
        continue;
      }
      anyRead = true;
      enriched.push(Object.assign({}, hits[i], { attachments: rows }));
    }
    if (!anyRead) {
      if (unreadStatus && unreadStatus !== 200) return suggestFail('suggest:graph-' + unreadStatus);
      return suggestFail('suggest:attachments-unread');
    }
    const clockPane = Object.assign({}, pane, {
      timeFormat: pane.timeFormat || await mailboxTimeFormat(),
      hourCycle: pane.hourCycle || pageHourCycle(),
      pageHour24: pane.pageHour24 === true || (typeof FlowOwaParse.pageProves24h === 'function' && FlowOwaParse.pageProves24h(document))
    });
    const linked = FlowOwaParse.uniqueGraphMessage(clockPane, enriched);
    if (!linked || !linked.message) {
      const why = (linked && linked.detail) || '';
      if (anyUnread && /attachments-unknown/.test(why)) return suggestFail('suggest:unresolved', why || 'attachments-unknown');
      return suggestFail((linked && linked.reason) || 'suggest:unresolved', why || ('candidates=' + enriched.length));
    }
    const files = linked.message.attachments;
    if (!Array.isArray(files) || linked.message.attachmentsUnread) return suggestFail('suggest:attachments-unread');
    if (!files.length) return suggestFail('suggest:attachments-empty');
    return { files: files, messageId: linked.message.id };
  }

  // A mail that already has a card keeps suggest:other-card in the local log.
  // No other card, and a step the engine named, is one suggestion card.
  // The title is Save the file? The row text is step.copy. Dismiss is the ×.
  function catalogFiles(raw, eligible, excluded) {
    const chosen = {};
    (eligible || []).forEach((f) => { if (f && f.id) chosen[f.id] = 1; });
    const skip = {};
    (excluded || []).forEach((f) => { if (f && f.id) skip[f.id] = f; });
    const full = Array.isArray(raw) && raw.length;
    const source = full ? raw : (eligible || []).concat(excluded || []);
    const seen = {};
    const out = [];
    source.forEach((a, idx) => {
      const idKey = a && (a.id || ('att-' + idx));
      if (!a || seen[idKey]) return;
      seen[idKey] = 1;
      const ex = a.id && skip[a.id];
      const rawName = String((ex && ex.name) || a.name || a.filename || '').trim();
      const id = String(a.id == null || a.id === '' ? ('att-' + idx) : a.id);
      const named = Boolean(rawName) && rawName !== id;
      const why = (ex && (ex.why || ex.reason)) || a.why || a.reason || '';
      const skipped = Boolean(ex) || !named;
      if (!named && !skipped) return;
      const file = {
        id: a.id,
        name: named ? rawName : '',
        size: ex && ex.size != null ? ex.size : a.size,
        why: why || (skipped ? 'not saved' : '')
      };
      const label = skipped
        ? ((typeof FlowSuggestSave !== 'undefined' && typeof FlowSuggestSave.skippedLabel === 'function')
          ? FlowSuggestSave.skippedLabel(file)
          : (named ? (rawName + ' · skipped · ' + file.why) : ('File skipped · ' + file.why)))
        : ((typeof FlowSuggestSave !== 'undefined' && typeof FlowSuggestSave.fileLabel === 'function')
          ? (FlowSuggestSave.fileLabel(file) || rawName)
          : rawName);
      out.push({
        id: id,
        name: named ? rawName : '',
        label: label,
        size: file.size,
        why: file.why,
        on: !skipped && (!full || chosen[a.id] === 1),
        skipped: skipped
      });
    });
    return out;
  }

  function paintSuggestCard(pane, decision, rawFiles) {
    if (paintDepth <= 0) return null;
    const mount = mountPoint();
    const step = decision && decision.step;
    if (!mount || !step || typeof FlowChipHost === 'undefined') return null;
    const copy = step.copy || {};
    const he = /[\u0590-\u05FF]/.test(String(pane && pane.text || ''));
    const rowCopy = he ? (copy.he || copy.en || '') : (copy.en || copy.he || '');
    const process = {
      id: 'suggest-save',
      name: 'Save the file?',
      closingLine: '',
      steps: [{
        kind: 'attachmentSave',
        id: 'attachmentSave',
        label: rowCopy,
        copy: copy,
        params: Object.assign({}, step.params || { files: decision.files || [] }, {
          catalog: catalogFiles(rawFiles, (step.params && step.params.files) || decision.files || [], (step.params && step.params.excluded) || [])
        })
      }]
    };
    const ctx = {
      process: process,
      intent: { label: rowCopy, lang: he ? 'he' : 'en' },
      messageId: (pane && (pane.itemId || pane.conversationId)) || '',
      graphMessageId: (pane && pane.graphMessageId) || '',
      itemId: pane && pane.itemId,
      pathId: pane && pane.pathId,
      conversationId: pane && pane.conversationId,
      bodyText: (pane && pane.text) || '',
      subject: (pane && pane.subject) || '',
      app: 'outlook',
      fileCard: true,
      suggestOnly: true
    };
    return injectCard(mount, ctx, {
      onDoIt: (host, chip, c) => onSuggestDoIt(host, chip, c),
      onDismiss: async (host) => {
        const clickToken = captureMailToken();
        if (ignoreStaleClick(host)) return;
        const id = ctx.messageId;
        if (!id || typeof FlowStorage === 'undefined') return;
        const bag = await FlowStorage.get();
        if (ignoreStaleClick(host)) return;
        paintIfCurrent(clickToken, function () { paintRemove(host); });
        const map = Object.assign({}, bag.suggestDismissals || {});
        map[id] = { at: Date.now() };
        await FlowStorage.set({ suggestDismissals: map });
      }
    });
  }

  function saveFailReason(r) {
    if (!r) return '';
    if (r.reason) return String(r.reason);
    const rows = r.results || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].reason) return String(rows[i].reason);
    }
    return '';
  }

  async function onSuggestDoIt(host, chip, ctx) {
    const token = captureMailToken();
    if (ignoreStaleClick(host)) return;
    doItInFlight = true;
    try {
      paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-pending', pageChrome().closing); });
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('preparing');
      const step = (ctx.process.steps || [])[0] || {};
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('verifying');
      if (ignoreStaleClick(host)) return;
      const r = await send({
        type: 'flow:execute-action',
        payload: {
          connectorId: 'attachmentSave',
          params: step.params || {},
          messageId: ctx.messageId,
          graphMessageId: ctx.graphMessageId || '',
          outlookIncomingId: ctx.graphMessageId || ctx.itemId || ctx.messageId,
          label: 'Save the file?',
          subject: ctx.subject || '',
          text: ctx.bodyText || ''
        }
      });
      const proof = (r && r.proof) || null;
      const proved = typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.allowsHandled
        ? FlowProofOfClose.allowsHandled({ ok: !!(r && r.ok), proof: proof })
        : false;
      if (!proved) {
        const why = saveFailReason(r);
        if (why === 'not-connected' || why === 'files-not-granted') {
          const line = why === 'files-not-granted' ? 'Reconnect Outlook to allow OneDrive' : 'Outlook is not connected';
          if (host && host.__glanceSteps) host.__glanceSteps.setAll('offline', line);
          paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', line); });
          return;
        }
        if (host && host.__glanceSteps) host.__glanceSteps.setAll('failed');
        paintIfCurrent(token, function () { FlowChipHost.setChipState(chip, 'flow-chip-error', (r && (r.line || r.written)) || "Couldn't confirm"); });
        return;
      }
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('verified');
      const title = actionTitle({
        connectorId: 'attachmentSave', process: ctx.process, intent: ctx.intent, text: ctx.bodyText,
        writtenLine: r.written, subject: ctx.subject, params: step.params
      });
      const fields = FlowProofOfClose.receiptLogFields
        ? FlowProofOfClose.receiptLogFields(proof, {
          writtenLine: r.written || title,
          processName: 'Save the file?',
          closedLine: '',
          status: pageChrome().handled
        })
        : null;
      const graphId = ctx.graphMessageId && !isConversationId(ctx.graphMessageId) ? ctx.graphMessageId : '';
      await FlowStorage.appendLog(Object.assign({
        kind: 'written',
        label: title,
        actionTitle: title,
        messageId: ctx.messageId,
        itemId: graphId || ctx.itemId || null,
        pathId: ctx.pathId || null,
        graphMessageId: graphId || null,
        threadId: ctx.conversationId || null,
        outlookConversationId: ctx.conversationId || null,
        outlookIncomingId: graphId || ctx.messageId,
        app: 'outlook',
        connectorId: 'attachmentSave',
        ref: r.ref,
        where: 'OneDrive',
        url: r.url || null,
        subject: ctx.subject,
        text: ctx.bodyText,
        system: 'microsoft/onedrive'
      }, fields || {}));
      const mount = host.parentElement || mountPoint();
      if (mount) {
        paintIfCurrent(token, function () { return paintOutlookTodoReceipt(mount, Object.assign({
          kind: 'written',
          messageId: ctx.messageId,
          itemId: graphId || ctx.itemId || null,
          pathId: ctx.pathId || null,
          graphMessageId: graphId || null,
          threadId: ctx.conversationId || null,
          outlookConversationId: ctx.conversationId || null,
          connectorId: 'attachmentSave',
          ref: r.ref,
          url: r.url || null,
          system: 'microsoft/onedrive',
          fetchedBack: true,
          writtenLine: r.written || title,
          processName: 'Save the file?',
          receiptStatus: pageChrome().handled
        }, fields || {})); });
      }
    } finally {
      doItInFlight = false;
    }
  }

  // A card for a different message is not "another card" on this one.
  // An attachment mail with no ask still gets Save the file? on its own.
  function chipForThisPane(pane) {
    const host = document.querySelector('#ReadingPaneContainerId .flow-chip-host');
    if (!host || !pane) return null;
    const marked = String(host.getAttribute('data-glance-message') || '').split('|').filter(Boolean);
    if (!marked.length) return host;
    const ids = [pane.itemId, pane.pathId, pane.conversationId].filter(Boolean).map(String);
    return ids.some((id) => marked.indexOf(id) !== -1) ? host : null;
  }

  function outlookFileItAlreadyPicked(host) {
    if (!host || !host.__glanceSteps || typeof host.__glanceSteps.rows !== 'function') return false;
    const rows = host.__glanceSteps.rows();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.suggested || r.manual || r.role === 'close') continue;
      const kind = String((r.step && r.step.kind) || r.kind || '');
      if (kind !== 'driveFile' && kind !== 'onedriveFile' && kind !== 'attachmentSave') continue;
      const params = r.step && r.step.params;
      if (!params) continue;
      if (params.fileName || params.selectedAttachment) return true;
      const catalog = Array.isArray(params.catalog) && params.catalog.length ? params.catalog : (params.files || []);
      if (catalog.length >= 2) return true;
      if (catalog.some((f) => f && f.on && !f.skipped)) return true;
    }
    return false;
  }

  async function recordSuggestNote() {
    const pane = suggestNote;
    suggestNote = null;
    if (!pane || typeof FlowSuggestSave === 'undefined' || typeof FlowSuggestSave.suggestSave !== 'function') return;
    const sameChip = chipForThisPane(pane);
    if (sameChip && sameChip.classList.contains('flow-chip-settled') && sameChip.getAttribute('data-glance-chain') === 'task-proof') return;
    if (typeof FlowProofOfClose !== 'undefined' && typeof FlowProofOfClose.savedFileReceipt === 'function') {
      let bagNow = null;
      try { bagNow = await FlowStorage.get(); } catch (e0) { bagNow = null; }
      const namesNow = (pane.attachments || []).map((a) => a && (a.name || a.filename)).filter(Boolean);
      const provedNow = FlowProofOfClose.savedFileReceipt(((bagNow && bagNow.log) || []).filter(outlookProofRow), {
        messageIds: [pane.itemId, pane.pathId, pane.conversationId].concat(pane.graphMessageId ? [pane.graphMessageId] : []),
        fileNames: namesNow,
        subject: pane.subject || ''
      });
      const mountNow = mountPoint();
      if (provedNow && mountNow && paintIfCurrent(pane.__mailToken, function () { return paintOutlookTodoReceipt(mountNow, provedNow); })) {
        lastOutcome = 'card';
        await clearReason(pane);
        return;
      }
    }
    const showed = Boolean(sameChip);
    const messageId = pane.itemId || pane.conversationId || pane.pathId || '';
    let files = null;
    let graphMessageId = '';
    let stageReason = '';
    let read = null;
    try {
      read = await suggestFiles(await hydratePane(pane));
      if (read && read.unresolved) stageReason = read.reason || 'suggest:unresolved';
      else if (read && Array.isArray(read.files)) {
        files = read.files;
        graphMessageId = read.messageId || '';
        if (graphMessageId && typeof FlowProofOfClose !== 'undefined' && typeof FlowProofOfClose.taskReceiptFromLog === 'function') {
          let bagNow = null;
          try { bagNow = await FlowStorage.get(); } catch (e2) { bagNow = null; }
          const proved = FlowProofOfClose.taskReceiptFromLog(((bagNow && bagNow.log) || []).filter(outlookProofRow), {
            messageIds: [graphMessageId],
            threadIds: [],
            fileNames: files.map((a) => a && (a.name || a.filename)).filter(Boolean)
          });
          const mountNow = mountPoint();
          if (proved && mountNow && paintIfCurrent(pane.__mailToken, function () { return paintOutlookTodoReceipt(mountNow, proved); })) {
            lastOutcome = 'card';
            await clearReason(pane);
            return;
          }
        }
      } else files = read;
    } catch (e) { files = null; stageReason = 'suggest:attachments-unread'; }
    if (stageReason && !showed) {
      await appendSuggestLog({ messageId: messageId, reason: stageReason, detail: (read && read.detail) || '', surface: 'outlook' });
      const judged = pane.__signedSaveJudge;
      if (/^suggest:(?:unresolved|graph-|attachments-unread)/.test(stageReason) && judged && await paintJudgedCardWithAttachmentsUnread(pane, judged)) return;
      if (!pageAlreadyDecided(pane) || genericTextQuiet(pane)) {
        await pageReason(stageReason, pane, { detail: (read && read.detail) || '' });
      }
      return;
    }
    let bag = {};
    try { bag = await FlowStorage.get(); } catch (e) { bag = {}; }
    // FlowOnedriveFile is on this page (manifest content script, copied onto
    // Outlook). Files.ReadWrite is read from the stored token. Unknown scopes
    // stay null so the suggestion fails closed. No new scope.
    const consent = (typeof FlowOnedriveFile !== 'undefined' && typeof FlowOnedriveFile.hasWriteScope === 'function')
      ? FlowOnedriveFile.hasWriteScope(calendarScopes(bag))
      : null;
    const own = ownAddressesOf(bag);
    const from = String(pane.senderEmail || '').toLowerCase();
    const decision = FlowSuggestSave.suggestSave({
      surface: 'outlook',
      inbound: from ? own.indexOf(from) < 0 : true,
      text: pane.text || '',
      body: pane.text || '',
      messageId: messageId,
      attachments: files,
      consent: consent,
      otherCard: false,
      noise: /noise|marketing/.test(String(lastLoggedReason || '')),
      dismissals: bag.suggestDismissals || {},
      log: bag.log || []
    });
    if (showed) {
      const existing = chipForThisPane(pane) || document.querySelector('#ReadingPaneContainerId .flow-chip-host');
      if (outlookFileItAlreadyPicked(existing)) {
        await clearReason(pane);
        await appendSuggestLog({ messageId: messageId, reason: 'suggest:file-it-picked', surface: 'outlook' });
        return;
      }
      if (existing && existing.__glanceSteps && existing.__glanceSteps.addSuggested && decision.step && decision.eligible) {
        const step = decision.step;
        const copy = step.copy || {};
        existing.__glanceSteps.addSuggested({
          id: 'attachmentSave',
          kind: 'attachmentSave',
          copy: copy.en || copy.he || '',
          rawCopy: copy,
          state: 'queued',
          checked: false,
          suggested: true,
          manual: false,
          added: false,
          counted: true,
          role: 'suggested',
          step: Object.assign({}, step, {
            params: Object.assign({}, step.params, {
              catalog: catalogFiles(files, (step.params && step.params.files) || [], (step.params && step.params.excluded) || [])
            })
          })
        });
      }
      await clearReason(pane);
      await appendSuggestLog({ messageId: messageId, reason: 'suggest:other-card', surface: 'outlook' });
      return;
    }
    await appendSuggestLog({
      messageId: messageId, reason: decision.reason, surface: 'outlook',
      fileCount: decision.fileCount, target: decision.target
    });
    if (decision.step && decision.eligible) {
      const host = paintIfCurrent(pane.__mailToken, function () { return paintSuggestCard(Object.assign({}, pane, { graphMessageId: graphMessageId }), decision, files); });
      if (host) {
        lastOutcome = 'card';
        await clearReason(pane);
        return;
      }
    }
    const skipped = decision.skipped || [];
    if (!decision.eligible && skipped.length && paintIfCurrent(pane.__mailToken, function () { return paintSkippedOnly(pane, skipped); })) {
      lastOutcome = 'card';
      await clearReason(pane);
      return;
    }
    const fileGap = decision.reason === 'suggest:no-consent' && Array.isArray(files) && files.length > 0;
    if (!pageAlreadyDecided(pane) || (fileGap && genericTextQuiet(pane))) await pageReason(decision.reason, pane, { fileCount: decision.fileCount, target: decision.target });
  }

  function paintRemove(el) {
    if (paintDepth <= 0 || !el) return;
    try { el.remove(); } catch (e) { /* already gone */ }
  }

  function paintSkippedOnly(pane, skipped) {
    if (paintDepth <= 0) return null;
    const mount = mountPoint();
    if (!mount || !skipped || !skipped.length) return null;
    const host = document.createElement('div');
    host.className = 'flow-chip-host flow-skip-host';
    host.setAttribute('dir', 'ltr');
    skipped.forEach((file) => {
      const line = document.createElement('div');
      line.className = 'flow-skip-row';
      line.textContent = (typeof FlowSuggestSave !== 'undefined' && typeof FlowSuggestSave.skippedLabel === 'function')
        ? FlowSuggestSave.skippedLabel(file)
        : ((file && file.name) ? (file.name + ' · skipped · ' + (file.why || 'not saved')) : 'File skipped');
      host.appendChild(line);
    });
    if (mount.firstChild) mount.insertBefore(host, mount.firstChild);
    else mount.appendChild(host);
    return host;
  }

  // Same row Loops is showing: the exchange id, or the promise key when an
  // older mail used another id for the same commitment.
  async function openLoopForPane(pane) {
    if (!pane || typeof FlowStorage.getStillOpen !== 'function' || typeof FlowStillOpen === 'undefined' || typeof FlowStillOpen.promiseKey !== 'function') return null;
    const open = await FlowStorage.getStillOpen();
    if (!open || !open.length) return null;
    const ids = messageIdsOf(pane);
    for (let i = 0; i < open.length; i++) {
      const row = open[i];
      if (!row || !row.process) continue;
      const rowIds = rowIdsOf(row);
      if (ids.some((id) => rowIds.some((rid) => sameExchangeId(id, rid)))) return row;
    }
    const paneRow = {
      text: (typeof FlowOwaParse !== 'undefined' && typeof FlowOwaParse.stripReadingChrome === 'function')
        ? FlowOwaParse.stripReadingChrome(pane.text) : pane.text,
      subject: pane.subject,
      sender: { email: pane.senderEmail, name: pane.senderName },
      threadId: pane.conversationId || '',
      outlookConversationId: pane.conversationId || ''
    };
    for (let j = 0; j < open.length; j++) {
      const row = open[j];
      if (row && FlowStillOpen.sameSubjectPromise(row, paneRow)) return row;
    }
    // Same promise, another subject or another id (an older undone mail).
    // The due lives on the judgment, so the key is classified here. A miss
    // stays quiet below; this match is the one Do It, not a second card.
    let judged = null;
    if (typeof FlowIntent !== 'undefined' && typeof FlowIntent.classify === 'function') {
      try { judged = FlowIntent.classify(paneRow.text || '', { subject: pane.subject || '', now: new Date() }); }
      catch (e) { judged = null; }
    }
    const key = FlowStillOpen.promiseKey(Object.assign({}, paneRow, { intent: judged || null }));
    if (!key) return null;
    for (let k = 0; k < open.length; k++) {
      const row = open[k];
      if (row && row.process && FlowStillOpen.promiseKey(row) === key) return row;
    }
    return null;
  }

  // Loops already carries this promise on a different message. This mail
  // does not get a second Do It, and it does not borrow the other card.
  function rowIdsOf(row) {
    return [row && row.messageId, row && row.itemId, row && row.pathId, row && row.threadId, row && row.outlookConversationId, row && row.outlookIncomingId].filter(Boolean).map(String);
  }

  async function promiseOwnedElsewhere(pane, intent, extraIds) {
    if (!pane || typeof FlowStorage.getStillOpen !== 'function' || typeof FlowStillOpen === 'undefined' || typeof FlowStillOpen.promiseKey !== 'function') return false;
    const open = await FlowStorage.getStillOpen();
    if (!open || !open.length) return false;
    const ids = messageIdsOf(pane).concat((extraIds || []).filter(Boolean).map(String));
    function mine(row) {
      const rowIds = rowIdsOf(row);
      return ids.some((id) => rowIds.some((rid) => sameExchangeId(id, rid)));
    }
    if (open.some(mine)) return false;
    const clean = (typeof FlowOwaParse.stripReadingChrome === 'function')
      ? FlowOwaParse.stripReadingChrome(pane.text)
      : pane.text;
    const key = FlowStillOpen.promiseKey({
      text: clean,
      subject: pane.subject,
      sender: { email: pane.senderEmail, name: pane.senderName },
      threadId: pane.conversationId || '',
      outlookConversationId: pane.conversationId || '',
      intent: intent || null
    });
    if (!key) return false;
    return open.some((row) => row && FlowStillOpen.promiseKey(row) === key && !mine(row));
  }

  async function showOpenLoopCard(pane, loop) {
    const token = pane && pane.__mailToken;
    if (!mailTokenLive(token)) return false;
    const mount = mountPoint();
    if (!mount || !loop || !loop.process) return false;
    const existing = mount.querySelector('.flow-chip-host');
    if (existing && existing.getAttribute('data-glance-undone') !== '1' && existing.getAttribute('data-glance-verifying') !== '1') return true;
    if (existing) paintIfCurrent(token, function () { paintRemove(existing); });
    const ctx = buildCtx(loop, pane, { intent: loop.intent, process: loop.process });
    if (!ctx || !ctx.messageId) return false;
    let loopSt = null;
    try { loopSt = await FlowStorage.get(); } catch (e) { loopSt = null; }
    const dateWaiting = ctx.process.needsDateChoice === true && Array.isArray(ctx.process.dateChoices) && ctx.process.dateChoices.length >= 2;
    if ((ctx.process.id === 'hold' || ctx.glanceChain === 'calendar-hold') && !meetingClock(ctx) && !dateWaiting) return false;
    if (taskOnlyProcess(ctx.process) && todoAsk(loopSt)) {
      const asked = paintIfCurrent(token, function () { return paintTodoScopeCard(mount, ctx); });
      if (!asked) return false;
      const askedIds = [ctx.messageId, pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
      if (askedIds.length) asked.setAttribute('data-glance-message', askedIds.join('|'));
      lastOutcome = 'card';
      lastKey = ctx.messageId + '|' + ((ctx.intent && ctx.intent.label) || '');
      await clearReason(pane, 'tasks-not-granted');
      return true;
    }
    const host = paintIfCurrent(token, function () {
      const painted = injectCard(mount, ctx, {
        onDoIt: (h, chip, c, steps) => { onDoIt(h, chip, c, steps); },
        onDismiss: (h, c) => { onDismiss(h, c); }
      });
      if (painted) {
        const hasTaskRow = (ctx.process && ctx.process.steps || []).some((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
        if (typeof FlowOutlookAttachmentEvidence !== 'undefined') {
          const noteSelf = ctx.noteToSelf === true || (pane && pane.noteToSelf === true) ||
            (ctx.intent && ctx.intent.selfTask === true);
          if (noteSelf) {
            paintNoteHint(painted, FlowOutlookAttachmentEvidence.noteToSelfLine(pageUiLang(), { taskSuggested: hasTaskRow }));
          }
        }
        paintMissingScope(painted, ctx, loopSt);
      }
      return painted;
    });
    if (!host) return false;
    const tagged = [ctx.messageId, pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
    if (tagged.length) host.setAttribute('data-glance-message', tagged.join('|'));
    lastOutcome = 'card';
    lastKey = ctx.messageId + '|' + ((ctx.intent && ctx.intent.label) || '');
    await clearReason(pane, 'page:still-open');
    return true;
  }

  // A stored Undo line stays only when this mail has no card and no open loop.
  // A promise mail gets its Do It; a silent mail keeps the confirmation.
  async function paintStoredUndoneIfQuiet() {
    const token = captureMailToken();
    armRender();
    let pane = null;
    try {
      const st = await FlowStorage.get();
      if (!mailTokenLive(token)) return;
      pane = FlowOwaParse.readPane(document, location.href, { own: ownAddressesOf(st), userName: userNameOf(st) });
    } catch (e) { pane = null; }
    if (pane) bindMailToken(pane, token);
    if (!mailTokenLive(token)) return;
    if (pane) {
      const loop = await openLoopForPane(pane);
      if (loop) {
        const host = document.querySelector('#ReadingPaneContainerId .flow-chip-host');
        if (host && host.getAttribute('data-glance-undone') === '1') paintIfCurrent(token, function () { paintRemove(host); });
        if (!document.querySelector('#ReadingPaneContainerId .flow-chip-host')) await showOpenLoopCard(pane, loop);
        return;
      }
    }
    if (document.querySelector('#ReadingPaneContainerId .flow-chip-host')) return;
    if (!pane) return;
    const banner = await undoneBannerFor(pane);
    if (!banner || !banner.line) return;
    const mount = mountPoint();
    if (!mount) return;
    if (document.querySelector('#ReadingPaneContainerId .flow-chip-host')) return;
    paintIfCurrent(token, function () { return paintUndoneStatus(mount, pane, banner.line); });
  }

  let scanForEpoch = null;
  async function runScan() {
    timer = null;
    // Same mail: one scan. A new mail does not wait for the previous
    // scan's Graph read. That scan drops its own writes once the epoch moved.
    if (scanning && scanForEpoch === mailEpoch) { again = true; return; }
    const epoch = mailEpoch;
    scanning = true;
    scanForEpoch = epoch;
    try { await scan(); }
    catch (e) {
      try { console.error('Glance: outlook scan error', e && e.message ? e.message : e); } catch (x) { /* console gone */ }
      try {
        if (scanForEpoch === epoch) {
          const ids = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.urlIds) ? FlowOwaParse.urlIds(location.href) : {};
          await pageReason('page:scan-error', { subject: (ids && (ids.raw || ids.itemId || ids.conversationId)) || '' });
        }
      } catch (x2) { /* storage gone with the page */ }
    }
    finally {
      if (scanForEpoch !== epoch) return;
      try { await recordSuggestNote(); } catch (e) { /* the note is not the card */ }
      if (scanForEpoch !== epoch) return;
      try { await paintStoredUndoneIfQuiet(); } catch (e) { /* the banner is not the card */ }
      if (scanForEpoch !== epoch) return;
      scanning = false;
      if (renderLive()) switchPending = false;
      if (again || switchPending || mailEpoch !== epoch) { again = false; schedule(); }
    }
  }

  outlookObserver = new MutationObserver(schedule);
  outlookObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  // OWA moves between messages with pushState (no event): notice the address changing.
  hrefTimer = setInterval(() => {
    if (!guardContext()) return;
    if (location.href !== lastHref) { lastHref = location.href; lastKey = ''; lastSig = ''; schedule(); }
  }, 200);
  try {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    if (typeof origPush === 'function') {
      history.pushState = function () {
        const out = origPush.apply(this, arguments);
        if (location.href !== lastHref) { lastHref = location.href; lastKey = ''; lastSig = ''; schedule(); }
        return out;
      };
    }
    if (typeof origReplace === 'function') {
      history.replaceState = function () {
        const out = origReplace.apply(this, arguments);
        if (location.href !== lastHref) { lastHref = location.href; lastKey = ''; lastSig = ''; schedule(); }
        return out;
      };
    }
  } catch (e) { /* history is sealed */ }
  globalThis.__glanceOutlookPage = {
    rescan: () => { lastKey = ''; lastSig = ''; schedule(); },
    paintShownPlan: (ctx) => {
      const mount = mountPoint();
      if (!mount || !ctx || !ctx.process) return null;
      const token = captureMailToken();
      return paintIfCurrent(token, function () {
        const old = mount.querySelector('.flow-chip-host');
        if (old) paintRemove(old);
        return injectCard(mount, ctx, {
          onDoIt: (h, chip, c, steps) => { onDoIt(h, chip, c, steps); },
          onDismiss: (h, c) => { onDismiss(h, c); }
        });
      });
    },
    openMailToken: () => openMailTokenNow(),
    hydratePane: (pane) => hydratePane(pane),
    bumpMailEpoch: (why) => bumpMailEpoch(why),
    captureMailToken: () => captureMailToken(),
    paintCalendarFailure: (host, chip, result) => paintIfCurrent(captureMailToken(), function () { return paintCalendarFailure(host, chip, result); })
  };
  // A check from the panel (or another Outlook tab) lands here at once.
  try {
    if (guardContext() && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
      onRuntimeMessage = (msg, sender, sendResponse) => {
        if (!guardContext()) return;
        if (msg && msg.type === 'flow:outlook-ping') {
          try { sendResponse({ ok: true, alive: true }); } catch (e) { /* the caller left */ }
          return true;
        }
        if (msg && msg.type === 'flow:outlook-rescan') {
          lastKey = '';
          lastSig = '';
          markMailOpened();
          schedule();
          try { sendResponse({ ok: true }); } catch (e) { /* the caller left */ }
          return true;
        }
        if (msg && msg.type === 'flow:proof-sync') { lastSig = ''; schedule(); }
      };
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
    }
  } catch (e) { /* messaging unavailable */ }
  try {
    if (guardContext() && chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
      onStorageChanged = (changes, area) => {
        if (!guardContext()) return;
        if (area === 'local' && changes.glanceDebug) debug = Boolean(changes.glanceDebug.newValue);
        if (area === 'local' && changes.glanceOutlookFileTrace) {
          const n = Number(changes.glanceOutlookFileTrace.newValue) || 0;
          traceArmed = n > 0;
          if (n > 0) { lastSig = ''; schedule(); }
        }
        // A Do It / Undo from the panel changes what this card should say; this page's own "shown" row does not.
        const logChanged = area === 'local' && changes.log && Array.isArray(changes.log.newValue)
          && (changes.log.newValue[0] || {}).kind !== 'shown'; // the log is newest first
        if (area === 'local' && (changes.outlookPending || changes.outlookAuth || changes.outlookSync || changes.glanceOwnNames || logChanged)) { lastSig = ''; schedule(); }
      };
      chrome.storage.onChanged.addListener(onStorageChanged);
    }
  } catch (e) { /* storage events unavailable */ }
  // Keep the Microsoft session alive while Outlook is open, and judge the inbox once on arrival.
  // An offer below the fold pops up in view on its own (src/chip-peek.js): same card, same Do It, no design of its own.
  try { if (typeof FlowChipPeek !== 'undefined') FlowChipPeek.start(document, window); } catch (e) { /* the card itself still works */ }
  send({ type: 'flow:outlook-keepalive' }).catch(() => {});
  FlowStorage.get().then((st) => {
    if (st && st.outlookAuth && st.outlookAuth.token) pageSync('load').then(schedule).catch(() => {});
  }).catch(() => {});
  schedule();
})();
