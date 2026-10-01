// "Waiting on" in Gmail — the content-script half of core/follow-up.js.
//
// Two moments, both quiet:
//   1. You open a thread whose NEWEST message is yours and it asks someone for
//      something (an answer, a signature, a payment). One small card offers to
//      remind you on the day to chase, and to settle the reminder by itself if
//      they reply.
//   2. You open a thread you were waiting on and the newest message is now
//      theirs. The reminder is completed, with a one-line receipt.
//
// Everything is local except the writes the person approves (a Google Task, an
// optional Gmail draft). The card is position:fixed, appended to <body>, like
// the sidebar's hover card — it does not depend on Gmail's own markup, so a
// Gmail redesign cannot break its layout.
//
// Never throws into the scan loop: the caller wraps consider() in try/catch,
// and every await here degrades to "show nothing".
const FlowFollow = (() => {
  const HOST_ID = 'flow-follow-host';
  const UPSELL_KEY = 'followCapShownAt';
  const UPSELL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const RECEIPT_MS = 9000;

  // Offers made in this tab: "thread|message". A message is offered once per
  // page load, however many times Gmail re-renders it.
  const offered = new Set();
  // Thread states already examined in this tab, so a burst of Gmail re-renders
  // costs one storage read, not hundreds.
  const examined = new Set();
  const settling = new Set();
  let host = null;
  let hideTimer = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function send(msg) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage(msg, (res) => resolve(res || null)); } catch (e) { resolve(null); }
    });
  }

  function track(event) {
    send({ type: 'flow:track', event, params: {} });
  }

  function dismiss() {
    clearTimeout(hideTimer);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  function card(rtl) {
    dismiss();
    host = el('div', 'flow-fu');
    host.id = HOST_ID;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    document.body.appendChild(host);
    return host;
  }

  function dayLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function button(label, cls, onClick) {
    const b = el('button', 'flow-fu-btn ' + cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function receipt(text, undo) {
    const h = card(false);
    h.appendChild(el('div', 'flow-fu-line', text));
    if (undo) {
      const row = el('div', 'flow-fu-actions');
      row.appendChild(button('Undo', 'ghost', undo));
      h.appendChild(row);
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(dismiss, RECEIPT_MS);
  }

  // ---- 2. a reply settles the reminder ---------------------------------------
  async function settle(watch, who, lastText) {
    await FlowStorage.updateWatch(watch.id, { status: 'resolved', resolvedAt: Date.now(), resolvedBy: 'reply' });
    if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
    track('follow_resolved');
    const name = FlowFollowUp.firstName(who && who.name, who && who.email) || 'They';
    receipt(name + ' replied. Your reminder is closed.', null);
  }

  // ---- 1. offer ---------------------------------------------------------------
  function counterpartOf(lastNode, ownEmail) {
    const els = lastNode.querySelectorAll('[email]');
    for (const e of els) {
      const addr = (e.getAttribute('email') || '').toLowerCase();
      if (addr && addr !== String(ownEmail).toLowerCase()) {
        return { email: e.getAttribute('email'), name: e.getAttribute('name') || (e.textContent || '').trim() || null };
      }
    }
    return { email: null, name: null };
  }

  async function track1(ask, base) {
    const watch = FlowFollowUp.buildWatch(Object.assign({ ask, now: Date.now() }, base));
    const res = await send({
      type: 'flow:follow-task',
      payload: {
        title: FlowFollowUp.taskTitle(watch),
        dueIso: watch.chaseIso,
        what: watch.what,
        counterpart: watch.counterpart.name ? watch.counterpart.name + (watch.counterpart.email ? ' <' + watch.counterpart.email + '>' : '') : watch.counterpart.email,
        threadUrl: base.threadUrl
      }
    });
    if (!res || !res.ok) {
      const msg = res && res.reason === 'not-connected'
        ? 'Open the Glance panel and connect Google first, then try again.'
        : 'Could not add the reminder. Try again in a moment.';
      receipt(msg, null);
      return;
    }
    watch.taskRef = res.ref || null;
    await FlowStorage.upsertWatch(watch);
    track('follow_tracked');
    receipt('Reminder set for ' + dayLabel(watch.chaseIso) + '. If they reply, I will close it.', async () => {
      await send({ type: 'flow:undo-action', connectorId: 'googleTask', ref: res.ref });
      await FlowStorage.updateWatch(watch.id, { status: 'stopped', resolvedAt: Date.now(), resolvedBy: 'undo' });
      dismiss();
    });
  }

  async function declined(ask, base) {
    const watch = FlowFollowUp.buildWatch(Object.assign({ ask, now: Date.now() }, base));
    watch.status = 'stopped';
    watch.resolvedAt = Date.now();
    watch.resolvedBy = 'declined';
    await FlowStorage.upsertWatch(watch);
    dismiss();
  }

  function offerCard(ask, base) {
    const isPay = ask.kind === FlowFollowUp.KINDS.PAYMENT;
    const h = card(ask.lang === 'he');
    h.appendChild(el('div', 'flow-fu-title', isPay ? 'Waiting on a payment?' : 'Waiting on a reply?'));
    h.appendChild(el('div', 'flow-fu-quote', ask.what));
    h.appendChild(el('div', 'flow-fu-line', 'I can remind you on ' + dayLabel(ask.chaseIso) + ' and close it by myself if they reply.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('Remind me', 'primary', () => { track1(ask, base); }));
    row.appendChild(button('Not now', 'ghost', () => { declined(ask, base); }));
    h.appendChild(row);
  }

  async function capCard(active, cap) {
    const stored = await new Promise((r) => chrome.storage.local.get(UPSELL_KEY, r));
    if (stored && stored[UPSELL_KEY] && Date.now() - stored[UPSELL_KEY] < UPSELL_COOLDOWN_MS) return;
    await new Promise((r) => chrome.storage.local.set({ [UPSELL_KEY]: Date.now() }, r));
    track('follow_cap_hit');
    const h = card(false);
    h.appendChild(el('div', 'flow-fu-title', 'You are tracking ' + active + ' of ' + cap + ' follow-ups'));
    h.appendChild(el('div', 'flow-fu-line', 'This one looks like it needs chasing too. Glance Pro tracks as many as you have, and shows what is owed to you.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('See Glance Pro', 'primary', () => { window.open(FlowEntitlements.PRICING_URL, '_blank', 'noopener'); dismiss(); }));
    row.appendChild(button('Not now', 'ghost', dismiss));
    h.appendChild(row);
  }

  // ctx: { messages, ownEmail, extractSender(node), ownMessageText(node),
  //        messageText(node), threadIdFrom(node), subject, threadUrl(id) }
  async function consider(ctx) {
    if (typeof FlowFollowUp === 'undefined' || typeof FlowStorage === 'undefined') return;
    const msgs = ctx && ctx.messages;
    if (!msgs || !msgs.length || !ctx.ownEmail) return;

    const last = msgs[msgs.length - 1];
    const sender = ctx.extractSender(last);
    const lastIsOwn = Boolean(sender.email && sender.email.toLowerCase() === String(ctx.ownEmail).toLowerCase());
    const threadId = ctx.threadIdFrom(last);
    if (!threadId) return;
    const lastId = last.getAttribute('data-legacy-message-id') || null;
    const stateKey = threadId + '|' + lastId + '|' + (lastIsOwn ? 'own' : 'theirs');
    if (examined.has(stateKey)) return;
    examined.add(stateKey);
    if (examined.size > 400) examined.clear();
    const watch = await FlowStorage.getWatch(threadId);

    // A reply settles a live watch.
    if (!lastIsOwn) {
      if (watch && watch.status === 'waiting') {
        const text = ctx.messageText(last);
        if (FlowFollowUp.repliedSince(watch, { isOwn: false, text, email: sender.email }) && !settling.has(watch.id)) {
          settling.add(watch.id);
          try { await settle(watch, sender, text); } finally { settling.delete(watch.id); }
        }
      }
      return;
    }

    // My own message is newest.
    if (watch) {
      if (watch.status === 'waiting') {
        if (lastId && watch.messageId !== lastId) await FlowStorage.updateWatch(threadId, { messageId: lastId });
        return;
      }
      // Already offered (declined / closed) for this very message.
      if (lastId && watch.messageId === lastId) return;
    }
    const key = threadId + '|' + lastId;
    if (offered.has(key)) return;

    const ask = FlowFollowUp.classifyOutgoing(ctx.ownMessageText(last), { now: Date.now(), extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null });
    if (!ask) return;
    offered.add(key);

    const base = {
      threadId,
      messageId: lastId,
      subject: ctx.subject,
      counterpart: counterpartOf(last, ctx.ownEmail),
      threadUrl: ctx.threadUrl(lastId)
    };

    const status = await send({ type: 'flow:pro-status' });
    const list = await FlowStorage.getWatches();
    const active = list.filter(FlowFollowUp.isActive).length;
    const gate = FlowEntitlements.watchGate(active, status && status.record, Date.now());
    if (!gate.allowed) { await capCard(gate.used, gate.cap); return; }
    offerCard(ask, base);
  }

  return { consider, dismiss };
})();
