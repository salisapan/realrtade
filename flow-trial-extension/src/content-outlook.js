// Outlook on the web (outlook.live.com / outlook.office.com): same Glance Do It
// card and the same engine as Gmail (FlowIntent + FlowActions). Only I/O differs:
// read the open message from the OWA DOM (matched to Graph/sync state); write a
// reply DRAFT via Graph (never send).
//
// Honesty: OWA markup is not a public interface. Selectors live in core/owa-parse.js
// and are re-checked every pass; if the pane cannot be read, stay silent.
(() => {
  if (typeof FlowChipHost === 'undefined' || typeof FlowOwaParse === 'undefined') return;
  if (typeof FlowStorage === 'undefined') return;

  const DEBOUNCE_MS = 800;
  let timer = null;
  let lastKey = '';

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

  // Same engine as Gmail: classify + planFor. Used when DOM text is available
  // and no stored candidate matched (or to verify the stored intent).
  function decideFromText(text, senderEmail, senderName) {
    if (typeof FlowIntent === 'undefined' || typeof FlowActions === 'undefined') return null;
    const intent = FlowIntent.classify(text, {
      senderEmail: senderEmail,
      senderName: senderName,
      now: new Date()
    });
    if (!intent || !FlowIntent.shouldShowChip(intent)) return null;
    if (typeof FlowFactReply !== 'undefined' && FlowFactReply.blocksInbox && FlowFactReply.blocksInbox(intent, text)) return null;
    const process = FlowActions.planFor(intent, { threadUrl: location.href, hasThreadAttachment: false });
    if (!process) return null;
    const steps = (process.steps || []).map((s) => {
      if (s.kind !== 'gmailDraft') return s;
      return Object.assign({}, s, { kind: 'outlookDraft', id: (s.id || 'draft').replace(/^gmail/, 'outlook') });
    });
    return { intent: intent, process: Object.assign({}, process, { steps: steps }) };
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

  async function onDoIt(host, chip, ctx) {
    FlowChipHost.setChipState(chip, 'flow-chip-pending', 'Closing…');
    const body = (typeof FlowDraftReply !== 'undefined')
      ? FlowDraftReply.bodyFromIntent(ctx.intent, ctx.sender && ctx.sender.name, ctx.sender && ctx.sender.email)
      : '';
    const draftStep = (ctx.process.steps || []).find((s) => s.kind === 'outlookDraft') || { kind: 'outlookDraft', params: {} };
    const payload = {
      outlookIncomingId: ctx.outlookIncomingId || ctx.messageId,
      messageId: ctx.messageId,
      body: body,
      senderName: ctx.sender && ctx.sender.name,
      senderEmail: ctx.sender && ctx.sender.email,
      intent: ctx.intent,
      params: draftStep.params || {},
      label: ctx.intent && ctx.intent.label
    };
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
        if (u && u.ok) {
          if (typeof FlowStorage.markOutlookDraftUndone === 'function') {
            await FlowStorage.markOutlookDraftUndone(ctx.messageId, r.ref);
          }
          await FlowStorage.recordStillOpenMetric({ kind: 'undo', messageId: ctx.messageId, draftOnly: true });
          return { ok: true, written: u.written || 'Reply draft removed. Not sent.' };
        }
        // Clear local receipt even if Graph already deleted the draft.
        if (typeof FlowStorage.markOutlookDraftUndone === 'function') {
          await FlowStorage.markOutlookDraftUndone(ctx.messageId, r.ref);
        }
        return { ok: true, written: 'Reply draft removed. Not sent.' };
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

    const pane = FlowOwaParse.readPane(document, location.href);
    if (!pane) return;

    const candidates = await outlookCandidates();
    let entry = FlowOwaParse.matchEntry(pane, candidates);

    // Same silence bar as Gmail: if no stored candidate, try classify on the open text.
    let decided = null;
    const text = (pane.subject ? pane.subject + '\n' : '') + (pane.text || '');
    if (!entry || !entry.process) {
      decided = decideFromText(text, pane.senderEmail, pane.senderName);
      if (!decided) return;
      if (!entry) {
        // No Graph id → cannot createReply; stay silent rather than a dead Do It.
        if (!pane.itemId && !(entry && entry.messageId)) return;
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
            return { ok: true, written: (u && u.written) || 'Reply draft removed. Not sent.' };
          }
        });
      }
      return;
    }

    const ctx = buildCtx(entry, pane, decided);
    if (!ctx || !ctx.messageId) return;
    if (await FlowStorage.hasTerminalOutcome(ctx.messageId)) {
      // Unless it's an active outlook draft receipt
      const receipts = typeof FlowStorage.getActiveOutlookReceipts === 'function'
        ? await FlowStorage.getActiveOutlookReceipts() : [];
      if (!receipts.some((r) => r.messageId === ctx.messageId)) return;
    }

    const key = ctx.messageId + '|' + (ctx.intent && ctx.intent.label);
    const mount = FlowOwaParse.readingPaneRoots(document)[0] || document.querySelector('[role="main"]');
    if (!mount) return;
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
  schedule();
})();
