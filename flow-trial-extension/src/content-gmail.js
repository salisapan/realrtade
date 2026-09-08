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
  }

  function stopWatching() {
    if (observer) { observer.disconnect(); observer = null; }
    watching = false;
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

    // A live chip already sitting in this exact node means there is nothing
    // to do — this is the fast path that avoids re-running judgment on every
    // debounced mutation while a chip is already showing.
    if (message.querySelector('.flow-chip-host')) return;

    const legacyId = message.getAttribute('data-legacy-message-id');
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
      threadUrl: threadUrl(legacyId)
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

  function injectChip(messageNode, ctx) {
    if (messageNode.querySelector('.flow-chip-host')) return;

    const host = el('div', 'flow-chip-host');
    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'flow-chip-label', 'Do It: ' + ctx.result.label));

    const conn = FLOW_CONNECTORS.find((c) => c.id === state.connectorId);
    if (conn) chip.appendChild(el('span', 'flow-chip-target', conn.label));

    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');

    chip.addEventListener('click', () => onDoIt(host, chip, ctx));
    dismiss.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(host, ctx); });

    host.appendChild(chip);
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
        threadUrl: ctx.threadUrl
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

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.onboarded || changes.domainId || changes.connectorId) init();
  });

  init();
})();
