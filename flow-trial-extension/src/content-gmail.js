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

  async function init() {
    state = await FlowStorage.get();
    if (!state.onboarded) return; // no chips until something is actually connected
    if (!watching) { watching = true; observe(); }
  }

  function observe() {
    new MutationObserver(debounce(scanReadingPane, 400)).observe(document.body, { childList: true, subtree: true });
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
    // not "re-judge the entire history on every DOM mutation".
    const message = messages[messages.length - 1];
    const legacyId = message.getAttribute('data-legacy-message-id');
    const messageId = legacyId || hashNode(message);
    if (!messageId || (await FlowStorage.wasSeen(messageId))) return;

    const text = (message.innerText || '').trim();
    if (text.length < 20) return; // still rendering

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
    FlowStorage.appendLog({ kind: 'shown', label: result.label, messageId, score: result.score, signals: result.signals });
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
        return;
      }
      if (response.reason === 'connector-not-live') setChipState(chip, 'flow-chip-warn', 'That connector isn’t wired up yet.');
      else if (response.reason === 'not-connected') setChipState(chip, 'flow-chip-warn', 'Connect a system in the Flow popup first.');
      else if (response.reason === 'no-matching-contact') setChipState(chip, 'flow-chip-warn', 'No matching contact for ' + (ctx.sender.email || 'this sender') + '.');
      else setChipState(chip, 'flow-chip-error', response.error || 'Couldn’t complete that action.');
    });
  }

  function onDismiss(host, ctx) {
    host.remove();
    FlowStorage.appendLog({ kind: 'dismissed', label: ctx.result.label, messageId: ctx.messageId, score: ctx.result.score });
    FlowStorage.calibrate('dismiss');
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.onboarded || changes.domainId || changes.connectorId) init();
  });

  init();
})();
