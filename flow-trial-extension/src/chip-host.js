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
    const shown = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.showChrome === 'function')
      ? FlowDisplay.showChrome(uiLang, text)
      : text;
    if (chip && chip.classList && (chip.classList.contains('do-halo') || (chip.closest && chip.closest('.flow-step-card')))) {
      chip.setAttribute('data-glance-chip-state', cls || '');
      if (shown) chip.setAttribute('data-glance-chip-label', shown);
      return;
    }
    chip.className = 'flow-chip ' + cls;
    chip.replaceChildren(el('span', 'flow-chip-label', shown));
  }

  function bagClock(bag) {
    if (!bag) return null;
    const dateIso = bag.dateIso || (bag.date && bag.date.iso) || null;
    const hour = bag.hour != null ? bag.hour : (bag.time && bag.time.hour);
    const minute = bag.minute != null ? bag.minute : (bag.time && bag.time.minute);
    if (!dateIso) return null;
    return { dateIso: dateIso, hour: hour, minute: minute };
  }

  function clockOf(ctx) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.holdClockFrom === 'function') return FlowDisplay.holdClockFrom(ctx);
    const bags = [];
    if (ctx.holdClock) bags.push(ctx.holdClock);
    if (ctx.calendarHold && ctx.calendarHold.params) bags.push(ctx.calendarHold.params);
    ((ctx.process && ctx.process.steps) || []).forEach((step) => { if (step && step.params) bags.push(step.params); });
    if (ctx.intent) {
      bags.push(ctx.intent);
      if (ctx.intent.entities) bags.push(ctx.intent.entities);
      if (ctx.intent.facts) bags.push(ctx.intent.facts);
      const rem = ctx.intent.entities && ctx.intent.entities.reminder;
      if (rem) bags.push(rem);
    }
    for (let i = 0; i < bags.length; i++) {
      const found = bagClock(bags[i]);
      if (found) return found;
    }
    return null;
  }

  function cardLang(ctx) {
    const raw = (ctx && ctx.uiLang) || uiLang;
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.uiLangFrom === 'function') return FlowDisplay.uiLangFrom({ setting: raw });
    return raw === 'he' ? 'he' : 'en';
  }

  function cardTitle(ctx, face) {
    const lang = cardLang(ctx);
    const fallback = (face && face.title) || (ctx.process && ctx.process.name) || 'Reply';
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.cardTitle === 'function') return FlowDisplay.cardTitle(lang, ctx, fallback);
    return fallback;
  }

  function holdCard(ctx) {
    if (!ctx) return false;
    if (ctx.glanceChain === 'calendar-hold') return true;
    return Boolean(ctx.process && ctx.process.id === 'hold');
  }

  function paintWhen(host, ctx) {
    if (!host || typeof FlowDisplay === 'undefined') return;
    const clock = clockOf(ctx);
    const lang = cardLang(ctx);
    let line = '';
    if (holdCard(ctx)) {
      line = clock && typeof FlowDisplay.holdWhenLine === 'function'
        ? FlowDisplay.holdWhenLine(clock.dateIso, clock.hour, clock.minute, lang)
        : '';
    } else if (clock && clock.dateIso && typeof FlowDisplay.cardDateLine === 'function') {
      line = FlowDisplay.cardDateLine(clock.dateIso, lang);
    }
    if (!line) return;
    const node = el('p', 'flow-chip-when', line);
    node.setAttribute('data-glance-when', line);
    node.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    host.appendChild(node);
  }

  let uiLang = 'en';

  function setUiLang(lang) {
    uiLang = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.uiLangFrom === 'function')
      ? FlowDisplay.uiLangFrom({ setting: lang })
      : (lang === 'he' ? 'he' : 'en');
  }

  function words(lang) {
    const which = lang || uiLang;
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.chrome === 'function') return FlowDisplay.chrome(which);
    return { dismiss: 'Dismiss', doIt: 'Do It', undo: 'Undo', undoing: 'Undoing…', openDraft: 'Open draft', view: 'View' };
  }

  // mountNode: DOM parent. ctx: { process, intent, messageId, app }.
  // handlers: { onDoIt(host, chip, ctx, liveSteps), onDismiss(host, ctx) }
  function inject(mountNode, ctx, handlers) {
    if (!mountNode || !ctx || !ctx.process) return null;
    const dateWaiting = ctx.process.needsDateChoice === true && Array.isArray(ctx.process.dateChoices) && ctx.process.dateChoices.length >= 2;
    if (holdCard(ctx)) {
      const clock = clockOf(ctx);
      const lang = cardLang(ctx);
      const line = clock && typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.holdWhenLine === 'function'
        ? FlowDisplay.holdWhenLine(clock.dateIso, clock.hour, clock.minute, lang)
        : '';
      if (!line && !dateWaiting) return null;
    }
    if (ctx && ctx.uiLang) setUiLang(ctx.uiLang);
    if (mountNode.querySelector('.flow-chip-host')) return mountNode.querySelector('.flow-chip-host');

    const lang = cardLang(ctx);
    const host = el('div', 'flow-chip-host');
    host.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    host.setAttribute('lang', lang);
    const face = (typeof FlowDisplay !== 'undefined' && FlowDisplay.cardFace)
      ? FlowDisplay.cardFace(ctx.process, ctx.intent, { bodyText: ctx.bodyText || ctx.text || '', fileCard: ctx.fileCard === true })
      : { title: ctx.process.name || 'Reply', sentence: null, fileCard: false };
    const title = cardTitle(ctx, face);
    const taskOnly = ((ctx.process && ctx.process.steps) || []).length > 0 &&
      (ctx.process.steps || []).every((s) => s && (s.kind === 'outlookTask' || s.kind === 'googleTask' || s.kind === 'googleTasks' || s.kind === 'task'));
    const kitReady = typeof FlowStepList !== 'undefined' && typeof FlowStepListView !== 'undefined' && typeof FlowStepKit !== 'undefined' && (ctx.process.steps || []).length;
    if (kitReady) {
      const liveSteps = (ctx.process.steps || []).slice();
      const rows = FlowStepList.rowsFor(ctx.process, { memory: ctx.executionMemory, surface: ctx.app, lang: ctx.intent && ctx.intent.lang });
      host.__glanceSteps = FlowStepListView.mount(host, rows, {
        intent: title,
        lang: ctx.intent && ctx.intent.lang,
        uiLang: lang,
        noHold: taskOnly,
        fileCard: face.fileCard === true || ctx.fileCard === true,
        surface: ctx.app || 'outlook',
        dateChoices: ctx.process.dateChoices || null,
        onDateChoice: function (iso) {
          if (typeof FlowActions !== 'undefined' && FlowActions.chooseDate) FlowActions.chooseDate(ctx.process, iso);
          liveSteps.forEach(function (step) {
            if (step && step.kind === 'calendar' && step.params) step.params.dateIso = iso;
          });
        },
        onDoIt: function (button) {
          if (button && button.disabled) return;
          if (ctx.process.needsDateChoice) return;
          if (handlers && handlers.onDoIt) handlers.onDoIt(host, button, ctx, liveSteps);
        },
        onDismiss: function () {
          if (handlers && handlers.onDismiss) handlers.onDismiss(host, ctx);
          else host.remove();
        },
        onHold: function () {
          if (handlers && handlers.onHold) return handlers.onHold(host, ctx);
          return true;
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
      paintWhen(host, ctx);
      if (mountNode.firstChild) mountNode.insertBefore(host, mountNode.firstChild);
      else mountNode.appendChild(host);
      return host;
    }
    host.appendChild(el('span', 'flow-chip-process-name', title));

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
    const uiWords = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.chrome === 'function')
      ? FlowDisplay.chrome(lang)
      : { dismiss: 'Dismiss', doIt: 'Do It' };
    dismiss.setAttribute('aria-label', uiWords.dismiss || 'Dismiss');
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
    let doText = (ctx.doLabel && ctx.doLabel !== 'Do It') ? ctx.doLabel : (uiWords.doIt || ctx.doLabel || 'Do It');
    if (taskOnly && typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.actionLabel === 'function') {
      doText = FlowDisplay.actionLabel(ctx.process, lang);
    }
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.showChrome === 'function') doText = FlowDisplay.showChrome(lang, doText);
    chip.appendChild(el('span', 'flow-chip-do-label', doText));
    chip.addEventListener('click', () => {
      if (handlers && handlers.onDoIt) handlers.onDoIt(host, chip, ctx, liveSteps);
    });
    mainRow.appendChild(chip);
    host.appendChild(mainRow);

    if (typeof FlowStepList !== 'undefined' && typeof FlowStepListView !== 'undefined' && (ctx.process.steps || []).length) {
      const rows = FlowStepList.rowsFor(ctx.process, { memory: ctx.executionMemory, surface: ctx.app, lang: ctx.intent && ctx.intent.lang });
      const view = FlowStepListView.mount(host, rows, {
        uiLang: lang,
        noHold: taskOnly,
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
        },
        onHold: function () {
          if (handlers && handlers.onHold) return handlers.onHold(host, ctx);
          return true;
        }
      });
      host.__glanceSteps = view;
    }

    paintWhen(host, ctx);
    if (mountNode.firstChild) mountNode.insertBefore(host, mountNode.firstChild);
    else mountNode.appendChild(host);
    return host;
  }

  // In-place receipt after a successful Outlook (or other) draft write.
  function showDraftReceipt(host, opts) {
    const o = opts || {};
    if (o.uiLang) setUiLang(o.uiLang);
    const L = words();
    host.classList.add('flow-chip-settled');
    const done = el('div', 'flow-chip flow-chip-done');
    done.setAttribute('dir', 'ltr');
    done.setAttribute('role', 'status');
    const icon = el('span', 'flow-chip-done-icon', '✓');
    icon.setAttribute('aria-hidden', 'true');
    done.appendChild(icon);
    function shown(text) {
      if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.showChrome === 'function') return FlowDisplay.showChrome(uiLang, text);
      return text == null ? '' : String(text);
    }
    done.appendChild(el('span', 'flow-chip-handled', shown(o.status || L.draftReady || 'Draft ready.')));
    done.appendChild(el('span', 'flow-chip-written', shown(o.written || L.draftReadyLong || 'Reply draft ready in Outlook Drafts. Not sent.')));

    const actions = el('span', 'flow-chip-actions');
    if (o.url) {
      const a = el('a', 'flow-chip-link', o.linkLabel || L.openDraft);
      a.href = o.url; a.target = '_blank'; a.rel = 'noopener';
      actions.appendChild(a);
    }
    if (typeof o.onUndo === 'function') {
      const undo = el('button', 'flow-chip-undo', L.undo);
      undo.type = 'button';
      undo.addEventListener('click', () => {
        undo.disabled = true; undo.textContent = L.undoing;
        Promise.resolve(o.onUndo()).then((r) => {
          if (r && r.ok) {
            // Caller may remove the host to re-inject Do It (outlookReopen).
            if (r.reopen || !host.isConnected) return;
            done.replaceChildren(el('span', 'flow-chip-label', (typeof FlowDisplay !== 'undefined' && FlowDisplay.showChrome) ? FlowDisplay.showChrome(uiLang, r.written || L.draftRemoved || 'Reply draft removed. Not sent.') : (r.written || 'Reply draft removed. Not sent.')));
          } else {
            undo.disabled = false; undo.textContent = L.undo;
            if (r && r.written) {
              let hint = done.querySelector('.flow-chip-undo-hint');
              if (!hint) {
                hint = el('span', 'flow-chip-undo-hint flow-chip-undo-failed', (typeof FlowDisplay !== 'undefined' && FlowDisplay.showChrome) ? FlowDisplay.showChrome(uiLang, r.written) : r.written);
                done.appendChild(hint);
              } else hint.textContent = (typeof FlowDisplay !== 'undefined' && FlowDisplay.showChrome) ? FlowDisplay.showChrome(uiLang, r.written) : r.written;
            }
          }
        });
      });
      actions.appendChild(undo);
    }
    done.appendChild(actions);
    host.replaceChildren(done);
  }

  return { inject, setChipState, showDraftReceipt, setUiLang, closingSentence, loopMark, el };
})();

if (typeof module !== 'undefined') module.exports = { FlowChipHost };
else if (typeof globalThis !== 'undefined') globalThis.FlowChipHost = FlowChipHost;
