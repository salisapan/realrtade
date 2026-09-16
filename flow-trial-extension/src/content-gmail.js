// Runs on mail.google.com. Watches the message open in the reading pane and,
// when the on-device judgment engine finds a real reason, injects a single
// Do It chip — never a popup, never a second confirmation step, never a
// paragraph to read.
//
// Honesty about fragility: Gmail's DOM has no public contract and changes
// without notice. The selectors below read the current structure (role="main"
// reading pane, div[role="listitem"] messages, the `email` attribute on the
// sender span, h2.hP for the subject). If Gmail changes, this degrades to "the
// chip stops appearing" — never to a crash and never to a wrong write, because
// judgment only ever reads text and the write path only ever adds a record.

(function flowGmailWatcher() {
  let state = null;
  let watching = false;
  let observer = null;

  // The reading pane's currently open thread, refreshed on every
  // scanReadingPane() pass — this is what Feature 2 (Draft-It) and Feature 4
  // (Next-Step) act on, independent of whether the on-device judgment engine
  // found anything worth a chip for. A user asking Glance to draft a reply
  // isn't asking "was this a decision" — they're asking about whatever
  // message is in front of them right now.
  let currentContext = null; // { message, messages, sender, subject, legacyId }

  async function init() {
    state = await FlowStorage.get();
    // Disconnecting a connector in the popup flips onboarded back to false
    // and fires the onChanged listener below, which calls init() again —
    // this is the only place that transition is handled, so it has to
    // actually tear the observer down, not just decline to start a new one.
    // Without this, the observer created by observe() below keeps running
    // forever: watching never goes back to false, so scanReadingPane's own
    // guard never trips, and Flow keeps injecting chips whose "Do It" click
    // is now guaranteed to fail (state.connectorId is null once disconnected).
    if (!state.onboarded) { stopWatching(); return; }
    if (!watching) { watching = true; observe(); }
    // mountSidebar() is off — see the note at wireAttachmentHoverCards()'s
    // call site in scanReadingPane() for why the whole sidebar surface
    // (badge, Draft-It, attachment X-ray) is cut, not just styled.
  }

  function stopWatching() {
    if (observer) { observer.disconnect(); observer = null; }
    watching = false;
    currentContext = null;
    if (typeof FlowSidebar !== 'undefined') FlowSidebar.unmount();
  }

  // Mounted once per tab, idempotent (FlowSidebar.mount() itself no-ops if
  // already attached). Feature 1's badge appears the moment the sidebar
  // mounts — it isn't gated behind the judgment engine finding anything,
  // since "the shield is active" is true for every message Glance ever
  // reads, not only the ones that clear the chip threshold.
  function mountSidebar() {
    if (typeof FlowSidebar === 'undefined') return; // degrade silently, same policy as the chip system below
    FlowSidebar.mount();
    FlowSidebar.renderDraft('idle', { onDraft: handleDraftIt });
  }

  function observe() {
    observer = new MutationObserver(debounce(scanReadingPane, 400));
    observer.observe(document.body, { childList: true, subtree: true });
    scanReadingPane();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function extractSender(messageNode) {
    const el = messageNode.querySelector('[email]');
    if (!el) return { email: null, name: null };
    return { email: el.getAttribute('email'), name: el.getAttribute('name') || el.textContent.trim() };
  }

  // Gmail renders any recipient who is the signed-in account as the literal
  // text "me" rather than their name, on every message that arrived TO them.
  // That gives a way to read the account's own address without any
  // account-detection hack: scan the thread for a "me"-labeled [email] node.
  function ownEmailFromThread(messages) {
    for (const m of messages) {
      const els = m.querySelectorAll('[email]');
      for (const el of els) {
        if ((el.textContent || '').trim() === 'me') return el.getAttribute('email');
      }
    }
    return null;
  }

  function currentSubject() {
    const h = document.querySelector('h2.hP') || document.querySelector('div[role="main"] h2');
    return h ? h.textContent.trim() : '';
  }

  // Gmail's #all/<id> route resolves a legacy message id from any label, which
  // makes the link in the written record survive archiving.
  function threadUrl(legacyId) {
    if (!legacyId) return null;
    const m = location.pathname.match(/\/mail\/u\/(\d+)/);
    return 'https://mail.google.com/mail/u/' + (m ? m[1] : '0') + '/#all/' + legacyId;
  }

  async function scanReadingPane() {
    if (!watching) return;
    const main = document.querySelector('div[role="main"]');
    if (!main) return;

    const messages = main.querySelectorAll('div[role="listitem"]');
    if (!messages.length) return;

    // Only the newest message in the thread — this mirrors "an email arrived",
    // not "re-judge the entire history on every DOM mutation". But the newest
    // *node* is your own reply the moment you send one, and judging it as an
    // incoming decision meant Flow looked up your own address as the sender
    // and re-offered to log whatever the thread was already about. Walking
    // backward for the newest message that isn't from the account itself
    // finds the thing this scanner exists to react to: mail that arrived.
    const ownEmail = ownEmailFromThread(messages);
    let message = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      const candidateSender = extractSender(candidate);
      if (ownEmail && candidateSender.email && candidateSender.email.toLowerCase() === ownEmail.toLowerCase()) continue;
      message = candidate;
      break;
    }
    if (!message) return; // every visible message in the thread is the account's own outbound mail

    const legacyId = message.getAttribute('data-legacy-message-id');

    // A stale Feature 3 hover card is otherwise left floating in
    // document.body: it's appended independent of the chip's own DOM
    // subtree, so it doesn't get cleaned up just because Gmail replaces the
    // message node it was hovering over when the user opens a new thread.
    const messageChanged = !currentContext || currentContext.message !== message;
    if (messageChanged && typeof FlowSidebar !== 'undefined') FlowSidebar.hideFloatingCard();

    // Refreshed on every pass, independent of the chip early-returns below —
    // Draft-It and Next-Step act on "whatever thread is open", not on
    // whether this particular message cleared the judgment threshold.
    currentContext = {
      message, messages,
      sender: extractSender(message),
      subject: currentSubject(),
      legacyId,
      messageId: legacyId || hashNode(message),
      threadUrl: threadUrl(legacyId)
    };
    // wireAttachmentHoverCards(message) is off — Draft-It and the attachment
    // X-ray both depend on the same glance-assist backend call, and that call
    // isn't reliably configured yet ("This feature is not configured yet"
    // reaching the card in practice). Cutting the whole sidebar surface
    // (badge, Draft-It, this hover card) rather than shipping a feature that
    // errors on click — the chip's own write is the one path proven to work
    // end to end. Re-enable both this call and mountSidebar() in init() once
    // glance-assist is confirmed working.

    // A live chip already sitting in this exact node means there is nothing
    // to do — this is the fast path that avoids re-running judgment on every
    // debounced mutation while a chip is already showing.
    if (message.querySelector('.flow-chip-host')) return;

    const messageId = legacyId || hashNode(message);
    if (!messageId) return;

    // A message can reach "seen" with no live chip in front of you two very
    // different ways: you dismissed it, or Gmail rebuilt the DOM out from
    // under it. Those call for opposite responses, so the check below asks
    // "did the user ever take a final action on this message" rather than
    // "have we looked at this message before" — see hasTerminalOutcome for
    // why "seen" alone used to make a rebuilt node's chip unrecoverable.
    if (await FlowStorage.hasTerminalOutcome(messageId)) return;

    const text = (message.innerText || '').trim();
    if (text.length < 20) return; // still rendering

    // Captured before markSeen flips it, so it still answers "is this the
    // first time," which is what decides whether to log 'shown' below.
    const alreadyLoggedShown = await FlowStorage.wasSeen(messageId);
    await FlowStorage.markSeen(messageId);

    state = await FlowStorage.get();
    const sender = extractSender(message);
    const subject = currentSubject();
    const result = FlowJudgment.evaluate(text, state.domainId, {
      senderEmail: sender.email,
      subject,
      calibration: state.calibration
    });
    if (!result) return;

    injectChip(message, {
      messageId, result, sender, subject,
      threadUrl: threadUrl(legacyId),
      // Snapshotted now, not re-read from the DOM at click time — by the
      // time "Do It" is clicked the chip's own ctx has no live node
      // reference to this message (only messageId/result/sender/subject),
      // and Gmail may have long since rebuilt or removed it anyway.
      bodyText: text
    });
    // Re-injecting after Gmail rebuilds the node is now expected behaviour,
    // not a rare edge case — logging 'shown' again every time would fill the
    // 200-entry cap with duplicates for one message and evict real history
    // for others. Only record it the first time.
    if (!alreadyLoggedShown) {
      FlowStorage.appendLog({ kind: 'shown', label: result.label, messageId, score: result.score, signals: result.signals });
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_shown', params: { domain: state.domainId } });
    }
  }

  function hashNode(node) {
    const s = (node.innerText || '').slice(0, 120);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'h' + h;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // The Hebrew sentence that sits next to the "Do It" button, explaining what
  // Flow found — generated from the same facts (amount, date) the record
  // itself will carry, not a translation of ctx.result.label (which stays
  // English; it's the Notion/Slack/etc. page title, not UI copy). "Do It"
  // itself is deliberately left untranslated in the button — see chip.css's
  // header comment.
  function heLead(result, connLabel) {
    const f = (result && result.facts) || {};
    let what;
    if (f.lost) what = 'לתעד שהעסקה לא יוצאת לפועל';
    else if (f.moneyText && f.dateText) what = 'לתעד ' + f.moneyText + ', ' + f.dateText;
    else if (f.moneyText) what = 'לתעד סכום של ' + f.moneyText;
    else if (f.dateText) what = 'לתעד תאריך ' + f.dateText;
    else what = 'לתעד את ההחלטה הזו';
    return 'Flow זיהה: ' + what + (connLabel ? ' ב-' + connLabel : '') + '?';
  }

  function injectChip(messageNode, ctx) {
    if (messageNode.querySelector('.flow-chip-host')) return;

    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', 'rtl');

    const conn = FLOW_CONNECTORS.find((c) => c.id === state.connectorId);
    host.appendChild(el('p', 'flow-chip-text', heLead(ctx.result, conn ? conn.label : null)));

    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.setAttribute('dir', 'ltr');
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', 'Do It'));
    chip.addEventListener('click', () => onDoIt(host, chip, ctx));
    host.appendChild(chip);

    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, ctx); });
    host.appendChild(dismiss);

    messageNode.insertBefore(host, messageNode.firstChild);
  }

  function setChipState(chip, cls, text) {
    chip.className = 'flow-chip ' + cls;
    chip.replaceChildren(el('span', 'flow-chip-label', text));
  }

  // After a successful write the chip stops being a button and becomes a receipt:
  // what was written, where, a link to it, and a way to take it back. A tool that
  // writes to your CRM and then says nothing is a tool nobody trusts twice.
  function showReceipt(host, ctx, res) {
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    done.appendChild(el('span', 'flow-chip-label', 'Logged to ' + res.where + ' · ' + res.target));

    const actions = el('span', 'flow-chip-actions');
    if (res.url) {
      const view = el('a', 'flow-chip-link', 'View');
      view.href = res.url; view.target = '_blank'; view.rel = 'noopener';
      actions.appendChild(view);
    }
    const undo = el('button', 'flow-chip-link', 'Undo');
    undo.type = 'button';
    undo.addEventListener('click', () => {
      undo.textContent = 'Undoing…';
      chrome.runtime.sendMessage({ type: 'flow:undo-action', connectorId: ctx.connectorId, ref: res.ref }, (r) => {
        if (r && r.ok) {
          done.replaceChildren(el('span', 'flow-chip-label', 'Undone — nothing was kept'));
          FlowStorage.appendLog({ kind: 'undone', label: ctx.result.label, messageId: ctx.messageId });
        } else {
          undo.textContent = 'Undo failed';
        }
      });
    });
    actions.appendChild(undo);
    done.appendChild(actions);

    host.replaceChildren(done);
  }

  function onDoIt(host, chip, ctx) {
    ctx.connectorId = state.connectorId;
    setChipState(chip, 'flow-chip-pending', 'Working…');
    FlowStorage.appendLog({ kind: 'clicked', label: ctx.result.label, messageId: ctx.messageId, score: ctx.result.score });
    FlowStorage.calibrate('click');
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_clicked', params: { domain: state.domainId } });

    chrome.runtime.sendMessage({
      type: 'flow:execute-action',
      payload: {
        connectorId: state.connectorId,
        label: ctx.result.label,
        facts: ctx.result.facts,
        senderEmail: ctx.sender.email,
        senderName: ctx.sender.name,
        subject: ctx.subject,
        threadUrl: ctx.threadUrl,
        // Only used, on the background-script side, to test a destination
        // select column's own option names against the message — never sent
        // to any third party as free text (Notion API calls get discrete
        // property values, not this string; see notionProperties()). Read
        // from ctx.bodyText — the snapshot injectChip() took at scan time,
        // not the live DOM: this ctx never carried a `message` node
        // reference (only messageId/result/sender/subject/threadUrl).
        bodyText: (ctx.bodyText || '').slice(0, 20000)
      }
    }, (response) => {
      if (!response) { setChipState(chip, 'flow-chip-error', 'Something went wrong. Try again.'); return; }
      if (response.ok) {
        showReceipt(host, ctx, response);
        FlowStorage.appendLog({ kind: 'written', label: ctx.result.label, messageId: ctx.messageId, where: response.where, url: response.url, ref: response.ref, connectorId: state.connectorId });
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'write_completed', params: { domain: state.domainId, connector: state.connectorId } });
        return;
      }
      if (response.reason === 'connector-not-live') setChipState(chip, 'flow-chip-warn', 'That connector isn’t wired up yet.');
      else if (response.reason === 'not-connected') setChipState(chip, 'flow-chip-warn', 'Connect a system in the Glance popup first.');
      else if (response.reason === 'no-matching-contact') setChipState(chip, 'flow-chip-warn', 'No matching contact for ' + (ctx.sender.email || 'this sender') + '.');
      else setChipState(chip, 'flow-chip-error', response.error || 'Couldn’t complete that action.');
    });
  }

  function onDismiss(host, ctx) {
    host.remove();
    FlowStorage.appendLog({ kind: 'dismissed', label: ctx.result.label, messageId: ctx.messageId, score: ctx.result.score });
    FlowStorage.calibrate('dismiss');
    chrome.runtime.sendMessage({ type: 'flow:track', event: 'chip_dismissed', params: { domain: state.domainId } });
  }

  /* ------------------------------------------------------- Feature 2: Draft-It */

  function messageBodyText(node) {
    return (node.innerText || '').trim();
  }

  // Current message first, then up to 3 prior messages walking backward
  // through the thread — "current + up to 3 prior emails" is the spec as
  // written, and walking backward from the open message is the only order
  // that matches "the messages that led up to this one."
  function harvestThreadBodies(ctx) {
    const idx = Array.prototype.indexOf.call(ctx.messages, ctx.message);
    const bodies = [messageBodyText(ctx.message)];
    if (idx < 0) return bodies;
    for (let i = idx - 1, n = 0; i >= 0 && n < 3; i--, n++) bodies.push(messageBodyText(ctx.messages[i]));
    return bodies;
  }

  async function handleDraftIt() {
    if (typeof FlowSidebar === 'undefined') return;
    if (!currentContext || !currentContext.message) {
      FlowSidebar.renderDraft('error', { message: 'Open an email to draft a reply.', onDraft: handleDraftIt });
      return;
    }

    FlowSidebar.renderDraft('loading');
    const ctx = currentContext;
    const bodies = harvestThreadBodies(ctx);
    // maskBatch(), not N independent mask() calls — see privacyShield.js's
    // own comment on why the token space has to be shared across the whole
    // thread rather than per-message, or the same person named in two
    // messages could mint two different tokens (or worse, two different
    // people could collide on the same one).
    const batch = FlowPrivacyShield.maskBatch(bodies);
    const entries = batch.maskedTexts.map((maskedText, i) => ({ position: i === 0 ? 'current' : 'previous', maskedBody: maskedText }));
    const lang = FlowSidebar.isRTLText(bodies[0]) ? 'he' : 'en';

    chrome.runtime.sendMessage({ type: 'flow:draft-reply', payload: { lang, entries } }, (response) => {
      if (!response || !response.ok) {
        FlowSidebar.renderDraft('error', { message: (response && response.error) || 'Could not draft a reply.', onDraft: handleDraftIt });
        return;
      }
      // The one place a real name/amount/date is reconstructed for this
      // feature — entirely client-side, from the tokenMap this tab built
      // and never sent anywhere. See glance-assist.js and privacyShield.js
      // for the two ends of this contract.
      const draftText = FlowPrivacyShield.unmask(response.draftText, batch.tokenMap);
      FlowSidebar.renderDraft('ready', { text: draftText, onInsert: insertDraftIntoReplyBox, onDraft: handleDraftIt });
      chrome.runtime.sendMessage({ type: 'flow:track', event: 'draft_generated', params: { domain: state.domainId } });
    });
  }

  // Gmail marks its own compose/reply editor with role="textbox" on a
  // contenteditable div — a stable, Gmail-set attribute, the same kind of
  // anchor this file already leans on for [email] above rather than one of
  // Gmail's internal, unstable class names.
  function findComposeBox() {
    const boxes = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
    return boxes.length ? boxes[boxes.length - 1] : null; // the most recently opened one is the active one
  }

  function insertDraftIntoReplyBox(text) {
    const box = findComposeBox();
    if (!box) {
      FlowSidebar.renderDraft('error', { message: 'Open Reply in Gmail first, then Insert into Reply.', onDraft: handleDraftIt });
      return;
    }
    box.focus();
    // execCommand is deprecated but still the one reliable way to make
    // Gmail's own editor notice the change — a raw textContent assignment
    // bypasses the input events its autosave and character counter are
    // listening for, so it's kept as a fallback rather than the first try.
    const inserted = document.execCommand && document.execCommand('insertText', false, text);
    if (!inserted) {
      box.textContent = text;
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  /* ------------------------------------------------- Feature 3: attachment X-ray */

  // Gmail marks a real attachment's download link with a `download_url`
  // attribute shaped "mime/type:filename.ext:https://...url" — a stable,
  // Gmail-set attribute, not one of Gmail's internal minified class names.
  function findAttachmentChips(messageNode) {
    return Array.from(messageNode.querySelectorAll('[download_url]'));
  }

  function parseDownloadUrl(raw) {
    const parts = String(raw || '').split(':');
    if (parts.length < 3) return null;
    return { mimeType: parts[0], filename: parts[1], url: parts.slice(2).join(':') };
  }

  // Wired once per chip (chip.dataset.flowWired guards re-wiring on every
  // debounced re-scan) — a short hover delay before anything fires so a
  // cursor merely passing over a chip on its way elsewhere doesn't trigger a
  // fetch and a summarization call for every attachment in the message.
  function wireAttachmentHoverCards(messageNode) {
    if (typeof FlowSidebar === 'undefined') return;
    for (const chip of findAttachmentChips(messageNode)) {
      if (chip.dataset.flowWired) continue;
      chip.dataset.flowWired = '1';
      let hoverTimer = null;
      chip.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => onAttachmentHover(chip), 220);
      });
      chip.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        FlowSidebar.hideFloatingCard();
      });
    }
  }

  // download url -> { summary, entities } | 'unsupported', so re-hovering the
  // same chip in one session never refetches or re-summarizes it.
  const attachmentCache = new Map();

  async function onAttachmentHover(chip) {
    const meta = parseDownloadUrl(chip.getAttribute('download_url'));
    if (!meta) return;
    const rect = chip.getBoundingClientRect();

    const cached = attachmentCache.get(meta.url);
    if (cached === 'unsupported') {
      FlowSidebar.showFloatingCard(rect, { state: 'unsupported', message: 'Preview isn’t available for this file type yet.' });
      return;
    }
    if (cached) {
      FlowSidebar.showFloatingCard(rect, { state: 'ready', summary: cached.summary, entities: cached.entities });
      return;
    }

    const isDocx = /\.docx$/i.test(meta.filename) ||
      meta.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isDocx) {
      // PDFs (and every other type) land here today — see docreader.js's own
      // header for why PDF text extraction isn't attempted rather than
      // attempted unreliably.
      attachmentCache.set(meta.url, 'unsupported');
      FlowSidebar.showFloatingCard(rect, { state: 'unsupported', message: 'Preview isn’t available for this file type yet.' });
      return;
    }

    FlowSidebar.showFloatingCard(rect, { state: 'loading' });
    try {
      const res = await fetch(meta.url, { credentials: 'include' });
      if (!res.ok) throw new Error('attachment download failed (' + res.status + ')');
      const blob = await res.blob();
      const rawText = await FlowDocReader.extractDocxText(blob);
      if (!rawText.trim()) throw new Error('empty document');

      const masked = FlowPrivacyShield.mask(rawText);
      chrome.runtime.sendMessage({ type: 'flow:summarize-attachment', payload: { maskedText: masked.maskedText } }, (response) => {
        if (!response || !response.ok) {
          FlowSidebar.showFloatingCard(rect, { state: 'error', message: (response && response.error) || 'Couldn’t read this attachment.' });
          return;
        }
        const summary = FlowPrivacyShield.unmask(response.summary, masked.tokenMap);
        const entities = (response.entities || []).map(([k, v]) => [k, FlowPrivacyShield.unmask(v, masked.tokenMap)]);
        attachmentCache.set(meta.url, { summary, entities });
        FlowSidebar.showFloatingCard(rect, { state: 'ready', summary, entities });
        chrome.runtime.sendMessage({ type: 'flow:track', event: 'attachment_summarized', params: { domain: state.domainId } });
      });
    } catch (err) {
      FlowSidebar.showFloatingCard(rect, { state: 'error', message: 'Couldn’t read this attachment.' });
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.onboarded || changes.domainId || changes.connectorId) init();
  });

  init();
})();
