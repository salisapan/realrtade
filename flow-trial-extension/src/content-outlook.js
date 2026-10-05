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
  let timer = null;
  let scanning = false;
  let again = false;
  let lastKey = '';
  let lastPageSyncAt = 0;
  let syncing = null;
  let lastReasonKey = '';
  let lastHref = location.href;
  // What the last finished scan looked at, and how it ended ('card' or 'reason'). Same open message, same text, and the
  // card still on the page (or its reason already recorded): nothing to do, nothing to log.
  let lastSig = '';
  let lastOutcome = '';
  let debug = false;
  try { debug = window.localStorage && window.localStorage.getItem('glance-debug') === '1'; } catch (e) { /* storage blocked */ }
  try { chrome.storage.local.get({ glanceDebug: false }, (r) => { if (r && r.glanceDebug) debug = true; dbg('injected', { version: VERSION, href: location.href }); }); } catch (e) { /* no storage */ }

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

  // Every open message ends in a card or in a reason the panel shows under "Why not shown" (never neither).
  async function pageReason(reason, pane, extra) {
    lastOutcome = 'reason';
    dbg('decision', { shown: false, reason, subject: pane && pane.subject });
    const key = reason + '|' + ((pane && (pane.conversationId || pane.itemId || pane.subject)) || location.pathname);
    if (key === lastReasonKey) return;
    lastReasonKey = key;
    try {
      const bag = await new Promise((resolve) => chrome.storage.local.get({ [PAGE_DIAG_KEY]: [] }, resolve));
      const list = (Array.isArray(bag[PAGE_DIAG_KEY]) ? bag[PAGE_DIAG_KEY] : []).filter((d) => d && d.key !== key);
      list.unshift(Object.assign({
        key, reason, at: Date.now(), source: 'page',
        subject: String((pane && pane.subject) || '').slice(0, 120),
        counterpart: (pane && pane.senderEmail) || null
      }, extra || {}));
      await new Promise((resolve) => chrome.storage.local.set({ [PAGE_DIAG_KEY]: list.slice(0, 20) }, resolve));
    } catch (e) { /* the extension was reloaded under this page */ }
  }

  async function clearReason(pane) {
    lastReasonKey = '';
    try {
      const bag = await new Promise((resolve) => chrome.storage.local.get({ [PAGE_DIAG_KEY]: [] }, resolve));
      const id = pane && (pane.conversationId || pane.itemId || pane.subject);
      const list = (bag[PAGE_DIAG_KEY] || []).filter((d) => d && !(id && String(d.key || '').endsWith('|' + id)));
      if (list.length !== (bag[PAGE_DIAG_KEY] || []).length) await new Promise((resolve) => chrome.storage.local.set({ [PAGE_DIAG_KEY]: list }, resolve));
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
        return r && r.ok ? r : Object.assign({ ok: false, error: 'failed' }, r || {});
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

  // Same engine as Gmail (core/incoming-judge.js), on the open message's text. Used only when the planner has not judged
  // this message yet; the planner's own entry (Graph ids, Graph text) always wins.
  function decideFromText(pane) {
    if (typeof FlowIncomingJudge === 'undefined') return null;
    // The message's own words, as Gmail judges them: quoted history ("From: … Sent: …", "On … wrote:") cut off.
    const own = (typeof FlowGraphMail !== 'undefined' && FlowGraphMail.ownText) ? FlowGraphMail.ownText(pane.text || '') : (pane.text || '');
    const r = FlowIncomingJudge.judge({
      text: own, subject: pane.subject || '',
      sender: { name: pane.senderName, email: pane.senderEmail },
      now: new Date(), threadUrl: location.href, hasThreadAttachment: false, surface: 'outlook'
    });
    dbg('judged', { show: Boolean(r && r.show), reason: r && r.reason, type: r && r.intent && r.intent.type, label: r && r.intent && r.intent.label, from: 'open text' });
    return r && r.show ? { intent: r.intent, process: r.process } : { none: true, reason: (r && r.reason) || 'intent-null' };
  }

  // The open message's Graph id when the address only carries its conversation: the newest message in it from someone else.
  async function messageIdForConversation(convId, own) {
    try {
      const q = "/me/messages?$filter=" + encodeURIComponent("conversationId eq '" + String(convId).replace(/'/g, "''") + "'") + '&$select=id,receivedDateTime,from,subject,internetMessageId&$top=25';
      const r = await send({ type: 'flow:outlook-fetch', url: 'https://graph.microsoft.com/v1.0' + q, init: { method: 'GET', headers: {} } });
      if (!r || !r.ok) return null;
      const list = (JSON.parse(r.body || '{}').value || []).filter((m) => {
        const a = String((m.from && m.from.emailAddress && m.from.emailAddress.address) || '').toLowerCase();
        return a && own.indexOf(a) < 0;
      });
      list.sort((a, b) => (Date.parse(b.receivedDateTime) || 0) - (Date.parse(a.receivedDateTime) || 0));
      return list[0] || null;
    } catch (e) { return null; }
  }

  function buildCtx(entry, pane, decided) {
    const intent = (decided && decided.intent) || entry.intent;
    let process = (decided && decided.process) || entry.process;
    if (!intent || !process) return null;
    // In-page Do It writes the Outlook draft only (same as popup). Drop non-draft steps from the chip.
    const draftSteps = (process.steps || []).filter((s) => s.kind === 'outlookDraft' || s.kind === 'gmailDraft');
    if (draftSteps.length) {
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
      threadId: entry.threadId || (entry.base && entry.base.threadId),
      threadUrl: (entry.base && entry.base.threadUrl) || entry.threadUrl || location.href,
      subject: entry.subject || (pane && pane.subject) || '',
      bodyText: entry.text || (pane && pane.text) || '',
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

  async function onDoIt(host, chip, ctx) {
    FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Closing…');
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
    const payload = Object.assign(base, {
      outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
      messageId: ctx.messageId,
      intent: ctx.intent,
      label: ctx.intent && ctx.intent.label,
      text: askText,
      fromAddress: fromAddress
    });
    payload.connectorId = 'outlookDraft';
    const r = await send({ type: 'flow:execute-action', payload: payload });
    if (!r || !r.ok) {
      FlowChipHost.setChipState(chip, 'flow-chip-error', (r && (r.reason || r.error)) || 'Could not create draft');
      return;
    }
    await FlowStorage.appendLog({
      kind: 'written',
      label: r.written || 'Reply draft ready in Outlook Drafts. Not sent.',
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
      written: r.written || 'Reply draft ready in Outlook Drafts. Not sent.',
      url: r.url || r.where,
      onUndo: async () => {
        const u = await send({ type: 'flow:undo-action', connectorId: 'outlookDraft', ref: r.ref });
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

  async function scan() {
    const st = await FlowStorage.get();
    const own = ((st && st.outlookAuth && st.outlookAuth.ownAddresses) || [])
      .concat(st && st.outlookAuth && st.outlookAuth.account && st.outlookAuth.account.address ? [st.outlookAuth.account.address] : [])
      .map((a) => String(a || '').toLowerCase());
    const pane = FlowOwaParse.readPane(document, location.href, { own: own });
    const ids = FlowOwaParse.urlIds(location.href);
    const sig = pane
      ? [pane.conversationId || pane.itemId || '', pane.subject, pane.senderName, hashText(pane.text)].join('|')
      : 'none|' + location.pathname;
    if (sig === lastSig && (lastOutcome === 'reason' || (lastOutcome === 'card' && document.querySelector('.flow-chip-host')))) return;
    lastSig = sig;
    lastOutcome = '';
    if (!pane) {
      // A message is open (its id is in the address) but its body could not be found: say so, with what was on the page.
      if (ids.kind) {
        const report = FlowOwaParse.rootsReport ? FlowOwaParse.rootsReport(document) : {};
        dbg('parsed', { ok: false, ids, anchors: report });
        await pageReason('page:pane-unreadable', null, { anchors: report });
      }
      return;
    }
    dbg('parsed', { subject: pane.subject, sender: pane.senderEmail, senderName: pane.senderName, itemId: pane.itemId, conversationId: pane.conversationId, chars: (pane.text || '').length });
    // Outlook must be connected (token present); otherwise no card, and the reason says why.
    if (!st || !st.outlookAuth || !st.outlookAuth.token) { await pageReason('page:not-connected', pane); return; }

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

    // Same silence bar as Gmail: if no stored candidate, judge the open text with the same chain.
    let decided = null;
    if (!entry || (!entry.process && !(entry.outlookReceipt && entry.ref))) {
      decided = decideFromText(pane);
      if (!decided || decided.none) {
        // The planner's own reason for this conversation, when it has one, says more than "the open text was quiet".
        const diags = (st.outlookSync && st.outlookSync.diagnostics) || [];
        const conv = FlowOwaParse.canonId(pane.conversationId);
        const planned = conv ? diags.find((d) => FlowOwaParse.canonId(d.conversationId) === conv) : null;
        await pageReason(planned ? planned.reason : ('page:' + ((decided && decided.reason) || 'intent-null')), pane);
        return;
      }
      if (!entry) {
        // createReply needs a Graph message id. The address gives one, or the conversation it belongs to.
        let msgId = pane.itemId || null;
        if (!msgId && pane.conversationId) {
          const found = await messageIdForConversation(pane.conversationId, own);
          msgId = found ? found.id : null;
          dbg('resolved', { conversationId: pane.conversationId, messageId: msgId });
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

  async function runScan() {
    timer = null;
    if (scanning) { again = true; return; }
    scanning = true;
    try { await scan(); }
    catch (e) { try { console.error('Glance: outlook scan error', e && e.message ? e.message : e); } catch (x) { /* console gone */ } }
    finally {
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
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.glanceDebug) debug = Boolean(changes.glanceDebug.newValue);
      // A Do It / Undo from the panel changes what this card should say; this page's own "shown" row does not.
      const logChanged = area === 'local' && changes.log && Array.isArray(changes.log.newValue)
        && (changes.log.newValue[0] || {}).kind !== 'shown'; // the log is newest first
      if (area === 'local' && (changes.outlookPending || changes.outlookAuth || logChanged)) { lastSig = ''; schedule(); }
    });
  } catch (e) { /* storage events unavailable */ }
  // Keep the Microsoft session alive while Outlook is open, and judge the inbox once on arrival.
  send({ type: 'flow:outlook-keepalive' }).catch(() => {});
  FlowStorage.get().then((st) => {
    if (st && st.outlookAuth && st.outlookAuth.token) pageSync('load').then(schedule).catch(() => {});
  }).catch(() => {});
  schedule();
})();
