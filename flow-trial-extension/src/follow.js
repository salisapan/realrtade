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

  // On-device learning: what this person accepts or turns down nudges the local
  // intent model (core/intent-model.js). Only feature indexes are stored, never
  // text. Loaded once per page; written after each decision.
  let adaptLoaded = false;
  async function loadAdapt() {
    if (adaptLoaded || typeof FlowIntentModel === 'undefined' || !FlowIntentModel.ready()) return;
    adaptLoaded = true;
    try { FlowIntentModel.setAdaptation(await FlowStorage.getIntentAdapt()); } catch (e) { /* learning is optional */ }
  }
  // "Reset what Glance learned" (popup) clears the stored adjustments; this page must drop its in-memory copy too,
  // or the next lesson would write the old numbers back.
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.intentAdapt && typeof FlowIntentModel !== 'undefined' && FlowIntentModel.ready()) FlowIntentModel.setAdaptation(changes.intentAdapt.newValue || {});
      });
    }
  } catch (e) { /* optional */ }
  async function teach(text, label, rate) {
    if (typeof FlowIntentModel === 'undefined' || !FlowIntentModel.ready()) return;
    try {
      await loadAdapt();
      FlowIntentModel.learn(text, 'act', label, rate);
      await FlowStorage.setIntentAdapt(FlowIntentModel.getAdaptation());
    } catch (e) { /* learning is optional */ }
  }

  // One line in the learning ledger (core/learning-ledger.js): what moved, and why. Optional, never blocks.
  function note(kind, info) {
    try {
      if (typeof FlowLedger === 'undefined' || typeof FlowStorage.appendLedger !== 'function') return;
      const e = FlowLedger.make(kind, info, Date.now());
      if (e) FlowStorage.appendLedger(e).catch(() => {});
    } catch (e) { /* the ledger is optional */ }
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
    const r = await send({ type: 'flow:follow-reschedule', ref: watch.taskRef, dueIso, title: FlowFollowUp.taskTitle(watch) });
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
    if ((watch.resolvedBy === 'reply' || watch.resolvedBy === 'delivered' || watch.resolvedBy === 'signal') && typeof FlowStorage.recordOutcomeLabel === 'function') FlowStorage.recordOutcomeLabel('reopened', watch.id + '|' + (watch.resolvedAt || '')).catch(() => {});
    if (watch.resolvedBy === 'reply' || watch.resolvedBy === 'delivered' || watch.resolvedBy === 'signal') note('reopened', { who: whoOf({ name: watch.counterpart && watch.counterpart.name, email: watch.counterpart && watch.counterpart.email }) });
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

  // ---- how much of this was understood by our own code (counts only) -----------
  function recordDecision(text, opened, key) {
    try {
      if (typeof FlowStorage.recordRecognition !== 'function' || typeof FlowRecognitionStats === 'undefined' || typeof FlowIntentPipeline === 'undefined') return;
      const d = FlowRecognitionStats.decide(FlowIntentPipeline.analyze(text), opened);
      FlowStorage.recordRecognition({ kind: d.kind, tier: d.tier, key: 'o|' + key }).catch(() => {});
    } catch (e) { /* measurement never blocks the product */ }
  }
  function recordReply(watch, reply, lastId) {
    try {
      if (typeof FlowStorage.recordRecognition !== 'function' || typeof FlowRecognitionStats === 'undefined') return;
      const d = FlowRecognitionStats.decideReply(reply);
      if (d) FlowStorage.recordRecognition({ kind: d.kind, tier: d.tier, key: 'r|' + watch.id + '|' + (lastId || '') }).catch(() => {});
    } catch (e) { /* measurement never blocks the product */ }
  }

  // ---- one story, many threads ---------------------------------------------------
  // The loop this message belongs to when it arrived in a thread of its own.
  async function storyFor(ctx, last, sender) {
    if (typeof FlowStory === 'undefined' || !sender) return null;
    const list = await FlowStorage.getWatches();
    if (!list.some((w) => FlowFollowUp.isActive(w) && !FlowFollowUp.isMine(w) && !FlowFollowUp.isClock(w))) return null;
    // The same person may be an address in one app and a phone number in another (core/identity-graph.js).
    let samePerson = null;
    if (typeof FlowIdentity !== 'undefined' && typeof FlowStorage.getIdentityGraph === 'function') {
      const graph = await FlowStorage.getIdentityGraph();
      const party = Object.assign({ channel: channelOf(ctx) }, sender);
      samePerson = (cp) => FlowIdentity.same(graph, cp, party);
    }
    if (!sender.email && !samePerson) return null;
    const hit = FlowStory.match(list, { email: sender.email, subject: ctx.subject, text: ctx.messageText(last) }, { extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null, samePerson });
    return hit ? hit.watch : null;
  }

  // ---- 3. what the answer did ------------------------------------------------------
  async function closed(watch, sender, how, via) {
    if (typeof FlowStorage.recordOutcomeLabel === 'function') FlowStorage.recordOutcomeLabel('autoClosed', watch.id + '|' + (watch.resolvedAt || '')).catch(() => {});
    if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
    track('follow_resolved');
    const name = whoOf(sender);
    const amt = amountLabel(watch);
    const on = via && via !== 'gmail' && typeof FlowChannel !== 'undefined' ? ' on ' + FlowChannel.label(via) : '';
    const line = how === 'paid'
      ? name + ' says it is paid' + on + (amt ? ' (' + amt + ')' : '') + took(watch) + '. Loop closed.'
      : how === 'file'
        ? name + ' sent the ' + ((watch.file && watch.file.label) || 'file') + (watch.deliveredFiles && watch.deliveredFiles[0] ? ' (' + watch.deliveredFiles[0] + ')' : '') + took(watch) + '. Loop closed.'
      : how === 'declined'
        ? name + ' said no' + took(watch) + '. Nothing left to chase, so I closed it.'
        : name + ' replied' + on + took(watch) + '. Loop closed.';
    receipt(line, null, { label: 'Reopen', run: () => reopen(watch) });
    timingNote(watch, sender);
  }

  // After a reply closes a loop: how long this person took, and what Glance now expects from them.
  async function timingNote(watch, sender) {
    try {
      if (watch.resolvedBy !== 'reply' || FlowFollowUp.isMine(watch)) return;
      const days = FlowFollowUp.daysOpen(watch, Date.now());
      if (!(days >= 1)) return;
      const list = await FlowStorage.getWatches();
      const expect = FlowFollowUp.typicalDays(list, Object.assign({}, watch, { status: 'waiting' }), Date.now());
      if (!(expect >= 1)) return;
      note('timing', { who: whoOf(sender), days, expectDays: Math.round(expect) });
    } catch (e) { /* optional */ }
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

  // They wrote back, but they need something from you. The ball is yours: the
  // chase stops and the reminder is now for you.
  async function yours(watch, sender, patch, ctx) {
    await moveTask(Object.assign({}, watch, patch), patch.chaseIso);
    track('follow_yours');
    const name = whoOf(sender);
    const what = patch.yoursReason === 'blocked' ? 'could not open or find what you sent' : 'asked you something';
    let next = Object.assign({}, watch, patch);
    const canDraft = Boolean(next.counterpart && next.counterpart.email);
    // Is a file part of the way out, and is there exactly one right file? Otherwise: none.
    const choice = canDraft ? await resolveFile(ctx, next) : null;
    if (choice && choice.source === 'drive') {
      next = (await FlowStorage.updateWatch(watch.id, { fileChoice: { name: choice.name, driveFileId: choice.id } })) || Object.assign({}, next, { fileChoice: { name: choice.name, driveFileId: choice.id } });
    }
    receipt(name + ' ' + what + '. This one is yours now. I stopped chasing and moved your reminder to ' + dayLabel(patch.chaseIso) + '.' + (choice ? ' File ready: ' + choice.name + '.' : ''), null,
      canDraft ? { label: choice ? 'Prepare reply with file' : 'Prepare my reply', run: () => prepareReply(next, choice, ctx) } : null);
  }

  // The one right file for this reply, or null. Never a guess:
  //   could not open it  -> the single attachment of MY earlier message in this thread
  //                         (the file I actually sent);
  //   they ask for a file -> the one Drive file core/file-path.js is confident about.
  async function resolveFile(ctx, w) {
    try {
      if (typeof FlowFilePath === 'undefined') return null;
      if (w.yoursReason === 'blocked') {
        if (!ctx || !ctx.attachmentsOf) return null;
        const own = Array.from(ctx.messages).filter((m) => isOwnNode(ctx, m));
        for (let i = own.length - 1; i >= 0; i--) {
          const atts = ctx.attachmentsOf(own[i]);
          if (atts && atts.length) {
            const one = FlowFilePath.resendCandidate(atts);
            return one ? { source: 'thread', name: one.filename, meta: one } : null;
          }
        }
        return null;
      }
      const need = FlowFilePath.askNeed(w.yoursLine);
      if (!need) return null;
      const found = await send({ type: 'flow:search-drive', query: FlowFilePath.driveQuery(need) });
      const pick = FlowFilePath.pickDrive(need, found && found.ok ? found.files : null, {}, w.yoursLine);
      return pick ? { source: 'drive', id: pick.id, name: pick.name, mimeType: pick.mimeType } : null;
    } catch (e) { return null; }
  }

  // The first draft of your answer, written into Gmail's Drafts in that thread, with the
  // one file when there is one. Nothing is sent. Preparing is not closing: the loop
  // stays yours until you actually send.
  async function prepareReply(watch, choice, ctx) {
    const payload = { to: watch.counterpart.email, toName: watch.counterpart.name, subject: watch.subject };
    let used = null;
    if (choice && choice.source === 'thread' && ctx && ctx.fetchAttachment) {
      const fetched = await ctx.fetchAttachment(choice.meta);
      if (fetched) { payload.attachment = fetched; used = choice.name; }
    } else if (choice && choice.source === 'drive') {
      payload.driveFileId = choice.id; used = choice.name;
    }
    let res = await send({ type: 'flow:follow-draft', payload: Object.assign({}, payload, { body: await voiced(FlowFollowUp.replyDraft(watch, { fileName: used }), watch) }) });
    let withoutFile = false;
    if (used && res && res.reason === 'attach') {
      // The file could not be read: the plain draft, never a body that claims a file.
      used = null; withoutFile = true;
      res = await send({ type: 'flow:follow-draft', payload: { to: payload.to, toName: payload.toName, subject: payload.subject, body: await voiced(FlowFollowUp.replyDraft(watch, {}), watch) } });
    }
    track(used ? 'follow_file_prepared' : 'follow_reply_prepared');
    if (res && res.ok) {
      await FlowStorage.updateWatch(watch.id, FlowFilePath.preparedPatch(Date.now(), used));
      receipt('Draft ready in Gmail' + (used ? ' with ' + used : '') + '. Nothing was sent.' + (withoutFile ? ' I could not attach the file, so add it yourself.' : ''), null);
    } else receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not create the draft. Try again in a moment.', null);
  }

  // You answered: the ball goes back to them, and the chase starts again.
  async function handedBack(watch, lastId) {
    const patch = Object.assign({ messageId: lastId }, FlowFollowUp.handBackPatch(watch, Date.now()));
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    await moveTask(next, patch.chaseIso);
    receipt('Sent. I am back on it. I will look again on ' + dayLabel(patch.chaseIso) + '.', null);
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
  const RANK = { paid: 7, closed: 6, declined: 6, yours: 5, promised: 4, answered: 3, ack: 2, auto: 1 };
  function judge(ctx, watch) {
    const msgs = Array.from(ctx.messages);
    let from = msgs.length - 1;
    if (watch.messageId) {
      const at = msgs.findIndex((m) => idOf(ctx, m) === watch.messageId);
      if (at >= 0) from = at + 1;
    }
    let best = null;
    for (let i = from; i < msgs.length; i++) {
      const sender = ctx.extractSender(msgs[i]);
      if (isOwnNode(ctx, msgs[i])) continue;
      const text = ctx.messageText(msgs[i]);
      // Did a real file come with it? Only asked of a file-backed loop, and only when the page can tell.
      const evidence = typeof FlowFilePath !== 'undefined' && ctx.attachmentsOf && FlowFilePath.isFileBacked(watch)
        ? FlowFilePath.evidence({ text, attachments: ctx.attachmentsOf(msgs[i]) }) : null;
      const reply = FlowFollowUp.classifyReply(text, watch, { now: Date.now(), email: sender.email, evidence });
      if (!best || (RANK[reply.outcome] || 0) > (RANK[best.reply.outcome] || 0)) best = { reply, sender, text };
    }
    return best;
  }

  async function handleReply(ctx, watch, lastId) {
    let best = judge(ctx, watch);
    if (!best) return;
    // Closing wrongly is the one mistake this product must not make. If this person has been reopening
    // Glance's own closes often, a close that rests only on "they wrote back" (no rule fired) is not made.
    if (best.reply.outcome === 'closed' && best.reply.basis === 'default' && typeof FlowOutcomeLabels !== 'undefined' && FlowStorage.getOutcomeLabels) {
      try { if (FlowOutcomeLabels.closureQuality(await FlowStorage.getOutcomeLabels()).strict) best = { reply: Object.assign({}, best.reply, { outcome: 'ack' }), sender: best.sender }; } catch (e) { /* quality is advisory */ }
    }
    // The reply model read it as "not an answer" and held the loop open: say so in the learning list, so it can be checked on real threads.
    if (best.reply.basis === 'model' || best.reply.basis === 'unsure' || best.reply.why === 'waiting on someone else') {
      const why = String(best.reply.why || '');
      note('heldOpen', { text: best.text, counterpart: watch.counterpart, reason: /waiting on someone/.test(why) ? 'it is with someone else' : /not clearly/.test(why) ? 'too short to be an answer' : /interim/.test(why) ? 'still working on it' : /ack/.test(why) ? 'only a thank-you' : 'unrelated' });
    }
    const res = FlowFollowUp.applyReply(watch, best.reply, Date.now());
    if (res.none) return;
    recordReply(watch, best.reply, lastId);
    // An answer that came in another app than the one the loop was opened in says so, in the loop and in the receipt.
    const via = (watch.channel || 'gmail') !== channelOf(ctx) ? channelOf(ctx) : null;
    const patch = Object.assign({}, res.patch, { lastReplyMessageId: lastId }, via ? { viaChannel: via } : {});
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    if (res.close && next.tier === 'model' && best.reply.outcome !== 'declined') confirmAsk(next, 'confirmedAsk', 'ASK');
    if (res.close) await closed(next, best.sender, best.reply.outcome === 'paid' ? 'paid' : best.reply.outcome === 'declined' ? 'declined' : best.reply.delivered === 'file' ? 'file' : 'replied', via);
    else if (res.yours) await yours(watch, best.sender, patch, ctx);
    else if (res.claimedOnly) {
      // They wrote "attached" and nothing came through. Say so once; the loop stays open.
      if (!watch.claimedFileAt) receipt(whoOf(best.sender) + ' said the file is attached, but no file came through. I kept the loop open.', null);
    }
    else if (res.rescheduled) await promised(watch, best.sender, patch);
    else if (res.confirm) paidCard(next, best.sender);
  }

  // ---- the on-device language model (core/local-lm.js) ------------------------------------------
  // A third tier for wording the lexicon and the learned model left silent. It only proposes (the person still taps),
  // and it is asked only on a device where it passed the precision self-test, per language. If this browser has no
  // built-in model, all of this is a no-op. The self-test runs in the background, once a month (once a day while the
  // model is missing), never blocks a message and never downloads a model.
  const LM_BUDGET_MS = 8000;
  let lmSession = null;
  let lmStatus; // undefined = not read yet
  let lmTesting = false;

  async function runLmSelfTest() {
    if (lmTesting) return;
    lmTesting = true;
    try {
      const now = Date.now();
      const prev = await FlowStorage.getLocalLm();
      if (prev && prev.testingAt && now - prev.testingAt < 15 * 60 * 1000) return;     // another tab is on it
      const avail = await FlowLocalLMChrome.availability();
      if (avail !== 'available') { lmStatus = { checkedAt: now, nextCheckAt: now + 24 * 3600 * 1000, reason: avail, en: { ok: false }, he: { ok: false } }; await FlowStorage.setLocalLm(lmStatus); return; }
      await FlowStorage.setLocalLm(Object.assign({}, prev || {}, { testingAt: now }));
      const session = await FlowLocalLMChrome.open();
      const res = await FlowLocalLM.selfTest(session, typeof FlowLocalLMAudit !== 'undefined' ? FlowLocalLMAudit : [], { now: Date.now() });
      if (session && session.destroy) session.destroy();
      lmStatus = Object.assign({}, res, { nextCheckAt: res.checkedAt + FlowLocalLM.TEST_MAX_AGE_MS, reason: res.en.ok || res.he.ok ? 'passed' : 'failed' });
      await FlowStorage.setLocalLm(lmStatus);
    } catch (e) { /* the tier simply stays off */ } finally { lmTesting = false; }
  }

  // A model the person runs on their own computer (Ollama, LM Studio; core/local-lm-server.js), reached through the service worker because
  // a Gmail page may not call localhost itself. Used instead of the browser's model only when the person turned it on AND it passed
  // the same precision self-test (done in the popup, per language). Same rules: it only proposes.
  const LM_SERVER_BUDGET_MS = 25000;
  function serverSession() {
    return {
      prompt: async (text, schema) => {
        const r = await send({ type: 'flow:lm-server-prompt', text, schema });
        if (!r || !r.ok) throw new Error((r && r.reason) || 'off');
        return r.text;
      },
      destroy: () => {}
    };
  }
  async function serverChoice() {
    try {
      if (typeof FlowStorage.getLocalLmServer !== 'function') return null;
      const c = await FlowStorage.getLocalLmServer();
      const st = c && c.status;
      if (!c || c.enabled !== true || !c.model || !st || !((st.en && st.en.ok) || (st.he && st.he.ok)) || FlowLocalLM.stale(st, Date.now())) return null;
      return { session: serverSession(), status: st };
    } catch (e) { return null; }
  }

  async function lmAskLocal(text) {
    try {
      if (typeof FlowLocalLM === 'undefined' || typeof FlowStorage.getLocalLm !== 'function') return null;
      let session = null;
      let status = null;
      const srv = await serverChoice();
      if (srv) { session = srv.session; status = srv.status; }
      else {
        if (typeof FlowLocalLMChrome === 'undefined') return null;
        if (lmStatus === undefined) lmStatus = await FlowStorage.getLocalLm();
        if (!lmStatus || Date.now() > (lmStatus.nextCheckAt || 0)) { runLmSelfTest(); }
        if (!lmStatus || !((lmStatus.en && lmStatus.en.ok) || (lmStatus.he && lmStatus.he.ok)) || FlowLocalLM.stale(lmStatus, Date.now())) return null;
        if (!lmSession) lmSession = await FlowLocalLMChrome.open();
        if (!lmSession) return null;
        session = lmSession; status = lmStatus;
      }
      const maxTried = srv ? 2 : 3;
      const work = (async () => {
        let tried = 0;
        for (const s of FlowIntentPipeline.sentences(text)) {
          if (tried >= maxTried) break;
          const p = await FlowLocalLM.propose(s, { session, pipeline: FlowIntentPipeline, model: FlowIntentModel, status, extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null, now: Date.now() });
          tried++;
          if (p) return FlowFollowUp.fromProposal(p, Date.now());
        }
        return null;
      })();
      return await Promise.race([work, new Promise((r) => setTimeout(() => r(null), srv ? LM_SERVER_BUDGET_MS : LM_BUDGET_MS))]);
    } catch (e) { return null; }
  }

  // ---- the deeper read (core/ai-ladder.js, docs/ai-ladder.md) ---------------------------------------------------------
  // The step after the on-device ones: one masked sentence to Glance's server, only when the person said yes in the popup, the server says it is running, and this
  // month's allowance has room. At most two sentences of one message are asked about. The answer is a proposal; the person still taps.
  const LADDER_PER_MESSAGE = 2;

  async function ladderAsk(text) {
    try {
      if (typeof FlowAiLadder === 'undefined' || typeof FlowExecRouter === 'undefined' || typeof FlowStorage.getLadder !== 'function' || typeof FlowIntentModel === 'undefined') return null;
      const info = await send({ type: 'flow:ladder-info' });
      if (!info || !info.ok || !info.enabled) return null;
      let state = FlowAiLadder.stateOf(info);
      if (!FlowAiLadder.mayAsk(state)) return null;
      const plan = FlowAiLadder.planOf(info.pro === true);
      const kept = await FlowStorage.getLadder();
      let cache = kept.cache, stats = kept.stats, found = null, asked = 0;
      for (const s of FlowIntentPipeline.sentences(text)) {
        if (asked >= LADDER_PER_MESSAGE || !FlowAiLadder.mayAsk(state)) break;
        const r = await FlowAiLadder.read(s, {
          pipeline: FlowIntentPipeline, model: FlowIntentModel, state, plan, cache, now: Date.now(),
          extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null, maskIds: FlowMaskIds,
          mask: (x) => FlowExecRouter.maskForServer(x, FlowPrivacyShield, FlowMaskIds),
          ask: (req) => send({ type: 'flow:ladder-read', maskedSentence: req.maskedSentence })
        });
        if (r.why === 'read' || r.why === 'nothing') { asked++; note('secondReading', { text: s }); }
        if (r.cache) cache = r.cache;
        if (r.why !== 'decided' && r.why !== 'length' && r.why !== 'off' && r.why !== 'sure-not-ask' && r.why !== 'not-residual' && r.why !== 'no-model') stats = FlowAiLadder.noteRead(stats, r, Date.now());
        if (r.quota) state = FlowAiLadder.stateOf(Object.assign({}, info, { snapshot: r.quota }));
        if (r.why === 'quota_used' || r.why === 'unreachable' || r.why === 'paused') break;
        if (r.proposal) { found = r.proposal; break; }
      }
      await FlowStorage.setLadder({ cache, stats });
      if (!found) return null;
      const ask = FlowFollowUp.fromProposal(found, Date.now());
      if (ask) ask.ladder = { via: found.via, standIn: found.standIn === true };
      return ask;
    } catch (e) { return null; }
  }

  // The person's tap on a proposal that came from a deeper read: the label that says whether it was right. Counts only.
  function ladderOutcome(ask, accepted) {
    try {
      if (!ask || !ask.ladder || typeof FlowAiLadder === 'undefined' || typeof FlowStorage.getLadder !== 'function') return;
      FlowStorage.getLadder().then((k) => FlowStorage.setLadder({ stats: FlowAiLadder.noteOutcome(k.stats, accepted) })).catch(() => {});
    } catch (e) { /* optional */ }
  }

  // The order: the person's own computer first (the browser's model, or Ollama / LM Studio), then, only if nothing there could place it, the server.
  async function lmAsk(text) {
    const local = await lmAskLocal(text);
    return local || ladderAsk(text);
  }

  // Voice-matched drafts (core/style-profile.js): Pro only; a template draft opens and closes the way this person does.
  async function voiced(text, w) {
    try {
      if (!text || typeof FlowStyle === 'undefined' || typeof FlowStorage.getStyleProfile !== 'function') return text;
      const status = await send({ type: 'flow:pro-status' });
      if (!FlowEntitlements.isActive(status && status.record, Date.now())) return text;
      const sum = FlowStyle.summary(await FlowStorage.getStyleProfile(), w && w.lang === 'he' ? 'he' : 'en');
      return FlowStyle.restyle(text, sum, { name: FlowFollowUp.firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email) });
    } catch (e) { return text; }
  }

  // Every message you send teaches the style profile how you open and close. Counts only (core/style-profile.js).
  async function learnStyle(text) {
    try {
      if (typeof FlowStyle === 'undefined' || typeof FlowStorage.observeStyle !== 'function') return;
      const r = await FlowStorage.observeStyle(text);
      if (!r || !r.after) return;
      const a = r.after, b = r.before;
      if (!b || b.greeting !== a.greeting || b.signoff !== a.signoff || b.length !== a.length) note('style', { note: FlowStyle.note(a) });
    } catch (e) { /* optional */ }
  }

  // ---- one person across apps (core/identity-graph.js, core/cross-channel.js) ---------------------
  // Every person seen is remembered by hard keys only (address, number) plus a name hint; nothing of the message is kept.
  async function observeWho(ctx, last, lastIsOwn) {
    try {
      if (typeof FlowStorage.observeIdentity !== 'function' || typeof FlowChannel === 'undefined') return;
      const party = lastIsOwn ? Object.assign({ channel: channelOf(ctx) }, counterpartIn(ctx, last)) : partyOfNode(ctx, last);
      await FlowStorage.observeIdentity(party);
    } catch (e) { /* optional */ }
  }

  // The one key that stands for this person in every app: their address if we know one, else their number.
  async function personKeyFor(party) {
    try {
      if (typeof FlowIdentity === 'undefined' || typeof FlowStorage.getIdentityGraph !== 'function') return null;
      const a = FlowIdentity.aliasesOf(await FlowStorage.getIdentityGraph(), party);
      return a.emails[0] || (a.phones[0] ? 'phone:' + a.phones[0] : null) || (party && party.email) || (party && party.phone ? 'phone:' + FlowChannel.normalizePhone(party.phone) : null) || null;
    } catch (e) { return null; }
  }

  async function applyCrossDecision(watch, d, sender, channel, lastId) {
    const patch = FlowCrossChannel.patchFor(watch, d, channel, Date.now());
    if (!patch) return;
    const full = Object.assign({}, patch, { lastReplyMessageId: lastId });
    const next = (await FlowStorage.updateWatch(watch.id, full)) || Object.assign({}, watch, full);
    if (d.action === 'promised' || next.status !== 'resolved') { await promised(watch, sender, full); return; }
    const how = d.reply.outcome === 'paid' ? 'paid' : d.reply.outcome === 'declined' ? 'declined' : d.reply.delivered === 'file' ? 'file' : 'replied';
    await closed(next, sender, how, channel);
  }

  function crossCard(watch, d, sender, channel, lastId) {
    const h = card(watch.lang === 'he');
    h.appendChild(el('div', 'flow-fu-title', whoOf(sender) + ' wrote on ' + FlowChannel.label(channel) + '.'));
    h.appendChild(el('div', 'flow-fu-line', 'Does this settle \u201c' + String(watch.what || 'your request').slice(0, 80) + '\u201d? I kept the loop open.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('Yes, close it', 'primary', async () => { dismiss(); await applyCrossDecision(watch, d, sender, channel, lastId); }));
    row.appendChild(button('Not yet', 'ghost', dismiss));
    h.appendChild(row);
  }

  // Their message in this app might settle a loop opened in another. Close only when the evidence is hard; otherwise ask once.
  async function crossChannel(ctx, last, sender, threadId, lastId) {
    try {
      if (typeof FlowCrossChannel === 'undefined' || typeof FlowIdentity === 'undefined' || typeof FlowStorage.getIdentityGraph !== 'function') return false;
      const channel = channelOf(ctx);
      const list = await FlowStorage.getWatches();
      if (!list.some((w) => FlowFollowUp.isActive(w) && !FlowFollowUp.isMine(w) && !FlowFollowUp.isClock(w))) return false;
      const graph = await FlowStorage.getIdentityGraph();
      const party = partyOfNode(ctx, last);
      const d = FlowCrossChannel.judge(list, graph, party, ctx.messageText(last), { channel, thread: threadId }, { now: Date.now(), extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null });
      if (!d) return false;
      const watch = list.find((w) => w.id === d.watchId);
      if (!watch || (watch.lastReplyMessageId && watch.lastReplyMessageId === lastId) || settling.has(watch.id)) return false;
      settling.add(watch.id);
      try {
        if (d.action === 'ask') {
          await FlowStorage.updateWatch(watch.id, { crossAskedAt: Date.now() });
          crossCard(watch, d, party, channel, lastId);
        } else await applyCrossDecision(watch, d, party, channel, lastId);
      } finally { settling.delete(watch.id); }
      return true;
    } catch (e) { return false; }
  }

  // The reminder for this loop was ticked done in Google Tasks (on a phone, say): the person closed it themselves.
  const taskChecked = new Set();
  async function taskDone(watch) {
    try {
      if (!watch || watch.status !== 'waiting' || !watch.taskRef || !watch.taskRef.taskId || taskChecked.has(watch.id) || !FlowFollowUp.closeFromTask) return false;
      taskChecked.add(watch.id);
      const r = await send({ type: 'flow:follow-task-status', refs: [watch.taskRef] });
      const st = r && r.ok && (r.statuses || []).find((x) => x.taskId === watch.taskRef.taskId);
      if (!st || st.status !== 'completed') return false;
      const patch = FlowFollowUp.closeFromTask(watch, Date.now());
      const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
      track('follow_resolved');
      receipt('You ticked the reminder done, so I closed the loop' + took(watch) + '.', null, { label: 'Reopen', run: () => reopen(next) });
      return true;
    } catch (e) { return false; }
  }

  // ---- 4. settled outside the thread (core/outside-signals.js) ----------------------------
  // Money arrived at a bank or payment provider, a calendar entry now exists, a file was shared. Strong evidence
  // closes the loop with a receipt and Reopen; weaker evidence asks once and never closes alone. Nothing from the
  // evidence (no text, no sender) is stored on the loop.
  async function settledBy(watch, prop, strong) {
    const next = (await FlowStorage.updateWatch(watch.id, prop.patch)) || Object.assign({}, watch, prop.patch);
    if (strong && typeof FlowStorage.recordOutcomeLabel === 'function') FlowStorage.recordOutcomeLabel('autoClosed', watch.id + '|' + (next.resolvedAt || '')).catch(() => {});
    if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
    track('follow_resolved');
    receipt(prop.receipt + took(watch) + '. Loop closed.', null, { label: 'Reopen', run: () => reopen(next) });
  }

  function signalCard(watch, prop, signal) {
    const h = card(watch.lang === 'he');
    h.appendChild(el('div', 'flow-fu-title', prop.question));
    h.appendChild(el('div', 'flow-fu-line', 'The loop stays open until you say so.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button(prop.yes, 'primary', () => settledBy(watch, prop, false)));
    row.appendChild(button(prop.no, 'ghost', async () => { await FlowStorage.updateWatch(watch.id, FlowOutsideSignals.dismissPatch(watch, signal.kind)); dismiss(); }));
    h.appendChild(row);
  }

  async function paymentSignal(ctx, last, sender) {
    if (typeof FlowOutsideSignals === 'undefined') return false;
    const ev = FlowOutsideSignals.paymentEvidence(ctx.messageText(last), sender && sender.email);
    if (!ev) return false;
    // The amount and the day, nothing else: a later request for a receipt can tell the payment really arrived (core/resolution.js).
    if (FlowStorage.recordPaymentSeen) FlowStorage.recordPaymentSeen({ value: ev.amount.value, currency: ev.amount.currency, trusted: ev.trusted, at: Date.now() }).catch(() => {});
    const list = await FlowStorage.getWatches();
    const m = FlowOutsideSignals.matchPayment(list, ev, Date.now());
    if (!m) return false;
    const watch = list.find((w) => w.id === m.watchId);
    if (!watch) return false;
    const prop = FlowOutsideSignals.proposal(watch, m, Date.now(), { amountLabel: amountLabel(watch) });
    if (m.strength === 'strong') await settledBy(watch, prop, true);
    else signalCard(watch, prop, m);
    return true;
  }

  // ---- a promise of yours, kept ------------------------------------------------
  // ---- learning from what happened next (core/outcome-labels.js) ---------------------------
  // The on-device model alone proposed this loop and reality agreed (they answered / you kept it):
  // a small confirmation, once. Only feature numbers move; no text is stored.
  async function confirmAsk(watch, kind, label) {
    try {
      if (typeof FlowStorage.recordOutcomeLabel !== 'function' || typeof FlowOutcomeLabels === 'undefined') return;
      if (await FlowStorage.recordOutcomeLabel(kind, watch.id)) {
        await teach(watch.what, label, FlowOutcomeLabels.RATE_CONFIRMED);
        note(label === 'PROMISE' ? 'promiseConfirmed' : 'askConfirmed', { text: watch.what, counterpart: watch.counterpart, about: watch.subtypeLabel || null });
      }
    } catch (e) { /* learning is optional */ }
  }

  // You chased by hand in a thread where no loop exists: an earlier message of yours was an ask
  // the engine stayed silent on. Teach the model that sentence, once.
  async function learnMissed(ctx, last, threadId, kind) {
    try {
      if (typeof FlowOutcomeLabels === 'undefined' || typeof FlowStorage.recordOutcomeLabel !== 'function') return;
      const finder = kind === 'missedPromise' ? FlowFollowUp.missedPromiseIn : FlowFollowUp.missedAskIn;
      if (!finder) return;
      await loadAdapt();
      const msgs = Array.from(ctx.messages);
      const at = msgs.indexOf(last);
      const own = [];
      for (let i = at - 1; i >= 0; i--) {
        if (isOwnNode(ctx, msgs[i])) own.push({ text: ctx.ownMessageText(msgs[i]), key: idOf(ctx, msgs[i]) || String(i) });
      }
      const found = finder(own, { now: Date.now(), extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null });
      if (!found) return;
      if (await FlowStorage.recordOutcomeLabel(kind, threadId + '|' + found.key)) {
        await teach(found.sentence, kind === 'missedPromise' ? 'PROMISE' : 'ASK', FlowOutcomeLabels.RATE_MISSED);
        note(kind === 'missedPromise' ? 'promiseMissed' : 'askMissed', { text: found.sentence });
        track(kind === 'missedPromise' ? 'follow_learned_missed_promise' : 'follow_learned_missed_ask');
      }
    } catch (e) { /* learning is optional */ }
  }
  const learnMissedAsk = (ctx, last, threadId) => learnMissed(ctx, last, threadId, 'missedAsk');

  async function kept(watch, lastId) {
    const patch = Object.assign({ messageId: lastId }, FlowFollowUp.closeAsKept(watch, Date.now()));
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
    track('follow_resolved');
    if (typeof FlowStorage.recordOutcomeLabel === 'function') FlowStorage.recordOutcomeLabel('autoClosed', watch.id + '|' + (next.resolvedAt || '')).catch(() => {});
    if (watch.tier === 'model') confirmAsk(watch, 'confirmedPromise', 'PROMISE');
    receipt('Promise kept' + took(watch) + '. Loop closed.', null, { label: 'Reopen', run: () => reopen(next) });
  }

  // ---- 2. you chased -----------------------------------------------------------------
  async function chased(watch, lastId) {
    const all = await FlowStorage.getWatches();
    const patch = Object.assign({ messageId: lastId }, FlowFollowUp.recordNudge(watch, Date.now(), all));
    const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
    await moveTask(next, patch.chaseIso);
    receipt('Chase noted. I will look again on ' + dayLabel(patch.chaseIso) + '.', null);
  }

  // ---- 1. offer ---------------------------------------------------------------
  // ---- which app is this? (core/channel.js) -------------------------------------------------------
  // Gmail is the default. Another surface (src/content-whatsapp.js) hands in the same ctx with a few extra hooks:
  //   channel, messageId(node), isOwn(node), counterpart(node), partyOf(node)
  // so everything below this line works on a chat exactly as it does on an email thread.
  function channelOf(ctx) { return (ctx && ctx.channel) || 'gmail'; }
  function idOf(ctx, node) { return ctx && ctx.messageId ? ctx.messageId(node) : (node.getAttribute('data-legacy-message-id') || null); }
  function isOwnNode(ctx, node) {
    if (ctx && ctx.isOwn) return Boolean(ctx.isOwn(node));
    const e = (ctx.extractSender(node).email || '').toLowerCase();
    return Boolean(e && e === String(ctx.ownEmail).toLowerCase());
  }
  function counterpartIn(ctx, node) { return ctx && ctx.counterpart ? ctx.counterpart(node) : counterpartOf(node, ctx.ownEmail); }
  // The sender as a core/channel.js party (name, email, phone), whatever the app calls it.
  function partyOfNode(ctx, node) {
    const base = ctx && ctx.partyOf ? ctx.partyOf(node) : ctx.extractSender(node);
    return { channel: channelOf(ctx), name: (base && base.name) || null, email: (base && base.email) || null, phone: (base && base.phone) || null };
  }

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

  // The engine could not decide on a sentence of yours: keep the most undecided one as the single question the popup
  // may ask (core/active-question.js). Nothing is shown here; Gmail stays quiet.
  async function considerQuestion(ctx, last, text, threadId, lastId) {
    try {
      if (typeof FlowActiveQuestion === 'undefined' || typeof FlowIntentModel === 'undefined' || typeof FlowIntentPipeline === 'undefined' || !FlowIntentModel.ready() || typeof FlowStorage.getActiveQuestion !== 'function') return;
      await loadAdapt();
      const cands = FlowActiveQuestion.candidates(text, { model: FlowIntentModel, pipeline: FlowIntentPipeline });
      if (!cands.length) return;
      const state = await FlowStorage.getActiveQuestion();
      const next = FlowActiveQuestion.offer(state, cands, { threadId, messageId: lastId, subject: ctx.subject, counterpart: counterpartIn(ctx, last), threadUrl: ctx.threadUrl(lastId), channel: channelOf(ctx) }, Date.now());
      if (JSON.stringify(next.pending) !== JSON.stringify(state.pending)) await FlowStorage.setActiveQuestion(next);
    } catch (e) { /* a question is optional */ }
  }

  async function track1(ask, base) {
    ladderOutcome(ask, true);
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
    teach(watch.what, FlowFollowUp.isMine(watch) ? 'PROMISE' : 'ASK', 1.5);
    note('accepted', { text: watch.what, counterpart: watch.counterpart });
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
    const fileWord = watch.file && watch.kind !== FlowFollowUp.KINDS.PAYMENT ? 'the ' + watch.file.label + ' arrives.' : null;
    receipt(head + ' I will look again on ' + dayLabel(watch.chaseIso) + ' and close it when ' + (fileWord || (name ? name + (watch.kind === FlowFollowUp.KINDS.PAYMENT ? ' pays.' : ' answers.') : 'they ' + (watch.kind === FlowFollowUp.KINDS.PAYMENT ? 'pay.' : 'answer.'))), async () => {
      await send({ type: 'flow:undo-action', connectorId: 'googleTask', ref: res.ref });
      await FlowStorage.updateWatch(watch.id, { status: 'stopped', resolvedAt: Date.now(), resolvedBy: 'undo' });
      dismiss();
    });
  }

  async function declined(ask, base) {
    ladderOutcome(ask, false);
    teach(ask.what, 'INFORM', 0.4); // a weak signal: "not now" is not always "not a request"
    note('turnedDown', { text: ask.what, counterpart: base && base.counterpart });
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
    h.appendChild(el('div', 'flow-fu-title', isPay ? 'Waiting on a payment?' : ask.file ? 'Waiting on the ' + ask.file.label + '?' : 'Waiting on a reply?'));
    h.appendChild(el('div', 'flow-fu-quote', ask.what));
    h.appendChild(el('div', 'flow-fu-line', 'I can stay on this until it is closed: look again on ' + dayLabel(ask.chaseIso) + (ask.personal ? ' (' + (ask.personal.level === 'colleagues' ? 'people at ' + ask.personal.domain + ' usually take' : ((FlowFollowUp.firstName(base.counterpart && base.counterpart.name, base.counterpart && base.counterpart.email) || '') ? FlowFollowUp.firstName(base.counterpart && base.counterpart.name, base.counterpart && base.counterpart.email) + ' usually takes' : 'they usually take')) + ' about ' + Math.max(1, Math.round(ask.personal.typical)) + ' business days)' : '') + ', and close it myself when ' + (isPay ? 'it is paid.' : ask.file ? 'the ' + ask.file.label + ' arrives.' : 'they answer.')));
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
    row.appendChild(button('See Glance Pro', 'primary', () => { window.open(FlowEntitlements.PRICING_URL.replace('from=glance', 'from=cap'), '_blank', 'noopener'); dismiss(); }));
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
    if (channelOf(ctx) !== 'gmail') return;              // an offer or a trial that runs out is an email thing
    if (!msgs || !msgs.length || !ctx.ownEmail) return;
    const last = msgs[msgs.length - 1];
    const sender = ctx.extractSender(last);
    if (!sender.email || isOwnNode(ctx, last)) return;
    if (FlowFollowUp.isAutoReply('', sender.email)) return; // noreply senders never get a card
    const threadId = ctx.threadIdFrom(last);
    if (!threadId) return;
    const lastId = idOf(ctx, last);
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


  // ---- a request that takes more than one step (core/resolution.js) ---------------------------------
  // "Can you send me the receipt?" is not one action. The path: what "done" means, an existing file first, whether
  // the payment is real, a draft or a request to whoever issues it, and only a real attachment in a message YOU sent
  // closes it. One loop (direction 'mine') carries the whole path; every card is one move, never a workflow.
  const examinedResolution = new Set();

  function needOf(ask) { return { object: ask.id, label: ask.label, lang: ask.lang, synonym: ask.synonym || [] }; }
  function sameSenderNode(ctx, a, b) { const x = (ctx.extractSender(a).email || '').toLowerCase(); return Boolean(x) && x === (b.email || '').toLowerCase(); }

  async function resolutionWorld(ctx, sender, env) {
    const need = env.need;
    let threadFiles = null;
    if (ctx.attachmentsOf) {
      threadFiles = [];
      Array.from(ctx.messages).forEach((m) => {
        const atts = ctx.attachmentsOf(m);
        if (!atts || !atts.length) return;
        const by = isOwnNode(ctx, m) ? 'me' : (sameSenderNode(ctx, m, sender) ? 'requester' : 'other');
        atts.forEach((a) => { if (a && a.filename) threadFiles.push({ filename: a.filename, by }); });
      });
    }
    const found = typeof FlowFilePath !== 'undefined' ? await send({ type: 'flow:search-drive', query: FlowFilePath.driveQuery({ label: need.label }) }) : null;
    const watches = await FlowStorage.getWatches();
    const person = { email: sender.email, personKey: env.personKey || null };
    const payment = FlowResolution.paymentStatus({ facts: env.facts, person, watches, paymentsSeen: await FlowStorage.getPaymentsSeen(), state: env.state, now: Date.now() });
    const issuer = await FlowStorage.getIssuer(need.object);
    return { evidence: { threadFiles, driveFiles: found && found.ok ? found.files : null }, payment, issuer };
  }

  function planFor(env, world) {
    return FlowResolution.plan({ need: env.need, facts: env.facts, evidence: world.evidence, payment: world.payment, issuer: world.issuer, state: env.state, sourceText: env.text, now: Date.now() });
  }

  // The loop that carries the path. Opened on the first tap, never before. Returns the stored watch, or null (cap, or Google not connected).
  async function resolutionLoop(env) {
    if (env.watch) return env.watch;
    const status = await send({ type: 'flow:pro-status' });
    const list = await FlowStorage.getWatches();
    const gate = FlowEntitlements.watchGate(list.filter(FlowFollowUp.isActive).length, status && status.record, Date.now());
    if (!gate.allowed) { await capCard(gate.used, gate.cap); return null; }
    const chaseIso = FlowFollowUp.chaseDate(FlowFollowUp.KINDS.REPLY, null, Date.now(), 2);
    const ask = {
      kind: FlowFollowUp.KINDS.REPLY, what: env.what, amount: env.facts.amount || null, deadlineIso: null, chaseIso, lang: env.need.lang,
      subtype: 'owe:send', subtypeLabel: null, tier: 'rule', direction: 'mine', file: { object: env.need.object, label: env.need.label, lang: env.need.lang, synonym: env.need.synonym },
      resolution: env.state
    };
    const watch = FlowFollowUp.buildWatch({ ask, threadId: env.threadId, messageId: env.lastId, subject: env.subject, counterpart: { email: env.sender.email, name: env.sender.name || null }, channel: 'gmail', personKey: env.personKey || null, now: Date.now() });
    watch.threadUrl = env.threadUrl || null;
    const res = await send({ type: 'flow:follow-task', payload: taskPayload(watch) });
    if (!res || !res.ok) { receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not add the reminder. Try again in a moment.', null); return null; }
    watch.taskRef = res.ref || null;
    await FlowStorage.upsertWatch(watch);
    FlowStorage.recordLoopOpen(watch).catch(() => {});
    track('follow_resolution_opened');
    return watch;
  }

  // Keep the one status truth on the loop: the state, plus the line the popup shows for it.
  async function saveResolution(env, state, plan) {
    const stored = Object.assign({}, state, plan ? { line: plan.line, move: plan.move } : {});
    const watch = await resolutionLoop(Object.assign({}, env, { state: stored }));
    if (!watch) return null;
    const next = (await FlowStorage.updateWatch(watch.id, { resolution: stored })) || Object.assign({}, watch, { resolution: stored });
    return Object.assign({}, env, { watch: next, state: stored });
  }

  // After a tap: advance the state, plan again at once, and show the NEXT move (the path moves, the person does not re-ask).
  async function advanceResolution(ctx, env, nextState) {
    const world = await resolutionWorld(ctx, env.sender, Object.assign({}, env, { state: nextState }));
    const plan = planFor(env, world);
    const saved = await saveResolution(Object.assign({}, env, { state: nextState }), nextState, plan);
    if (!saved) return;
    resolutionCard(ctx, saved, plan, world);
  }

  async function draftTo(to, toName, subject, body, extra) {
    return send({ type: 'flow:follow-draft', payload: Object.assign({ to, toName, subject, body }, extra || {}) });
  }

  function resolutionCard(ctx, env, plan, world) {
    const he = env.need.lang === 'he';
    const quiet = plan.actions && plan.actions.length === 1 && plan.actions[0] === 'hold';
    if (quiet || !plan.actions || !plan.actions.length) { dismiss(); return; }
    const h = card(he);
    h.appendChild(el('div', 'flow-fu-title', (he ? 'צעד הבא: ' : 'Next: ') + env.need.label + (env.facts.senderName ? ' · ' + env.facts.senderName : '')));
    h.appendChild(el('div', 'flow-fu-line', plan.line));
    h.appendChild(el('div', 'flow-fu-line', (he ? 'סגור כש: ' : 'Done when: ') + plan.doneWhen + '.'));
    const row = el('div', 'flow-fu-actions');
    h.appendChild(row);
    const t = Date.now();
    const st = env.state;
    const reply = (extra, withFile) => async () => {
      const used = withFile ? plan.file : null;
      const payload = {};
      if (used && used.source === 'drive') payload.driveFileId = used.id;
      else if (used && used.source === 'thread' && ctx.fetchAttachment) { const f = await ctx.fetchAttachment(used.meta); if (f) payload.attachment = f; }
      const voice = { counterpart: { email: env.sender.email, name: env.sender.name }, lang: env.need.lang };
      const attached = used && (payload.driveFileId || payload.attachment) ? used.name : null;
      let res = await draftTo(env.sender.email, env.sender.name, env.subject, await voiced(FlowResolution.replyDraft(env.need, env.facts, { fileName: attached }), voice), payload);
      let withoutFile = Boolean(used && !attached);
      if (attached && res && res.reason === 'attach') { withoutFile = true; res = await draftTo(env.sender.email, env.sender.name, env.subject, await voiced(FlowResolution.replyDraft(env.need, env.facts, {}), voice), {}); }
      if (!(res && res.ok)) { receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not create the draft. Try again in a moment.', null); return; }
      const next = FlowResolution.recordPrepared(st, t, attached && !withoutFile ? attached : null);
      const saved = await saveResolution(env, next, Object.assign({}, plan, { line: 'Draft ready' + (attached && !withoutFile ? ' with ' + attached : '') + '. Not sent; I will close this when you send it with the file.' }));
      track('follow_resolution_prepared');
      if (saved) receipt('Draft ready in Gmail' + (attached && !withoutFile ? ' with ' + attached : '') + '. Nothing was sent. I will close this when you send the ' + env.need.label + '.' + (withoutFile ? ' I could not attach the file, so add it yourself.' : ''), null);
    };
    const move = (fn) => () => { fn().catch((e) => { console.error('[Glance] resolution step failed', e); receipt('Something did not work. Try again in a moment.', null); }); };
    plan.actions.forEach((a, idx) => {
      const primary = idx === 0 ? 'primary' : 'ghost';
      if (a === 'prepare-reply-with-file') row.appendChild(button('Prepare reply with file', primary, move(reply({}, true))));
      else if (a === 'prepare-plain-reply') row.appendChild(button('Prepare my reply', primary, move(reply({}, false))));
      else if (a === 'mark-paid') row.appendChild(button(plan.move === 'verify-payment' ? 'Yes, it is paid' : 'It is paid now', primary, move(async () => { const saved = await saveResolution(env, FlowResolution.markPaid(st, t), null); if (saved) await advanceResolution(ctx, saved, saved.state); })));
      else if (a === 'not-paid') row.appendChild(button('Not yet', 'ghost', move(async () => { const saved = await saveResolution(env, FlowResolution.markNotPaid(st, t), null); if (saved) await advanceResolution(ctx, saved, saved.state); })));
      else if (a === 'request-issuer') row.appendChild(button('Ask ' + (plan.issuer.name || plan.issuer.email) + ' to issue it', primary, move(async () => {
        const dateText = null;
        const body = FlowResolution.issuerRequestDraft(env.need, env.facts, plan.issuer, { dateText });
        const res = await draftTo(plan.issuer.email, plan.issuer.name, (he ? 'בקשה: ' : 'Request: ') + env.need.label + (env.facts.senderName ? ' - ' + env.facts.senderName : ''), body, {});
        if (!(res && res.ok)) { receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not create the draft. Try again in a moment.', null); return; }
        const next = FlowResolution.recordRequest(st, t, plan.issuer.name || plan.issuer.email, plan.issuer.email);
        await saveResolution(env, next, { line: 'Draft to ' + (plan.issuer.name || plan.issuer.email) + ' is ready. Not sent. I will look again when you open this thread.', move: 'await-issuer' });
        track('follow_resolution_requested');
        receipt('Draft to ' + (plan.issuer.name || plan.issuer.email) + ' is ready in Gmail. Nothing was sent. This stays open until the ' + env.need.label + ' reaches ' + (env.facts.senderName || 'them') + '.', null);
      })));
      else if (a === 'chase-issuer') row.appendChild(button('Remind ' + (plan.issuer.name || plan.issuer.email), primary, move(async () => {
        const days = plan.quietDays || Math.max(1, Math.floor((t - (st.requestedAt || t)) / 86400000));
        const body = FlowResolution.issuerChaseDraft(env.need, env.facts, plan.issuer, { days });
        const res = await draftTo(plan.issuer.email, plan.issuer.name, (he ? 'תזכורת: ' : 'Reminder: ') + env.need.label + (env.facts.senderName ? ' - ' + env.facts.senderName : ''), body, {});
        if (!(res && res.ok)) { receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not create the draft. Try again in a moment.', null); return; }
        await saveResolution(env, FlowResolution.recordChase(st, t), { line: 'Reminder to ' + (plan.issuer.name || plan.issuer.email) + ' is ready. Not sent. I will look again in a few days.', move: 'await-issuer' });
        track('follow_resolution_chased');
        receipt('Reminder to ' + (plan.issuer.name || plan.issuer.email) + ' is ready in Gmail. Nothing was sent.', null);
      })));
      else if (a === 'issue-myself') { const issuing = FlowResolution.doneDefinition(env.need, env.facts).attests === 'payment'; row.appendChild(button(issuing ? 'I will issue it' : 'I will send it', idx === 0 ? 'primary' : 'ghost', move(async () => { const next = FlowResolution.recordOwnerIssuing(st, t); await saveResolution(env, next, { line: 'Waiting for you to ' + (issuing ? 'issue' : 'send') + ' the ' + env.need.label + '.', move: 'await-owner-issue' }); receipt('Noted. I will close this when you send the ' + env.need.label + ' as a file.', null); }))); }
      else if (a === 'set-issuer') {
        const input = el('input', 'flow-fu-input');
        input.type = 'email'; input.placeholder = he ? 'כתובת מי שמפיק לכם קבלות' : 'Address of whoever issues your receipts'; input.setAttribute('aria-label', input.placeholder);
        h.insertBefore(input, row);
        row.appendChild(button('Save and ask them', primary, move(async () => {
          const saved = await FlowStorage.setIssuer(env.need.object, { email: input.value, name: null });
          if (!saved) { input.setAttribute('aria-invalid', 'true'); return; }
          await advanceResolution(ctx, env, st);
        })));
      }
      else if (a === 'create-from-template' && ctx.openCreateCard) row.appendChild(button('Fill in the details', primary, () => { dismiss(); ctx.openCreateCard({ ask: { id: env.need.object, creatable: true, lang: env.need.lang, label: env.need.label, synonym: env.need.synonym, line: plan.line }, decision: plan.template, sender: env.sender, subject: env.subject, bodyText: env.text, threadId: env.threadId }); }));
    });
    row.appendChild(button('Not now', 'ghost', dismiss));
  }

  // An ask for a financial artifact in a thread with no loop, or a new message in a thread that carries a resolution.
  // Returns true when the resolution owns this message (nothing else should offer anything on it).
  async function considerResolution(ctx, last, sender, threadId, lastId, watch) {
    if (typeof FlowResolution === 'undefined' || typeof FlowFileAttach === 'undefined' || channelOf(ctx) !== 'gmail' || ctx.strict) return false;
    if (!sender.email || FlowFollowUp.isAutoReply('', sender.email)) return false;
    if (watch && !(watch.resolution && watch.status === 'waiting')) return false;
    const text = ctx.messageText(last);
    let need = null;
    let facts = null;
    let state = null;
    if (watch) {
      // The path is already open: plan it again from what is true now.
      state = watch.resolution;
      const m = FlowFileAttach.mention(state.label || state.object);
      need = { object: state.object, label: state.label, lang: state.lang || 'en', synonym: m ? m.synonym : [state.label] };
      facts = { senderName: (watch.counterpart && watch.counterpart.name) || sender.name || null, amount: watch.amount || null };
    } else {
      const g = FlowFileAttach.gate(text);
      if (g.kind !== 'clear' || !FlowResolution.owns(g.ask.id)) return false;
      need = needOf(g.ask);
      const ex = typeof FlowExtract !== 'undefined' ? FlowExtract : null;
      const money = ex && ex.parseMoney ? ex.parseMoney(text) : null;
      facts = { senderName: sender.name || null, amount: money ? { value: money.value, currency: money.currency || null, raw: money.raw } : null };
      state = FlowResolution.open(need, facts, Date.now());
    }
    const key = threadId + '|' + lastId;
    if (examinedResolution.has(key)) return true;
    examinedResolution.add(key);
    const env = { need, facts, state, watch, sender, threadId, lastId, subject: ctx.subject, threadUrl: ctx.threadUrl(lastId), text, what: String(text).replace(/\s+/g, ' ').trim().slice(0, 160), personKey: (watch && watch.personKey) || null };
    const world = await resolutionWorld(ctx, sender, env);
    const plan = planFor(env, world);
    if (watch) {
      // Say it again only when the move changed, and keep the stored line true. A held loop stays quiet.
      if (state.move === plan.move) return true;
      const saved = await saveResolution(env, state, plan);
      if (saved) resolutionCard(ctx, saved, plan, world);
      return true;
    }
    track('follow_resolution_planned');
    resolutionCard(ctx, env, plan, world);
    return true;
  }


  // The issuer you asked answers in a thread of its own, with the file. One card: reply to the person who asked, with that file.
  // Nothing is attached or sent without the tap, and the loop stays open until you send it.
  const examinedIssuer = new Set();
  async function issuerReply(ctx, last, sender, threadId, lastId) {
    if (typeof FlowResolution === 'undefined' || channelOf(ctx) !== 'gmail' || ctx.strict || !sender.email) return false;
    const key = threadId + '|' + lastId;
    if (examinedIssuer.has(key)) return false;
    examinedIssuer.add(key);
    if (examinedIssuer.size > 400) examinedIssuer.clear();
    const watches = await FlowStorage.getWatches();
    const text = ctx.messageText(last);
    const atts = ctx.attachmentsOf ? ctx.attachmentsOf(last) : null;
    const m = atts && atts.length ? FlowResolution.matchIssuerReply(watches, { senderEmail: sender.email, text, attachments: atts }) : null;
    if (!m) return await issuerWords(ctx, watches, sender, text, atts);
    const w = m.watch;
    const need = { object: w.resolution.object, label: w.resolution.label, lang: w.resolution.lang || 'en' };
    const facts = { senderName: (w.counterpart && w.counterpart.name) || null, amount: w.amount || null };
    const who = FlowFollowUp.firstName(w.counterpart && w.counterpart.name, w.counterpart && w.counterpart.email) || 'them';
    const h = card(need.lang === 'he');
    h.appendChild(el('div', 'flow-fu-title', (sender.name || sender.email) + ' sent the ' + need.label));
    h.appendChild(el('div', 'flow-fu-line', m.file.filename + ' answers your request for ' + who + '. Reply to ' + who + ' with it? A draft, not sent.'));
    const row = el('div', 'flow-fu-actions');
    row.appendChild(button('Prepare reply to ' + who + ' with it', 'primary', async () => {
      const fetched = ctx.fetchAttachment ? await ctx.fetchAttachment(m.file) : null;
      const voice = { counterpart: w.counterpart, lang: need.lang };
      const attached = fetched ? m.file.filename : null;
      const res = await draftTo(w.counterpart.email, w.counterpart.name, w.subject, await voiced(FlowResolution.replyDraft(need, facts, { fileName: attached }), voice), fetched ? { attachment: fetched } : {});
      if (!(res && res.ok)) { receipt(res && res.reason === 'not-connected' ? 'Open the Glance panel and connect Google first, then try again.' : 'Could not create the draft. Try again in a moment.', null); return; }
      const next = Object.assign({}, FlowResolution.recordPrepared(w.resolution, Date.now(), attached), { line: 'Draft to ' + who + ' is ready with ' + (attached || 'no file') + '. Not sent; I will close this when you send it.', move: 'prepare-reply-with-file' });
      await FlowStorage.updateWatch(w.id, { resolution: next });
      track('follow_resolution_issuer_file');
      receipt('Draft to ' + who + ' is ready in Gmail' + (attached ? ' with ' + attached : '') + '. Nothing was sent. I will close this when you send the ' + need.label + '.' + (attached ? '' : ' I could not read the file, so attach it yourself.'), null);
    }));
    row.appendChild(button('Not now', 'ghost', dismiss));
    h.appendChild(row);
    return true;
  }


  // The issuer wrote back WITHOUT a file that fits: read what they said with the same reply reader every loop uses. A promised day moves the
  // reminder to that day, a no sends the path looking for someone else, a question is flagged as yours. Nothing is attached, sent or closed.
  async function issuerWords(ctx, watches, sender, text, atts) {
    const mm = FlowResolution.matchIssuerMessage(watches, { senderEmail: sender.email, text });
    if (!mm) return false;
    const w = mm.watch;
    const now = Date.now();
    const m0 = typeof FlowFileAttach !== 'undefined' ? FlowFileAttach.mention(w.resolution.label || w.resolution.object) : null;
    const pseudo = { direction: 'theirs', kind: FlowFollowUp.KINDS.REPLY, lang: w.resolution.lang || 'en', what: 'Please issue the ' + w.resolution.label, file: { object: w.resolution.object, label: w.resolution.label, lang: w.resolution.lang || 'en', synonym: m0 ? m0.synonym : [w.resolution.label] } };
    const evidence = typeof FlowFilePath !== 'undefined' && atts ? FlowFilePath.evidence({ text, attachments: atts }) : null;
    const reply = FlowFollowUp.classifyReply(text, pseudo, { now, email: sender.email, evidence });
    const r = FlowResolution.readIssuerAnswer(w.resolution, reply, now, text);
    if (r.kind === 'none' || r.kind === 'file') return false;
    const move = r.kind === 'declined' ? 'name-issuer' : 'await-issuer';
    const resolution = Object.assign({}, r.state, { line: r.line, move });
    const next = (await FlowStorage.updateWatch(w.id, { resolution })) || Object.assign({}, w, { resolution });
    if (r.kind === 'promised' && r.state.issuerPromisedIso) await moveTask(next, r.state.issuerPromisedIso);
    track('follow_resolution_issuer_' + r.kind);
    receipt(r.line, null);
    return true;
  }

  // The newest message is mine, in a thread that carries a resolution: did I really deliver it?
  async function resolutionDelivery(ctx, watch, last, lastId) {
    const text = ctx.ownMessageText(last);
    const attachments = ctx.attachmentsOf ? ctx.attachmentsOf(last) : null;
    const verdict = FlowResolution.judgeDelivery(watch.resolution, { text, attachments });
    if (verdict.close) {
      const patch = Object.assign({ messageId: lastId }, FlowResolution.closePatch(watch.resolution, Date.now(), verdict));
      const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
      if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
      track('follow_resolved');
      const to = FlowFollowUp.firstName(watch.counterpart && watch.counterpart.name, watch.counterpart && watch.counterpart.email);
      receipt('Sent' + (to ? ' to ' + to : '') + ': ' + (verdict.files && verdict.files[0] ? verdict.files[0] : watch.resolution.label) + '. Loop closed.', null, { label: 'Reopen', run: () => reopen(next) });
      return;
    }
    await FlowStorage.updateWatch(watch.id, { messageId: lastId });
    if (verdict.reason === 'claimed-not-attached') receipt('Your message says the ' + watch.resolution.label + ' is attached, but nothing is attached. I kept this open.', null);
    else if (verdict.ask) {
      const h = card(watch.lang === 'he');
      h.appendChild(el('div', 'flow-fu-title', 'Did the ' + watch.resolution.label + ' go out?'));
      h.appendChild(el('div', 'flow-fu-line', verdict.reason === 'cannot-see-attachments' ? 'I cannot see what was attached to your message, so I kept this open.' : 'The file you sent is not named as a ' + watch.resolution.label + ', so I kept this open.'));
      const row = el('div', 'flow-fu-actions');
      row.appendChild(button('Yes, it is done', 'primary', async () => {
        const patch = FlowResolution.closePatch(watch.resolution, Date.now(), { files: verdict.files || [], manual: true });
        const next = (await FlowStorage.updateWatch(watch.id, patch)) || Object.assign({}, watch, patch);
        if (watch.taskRef) await send({ type: 'flow:follow-complete', ref: watch.taskRef });
        receipt('Marked done by you. Loop closed.', null, { label: 'Reopen', run: () => reopen(next) });
      }));
      row.appendChild(button('Not yet', 'ghost', dismiss));
      h.appendChild(row);
    }
  }

  // ctx: { messages, ownEmail, extractSender(node), ownMessageText(node),
  //        messageText(node), threadIdFrom(node), subject, threadUrl(id) }
  async function consider(ctx) {
    if (typeof FlowFollowUp === 'undefined' || typeof FlowStorage === 'undefined') return;
    await loadAdapt();
    const msgs = ctx && ctx.messages;
    if (!msgs || !msgs.length || !(ctx.ownEmail || ctx.isOwn)) return;

    const last = msgs[msgs.length - 1];
    const sender = ctx.extractSender(last);
    const lastIsOwn = isOwnNode(ctx, last);
    const threadId = ctx.threadIdFrom(last);
    if (!threadId) return;
    const lastId = idOf(ctx, last);
    const stateKey = threadId + '|' + lastId + '|' + (lastIsOwn ? 'own' : 'theirs');
    if (examined.has(stateKey)) return;
    examined.add(stateKey);
    if (examined.size > 400) examined.clear();
    if (lastIsOwn) learnStyle(ctx.ownMessageText(last));
    await observeWho(ctx, last, lastIsOwn);
    const watch = await FlowStorage.getWatch(threadId);
    if (watch && (await taskDone(watch))) return;

    // They wrote last. What did the answer do to the loop?
    if (!lastIsOwn) {
      // A bank or payment provider telling you money arrived settles a payment loop in another thread.
      if (await paymentSignal(ctx, last, sender)) return;
      // The issuer you asked for a receipt answered here, with the file.
      if (await issuerReply(ctx, last, sender, threadId, lastId)) return;
      // A request that takes more than one step (a receipt): plan the path, or plan it again.
      if (await considerResolution(ctx, last, sender, threadId, lastId, watch)) return;
      let target = watch;
      // Their answer came in a thread of its own ("Re:" dropped, a fresh message):
      // follow the story, not the thread.
      if (!target) target = await storyFor(ctx, last, sender);
      // Not a loop of this conversation at all: it may still be the answer to one opened in another app.
      if (!target && (await crossChannel(ctx, last, sender, threadId, lastId))) return;
      if (target && target.status === 'waiting' && !FlowFollowUp.isMine(target) && !FlowFollowUp.isClock(target) && !(target.lastReplyMessageId && target.lastReplyMessageId === lastId) && !settling.has(target.id)) {
        settling.add(target.id);
        try { await handleReply(ctx, target, lastId); } finally { settling.delete(target.id); }
      }
      return;
    }

    // My own message is newest.
    if (watch) {
      if (watch.status === 'waiting') {
        if (lastId && watch.messageId !== lastId) {
          const text = ctx.ownMessageText(last);
          // They had asked me something; this message is my answer. The ball goes back.
          if (FlowFollowUp.isYours(watch)) { await handedBack(watch, lastId); return; }
          // A promise of mine: a newer message that delivers it keeps it.
          if (FlowFollowUp.isMine(watch) && watch.resolution && typeof FlowResolution !== 'undefined') { await resolutionDelivery(ctx, watch, last, lastId); return; }
          if (FlowFollowUp.isMine(watch)) {
            const ev = typeof FlowFilePath !== 'undefined' && ctx.attachmentsOf ? FlowFilePath.evidence({ text, attachments: ctx.attachmentsOf(last) }) : null;
            if (FlowFollowUp.deliversFor(watch, text, ev)) await kept(watch, lastId);
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
    // A hand-made chase with no loop behind it: whatever you asked earlier was an ask we missed.
    if (!watch && FlowFollowUp.looksLikeChase(mineText)) learnMissedAsk(ctx, last, threadId);
    // You delivered something where no promise loop exists: an earlier sentence of yours promised it.
    if (!watch && FlowFollowUp.deliversPromise(mineText)) learnMissed(ctx, last, threadId, 'missedPromise');
    const cls = { now: Date.now(), extract: typeof FlowExtract !== 'undefined' ? FlowExtract : null };
    // What I asked of them comes first; if I asked nothing, what I promised them.
    let ask = FlowFollowUp.classifyOutgoing(mineText, cls) || FlowFollowUp.classifyCommitment(mineText, cls);
    // A new surface (a chat) is stricter than Gmail until it has been measured: word-list asks only, no model tiers, no question.
    if (!ask && !watch && !ctx.strict) ask = await lmAsk(mineText);
    recordDecision(mineText, Boolean(ask), key);
    if (!ask) { if (!watch && !ctx.strict) considerQuestion(ctx, last, mineText, threadId, lastId); return; }
    if (ctx.strict && (ask.tier === 'model' || ask.tier === 'lm')) return;
    offered.add(key);

    // The same story already has a loop in another thread: never a second one.
    const kin = ask.direction === 'theirs' ? await storyFor(ctx, last, counterpartIn(ctx, last)) : null;
    if (kin) {
      if (FlowFollowUp.looksLikeChase(mineText)) {
        const patch = FlowFollowUp.recordNudge(kin, Date.now());
        const next = (await FlowStorage.updateWatch(kin.id, patch)) || Object.assign({}, kin, patch);
        await moveTask(next, patch.chaseIso);
        receipt('Chase noted on the same story. I will look again on ' + dayLabel(patch.chaseIso) + '.', null);
      }
      return;
    }

    const base = {
      threadId,
      messageId: lastId,
      subject: ctx.subject,
      counterpart: counterpartIn(ctx, last),
      channel: channelOf(ctx),
      threadUrl: ctx.threadUrl(lastId)
    };
    base.personKey = await personKeyFor(Object.assign({ channel: channelOf(ctx) }, base.counterpart));

    const status = await send({ type: 'flow:pro-status' });
    const list = await FlowStorage.getWatches();
    // When to look again, learned from how long THIS person has taken before (new people: the default).
    ask = FlowFollowUp.personalChase(ask, list, base.personKey || (base.counterpart && base.counterpart.email), Date.now());
    const active = list.filter(FlowFollowUp.isActive).length;
    const gate = FlowEntitlements.watchGate(active, status && status.record, Date.now());
    if (!gate.allowed) { await capCard(gate.used, gate.cap); return; }
    offerCard(ask, base);
  }

  return { consider, considerClock, dismiss };
})();
