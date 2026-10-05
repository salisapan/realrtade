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
(() => {
  if (typeof FlowChipHost === 'undefined' || typeof FlowOwaParse === 'undefined') return;
  if (typeof FlowStorage === 'undefined') return;

  const DEBOUNCE_MS = 800;
  const PAGE_SYNC_MIN_MS = 60 * 1000;
  let timer = null;
  let lastKey = '';
  let lastPageSyncAt = 0;
  let syncing = null;

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
    return r && r.show ? { intent: r.intent, process: r.process } : null;
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
    // Outlook must be connected (token present); otherwise silence.
    const st = await FlowStorage.get();
    if (!st || !st.outlookAuth || !st.outlookAuth.token) return;

    const own = (st.outlookAuth.ownAddresses || []).concat(st.outlookAuth.account && st.outlookAuth.account.address ? [st.outlookAuth.account.address] : []);
    const pane = FlowOwaParse.readPane(document, location.href, { own: own });
    if (!pane) return;

    let candidates = await outlookCandidates();
    let entry = FlowOwaParse.matchEntry(pane, candidates);
    // Not judged yet (new mail, or the panel has not been opened): run one check from here, then look again.
    if (!entry && !(st.outlookSync && st.outlookSync.needsSignIn)) {
      const r = await pageSync('pane');
      if (r && r.ok && !r.skipped) {
        candidates = await outlookCandidates();
        entry = FlowOwaParse.matchEntry(pane, candidates);
      }
    }

    // Same silence bar as Gmail: if no stored candidate, judge the open text with the same chain.
    let decided = null;
    if (!entry || !entry.process) {
      decided = decideFromText(pane);
      if (!decided) return;
      if (!entry) {
        // No Graph id -> cannot createReply; stay silent rather than a dead Do It.
        if (!pane.itemId) return;
        entry = {
          messageId: pane.itemId,
          outlookIncomingId: pane.itemId,
          subject: pane.subject,
          text: pane.text,
          sender: { name: pane.senderName, email: pane.senderEmail },
          intent: decided.intent,
          process: decided.process
        };
      } else {
        entry = Object.assign({}, entry, { intent: decided.intent, process: decided.process });
      }
    }

    // Receipt-only entry: show settled receipt if draft still active.
    if (entry.outlookReceipt && entry.ref && !entry.process) {
      const mount = FlowOwaParse.readingPaneRoots(document)[0] || document.querySelector('[role="main"]');
      if (!mount || mount.querySelector('.flow-chip-host')) return;
      const host = FlowChipHost.inject(mount, {
        process: { name: 'Reply', steps: [{ kind: 'outlookDraft' }] },
        intent: { label: entry.label || 'Reply draft ready' },
        messageId: entry.messageId
      }, { onDoIt: () => {}, onDismiss: (h) => h.remove() });
      if (host) {
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
    if (!ctx || !ctx.messageId) return;
    const receipts = typeof FlowStorage.getActiveOutlookReceipts === 'function'
      ? await FlowStorage.getActiveOutlookReceipts() : [];
    const hasReceipt = receipts.some((r) => r.messageId === ctx.messageId);
    // Same still-open rule as the popup: draft-only undo (outlookReopen) is NOT
    // terminal, so Do It must be eligible again after Undo.
    if (await FlowStorage.hasTerminalOutcome(ctx.messageId) && !hasReceipt) return;

    const key = ctx.messageId + '|' + (ctx.intent && ctx.intent.label);
    const mount = FlowOwaParse.readingPaneRoots(document)[0] || document.querySelector('[role="main"]');
    if (!mount) return;
    const existing = mount.querySelector('.flow-chip-host');
    // Settled receipt with no active draft (e.g. Undo from the popup while this
    // pane is open): tear down so Do It can return.
    if (existing && existing.classList.contains('flow-chip-settled') && !hasReceipt) {
      existing.remove();
      lastKey = '';
    }
    if (mount.querySelector('.flow-chip-host') && key === lastKey) return;
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    lastKey = key;

    FlowChipHost.inject(mount, ctx, {
      onDoIt: (host, chip, c) => { onDoIt(host, chip, c); },
      onDismiss: (host, c) => { onDismiss(host, c); }
    });

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

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { scan().catch(() => {}); }, DEBOUNCE_MS);
  }

  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  // A check from the panel (or another Outlook tab) lands here at once.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.outlookPending || changes.outlookAuth)) schedule();
    });
  } catch (e) { /* storage events unavailable */ }
  // Keep the Microsoft session alive while Outlook is open, and judge the inbox once on arrival.
  send({ type: 'flow:outlook-keepalive' }).catch(() => {});
  FlowStorage.get().then((st) => {
    if (st && st.outlookAuth && st.outlookAuth.token) pageSync('load').then(schedule).catch(() => {});
  }).catch(() => {});
  schedule();
})();
