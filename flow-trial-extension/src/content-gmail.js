// Runs on mail.google.com. Watches the open message in the reading pane and,
// when the (currently stubbed) judgment engine recognizes something, injects
// the single Do It chip described in the spec — never a popup, never a
// second click to "confirm", never text the user has to read a paragraph of.
//
// Honesty about fragility: Gmail's DOM has no public class-name contract and
// changes without notice. The selectors below are a best-effort reading of
// the current DOM (role="main" reading pane, div[role="listitem"] messages).
// If Gmail changes structure, this degrades to "chip stops appearing" — never
// to a crash or a wrong action, because judgment only ever reads text, it
// never simulates clicks inside Gmail itself.

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

    injectChip(message, messageId, result);
    FlowStorage.appendLog({ kind: 'shown', label: result.label, messageId });
  }

  function hashNode(node) {
    // Cheap fallback id when Gmail's own message id attribute isn't present.
    const s = (node.innerText || '').slice(0, 120);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'h' + h;
  }

  function injectChip(messageNode, messageId, result) {
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
      const target = document.createElement('span');
      target.className = 'flow-chip-target';
      target.textContent = currentConnector;
      chip.appendChild(target);
    }

    const dismiss = document.createElement('button');
    dismiss.className = 'flow-chip-dismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'התעלם');
    dismiss.textContent = '×';

    chip.addEventListener('click', () => onDoIt(host, messageId, result));
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      onDismiss(host, messageId, result);
    });

    host.appendChild(chip);
    host.appendChild(dismiss);
    messageNode.insertBefore(host, messageNode.firstChild);
  }

  function onDoIt(host, messageId, result) {
    // Phase 1: no live connector write yet — record intent + show confirmation.
    // The call this becomes: FlowConnectors.execute(currentConnector, result).
    host.innerHTML = '<span class="flow-chip" style="cursor:default">בוצע ✓ <span class="flow-chip-target">בטל</span></span>';
    FlowStorage.appendLog({ kind: 'clicked', label: result.label, messageId });
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
