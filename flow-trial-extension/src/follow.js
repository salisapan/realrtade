// Open loops in Gmail — the content-script half of core/follow-up.js.
//
// A loop is something you are owed. Glance opens one when you ask, and stays
// on it until reality closes it. Four quiet moments:
//   1. You open a thread whose NEWEST message is yours and it asks someone for
//      something (an answer, a signature, a payment). One small card offers to
//      take the loop and look again on the day to chase.
//   2. You chase it yourself. Your message is recognised as a chase, the next
//      look moves out, and the next nudge Glance drafts will be firmer.
//   3. They answer. Glance reads what the answer DID: "got it, thanks" and an
//      out-of-office leave the loop open, "I will pay Friday" moves the day to
//      Friday, a real answer closes it, and on a payment only "it was paid"
//      closes it — otherwise it asks, once.
//   4. A closed loop can be reopened from its receipt.
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

  // `undo` is a function (labelled "Undo") or { label, run }.
  function receipt(text, undo, action) {
    const h = card(false);
    h.appendChild(el('div', 'flow-fu-line', text));
    const act = action || (undo ? { label: 'Undo', run: undo } : null);
    if (act) {
      const row = el('div', 'flow-fu-actions');
      row.appendChild(button(act.label, 'ghost', act.run));
      h.appendChild(row);
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(dismiss, RECEIPT_MS);
  }

  // ---- helpers ------------------------------------------------------------------
  function amountLabel(w) {
    if (!w.amount) return '';
    return w.amount.currency && w.amount.value ? FlowFollowUp.formatMoney({ currency: w.amount.currency, value: w.amount.value }) : (w.amount.raw || '');
  }

  function took(w) {
    const d = FlowFollowUp.daysOpen(w, Date.now());
    return d >= 1 ? ' after ' + d + (d === 1 ? ' day' : ' days') : '';
  }

  function whoOf(sender) {
    return FlowFollowUp.firstName(sender && sender.name, sender && sender.email) || 'They';
  }

  function taskPayload(watch) {
    const cp = watch.counterpart || {};
    return {
      title: FlowFollowUp.taskTitle(watch),
      dueIso: watch.chaseIso,
      what: watch.what,
      counterpart: cp.name ? cp.name + (cp.email ? ' <' + cp.email + '>' : '') : cp.email,
      threadUrl: watch.threadUrl || null
    };
  }

  // Move the reminder to the loop's new chase day. A Task the person deleted is
  // recreated, so a loop never silently loses its reminder.
  async function moveTask(watch, dueIso) {
    if (!watch.taskRef) return;
    const r = await send({ type: 'flow:follow-reschedule', ref: watch.taskRef, dueIso });
    if (r && r.reason === 'gone') {
      const made = await send({ type: 'flow:follow-task', payload: Object.assign(taskPayload(watch), { dueIso }) });
      if (made && made.ok && made.ref) await FlowStorage.updateWatch(watch.id, { taskRef: made.ref });
    }
  }

  // ---- 4. reopen -----------------------------------------------------------------
  async function reopen(watch) {
    const status = await send({ type: 'flow:pro-status' });
    const list = await FlowStorage.getWatches();
    const gate = FlowEntitlements.watchGate(list.filter(FlowFollowUp.isActive).length, status && status.record, Date.now());
    if (!gate.allowed) { await capCard(gate.used, gate.cap, true); return; }
    const patch = FlowFollowUp.reopenPatch(watch, Date.now());
    const next = await FlowStorage.updateWatch(watch.id, patch);
    if (watch.taskRef) {
      const r = await send({ type: 'flow:follow-reopen', ref: watch.taskRef, dueIso: patch.chaseIso });
      if (r && r.reason === 'gone') await moveTask(Object.assign({}, watch, patch), patch.chaseIso);
    }
    track('follow_reopened');
    receipt('Reopened. I will look again on ' + dayLabel(patch.chaseIso) + '.', null);
    return next;
  }

  // ---- 3. what the answer did ------------------------------------------------------
  async function closed(watch, sender, how) {
    if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
    track('follow_resolved');
    const name = whoOf(sender);
    const amt = amountLabel(watch);
    const line = how === 'paid'
      ? name + ' says it is paid' + (amt ? ' (' + amt + ')' : '') + took(watch) + '. Loop closed.'
      : name + ' replied' + took(watch) + '. Loop closed.';
    receipt(line, null, { label: 'Reopen', run: () => reopen(watch) });
  }

  async function promised(watch, sender, patch) {
    await moveTask(Object.assign({}, watch, patch), patch.chaseIso);
    track('follow_promised');
    const name = whoOf(sender);
    const line = patch.promisedIso
      ? name + ' promised it for ' + dayLabel(patch.promisedIso) + '. I moved your reminder to ' + dayLabel(patch.chaseIso) + '.'
      : name + ' said they will get to it. I will look again on ' + dayLabel(patch.chaseIso) + '.';
    receipt(line, null);
  }

  // A payment thread got a reply that never says it was paid. Ask once.
  function paidCard(watch, sender) {
    const h = card(watch.lang === 'he');
    h.appendChild(el('div', 'flow-fu-title', whoOf(sender) + ' replied. Is it paid?'));
    h.appendChild(el('div', 'flow-fu-line', 'Nothing in the message says the payment was sent, so I kept the loop open.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('Mark paid', 'primary', async () => {
      const done = Object.assign({ status: 'resolved', resolvedAt: Date.now(), resolvedBy: 'manual', closedAs: 'paid' });
      await FlowStorage.updateWatch(watch.id, done);
      await closed(Object.assign({}, watch, done), sender, 'paid');
    }));
    row.appendChild(button('Keep chasing', 'ghost', dismiss));
    h.appendChild(row);
  }

  // Everything they wrote after the message that opened the loop, judged as one:
  // an answer followed by a "thanks" is still an answer.
  const RANK = { paid: 6, closed: 5, promised: 4, answered: 3, ack: 2, auto: 1 };
  function judge(ctx, watch) {
    const msgs = Array.from(ctx.messages);
    let from = msgs.length - 1;
    if (watch.messageId) {
      const at = msgs.findIndex((m) => m.getAttribute('data-legacy-message-id') === watch.messageId);
      if (at >= 0) from = at + 1;
    }
    let best = null;
    for (let i = from; i < msgs.length; i++) {
      const sender = ctx.extractSender(msgs[i]);
      if (sender.email && sender.email.toLowerCase() === String(ctx.ownEmail).toLowerCase()) continue;
      const reply = FlowFollowUp.classifyReply(ctx.messageText(msgs[i]), watch, { now: Date.now(), email: sender.email });
      if (!best || (RANK[reply.outcome] || 0) > (RANK[best.reply.outcome] || 0)) best = { reply, sender };
    }
    return best;
  }

  async function handleReply(ctx, watch, lastId) {
    const best = judge(ctx, watch);
    if (!best) return;
    const res = FlowFollowUp.applyReply(watch, best.reply, Date.now());
    if (res.none) return;
    const patch = Object.assign({}, res.patch, { lastReplyMessageId: lastId });
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    if (res.close) await closed(next, best.sender, best.reply.outcome === 'paid' ? 'paid' : 'replied');
    else if (res.rescheduled) await promised(watch, best.sender, patch);
    else if (res.confirm) paidCard(next, best.sender);
  }

  // ---- a promise of yours, kept ------------------------------------------------
  async function kept(watch, lastId) {
    const patch = Object.assign({ messageId: lastId }, FlowFollowUp.closeAsKept(watch, Date.now()));
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
    track('follow_resolved');
    receipt('Promise kept' + took(watch) + '. Loop closed.', null, { label: 'Reopen', run: () => reopen(next) });
  }

  // ---- 2. you chased -----------------------------------------------------------------
  async function chased(watch, lastId) {
    const patch = Object.assign({ messageId: lastId }, FlowFollowUp.recordNudge(watch, Date.now()));
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    await moveTask(next, patch.chaseIso);
    receipt('Chase noted. I will look again on ' + dayLabel(patch.chaseIso) + '.', null);
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
    watch.threadUrl = base.threadUrl || null;
    const res = await send({ type: 'flow:follow-task', payload: taskPayload(watch) });
    if (!res || !res.ok) {
      const msg = res && res.reason === 'not-connected'
        ? 'Open the Glance panel and connect Google first, then try again.'
        : 'Could not add the reminder. Try again in a moment.';
      receipt(msg, null);
      return;
    }
    watch.taskRef = res.ref || null;
    await FlowStorage.upsertWatch(watch);
    FlowStorage.recordLoopOpen(watch).catch(() => {});
    track('follow_tracked');
    if (FlowFollowUp.isMine(watch)) {
      receipt('Reminder set for ' + dayLabel(watch.chaseIso) + '. I will close it when you send it.', async () => {
        await send({ type: 'flow:undo-action', connectorId: 'googleTask', ref: res.ref });
        await FlowStorage.updateWatch(watch.id, { status: 'stopped', resolvedAt: Date.now(), resolvedBy: 'undo' });
        dismiss();
      });
      return;
    }
    const name = FlowFollowUp.firstName(watch.counterpart.name, watch.counterpart.email);
    const amt = amountLabel(watch);
    const head = watch.kind === FlowFollowUp.KINDS.PAYMENT
      ? "I'm on this one now. Watching for " + (amt ? 'the ' + amt : 'the payment') + '.'
      : "I'm on this one now.";
    receipt(head + ' I will look again on ' + dayLabel(watch.chaseIso) + ' and close it when ' + (name ? name + (watch.kind === FlowFollowUp.KINDS.PAYMENT ? ' pays.' : ' answers.') : 'they ' + (watch.kind === FlowFollowUp.KINDS.PAYMENT ? 'pay.' : 'answer.')), async () => {
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
    if (ask.direction === 'mine') {
      h.appendChild(el('div', 'flow-fu-title', 'You promised something'));
      h.appendChild(el('div', 'flow-fu-quote', ask.what));
      h.appendChild(el('div', 'flow-fu-line', 'I can remind you on ' + dayLabel(ask.chaseIso) + ' so it does not slip, and close it when you send it.'));
      const mrow = el('div', 'flow-fu-actions');
      mrow.appendChild(button('Remind me', 'primary', () => { track1(ask, base); }));
      mrow.appendChild(button('Not now', 'ghost', () => { declined(ask, base); }));
      h.appendChild(mrow);
      return;
    }
    h.appendChild(el('div', 'flow-fu-title', isPay ? 'Waiting on a payment?' : 'Waiting on a reply?'));
    h.appendChild(el('div', 'flow-fu-quote', ask.what));
    h.appendChild(el('div', 'flow-fu-line', 'I can stay on this until it is closed: look again on ' + dayLabel(ask.chaseIso) + ', and close it myself when ' + (isPay ? 'it is paid.' : 'they answer.')));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('Stay on it', 'primary', () => { track1(ask, base); }));
    row.appendChild(button('Not now', 'ghost', () => { declined(ask, base); }));
    h.appendChild(row);
  }

  async function capCard(active, cap, reopening) {
    const stored = await new Promise((r) => chrome.storage.local.get(UPSELL_KEY, r));
    if (stored && stored[UPSELL_KEY] && Date.now() - stored[UPSELL_KEY] < UPSELL_COOLDOWN_MS) return;
    await new Promise((r) => chrome.storage.local.set({ [UPSELL_KEY]: Date.now() }, r));
    track('follow_cap_hit');
    const h = card(false);
    h.appendChild(el('div', 'flow-fu-title', 'You are following ' + active + ' of ' + cap + ' open loops'));
    h.appendChild(el('div', 'flow-fu-line', (reopening ? 'To reopen this one, another has to close first. ' : 'This one looks like it needs chasing too. ') + 'Glance Pro stays on every loop until it is closed, and shows the money still owed to you.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('See Glance Pro', 'primary', () => { window.open(FlowEntitlements.PRICING_URL, '_blank', 'noopener'); dismiss(); }));
    row.appendChild(button('Not now', 'ghost', dismiss));
    h.appendChild(row);
  }


  // ---- things that run out ---------------------------------------------------------
  // The newest message is theirs and states a date something stops being valid
  // ("valid until Oct 31", "your trial ends Oct 15"). One card offers to look
  // again three days before. Marketing mail is ignored by core/expiry.js.
  const examinedClock = new Set();
  const offeredClock = new Set();

  async function trackClock(found, base) {
    const ask = { kind: FlowFollowUp.KINDS.REPLY, what: found.what, amount: null, deadlineIso: found.expiresIso, chaseIso: found.warnIso, lang: found.lang, subtype: 'expiry:' + found.noun, direction: 'clock', expiresIso: found.expiresIso };
    const watch = FlowFollowUp.buildWatch(Object.assign({ ask, now: Date.now() }, base));
    watch.id = 'clock:' + base.threadId;
    watch.threadUrl = base.threadUrl || null;
    const res = await send({ type: 'flow:follow-task', payload: taskPayload(watch) });
    if (!res || !res.ok) {
      receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not add the reminder. Try again in a moment.', null);
      return;
    }
    watch.taskRef = res.ref || null;
    await FlowStorage.upsertWatch(watch);
    track('follow_tracked');
    receipt('Reminder set for ' + dayLabel(found.warnIso) + ', before it ends on ' + dayLabel(found.expiresIso) + '.', async () => {
      await send({ type: 'flow:undo-action', connectorId: 'googleTask', ref: res.ref });
      await FlowStorage.updateWatch(watch.id, { status: 'stopped', resolvedAt: Date.now(), resolvedBy: 'undo' });
      dismiss();
    });
  }

  function clockCard(found, base) {
    const h = card(found.lang === 'he');
    h.appendChild(el('div', 'flow-fu-title', FlowExpiry.title(found.noun) + ' ends ' + dayLabel(found.expiresIso)));
    h.appendChild(el('div', 'flow-fu-quote', found.what));
    h.appendChild(el('div', 'flow-fu-line', 'I can remind you on ' + dayLabel(found.warnIso) + ' so it does not lapse.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('Remind me', 'primary', () => { trackClock(found, base); }));
    row.appendChild(button('Not now', 'ghost', async () => {
      const ask = { kind: FlowFollowUp.KINDS.REPLY, what: found.what, amount: null, deadlineIso: found.expiresIso, chaseIso: found.warnIso, lang: found.lang, direction: 'clock', expiresIso: found.expiresIso };
      const w = FlowFollowUp.buildWatch(Object.assign({ ask, now: Date.now() }, base));
      w.id = 'clock:' + base.threadId; w.status = 'stopped'; w.resolvedAt = Date.now(); w.resolvedBy = 'declined';
      await FlowStorage.upsertWatch(w);
      dismiss();
    }));
    h.appendChild(row);
  }

  async function considerClock(ctx) {
    if (typeof FlowExpiry === 'undefined' || typeof FlowFollowUp === 'undefined' || typeof FlowStorage === 'undefined') return;
    const msgs = ctx && ctx.messages;
    if (!msgs || !msgs.length || !ctx.ownEmail) return;
    const last = msgs[msgs.length - 1];
    const sender = ctx.extractSender(last);
    if (!sender.email || sender.email.toLowerCase() === String(ctx.ownEmail).toLowerCase()) return;
    if (FlowFollowUp.isAutoReply('', sender.email)) return; // noreply senders never get a card
    const threadId = ctx.threadIdFrom(last);
    if (!threadId) return;
    const lastId = last.getAttribute('data-legacy-message-id') || null;
    const key = threadId + '|' + lastId;
    if (examinedClock.has(key)) return;
    examinedClock.add(key);
    if (examinedClock.size > 400) examinedClock.clear();

    const found = FlowExpiry.detect(ctx.messageText(last), { now: Date.now(), extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null });
    if (!found) return;
    const existing = await FlowStorage.getWatch('clock:' + threadId);
    if (existing && existing.expiresIso === found.expiresIso) return;
    if (offeredClock.has(key)) return;
    offeredClock.add(key);

    const base = { threadId, messageId: lastId, subject: ctx.subject, counterpart: { email: sender.email, name: sender.name || null }, threadUrl: ctx.threadUrl(lastId) };
    const status = await send({ type: 'flow:pro-status' });
    const list = await FlowStorage.getWatches();
    const gate = FlowEntitlements.watchGate(list.filter(FlowFollowUp.isActive).length, status && status.record, Date.now());
    if (!gate.allowed) { await capCard(gate.used, gate.cap); return; }
    clockCard(found, base);
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

    // They wrote last. What did the answer do to the loop?
    if (!lastIsOwn) {
      if (watch && watch.status === 'waiting' && !FlowFollowUp.isMine(watch) && !(watch.lastReplyMessageId && watch.lastReplyMessageId === lastId) && !settling.has(watch.id)) {
        settling.add(watch.id);
        try { await handleReply(ctx, watch, lastId); } finally { settling.delete(watch.id); }
      }
      return;
    }

    // My own message is newest.
    if (watch) {
      if (watch.status === 'waiting') {
        if (lastId && watch.messageId !== lastId) {
          const text = ctx.ownMessageText(last);
          // A promise of mine: a newer message that delivers it keeps it.
          if (FlowFollowUp.isMine(watch)) {
            if (FlowFollowUp.deliversPromise(text)) await kept(watch, lastId);
            else await FlowStorage.updateWatch(threadId, { messageId: lastId });
            return;
          }
          // A new message of mine in a thread I am waiting on: a chase, or just talk.
          if (FlowFollowUp.looksLikeChase(ctx.ownMessageText(last))) await chased(watch, lastId);
          else await FlowStorage.updateWatch(threadId, { messageId: lastId });
        }
        return;
      }
      // Already offered (declined / closed) for this very message.
      if (lastId && watch.messageId === lastId) return;
    }
    const key = threadId + '|' + lastId;
    if (offered.has(key)) return;

    const mineText = ctx.ownMessageText(last);
    const cls = { now: Date.now(), extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null };
    // What I asked of them comes first; if I asked nothing, what I promised them.
    const ask = FlowFollowUp.classifyOutgoing(mineText, cls) || FlowFollowUp.classifyCommitment(mineText, cls);
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

  return { consider, considerClock, dismiss };
})();
