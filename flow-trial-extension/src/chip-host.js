// Shared Glance floating card (Do It). Used by Gmail and Outlook content scripts.
// Visual contract matches content-gmail.js injectChip: process name, brand line, Do It, dismiss.
// The caller owns judgment (FlowIntent + FlowActions) and the write path (gmailDraft / outlookDraft).
const FlowChipHost = (() => {
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function loopMark() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'flow-chip-mark');
    svg.setAttribute('aria-hidden', 'true');
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '8'); c.setAttribute('cy', '8'); c.setAttribute('r', '5.5');
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'currentColor'); c.setAttribute('stroke-width', '1.5');
    svg.appendChild(c);
    return svg;
  }

  function closingSentence(process, intent) {
    if (process && process.closingLine) return process.closingLine;
    if (intent && intent.label) return intent.label;
    return 'Close this in one click.';
  }

  function setChipState(chip, cls, text) {
    chip.className = 'flow-chip ' + cls;
    chip.replaceChildren(el('span', 'flow-chip-label', text));
  }

  // mountNode: DOM parent. ctx: { process, intent, messageId, app }.
  // handlers: { onDoIt(host, chip, ctx, liveSteps), onDismiss(host, ctx) }
  function inject(mountNode, ctx, handlers) {
    if (!mountNode || !ctx || !ctx.process) return null;
    if (mountNode.querySelector('.flow-chip-host')) return mountNode.querySelector('.flow-chip-host');

    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', 'ltr');
    host.appendChild(el('span', 'flow-chip-process-name', ctx.process.name || 'Reply'));

    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    textEl.appendChild(document.createTextNode(' ' + closingSentence(ctx.process, ctx.intent)));
    host.appendChild(textEl);

    const liveSteps = (ctx.process.steps || []).slice();
    const mainRow = el('div', 'flow-chip-main-row');
    mainRow.setAttribute('dir', 'ltr');

    const dismiss = el('button', 'flow-chip-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      if (handlers && handlers.onDismiss) handlers.onDismiss(host, ctx);
      else host.remove();
    });
    mainRow.appendChild(dismiss);

    const chip = el('button', 'flow-chip');
    chip.type = 'button';
    chip.appendChild(el('span', 'shell'));
    chip.appendChild(el('span', 'ring'));
    chip.appendChild(el('span', 'shine'));
    chip.appendChild(el('span', 'flow-chip-do-label', ctx.doLabel || 'Do It'));
    chip.addEventListener('click', () => {
      if (handlers && handlers.onDoIt) handlers.onDoIt(host, chip, ctx, liveSteps);
    });
    mainRow.appendChild(chip);
    host.appendChild(mainRow);

    if (mountNode.firstChild) mountNode.insertBefore(host, mountNode.firstChild);
    else mountNode.appendChild(host);
    return host;
  }

  // In-place receipt after a successful Outlook (or other) draft write.
  function showDraftReceipt(host, opts) {
    const o = opts || {};
    host.classList.add('flow-chip-settled');
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    done.appendChild(el('span', 'flow-chip-handled', o.status || 'Draft ready.'));
    done.appendChild(el('span', 'flow-chip-written', o.written || 'Reply draft ready in Outlook Drafts. Not sent.'));

    const actions = el('span', 'flow-chip-actions');
    if (o.url) {
      const a = el('a', 'flow-chip-link', o.linkLabel || 'Open draft');
      a.href = o.url; a.target = '_blank'; a.rel = 'noopener';
      actions.appendChild(a);
    }
    if (typeof o.onUndo === 'function') {
      const undo = el('button', 'flow-chip-undo', 'Undo');
      undo.type = 'button';
      undo.addEventListener('click', () => {
        undo.disabled = true; undo.textContent = 'Undoing…';
        Promise.resolve(o.onUndo()).then((r) => {
          if (r && r.ok) {
            // Caller may remove the host to re-inject Do It (outlookReopen).
            if (r.reopen || !host.isConnected) return;
            done.replaceChildren(el('span', 'flow-chip-label', r.written || 'Reply draft removed. Not sent.'));
          } else {
            undo.disabled = false; undo.textContent = 'Undo';
          }
        });
      });
      actions.appendChild(undo);
    }
    done.appendChild(actions);
    host.replaceChildren(done);
  }

  return { inject, setChipState, showDraftReceipt, closingSentence, loopMark, el };
})();

if (typeof module !== 'undefined') module.exports = { FlowChipHost };
else if (typeof globalThis !== 'undefined') globalThis.FlowChipHost = FlowChipHost;
