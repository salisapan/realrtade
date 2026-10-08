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
  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch (e) { return '?'; } })();
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
  if (globalThis.__glanceOutlookPage) { try { globalThis.__glanceOutlookPage.rescan(); } catch (e) { /* old copy */ } return; }

  const SCAN_EVERY_MS = 800;        // at most one scan per 0.8 s, and at least one 0.8 s after any change
  const PAGE_SYNC_MIN_MS = 60 * 1000;
  const PAGE_DIAG_KEY = 'outlookPageDiag';
  const UNDONE_KEY = 'glanceUndoneBanners';
  let timer = null;
  let lastPaneKey = '';
  let suggestNote = null;
  let scanning = false;
  let again = false;
  let lastKey = '';
  let lastPageSyncAt = 0;
  let syncing = null;
  let lastReasonKey = '';
  let lastReasonStored = false;
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
  try { debug = window.localStorage && window.localStorage.getItem('glance-debug') === '1'; } catch (e) { /* storage blocked */ }
  try {
    chrome.storage.local.get({ glanceDebug: false, glanceOutlookFileTrace: 0 }, (r) => {
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

  function quietReason(reason) {
    const r = String(reason || '');
    if (r === 'third-party' || r === 'page:third-party') return 'third-party';
    if (r === 'outlook:file-found-no-attach' || r === 'outlook-file-found-no-attach') return 'outlook-file-found-no-attach';
    return null;
  }

  // Every open message ends in a card or in a reason the panel shows under "Why not shown" (never neither).
  async function pageReason(reason, pane, extra) {
    lastOutcome = 'reason';
    lastLoggedReason = reason;
    dbg('decision', { shown: false, reason, subject: pane && pane.subject });
    const key = reason + '|' + ((pane && (pane.conversationId || pane.itemId || pane.subject)) || location.pathname);
    if (key === lastReasonKey && lastReasonStored) return;
    const quiet = quietReason(reason);
    const quietId = pane && (pane.itemId || pane.conversationId);
    if (quiet && quietId && typeof FlowStorage !== 'undefined' && typeof FlowStorage.recordSilence === 'function') {
      FlowStorage.recordSilence({ messageId: String(quietId), reason: quiet }).catch(() => {});
    }
    try {
      const bag = await new Promise((resolve) => chrome.storage.local.get({ [PAGE_DIAG_KEY]: [] }, resolve));
      const list = (Array.isArray(bag[PAGE_DIAG_KEY]) ? bag[PAGE_DIAG_KEY] : []).filter((d) => d && d.key !== key);
      list.unshift(Object.assign({
        key, reason, at: Date.now(), source: 'page',
        subject: (typeof FlowDisplay !== 'undefined' && FlowDisplay.sanitizeStoredSubject)
          ? FlowDisplay.sanitizeStoredSubject(pane && pane.subject)
          : String((pane && pane.subject) || '').slice(0, 120),
        counterpart: (pane && pane.senderEmail) || null,
        conversationId: (pane && pane.conversationId) || null,
        messageId: (pane && (pane.itemId || pane.pathId)) || null
      }, extra || {}));
      await new Promise((resolve) => chrome.storage.local.set({ [PAGE_DIAG_KEY]: list.slice(0, 40) }, resolve));
      lastReasonKey = key;
      lastReasonStored = true;
    } catch (e) {
      lastReasonStored = false;
      try { console.error('Glance: page reason not stored', reason); } catch (x) { /* console gone */ }
    }
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
  async function clearReason(pane) {
    lastReasonKey = '';
    try {
      const bag = await new Promise((resolve) => chrome.storage.local.get({ [PAGE_DIAG_KEY]: [], outlookSync: {} }, resolve));
      const ids = messageIdsOf(pane);
      const id = pane && (pane.conversationId || pane.itemId || pane.subject);
      const list = (bag[PAGE_DIAG_KEY] || []).filter((d) => {
        if (!d) return false;
        if (id && String(d.key || '').endsWith('|' + id)) return false;
        if (idListed(d.conversationId, ids) || idListed(d.messageId, ids)) return false;
        return true;
      });
      const sync = bag.outlookSync || {};
      const patch = {};
      if (list.length !== (bag[PAGE_DIAG_KEY] || []).length) patch[PAGE_DIAG_KEY] = list;
      if (Array.isArray(sync.diagnostics)) {
        const diagnostics = sync.diagnostics.filter((d) => {
          if (!d) return false;
          if (idListed(d.conversationId, ids) || idListed(d.messageId, ids)) return false;
          return true;
        });
        if (diagnostics.length !== sync.diagnostics.length) patch.outlookSync = Object.assign({}, sync, { diagnostics: diagnostics });
      }
      if (Object.keys(patch).length) await new Promise((resolve) => chrome.storage.local.set(patch, resolve));
    } catch (e) { /* ignore */ }
  }

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) resolve({ ok: false, reason: chrome.runtime.lastError.message });
          else resolve(r || { ok: false });
        });
      } catch (e) {
        resolve({ ok: false, reason: String(e && e.message || e) });
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
      redirectUri: () => 'https://' + chrome.runtime.id + '.chromiumapp.org/',
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
  async function pageSync(reason) {
    if (syncing) return syncing;
    const now = Date.now();
    if (now - lastPageSyncAt < PAGE_SYNC_MIN_MS) return { ok: true, skipped: true };
    const o = runner();
    if (!o) return { ok: false, error: 'no-runner' };
    lastPageSyncAt = now;
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
        if (e && !out.some((x) => x.messageId === e.messageId && x.outlookReceipt)) {
          out.push(Object.assign({}, e, { outlookReceipt: true }));
        }
      });
    }
    return out;
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
    // A save-shaped sentence is the only one that asks how many files are
    // on the message. Every other sentence stays at zero, as before.
    // The address often carries only a conversation id. Counting files on that
    // id fails, and a failed read must not become a silent zero.
    let attachmentCount = 0;
    if (typeof FlowGoogleCloses !== 'undefined' && typeof FlowGoogleCloses.needsOneAttachment === 'function' && FlowGoogleCloses.needsOneAttachment(own)) {
      let id = pane.itemId || null;
      if (!id) {
        const found = await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, ownAddresses, pane.senderEmail);
        if (found && found.unread) return { none: true, reason: found.reason };
        id = found && found.id;
      }
      const rows = id ? await graphValues('/me/messages/' + encodeURIComponent(id) + '/attachments?$select=id,isInline', 'save-count') : null;
      if (!Array.isArray(rows)) {
        const flag = mailbox && mailbox.hasAttachments;
        if (flag === false) attachmentCount = 0;
        else return { none: true, reason: 'page:attachment-count-unread' };
      } else {
        attachmentCount = rows.filter((a) => {
          if (!a || a.isInline === true) return false;
          return !/itemAttachment/i.test(String(a['@odata.type'] || ''));
        }).length;
      }
    }
    const r = FlowIncomingJudge.judge({
      text: own, subject: pane.subject || '',
      sender: { name: pane.senderName, email: pane.senderEmail },
      now: new Date(), threadUrl: location.href,
      hasThreadAttachment: attachmentCount === 1,
      attachmentCount: attachmentCount,
      surface: 'outlook'
    });
    dbg('judged', { show: Boolean(r && r.show), reason: r && r.reason, type: r && r.intent && r.intent.type, label: r && r.intent && r.intent.label, from: 'open text' });
    return r && r.show ? { intent: r.intent, process: r.process } : { none: true, reason: (r && r.reason) || 'intent-null' };
  }

  function ownAddressesOf(st) {
    return ((st && st.outlookAuth && st.outlookAuth.ownAddresses) || [])
      .concat(st && st.outlookAuth && st.outlookAuth.account && st.outlookAuth.account.address ? [st.outlookAuth.account.address] : [])
      .map((a) => String(a || '').toLowerCase());
  }

  function fromAddress(msg) {
    return String((msg && msg.from && msg.from.emailAddress && msg.from.emailAddress.address) || '').toLowerCase();
  }

  function newestOther(list, own) {
    const rows = (list || []).filter((m) => {
      const a = fromAddress(m);
      return a && (own || []).indexOf(a) < 0;
    });
    rows.sort((a, b) => (Date.parse(b.receivedDateTime) || 0) - (Date.parse(a.receivedDateTime) || 0));
    return rows[0] || null;
  }

  function sameOpenSender(from, openEmail) {
    const a = String(from || '').toLowerCase();
    const b = String(openEmail || '').toLowerCase();
    return Boolean(a) && a === b;
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

  // Spellings of one Exchange id: Graph REST (- and _) first, then the URL form (+ and /).
  function idSpellings(id) {
    const raw = String(id || '');
    const canon = FlowOwaParse.canonId(raw);
    const out = [];
    if (canon) out.push(canon);
    if (raw && raw !== canon) out.push(raw);
    return out;
  }

  // The /inbox/id/<restId> segment is the Graph message id (EWS alphabet in the URL,
  // REST alphabet on Graph). GET /me/messages/{id} with both spellings. A conversation
  // id that is not a message returns no row, and the conversation fallbacks still run.
  async function messageIdFromPathRest(pathId) {
    const spells = idSpellings(pathId);
    const prefers = [null, GRAPH_IMMUTABLE];
    const select = '?$select=id,conversationId,receivedDateTime,from,subject,internetMessageId';
    for (let p = 0; p < prefers.length; p++) {
      for (let i = 0; i < spells.length; i++) {
        const msg = await graphJson('/me/messages/' + encodeURIComponent(spells[i]) + select, 'path-rest-id', prefers[p]);
        if (msg && msg.id && !Array.isArray(msg.value)) return { id: msg.id, how: 'path-rest-id', immutable: Boolean(prefers[p]), from: fromAddress(msg) };
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

  async function messageIdForConversation(convId, own) {
    const raw = String(convId || '');
    const want = FlowOwaParse.canonId(raw);
    if (!want) return null;
    try {
      const spells = idSpellings(raw);
      const prefers = [null, GRAPH_IMMUTABLE];
      for (let p = 0; p < prefers.length; p++) {
        for (let i = 0; i < spells.length; i++) {
          const q = "/me/messages?$filter=" + encodeURIComponent("conversationId eq '" + spells[i].replace(/'/g, "''") + "'") + '&$select=id,conversationId,receivedDateTime,from,subject,internetMessageId&$top=25';
          const fromFilter = newestOther(await graphValues(q, 'conversation-filter', prefers[p]), own);
          if (fromFilter && fromFilter.id) return { id: fromFilter.id, how: 'conversation-filter', immutable: Boolean(prefers[p]), from: fromAddress(fromFilter) };
        }
      }
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const select = '&$select=id,conversationId,receivedDateTime,from,subject,internetMessageId';
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
        const fromList = newestOther(hits, own);
        if (fromList && fromList.id) return { id: fromList.id, how: how, immutable: Boolean(prefers[p]), from: fromAddress(fromList) };
      }
      return null;
    } catch (e) { return null; }
  }

  // Path RestId first (GET /me/messages/{id}), then the conversation filter and the inbox list.
  // A conversation resolves to one message. The newest message from someone
  // else is not the open message. Return its from-address; on a mismatch the
  // result is unread and is never used as the open message.
  async function resolveOutlookMessageId(pathId, convId, own, openSender, subject) {
    const direct = await messageIdFromPathRest(pathId || convId);
    if (direct && direct.id) return direct;
    const found = await messageIdForConversation(convId || pathId, own);
    const resolved = found && found.id ? found : await messageBySubject(subject, openSender, own);
    if (!resolved || !resolved.id) return null;
    if (!sameOpenSender(resolved.from, openSender)) {
      dbg('sender-mismatch', { how: resolved.how, from: resolved.from || null, open: String(openSender || '').toLowerCase() || null });
      return { unread: true, reason: 'page:sender-mismatch', from: resolved.from || null };
    }
    return resolved;
  }

  async function messageBySubject(subject, openSender, own) {
    const sub = (typeof FlowOwaParse.norm === 'function') ? FlowOwaParse.norm(subject) : String(subject || '').toLowerCase().trim();
    if (!sub) return null;
    const select = '&$select=id,conversationId,receivedDateTime,from,subject,internetMessageId';
    const plainPath = '/me/mailFolders/inbox/messages?$top=40&$orderby=' + encodeURIComponent('receivedDateTime desc') + select;
    const list = await graphValues(plainPath, 'inbox-subject', null);
    const hits = (Array.isArray(list) ? list : []).filter((m) => {
      if (!m) return false;
      const msub = (typeof FlowOwaParse.norm === 'function') ? FlowOwaParse.norm(m.subject) : String(m.subject || '').toLowerCase().trim();
      return msub === sub && sameOpenSender(fromAddress(m), openSender);
    });
    const row = newestOther(hits, own);
    if (!row || !row.id) return null;
    return { id: row.id, how: 'inbox-subject', immutable: false, from: fromAddress(row) };
  }

  async function ensureOutlookMessageId(ctx) {
    const have = ctx && (ctx.outlookIncomingId || ctx.messageId);
    if (have) return have;
    const pathId = ctx && (ctx.pathId || ctx.conversationId);
    const convId = ctx && ctx.conversationId;
    if (!pathId && !convId) return null;
    let own = [];
    try { own = ownAddressesOf(await FlowStorage.get()); } catch (e) { own = []; }
    const found = await resolveOutlookMessageId(pathId, convId, own, ctx && ctx.sender && ctx.sender.email);
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

  function buildCtx(entry, pane, decided) {
    const intent = (decided && decided.intent) || entry.intent;
    let process = (decided && decided.process) || entry.process;
    if (!intent || !process) return null;
    // In-page Do It writes the Outlook draft only (same as popup). Drop non-draft steps from the chip.
    // A OneDrive file step is the close. The draft beside it is the share-link step, and dropping the file
    // would turn that Do It into a reply draft.
    const hasOnedrive = (process.steps || []).some((s) => s && s.kind === 'onedriveFile');
    const draftSteps = (process.steps || []).filter((s) => s.kind === 'outlookDraft' || s.kind === 'gmailDraft');
    if (draftSteps.length && !hasOnedrive) {
      process = Object.assign({}, process, {
        steps: draftSteps.map((s) => s.kind === 'gmailDraft'
          ? Object.assign({}, s, { kind: 'outlookDraft', id: String(s.id || 'draft').replace(/^gmail/i, 'outlook') })
          : s)
      });
    }
    const sender = entry.sender || (entry.base && entry.base.counterpart) || {
      name: pane && pane.senderName,
      email: pane && pane.senderEmail
    };
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
      key: entry.key
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

  async function onDoIt(host, chip, ctx, liveSteps) {
    doItInFlight = true;
    try {
    FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Closing…');
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('preparing');
    let resolvedId = null;
    try {
      if (!(ctx && (ctx.outlookIncomingId || ctx.messageId))) graphTrace = { attempts: [] };
      resolvedId = await ensureOutlookMessageId(ctx);
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
      FlowChipHost.setChipState(chip, 'flow-chip-error', 'Could not find that message');
      return;
    }
    const fromList = Array.isArray(liveSteps);
    const steps = fromList ? liveSteps : ((ctx.process && ctx.process.steps) || []);
    if (fromList && !steps.length) {
      if (host) host.remove();
      return;
    }
    const fileStep = steps.find((s) => s && s.kind === 'onedriveFile');
    if (fileStep) {
      await onOnedriveDoIt(host, chip, ctx, fileStep);
      return;
    }
    const hasDraft = steps.some((s) => s && (s.kind === 'outlookDraft' || s.kind === 'gmailDraft'));
    const taskStep = steps.find((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks'));
    if (taskStep && !hasDraft) {
      await onOutlookTodoDoIt(host, chip, ctx, taskStep);
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
    const r = await send({ type: 'flow:execute-action', payload: payload });
    // A file is attached only when Graph returned an attachment id. A success
    // without that id is not a draft we keep, and the receipt never says attached.
    if (!r || !r.ok || (file && !r.attachmentId)) {
      if (r && r.ok && r.ref && file && !r.attachmentId) {
        await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref, outlookImmutableId: ctx.outlookImmutableId === true });
      }
      if (file) {
        await pageReason('outlook:file-found-no-attach', {
          itemId: ctx.messageId,
          subject: ctx.subject,
          senderEmail: ctx.sender && ctx.sender.email
        });
      }
      FlowChipHost.setChipState(chip, 'flow-chip-error', (r && !r.ok && (r.reason || r.error)) || (file ? 'Could not attach that file.' : 'Could not create draft'));
      return;
    }
    const written = file
      ? 'Reply draft ready in Outlook Drafts, with the file attached. Not sent.'
      : (r.written || 'Reply draft ready in Outlook Drafts. Not sent.');
    await FlowStorage.appendLog({
      kind: 'written',
      label: written,
      messageId: ctx.messageId,
      app: 'outlook',
      connectorId: 'outlookDraft',
      ref: r.ref,
      where: r.where,
      url: r.url || r.where,
      outlookIncomingId: ctx.outlookIncomingId,
      outlookReceipt: true,
      intent: ctx.intent,
      process: ctx.process,
      sender: ctx.sender,
      subject: ctx.subject,
      text: ctx.bodyText
    });
    if (ctx.messageId) {
      await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
      await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
    }
    FlowChipHost.showDraftReceipt(host, {
      written: written,
      url: r.url || r.where,
      onUndo: async () => {
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref, outlookImmutableId: ctx.outlookImmutableId === true });
        if (typeof FlowStorage.markOutlookDraftUndone === 'function') {
          await FlowStorage.markOutlookDraftUndone(ctx.messageId, r.ref);
        }
        if (u && u.ok) {
          await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: ctx.messageId, draftOnly: true });
        }
        // Undo reopens the owed ask: drop the settled receipt and let scan
        // re-inject Do It (same eligibility as the popup Still Open list).
        lastKey = '';
        lastSig = '';
        try { host.remove(); } catch (e) { /* already gone */ }
        schedule();
        return { ok: true, written: (u && u.written) || 'Reply draft removed. Not sent.', reopen: true };
      }
    });
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
    return row.connectorId === 'onedriveFile';
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
    return document.querySelector('#ReadingPaneContainerId') || mount || document;
  }

  // One Handled receipt for this message. A second copy, in the header or
  // in the body, is removed. A different message's host is not this receipt.
  function stripDuplicateUndoHosts(mount) {
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

  function paintOutlookTodoReceipt(mount, row) {
    const copy = (typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.remountCopy)
      ? FlowProofOfClose.remountCopy(row)
      : null;
    if (!mount || !copy) return null;
    const ids = [row.messageId, row.itemId, row.pathId, row.threadId, row.outlookConversationId].filter(Boolean).map(String);
    const scope = (typeof readingScope === 'function' && readingScope(mount)) || mount;
    const hosts = scope.querySelectorAll ? Array.prototype.slice.call(scope.querySelectorAll('.flow-chip-host')) : [];
    let host = hosts.filter((h) => h.getAttribute('data-glance-undone') !== '1').pop() || null;
    if (host && host.classList.contains('flow-chip-settled') && host.getAttribute('data-glance-chain') === 'task-proof' && (!ids.length || hostMatches(host, ids))) {
      hosts.forEach((other) => { if (other !== host) other.remove(); });
      return host;
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
    done.appendChild(el('span', 'flow-chip-handled', copy.status));
    if (copy.writtenLine) done.appendChild(el('span', 'flow-chip-written', copy.writtenLine));
    if (copy.processName || copy.closedLine) {
      const detail = el('span', 'flow-chip-detail');
      if (copy.processName) detail.appendChild(el('span', 'flow-chip-process-name', copy.processName));
      if (copy.closedLine) detail.appendChild(el('span', 'flow-chip-label', copy.closedLine));
      done.appendChild(detail);
    }
    const undo = el('button', 'flow-chip-undo', copy.undoHint);
    undo.type = 'button';
    const hint = el('span', 'flow-chip-undo-hint');
    hint.hidden = true;
    const actionsRow = el('span', 'flow-chip-actions');
    actionsRow.appendChild(undo);
    if (copy.url) {
      const view = el('a', 'flow-chip-link', 'View');
      view.href = copy.url;
      view.target = '_blank';
      view.rel = 'noopener';
      actionsRow.appendChild(view);
    }
    undo.addEventListener('click', () => {
      undo.textContent = 'Undoing…';
      undo.disabled = true;
      send({ type: 'flow:undo-action', connectorId: copy.connectorId, ref: copy.ref }).then(async (result) => {
        if (!(result && result.ok)) {
          undo.textContent = copy.undoHint;
          undo.disabled = false;
          hint.hidden = false;
          hint.textContent = copy.undoFailed || 'Still there — the To Do task was not removed.';
          hint.className = 'flow-chip-undo-hint flow-chip-undo-failed';
          return;
        }
        const messageId = row.messageId;
        const threadKey = row.threadId || row.outlookConversationId;
        if ((copy.connectorId === 'onedriveFile' || copy.connectorId === 'attachmentSave') && typeof FlowStorage.markOnedriveFileUndone === 'function') {
          await FlowStorage.markOnedriveFileUndone(messageId, copy.ref, threadKey);
        } else if (typeof FlowStorage.markMicrosoftTodoUndone === 'function') {
          await FlowStorage.markMicrosoftTodoUndone(messageId, copy.ref, threadKey);
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
        done.replaceChildren(el('span', 'flow-chip-label', copy.undoneLine));
        rememberUndone(undoneIds, copy.undoneLine);
        lastOutcome = 'card';
        lastKey = (row.messageId || 'open') + '|undone';
        lastSig = '';
      });
    });
    done.appendChild(actionsRow);
    done.appendChild(hint);
    if (manuals) done.appendChild(el('span', 'flow-chip-label', manuals + (manuals === 1 ? ' manual step left for you' : ' manual steps left for you')));
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
    chrome.storage.local.get({ [UNDONE_KEY]: {} }, (bag) => {
      const map = Object.assign({}, (bag && bag[UNDONE_KEY]) || {});
      const at = Date.now();
      keys.forEach((id) => { map[id] = { line: line, ids: keys, at: at }; });
      chrome.storage.local.set({ [UNDONE_KEY]: map });
    });
  }

  async function undoneBannerFor(pane) {
    const ids = messageIdsOf(pane);
    if (!ids.length) return null;
    const bag = await new Promise((resolve) => chrome.storage.local.get({ [UNDONE_KEY]: {} }, resolve));
    const map = (bag && bag[UNDONE_KEY]) || {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      if (idListed(keys[i], ids) && map[keys[i]] && map[keys[i]].line) return map[keys[i]];
    }
    return null;
  }

  function paintUndoneStatus(mount, pane, line) {
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
    done.appendChild(el('span', 'flow-chip-label', line));
    host.appendChild(done);
    if (mount.firstChild) mount.insertBefore(host, mount.firstChild);
    else mount.appendChild(host);
    stripDuplicateUndoHosts(mount);
    lastOutcome = 'card';
    return host;
  }

  function paneIdList(pane) {
    return [pane && pane.itemId, pane && pane.pathId, pane && pane.conversationId].filter(Boolean).map(String);
  }

  function draftMatchesPane(row, pane) {
    if (!row || row.connectorId !== 'outlookDraft') return false;
    const want = paneIdList(pane);
    const ids = [row.messageId, row.outlookIncomingId, row.itemId, row.pathId, row.threadId, row.outlookConversationId].filter(Boolean).map(String);
    return want.some((id) => ids.indexOf(id) !== -1);
  }

  // The open page already showed Draft ready. Keep that receipt, with Undo,
  // until the draft is undone. A reload mounts the same receipt from the log.
  async function keepActiveDraftReceipt(pane) {
    if (!pane || typeof FlowStorage.getActiveOutlookReceipts !== 'function') return false;
    const receipts = await FlowStorage.getActiveOutlookReceipts();
    const draft = (receipts || []).filter((r) => draftMatchesPane(r, pane)).pop();
    if (!draft) return false;
    const mount = mountPoint();
    if (!mount) return false;
    const settled = mount.querySelector('.flow-chip-host.flow-chip-settled');
    if (settled && settled.querySelector('.flow-chip-undo')) {
      lastOutcome = 'card';
      return true;
    }
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    const host = FlowChipHost.inject(mount, {
      process: { name: 'Reply', steps: [] },
      intent: { label: draft.label || 'Reply draft ready' },
      messageId: draft.messageId
    }, { onDoIt: () => {}, onDismiss: (h) => h.remove() });
    if (!host) return false;
    lastOutcome = 'card';
    FlowChipHost.showDraftReceipt(host, {
      written: draft.writtenLine || draft.label || 'Reply draft ready in Outlook Drafts. Not sent.',
      url: draft.url || draft.where,
      onUndo: async () => {
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: draft.ref });
        if (typeof FlowStorage.markOutlookDraftUndone === 'function') {
          await FlowStorage.markOutlookDraftUndone(draft.messageId, draft.ref);
        }
        await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: draft.messageId, draftOnly: true });
        lastKey = '';
        lastSig = '';
        try { host.remove(); } catch (e) { /* already gone */ }
        schedule();
        return { ok: true, written: (u && u.written) || 'Reply draft removed. Not sent.', reopen: true };
      }
    });
    return true;
  }

  // Handled after a reload or a return to this thread. The match is the
  // Outlook item id, the path id, or the conversation id. A hash of the
  // pane text is not an id.
  async function remountProvedTodoReceipt(pane) {
    if (!pane || typeof FlowProofOfClose === 'undefined' || typeof FlowProofOfClose.taskReceiptFromLog !== 'function') return false;
    const mount = mountPoint();
    if (!mount) return false;
    let bag = null;
    try { bag = await FlowStorage.get(); } catch (e) { return false; }
    const log = (bag && bag.log) || [];
    const todoLog = log.filter((e) => outlookProofRow(e));
    const row = FlowProofOfClose.taskReceiptFromLog(todoLog, {
      messageIds: [pane.itemId, pane.pathId, pane.conversationId],
      threadIds: [pane.conversationId]
    });
    const existing = stripDuplicateUndoHosts(mount);
    // Undo already replaced the receipt with its confirmation. The written
    // row is gone, so a scan would otherwise delete that line. Keep it while
    // this is still the same message. A different message drops it.
    if (existing && existing.getAttribute('data-glance-undone') === '1') {
      const marked = String(existing.getAttribute('data-glance-message') || '').split('|').filter(Boolean);
      const ids = [pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
      if (marked.length && ids.some((id) => marked.indexOf(id) !== -1)) {
        lastOutcome = 'card';
        return true;
      }
      existing.remove();
    }
    if (!outlookProofRow(row)) {
      const banner = await undoneBannerFor(pane);
      if (banner && banner.line) return Boolean(paintUndoneStatus(mount, pane, banner.line));
      if (existing && existing.isConnected) existing.remove();
      return false;
    }
    if (existing && existing.classList.contains('flow-chip-settled')) {
      lastOutcome = 'card';
      lastKey = (row.messageId || 'open') + '|task-proof';
      return true;
    }
    return Boolean(paintOutlookTodoReceipt(mount, row));
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

  async function livePromiseProof(item) {
    if (typeof FlowStillOpen === 'undefined' || typeof FlowStillOpen.activeProofFor !== 'function') return null;
    if (typeof FlowStorage === 'undefined' || typeof FlowStorage.get !== 'function') return null;
    let bag = null;
    try { bag = await FlowStorage.get(); } catch (e) { return null; }
    return FlowStillOpen.activeProofFor((bag && bag.log) || [], item);
  }

  async function onOutlookTodoDoIt(host, chip, ctx, taskStep) {
    const params = (taskStep && taskStep.params) || {};
    const he = ctx.intent && ctx.intent.lang === 'he';
    const live = await livePromiseProof(promiseItem(ctx));
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
        label: (ctx.intent && ctx.intent.label) || params.title || 'Task',
        senderName: ctx.sender && ctx.sender.name,
        senderEmail: ctx.sender && ctx.sender.email,
        subject: ctx.subject || '',
        text: ctx.bodyText || '',
        threadUrl: ctx.threadUrl || null,
        facts: (ctx.intent && ctx.intent.facts) || null,
        entities: (ctx.intent && (ctx.intent.entities || ctx.intent.facts)) || null
      }
    });
    const proved = typeof FlowProofOfClose !== 'undefined' && FlowProofOfClose.allowsHandled
      ? FlowProofOfClose.allowsHandled({ ok: !!(r && r.ok), proof: r && r.proof })
      : false;
    if (!proved) {
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('failed');
      const why = (r && r.reason === 'tasks-not-granted')
        ? 'Reconnect Outlook to allow To Do'
        : ((r && (r.error || r.reason)) || 'Could not confirm the task');
      FlowChipHost.setChipState(chip, 'flow-chip-error', why);
      return;
    }
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('verified');
    const status = he ? 'טופל.' : 'Handled.';
    const fields = FlowProofOfClose.receiptLogFields
      ? FlowProofOfClose.receiptLogFields(r.proof, {
        writtenLine: r.written,
        processName: faceTitle(ctx),
        closedLine: ctx.process && ctx.process.closedLine,
        status: status
      })
      : null;
    const threadId = ctx.threadId || ctx.conversationId || null;
    const taskTitle = actionTitle({
      connectorId: 'outlookTask', process: ctx.process, intent: ctx.intent, text: ctx.bodyText,
      writtenLine: r.written, subject: ctx.subject, params: params
    });
    await FlowStorage.appendLog(Object.assign({
      kind: 'written',
      label: taskTitle,
      actionTitle: taskTitle,
      messageId: ctx.messageId,
      itemId: ctx.itemId || null,
      pathId: ctx.pathId || null,
      threadId: threadId,
      outlookConversationId: ctx.conversationId || null,
      outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
      app: 'outlook',
      connectorId: 'outlookTask',
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
      connectorId: 'outlookTask',
      ref: r.ref,
      url: r.url || null,
      system: 'microsoft/todo',
      externalId: r.proof && r.proof.externalId,
      verifiedAt: r.proof && r.proof.verifiedAt,
      fetchedBack: true,
      writtenLine: r.written,
      processName: faceTitle(ctx),
      closedLine: ctx.process && ctx.process.closedLine,
      receiptStatus: status,
      process: ctx.process,
      intent: ctx.intent,
      text: ctx.bodyText,
      sender: ctx.sender,
      subject: ctx.subject,
      app: 'outlook'
    }, fields || {});
    if (mount) paintOutlookTodoReceipt(mount, row);
  }

  async function onOnedriveDoIt(host, chip, ctx, fileStep) {
    const params = (fileStep && fileStep.params) || {};
    const he = ctx.intent && ctx.intent.lang === 'he';
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
      FlowChipHost.setChipState(chip, 'flow-chip-error', why);
      return;
    }
    if (host && host.__glanceSteps) host.__glanceSteps.setAll('verified');
    const status = he ? 'טופל.' : 'Handled.';
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
    if (mount) paintOutlookTodoReceipt(mount, row);
  }

  function holdingLabel(chain) {
    return chain && chain.requirement && chain.requirement.lang === 'he' ? 'טיוטת תשובת ביניים' : 'Draft a holding reply';
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

  function ownSender(email, own) {
    const e = String(email || '').trim().toLowerCase();
    return Boolean(e && (own || []).indexOf(e) >= 0);
  }

  // A silence replaces whatever card was already floating. The schedule card
  // from an older judgment used to stay up after the check had moved on.
  function dropStuckCard() {
    const mount = mountPoint();
    const old = mount && mount.querySelector('.flow-chip-host');
    if (old) old.remove();
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
    const chain = ctx.chain || {};
    const holding = chain.holding && chain.holding.text;
    if (!holding || !ctx.sender || !ctx.sender.email) {
      FlowChipHost.setChipState(chip, 'flow-chip-error', 'Needs an address');
      return;
    }
    FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Working…');
    let fromAddress = null;
    try {
      const st = await FlowStorage.get();
      fromAddress = preferHumanFrom(st && st.outlookAuth);
    } catch (e) { /* From resolved again in background */ }
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
      FlowChipHost.setChipState(chip, 'flow-chip-error', (r && (r.reason || r.error)) || 'Could not create draft');
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
    const he = chain.requirement && chain.requirement.lang === 'he';
    FlowChipHost.showDraftReceipt(host, {
      status: he ? 'הטיוטה מוכנה. לא נשלח.' : 'Draft ready. Not sent.',
      written: he ? 'הטיוטה מוכנה. לא נשלח.' : 'Draft ready. Not sent.',
      url: r.url || r.where,
      onUndo: async () => {
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref });
        if (u && u.ok && ctx.threadId && typeof FlowStorage.updateWatch === 'function') {
          await FlowStorage.updateWatch(ctx.threadId, { status: 'stopped', resolvedBy: 'undo' });
        }
        lastKey = '';
        lastSig = '';
        try { host.remove(); } catch (e) { /* already gone */ }
        schedule();
        return { ok: true, written: (u && u.written) || 'Reply draft removed. Not sent.', reopen: true };
      }
    });
  }

  // A Drive hit is a card. The address often has only a conversation id; a missing
  // Graph message id used to return false here and the scan then called that
  // outlook:file-found-no-attach and removed the card. The id is resolved when
  // it can be, and Do It resolves it again before the draft. Nothing is sent.
  async function showFilePrepare(pane, chain, messageId, messageIdFrom, immutable) {
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
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    const host = FlowChipHost.inject(mount, ctx, {
      onDoIt: (h, chip, c) => { onDoIt(h, chip, c); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    });
    if (!host) return { shown: false, why: 'inject-failed' };
    host.setAttribute('data-glance-chain', 'prepare');
    host.setAttribute('data-glance-message', messageId || '');
    lastOutcome = 'card';
    lastKey = (messageId || (pane && pane.conversationId) || 'open') + '|prepare';
    dbg('decision', { shown: true, chain: 'prepare', fileId: file.id, messageId: messageId || null });
    dbg('rendered', { messageId: messageId || null, chain: 'prepare' });
    await clearReason(pane);
    await forgetFileSilence(pane);
    return { shown: true, why: messageId ? 'shown' : 'shown-without-message-id' };
  }

  async function showHoldingChain(pane, chain, messageId) {
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
      chain: chain
    };
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    const host = FlowChipHost.inject(mount, ctx, {
      onDoIt: (h, chip, c) => { onHoldingDoIt(h, chip, c); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    });
    if (!host) return false;
    host.setAttribute('data-glance-chain', 'needs-you');
    lastOutcome = 'card';
    lastKey = messageId + '|needs-you';
    dbg('decision', { shown: true, chain: 'needs-you', label: ctx.doLabel });
    dbg('rendered', { messageId: messageId, chain: 'needs-you' });
    await clearReason(pane);
    await forgetFileSilence(pane);
    return true;
  }

  async function onDismiss(host, ctx) {
    host.remove();
    if (!ctx || !ctx.messageId) return;
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
    return (token && token.grantedScopes) || [];
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
    return async () => {
      const u = await send({ type: 'flow:undo-action', connectorId: 'outlookCalendar', ref: ref });
      if (!(u && u.ok)) return { ok: false };
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
      try { host.remove(); } catch (e) { /* already gone */ }
      schedule();
      return { ok: true, written: (u && u.written) || 'Calendar event removed.', reopen: true };
    };
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
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    const host = FlowChipHost.inject(mount, {
      app: 'outlook',
      doLabel: 'Do It',
      messageId: messageId,
      process: { name: 'File on hold', steps: [{ kind: 'calendar' }] },
      intent: { label: row.label || 'On your calendar' }
    }, { onDoIt: () => {}, onDismiss: (h) => h.remove() });
    if (!host) return;
    host.setAttribute('data-glance-chain', 'calendar-hold');
    host.setAttribute('data-glance-message', messageId || '');
    lastOutcome = 'card';
    lastKey = (messageId || 'open') + '|calendar-hold';
    FlowChipHost.showDraftReceipt(host, {
      status: 'Handled.',
      written: row.label || 'On your calendar, with the file.',
      url: row.url || null,
      linkLabel: 'Open event',
      onUndo: calendarUndoHandler(host, messageId, row.ref)
    });
    await clearReason(pane);
  }

  // Family B on the open page: one named file, one clock, one Outlook event.
  // A note to yourself is the ask (the same gate as Gmail). A meeting with
  // no file is left to the existing judge, which stays quiet. The card is
  // shown only when the token already has Calendars.ReadWrite (the Calendar
  // box on the one Connect screen). Without it the page stays quiet.
  async function settleCalendarHold(pane, probe, st) {
    if (!probe || probe.move === 'ignore') return false;
    if (probe.move === 'silent') {
      dropStuckCard();
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
      dropStuckCard();
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
      dropStuckCard();
      await pageReason('outlook-calendar-silent', pane);
      return true;
    }
    if (typeof FlowOutlookCalendar === 'undefined' || !FlowOutlookCalendar.hasWriteScope(calendarScopes(st))) {
      dropStuckCard();
      await pageReason('outlook-calendar-write-not-granted', pane);
      return true;
    }
    await showCalendarHold(pane, hold, file, messageId);
    return true;
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
      calendarHold: { params: params }
    };
    if (doItInFlight) return;
    const old = mount.querySelector('.flow-chip-host');
    if (old && old.classList.contains('flow-chip-settled') && old.getAttribute('data-glance-chain') === 'calendar-hold') {
      lastOutcome = 'card';
      return;
    }
    if (old) old.remove();
    const host = FlowChipHost.inject(mount, ctx, {
      onDoIt: (h, chip, c) => { onCalendarDoIt(h, chip, c); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    });
    if (!host) { await pageReason('page:inject-failed', pane); return; }
    host.setAttribute('data-glance-chain', 'calendar-hold');
    host.setAttribute('data-glance-message', messageId || '');
    lastOutcome = 'card';
    lastKey = (messageId || 'open') + '|calendar-hold';
    dbg('decision', { shown: true, chain: 'calendar-hold', file: file.name || null });
    dbg('rendered', { messageId: messageId || null, chain: 'calendar-hold' });
    await clearReason(pane);
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
    doItInFlight = true;
    FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Closing…');
    let wrote = null;
    try {
      const hold = (ctx && ctx.calendarHold) || {};
      const r = await send({
        type: 'flow:execute-action',
        payload: { connectorId: 'outlookCalendar', params: hold.params || {}, messageId: ctx.messageId }
      });
      if (!r || !r.ok || !r.ref || !r.ref.eventId) {
        FlowChipHost.setChipState(chip, 'flow-chip-error', (r && (r.error || r.reason)) || 'Could not add the event');
        return;
      }
      const written = r.written || 'On your calendar, with the file.';
      wrote = { ref: r.ref, written: written, url: r.url || null };
      await FlowStorage.appendLog({
        kind: 'written',
        label: written,
        messageId: ctx.messageId,
        app: 'outlook',
        connectorId: 'outlookCalendar',
        ref: r.ref,
        where: r.where,
        url: r.url || null,
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
      if (ctx.messageId) {
        await FlowStorage.recordStillOpenMetric({ kind: 'doIt', messageId: ctx.messageId });
        await FlowStorage.recordCloseQuality({ kind: 'doIt', messageId: ctx.messageId });
      }
      FlowChipHost.showDraftReceipt(host, {
        status: 'Handled.',
        written: written,
        url: r.url || null,
        linkLabel: 'Open event',
        onUndo: calendarUndoHandler(host, ctx.messageId, r.ref)
      });
    } catch (e) {
      glanceError('calendar receipt', e);
      if (wrote && host && host.isConnected) {
        try {
          FlowChipHost.showDraftReceipt(host, {
            status: 'Handled.',
            written: wrote.written,
            url: wrote.url,
            linkLabel: 'Open event',
            onUndo: calendarUndoHandler(host, ctx.messageId, wrote.ref)
          });
        } catch (e2) { glanceError('calendar receipt', e2); }
      }
    } finally {
      doItInFlight = false;
    }
  }

  async function scan() {
    const st = await FlowStorage.get();
    const own = ownAddressesOf(st);
    const pane = keepSender(FlowOwaParse.readPane(document, location.href, { own: own }));
    const ids = FlowOwaParse.urlIds(location.href);
    const earlyPlanned = plannedRow(st, pane);
    const sig = pane
      ? [pane.conversationId || pane.itemId || '', pane.subject, pane.senderName, hashText(pane.text), (earlyPlanned && earlyPlanned.reason) || ''].join('|')
      : 'none|' + location.pathname;
    const armed = traceArmed || localFileTrace();
    // A click rewrites the chip. That must not re-enter the file chain: re-entry was what
    // set glanceOutlookFileTrace back to 0 on Do It. One trace per open message while armed.
    clearForeignHosts(pane);
    if (doItInFlight && document.querySelector('.flow-chip-host')) {
      dbg('decision', { shown: true, reason: 'page:do-it-in-flight' });
      return;
    }
    if (sig === lastSig && !(armed && tracedSig !== sig) && (lastOutcome === 'reason' || (lastOutcome === 'card' && document.querySelector('.flow-chip-host')))) {
      if (lastOutcome === 'reason' && !lastReasonStored) {
        await pageReason(lastLoggedReason || 'page:same-signature', pane || { subject: (ids && (ids.raw || ids.conversationId || ids.itemId)) || '' });
      }
      return;
    }
    lastSig = sig;
    lastOutcome = '';
    suggestNote = (pane && (pane.conversationId || pane.itemId || (pane.text && String(pane.text).trim()))) ? pane : null;
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
    dbg('parsed', { subject: pane.subject, sender: pane.senderEmail, senderName: pane.senderName, itemId: pane.itemId, conversationId: pane.conversationId, chars: (pane.text || '').length });
    // Outlook must be connected (token present); otherwise no card, and the reason says why.
    if (!st || !st.outlookAuth || !st.outlookAuth.token) { dropStuckCard(); await pageReason('page:not-connected', pane); return; }

    // A proved To Do task is mounted before a quiet return. The ids are the
    // Outlook item, the path, and the conversation — not a hash of the text.
    try {
      if (await remountProvedTodoReceipt(pane)) {
        dbg('decision', { shown: true, reason: 'page:receipt-mounted', subject: pane.subject });
        return;
      }
      const earlyProof = await livePromiseProof({
        text: pane.text,
        sender: { name: pane.senderName, email: pane.senderEmail },
        threadId: pane.conversationId || '',
        outlookConversationId: pane.conversationId || ''
      });
      if (earlyProof) {
        const earlyMount = mountPoint();
        if (earlyMount && paintOutlookTodoReceipt(earlyMount, earlyProof)) {
          dbg('decision', { shown: true, reason: 'page:promise-proof', subject: pane.subject });
          return;
        }
      }
    } catch (e) {
      glanceError('todo receipt', e);
      await pageReason('page:scan-error', pane);
      return;
    }

    // A draft that is still in Drafts stays the receipt. A later scan (the
    // planned reason changed, another message was undone) must not put Do It
    // back on top of it. Undo is what removes it.
    try {
      if (await keepActiveDraftReceipt(pane)) {
        dbg('decision', { shown: true, reason: 'page:draft-receipt', subject: pane.subject });
        return;
      }
    } catch (e) {
      glanceError('draft receipt', e);
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
    const receiptOnly = Boolean(entry && entry.outlookReceipt && entry.ref && !entry.process);
    const selfMail = !receiptOnly && (ownSender(pane.senderEmail, own) || (planned && (planned.reason === 'note-to-self' || planned.reason === 'own-sender')));
    if (selfMail) {
      dropStuckCard();
      await pageReason((planned && planned.reason) || 'note-to-self', pane);
      return;
    }
    if (!receiptOnly) {
      decided = await decideFromText(pane, own, entry);
      if (decided && decided.reason === 'third-party') {
        dropStuckCard();
        await pageReason('page:third-party', pane);
        return;
      }
      // Either side saying this is a file ask is enough to run the chain.
      // A stored schedule process used to skip this and leave the old card up
      // while Why not shown already said drive-search-failed.
      const fileNow = (decided && (filePendingReason(decided.reason) || fileSilenceReason(decided.reason))) || (planned && fileSilenceReason(planned.reason));
      if (fileNow) {
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
            if (chain && (chain.move === 'needs-you' || chain.move === 'prepare') && !msgId && (pane.pathId || pane.conversationId)) {
              const found = await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, own, pane.senderEmail);
              if (found && found.unread) msgIdHow = 'sender-mismatch';
              else if (found && found.id) { msgId = found.id; msgIdHow = found.how; msgImmutable = found.immutable === true; }
              else msgIdHow = 'none';
            }
            if (chain && chain.move === 'needs-you') {
              const shown = await showHoldingChain(pane, chain, msgId);
              finalReason = shown ? 'needs-you' : 'page:no-message-id';
              if (!shown) { dropStuckCard(); await pageReason(finalReason, pane); }
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
              dropStuckCard();
              await pageReason(finalReason, pane);
              return;
            }
            finalReason = namedSilence((ran && ran.quiet) || (chain && chain.reason) || 'file-chain-not-run');
            if ((!ran || ran.ran !== true) && planned && fileSilenceReason(planned.reason)) finalReason = planned.reason;
            dropStuckCard();
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
        if (!decided || decided.none) {
          const keepFile = typeof FlowOutlookSync !== 'undefined' && typeof FlowOutlookSync.keepMailboxFileCard === 'function'
            && FlowOutlookSync.keepMailboxFileCard(decided, entry);
          if (!keepFile) {
            dropStuckCard();
            const named = (decided && decided.reason) || 'intent-null';
            const quiet = (planned && planned.reason && !fileSilenceReason(planned.reason))
              ? planned.reason
              : (String(named).indexOf('page:') === 0 ? named : ('page:' + named));
            await pageReason(quiet, pane);
            return;
          }
          decided = { intent: entry.intent, process: entry.process };
        }
      if (!entry || (entry.process && decided.process && entry.process.id !== decided.process.id)) {
        // createReply needs a Graph message id. The address gives one, or the conversation it belongs to.
        let msgId = pane.itemId || null;
        if (!msgId && (pane.pathId || pane.conversationId)) {
          const found = await resolveOutlookMessageId(pane.pathId || pane.conversationId, pane.conversationId, own, pane.senderEmail);
          if (found && found.unread) {
            dbg('resolved', { conversationId: pane.conversationId, pathId: pane.pathId || null, mismatch: true, from: found.from || null });
            dropStuckCard();
            await pageReason(found.reason, pane);
            return;
          }
          msgId = found ? found.id : null;
          dbg('resolved', { conversationId: pane.conversationId, pathId: pane.pathId || null, messageId: msgId });
        }
        if (!msgId) { await pageReason('page:no-message-id', pane); return; }
        entry = {
          messageId: msgId,
          outlookIncomingId: msgId,
          outlookConversationId: pane.conversationId || null,
          subject: pane.subject,
          text: pane.text,
          sender: { name: pane.senderName, email: pane.senderEmail },
          intent: decided.intent,
          process: decided.process
        };
      } else {
        entry = Object.assign({}, entry, { intent: decided.intent, process: decided.process });
      }
    } else {
      dbg('judged', { show: true, type: entry.intent && entry.intent.type, label: entry.intent && entry.intent.label, from: 'mailbox check' });
    }

    // Receipt-only entry: show settled receipt if draft still active.
    if (entry.outlookReceipt && entry.ref && !entry.process) {
      const mount = mountPoint();
      if (!mount) { await pageReason('page:no-mount', pane); return; }
      if (mount.querySelector('.flow-chip-host')) { lastOutcome = 'card'; return; }
      const host = FlowChipHost.inject(mount, {
        process: { name: 'Reply', steps: [{ kind: 'outlookDraft' }] },
        intent: { label: entry.label || 'Reply draft ready' },
        messageId: entry.messageId
      }, { onDoIt: () => {}, onDismiss: (h) => h.remove() });
      if (host) {
        lastOutcome = 'card';
        dbg('rendered', { receipt: true, messageId: entry.messageId });
        FlowChipHost.showDraftReceipt(host, {
          written: entry.label || 'Reply draft ready in Outlook Drafts. Not sent.',
          url: entry.url || entry.where,
          onUndo: async () => {
            const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: entry.ref });
            if (typeof FlowStorage.markOutlookDraftUndone === 'function') {
              await FlowStorage.markOutlookDraftUndone(entry.messageId, entry.ref);
            }
            await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: entry.messageId, draftOnly: true });
            lastKey = '';
            try { host.remove(); } catch (e) { /* already gone */ }
            schedule();
            return { ok: true, written: (u && u.written) || 'Reply draft removed. Not sent.', reopen: true };
          }
        });
      }
      return;
    }

    const ctx = buildCtx(entry, pane, decided);
    if (!ctx || !ctx.messageId) { await pageReason('page:no-process', pane); return; }
    const receipts = typeof FlowStorage.getActiveOutlookReceipts === 'function'
      ? await FlowStorage.getActiveOutlookReceipts() : [];
    const hasReceipt = receipts.some((r) => r.messageId === ctx.messageId);
    // Same still-open rule as the popup: draft-only undo (outlookReopen) is NOT
    // terminal, so Do It must be eligible again after Undo.
    if (await FlowStorage.hasTerminalOutcome(ctx.messageId) && !hasReceipt) { await pageReason('page:already-handled', pane); return; }
    const livePromise = await livePromiseProof(promiseItem(ctx, pane));
    if (livePromise) {
      if (mountPoint() && paintOutlookTodoReceipt(mountPoint(), livePromise)) {
        dbg('decision', { shown: true, reason: 'page:promise-proof', subject: pane.subject });
        return;
      }
      await pageReason('page:same-promise', pane);
      return;
    }

    const key = ctx.messageId + '|' + (ctx.intent && ctx.intent.label);
    const mount = mountPoint();
    if (!mount) { await pageReason('page:no-mount', pane); return; }
    const existing = mount.querySelector('.flow-chip-host');
    // Settled receipt with no active draft (e.g. Undo from the popup while this
    // pane is open): tear down so Do It can return.
    if (existing && existing.classList.contains('flow-chip-settled') && !hasReceipt) {
      existing.remove();
      lastKey = '';
    }
    if (mount.querySelector('.flow-chip-host') && key === lastKey) { lastOutcome = 'card'; return; }
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    lastKey = key;

    const host = FlowChipHost.inject(mount, ctx, {
      onDoIt: (h, chip, c) => { onDoIt(h, chip, c); },
      onDismiss: (h, c) => { onDismiss(h, c); }
    });
    if (!host) { await pageReason('page:inject-failed', pane); return; }
    const tagged = [ctx.messageId, pane.itemId, pane.pathId, pane.conversationId].filter(Boolean);
    if (tagged.length) host.setAttribute('data-glance-message', tagged.join('|'));
    lastOutcome = 'card';
    dbg('decision', { shown: true, label: ctx.intent && ctx.intent.label });
    dbg('rendered', { messageId: ctx.messageId, label: ctx.intent && ctx.intent.label });
    await clearReason(pane);

    await FlowStorage.appendLog({
      kind: 'shown',
      label: ctx.intent.label,
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
      threadUrl: ctx.threadUrl
    }).catch(() => {});
  }

  // The open message's body, or the reading pane around it: never the message list.
  function mountPoint() {
    const root = FlowOwaParse.readingPaneRoots(document)[0];
    if (root) return root.parentElement || root;
    return document.querySelector('#ReadingPaneContainerId') || null;
  }

  // OWA never stops changing the page (ads, presence, "x min ago"). A debounce that restarts on every change never fires
  // there, which is how 0.9.14 stayed silent: so this is a throttle. One scan at a time; a change during a scan runs one more.
  function schedule() {
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
      fileCount: entry.fileCount || 0, target: entry.target || null, surface: entry.surface || 'outlook'
    });
    await FlowStorage.set({ suggestLog: log.slice(0, 40) });
  }

  async function attachmentListFor(id) {
    if (!id) return null;
    const spells = idSpellings(id);
    const prefers = [null, GRAPH_IMMUTABLE];
    const select = '/attachments?$select=id,name,contentType,size,isInline,contentId';
    for (let p = 0; p < prefers.length; p++) {
      for (let i = 0; i < spells.length; i++) {
        const rows = await graphValues('/me/messages/' + encodeURIComponent(spells[i]) + select, 'suggest-list', prefers[p]);
        if (Array.isArray(rows)) return rows;
      }
    }
    return null;
  }

  async function suggestFiles(pane) {
    let id = pane.itemId || null;
    let rows = id ? await attachmentListFor(id) : null;
    if (!Array.isArray(rows)) {
      const st = await FlowStorage.get();
      const found = await resolveOutlookMessageId(
        pane.pathId || pane.conversationId || pane.itemId,
        pane.conversationId || pane.itemId,
        ownAddressesOf(st),
        pane.senderEmail,
        pane.subject
      );
      if (!found || found.unread || !found.id) return null;
      rows = await attachmentListFor(found.id);
    }
    return Array.isArray(rows) ? rows : null;
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
    source.forEach((a) => {
      if (!a || seen[a.id]) return;
      if (a.id) seen[a.id] = 1;
      const ex = a.id && skip[a.id];
      const rawName = String((ex && ex.name) || a.name || '').trim();
      const id = String(a.id == null ? '' : a.id);
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
        id: a.id,
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
      itemId: pane && pane.itemId,
      pathId: pane && pane.pathId,
      conversationId: pane && pane.conversationId,
      bodyText: (pane && pane.text) || '',
      subject: (pane && pane.subject) || '',
      app: 'outlook',
      fileCard: true,
      suggestOnly: true
    };
    return FlowChipHost.inject(mount, ctx, {
      onDoIt: (host, chip, c) => onSuggestDoIt(host, chip, c),
      onDismiss: async (host) => {
        try { host.remove(); } catch (e) { /* already gone */ }
        const id = ctx.messageId;
        if (!id || typeof FlowStorage === 'undefined') return;
        const bag = await FlowStorage.get();
        const map = Object.assign({}, bag.suggestDismissals || {});
        map[id] = { at: Date.now() };
        await FlowStorage.set({ suggestDismissals: map });
      }
    });
  }

  async function onSuggestDoIt(host, chip, ctx) {
    doItInFlight = true;
    try {
      FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Closing…');
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('preparing');
      const step = (ctx.process.steps || [])[0] || {};
      if (host && host.__glanceSteps) host.__glanceSteps.setAll('verifying');
      const r = await send({
        type: 'flow:execute-action',
        payload: {
          connectorId: 'attachmentSave',
          params: step.params || {},
          messageId: ctx.messageId,
          outlookIncomingId: ctx.messageId,
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
        if (host && host.__glanceSteps) host.__glanceSteps.setAll('failed');
        FlowChipHost.setChipState(chip, 'flow-chip-error', (r && (r.line || r.written)) || "Couldn't confirm");
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
          status: 'Handled.'
        })
        : null;
      await FlowStorage.appendLog(Object.assign({
        kind: 'written',
        label: title,
        actionTitle: title,
        messageId: ctx.messageId,
        itemId: ctx.itemId || null,
        pathId: ctx.pathId || null,
        threadId: ctx.conversationId || null,
        outlookConversationId: ctx.conversationId || null,
        outlookIncomingId: ctx.messageId,
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
        paintOutlookTodoReceipt(mount, Object.assign({
          kind: 'written',
          messageId: ctx.messageId,
          itemId: ctx.itemId || null,
          pathId: ctx.pathId || null,
          threadId: ctx.conversationId || null,
          outlookConversationId: ctx.conversationId || null,
          connectorId: 'attachmentSave',
          ref: r.ref,
          url: r.url || null,
          system: 'microsoft/onedrive',
          fetchedBack: true,
          writtenLine: r.written || title,
          processName: 'Save the file?',
          receiptStatus: 'Handled.'
        }, fields || {}));
      }
    } finally {
      doItInFlight = false;
    }
  }

  async function recordSuggestNote() {
    const pane = suggestNote;
    suggestNote = null;
    if (!pane || typeof FlowSuggestSave === 'undefined' || typeof FlowSuggestSave.suggestSave !== 'function') return;
    const showed = lastOutcome === 'card' || Boolean(document.querySelector('#ReadingPaneContainerId .flow-chip-host'));
    const messageId = pane.itemId || pane.conversationId || pane.pathId || '';
    let files = null;
    try { files = await suggestFiles(pane); } catch (e) { files = null; }
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
      const existing = document.querySelector('#ReadingPaneContainerId .flow-chip-host');
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
      const host = paintSuggestCard(pane, decision, files);
      if (host) {
        lastOutcome = 'card';
        await clearReason(pane);
        return;
      }
    }
    const skipped = decision.skipped || [];
    if (!decision.eligible && skipped.length && paintSkippedOnly(pane, skipped)) {
      lastOutcome = 'card';
      await clearReason(pane);
      return;
    }
    await pageReason(decision.reason, pane, { fileCount: decision.fileCount, target: decision.target });
  }

  function paintSkippedOnly(pane, skipped) {
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

  async function runScan() {
    timer = null;
    if (scanning) { again = true; return; }
    scanning = true;
    try { await scan(); }
    catch (e) {
      try { console.error('Glance: outlook scan error', e && e.message ? e.message : e); } catch (x) { /* console gone */ }
      try {
        const ids = (typeof FlowOwaParse !== 'undefined' && FlowOwaParse.urlIds) ? FlowOwaParse.urlIds(location.href) : {};
        await pageReason('page:scan-error', { subject: (ids && (ids.raw || ids.itemId || ids.conversationId)) || '' });
      } catch (x2) { /* storage gone with the page */ }
    }
    finally {
      try { await recordSuggestNote(); } catch (e) { /* the note is not the card */ }
      scanning = false;
      if (again) { again = false; schedule(); }
    }
  }

  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  // OWA moves between messages with pushState (no event): notice the address changing.
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; lastKey = ''; lastSig = ''; schedule(); } }, 1000);
  globalThis.__glanceOutlookPage = { rescan: () => { lastKey = ''; lastSig = ''; schedule(); } };
  // A check from the panel (or another Outlook tab) lands here at once.
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'flow:proof-sync') { lastSig = ''; schedule(); }
    });
  } catch (e) { /* messaging unavailable */ }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.glanceDebug) debug = Boolean(changes.glanceDebug.newValue);
      if (area === 'local' && changes.glanceOutlookFileTrace) {
        const n = Number(changes.glanceOutlookFileTrace.newValue) || 0;
        traceArmed = n > 0;
        if (n > 0) { lastSig = ''; schedule(); }
      }
      // A Do It / Undo from the panel changes what this card should say; this page's own "shown" row does not.
      const logChanged = area === 'local' && changes.log && Array.isArray(changes.log.newValue)
        && (changes.log.newValue[0] || {}).kind !== 'shown'; // the log is newest first
      if (area === 'local' && (changes.outlookPending || changes.outlookAuth || changes.outlookSync || logChanged)) { lastSig = ''; schedule(); }
    });
  } catch (e) { /* storage events unavailable */ }
  // Keep the Microsoft session alive while Outlook is open, and judge the inbox once on arrival.
  send({ type: 'flow:outlook-keepalive' }).catch(() => {});
  FlowStorage.get().then((st) => {
    if (st && st.outlookAuth && st.outlookAuth.token) pageSync('load').then(schedule).catch(() => {});
  }).catch(() => {});
  schedule();
})();
