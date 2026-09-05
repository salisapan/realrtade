// Runs on mail.google.com. Watches the open message in the reading pane and,
// when the (currently stubbed) judgment engine recognizes something, injects
// the single Do It chip described in the spec — never a popup, never a
// second click to "confirm", never text the user has to read a paragraph of.
//
// Honesty about fragility: Gmail's DOM has no public class-name contract and
// changes without notice. The selectors below are a best-effort reading of
// the current DOM (role="main" reading pane, div[role="listitem"] messages,
// the `email` attribute Gmail puts on the sender's name span). If Gmail
// changes structure, this degrades to "chip stops appearing" — never to a
// crash or a wrong action, because judgment only ever reads text, it never
// simulates clicks inside Gmail itself.

(function flowGmailWatcher() {
  let currentDomainId = null;
  let currentConnector = null;
  let watching = false;

  async function init() {
    const state = await FlowStorage.get();
    if (!state.onboarded) return; // no chips before the user has connected anything
    currentDomainId = state.domainId;
    currentConnector = state.connectorId;
    watching = true;
    observe();
  }

  function observe() {
    const target = document.body;
    const mo = new MutationObserver(debounce(scanReadingPane, 400));
    mo.observe(target, { childList: true, subtree: true });
    scanReadingPane();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function extractSender(messageNode) {
    const el = messageNode.querySelector('[email]');
    if (!el) return { email: null, name: null };
    return { email: el.getAttribute('email'), name: el.getAttribute('name') || el.textContent.trim() };
  }

  async function scanReadingPane() {
    if (!watching) return;
    const main = document.querySelector('div[role="main"]');
    if (!main) return;

    const messages = main.querySelectorAll('div[role="listitem"]');
    if (!messages.length) return;

    // Only the last (most recently opened / bottom) message — mirrors "a new
    // email arrived", not "re-judge the whole thread every mutation".
    const message = messages[messages.length - 1];
    const messageId = message.getAttribute('data-legacy-message-id') || hashNode(message);
    if (!messageId || (await FlowStorage.wasSeen(messageId))) return;

    const text = (message.innerText || '').trim();
    if (text.length < 20) return; // still rendering

    await FlowStorage.markSeen(messageId);
    const result = FlowJudgment.evaluate(text, currentDomainId);
    if (!result) return;

    const sender = extractSender(message);
    injectChip(message, messageId, result, sender, text);
    FlowStorage.appendLog({ kind: 'shown', label: result.label, messageId });
  }

  function hashNode(node) {
    // Cheap fallback id when Gmail's own message id attribute isn't present.
    const s = (node.innerText || '').slice(0, 120);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'h' + h;
  }

  function injectChip(messageNode, messageId, result, sender, fullText) {
    if (messageNode.querySelector('.flow-chip-host')) return;

    const host = document.createElement('div');
    host.className = 'flow-chip-host';

    const chip = document.createElement('button');
    chip.className = 'flow-chip';
    chip.type = 'button';

    const labelEl = document.createElement('span');
    labelEl.className = 'flow-chip-label';
    labelEl.textContent = `Do It: ${result.label}`;
    chip.appendChild(labelEl);

    if (currentConnector) {
      const conn = FLOW_CONNECTORS.find((c) => c.id === currentConnector);
      const target = document.createElement('span');
      target.className = 'flow-chip-target';
      target.textContent = conn ? conn.label : currentConnector;
      chip.appendChild(target);
    }

    const dismiss = document.createElement('button');
    dismiss.className = 'flow-chip-dismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '×';

    chip.addEventListener('click', () => onDoIt(host, chip, messageId, result, sender, fullText));
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      onDismiss(host, messageId, result);
    });

    host.appendChild(chip);
    host.appendChild(dismiss);
    messageNode.insertBefore(host, messageNode.firstChild);
  }

  function setChipState(chip, cls, text) {
    chip.className = 'flow-chip ' + cls;
    chip.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'flow-chip-label';
    span.textContent = text;
    chip.appendChild(span);
  }

  function onDoIt(host, chip, messageId, result, sender, fullText) {
    setChipState(chip, 'flow-chip-pending', 'Working…');
    FlowStorage.appendLog({ kind: 'clicked', label: result.label, messageId });

    const excerpt = fullText.slice(0, 400);
    chrome.runtime.sendMessage(
      {
        type: 'flow:execute-action',
        payload: {
          connectorId: currentConnector,
          label: result.label,
          senderEmail: sender.email,
          senderName: sender.name,
          excerpt
        }
      },
      (response) => {
        if (!response) {
          setChipState(chip, 'flow-chip-error', 'Something went wrong. Try again.');
          return;
        }
        if (response.ok) {
          const conn = FLOW_CONNECTORS.find((c) => c.id === currentConnector);
          setChipState(chip, 'flow-chip-done', `Done ✓ · Logged to ${conn ? conn.label : 'your CRM'}`);
          return;
        }
        if (response.reason === 'connector-not-live') {
          setChipState(chip, 'flow-chip-warn', 'This connector isn’t wired up yet.');
        } else if (response.reason === 'not-connected') {
          setChipState(chip, 'flow-chip-warn', 'Connect HubSpot in the Flow popup first.');
        } else if (response.reason === 'no-matching-contact') {
          setChipState(chip, 'flow-chip-warn', `No HubSpot contact found for ${sender.email || 'this sender'}.`);
        } else {
          setChipState(chip, 'flow-chip-error', 'Couldn’t complete that action.');
        }
      }
    );
  }

  function onDismiss(host, messageId, result) {
    host.remove();
    FlowStorage.appendLog({ kind: 'dismissed', label: result.label, messageId });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.onboarded || changes.domainId || changes.connectorId) init();
  });

  init();
})();
