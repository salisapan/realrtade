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
    if (chip && chip.classList && (chip.classList.contains('do-halo') || (chip.closest && chip.closest('.flow-step-card')))) {
      chip.setAttribute('data-glance-chip-state', cls || '');
      if (text) chip.setAttribute('data-glance-chip-label', text);
      return;
    }
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
    const face = (typeof FlowDisplay !== 'undefined' && FlowDisplay.cardFace)
      ? FlowDisplay.cardFace(ctx.process, ctx.intent, { bodyText: ctx.bodyText || ctx.text || '', fileCard: ctx.fileCard === true })
      : { title: ctx.process.name || 'Reply', sentence: null, fileCard: false };
    const kitReady = typeof FlowStepList !== 'undefined' && typeof FlowStepListView !== 'undefined' && typeof FlowStepKit !== 'undefined' && (ctx.process.steps || []).length;
    if (kitReady) {
      const liveSteps = (ctx.process.steps || []).slice();
      const rows = FlowStepList.rowsFor(ctx.process, { memory: ctx.executionMemory, surface: ctx.app, lang: ctx.intent && ctx.intent.lang });
      host.__glanceSteps = FlowStepListView.mount(host, rows, {
        intent: face.title || ctx.process.name || 'Reply',
        lang: ctx.intent && ctx.intent.lang,
        fileCard: face.fileCard === true || ctx.fileCard === true,
        surface: ctx.app || 'outlook',
        onDoIt: function (button) { if (handlers && handlers.onDoIt) handlers.onDoIt(host, button, ctx, liveSteps); },
        onDismiss: function () {
          if (handlers && handlers.onDismiss) handlers.onDismiss(host, ctx);
          else host.remove();
        },
        onChange: function (next) {
          const picked = FlowStepList.liveStepsFrom(next, ctx.app || 'outlook');
          liveSteps.length = 0;
          picked.forEach(function (step) { liveSteps.push(step); });
          if (ctx.messageId && typeof FlowStorage !== 'undefined' && typeof FlowStorage.mergeAddedSteps === 'function') {
            FlowStorage.mergeAddedSteps(ctx.messageId, picked).catch(function () {});
          }
        },
        onRetry: function () {
          const button = host.querySelector('button.flow-chip') || host.querySelector('.do-halo');
          if (handlers && handlers.onDoIt) handlers.onDoIt(host, button, ctx, liveSteps);
        }
      });
      if (mountNode.firstChild) mountNode.insertBefore(host, mountNode.firstChild);
      else mountNode.appendChild(host);
      return host;
    }
    host.appendChild(el('span', 'flow-chip-process-name', face.title || ctx.process.name || 'Reply'));

    const textEl = el('p', 'flow-chip-text');
    textEl.appendChild(loopMark());
    textEl.appendChild(el('span', 'flow-chip-brand', 'Glance'));
    const sentence = face.fileCard ? '' : (face.sentence != null ? face.sentence : closingSentence(ctx.process, ctx.intent));
    if (sentence) textEl.appendChild(document.createTextNode(' ' + sentence));
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

    if (typeof FlowStepList !== 'undefined' && typeof FlowStepListView !== 'undefined' && (ctx.process.steps || []).length) {
      const rows = FlowStepList.rowsFor(ctx.process, { memory: ctx.executionMemory, surface: ctx.app, lang: ctx.intent && ctx.intent.lang });
      const view = FlowStepListView.mount(host, rows, {
        onChange: (next) => {
          const picked = FlowStepList.liveStepsFrom(next, ctx.app || 'outlook');
          liveSteps.length = 0;
          picked.forEach((step) => liveSteps.push(step));
          if (ctx.messageId && typeof FlowStorage !== 'undefined' && typeof FlowStorage.mergeAddedSteps === 'function') {
            FlowStorage.mergeAddedSteps(ctx.messageId, picked).catch(() => {});
          }
        },
        onRetry: () => {
          if (handlers && handlers.onDoIt) handlers.onDoIt(host, chip, ctx, liveSteps);
        }
      });
      host.__glanceSteps = view;
    }

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
