// The Morning Brief's UI: a small indicator for processes that were shown
// and never closed, and the panel it opens into. Pure DOM — no chrome.*
// calls, no FlowStorage/FlowExecutionMemory access, same division of
// responsibility as sidebar.js. content-gmail.js decides WHAT is pending and
// WHAT happens on Do It / Dismiss; this file only ever renders what it's
// handed and calls back into content-gmail.js's own onDoIt/onDismiss for the
// actual closing — see content-gmail.js's "Morning Brief" section for why
// that split keeps this a quiet extension of the chip, not a second app.
//
// Zero-Prompt, applied here specifically: show()/hide() are the entire
// contract for whether anything exists in the DOM at all. hide() removes the
// host outright — there is no "greyed out, nothing to do" state to render,
// because Zero-Prompt means nothing pending is silence, not an empty widget.

const FlowBrief = (() => {
  let uiOverride = null;
  function setUiLang(lang) { uiOverride = lang; }
  function words() {
    let ui = '';
    try { if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') ui = chrome.i18n.getUILanguage() || ''; } catch (e) {}
    let nav = '';
    try { nav = (typeof navigator !== 'undefined' && navigator.language) || ''; } catch (e) {}
    const lang = (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.uiLangFrom === 'function')
      ? FlowDisplay.uiLangFrom({ setting: uiOverride, uiLanguage: ui, navigatorLanguage: nav })
      : 'en';
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.chrome === 'function') return FlowDisplay.chrome(lang);
    return { doIt: 'Do It', dismiss: 'Dismiss' };
  }
  const INDICATOR_ID = 'flow-brief-indicator-host';
  const PANEL_ID = 'flow-brief-panel-host';
  const RESURFACE_ID = 'flow-resurface-host';
  let indicatorHost = null;
  let panelHost = null;
  let resurfaceHost = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Closing-frame, matching the rest of the product's copy ("Closed —
  // scheduled and tracked.") — this is what's LEFT to close, phrased the
  // same way, never "notifications" or "reminders."
  function fillN(template, n) {
    if (typeof FlowDisplay !== 'undefined' && typeof FlowDisplay.fillChrome === 'function') {
      return FlowDisplay.fillChrome(template, { n: n });
    }
    return String(template || '').split('{n}').join(String(n));
  }

  function indicatorLabel(count) {
    const L = words();
    if (count === 1) return L.stillOpenOne || '1 thing still open';
    if (L.stillOpenMany) return fillN(L.stillOpenMany, count);
    return count + ' things still open';
  }

  // The same helper as the card (glanceUiCopy). English Gmail reads
  // "Still open". Hebrew Gmail reads the Hebrew line. Never both.
  function panelHeadLabel() {
    if (typeof glanceUiCopy === 'function') return glanceUiCopy('panelHead');
    const code = (typeof navigator !== 'undefined' && navigator.language) || '';
    return /^he(-|$)/i.test(String(code)) ? 'מה עדיין פתוח' : 'Still open';
  }

  // Ensures the indicator exists and reflects `count`, wiring onToggle to
  // open the panel. Safe to call repeatedly (e.g. once per checkBrief() pass)
  // — it only ever updates the one label and handler, never rebuilds the DOM
  // node, so it can't steal focus or interrupt an open panel underneath it.
  function show(count, onToggle) {
    if (!indicatorHost) {
      indicatorHost = el('button', 'flow-brief-indicator');
      indicatorHost.id = INDICATOR_ID;
      indicatorHost.type = 'button';
      document.body.appendChild(indicatorHost);
    }
    indicatorHost.textContent = indicatorLabel(count);
    indicatorHost.onclick = onToggle;
  }

  // The one place anything Brief-related gets fully removed from the page —
  // called whenever there is nothing pending, or watching stops entirely.
  function hide() {
    closePanel();
    hideResurface();
    if (indicatorHost && indicatorHost.parentNode) indicatorHost.parentNode.removeChild(indicatorHost);
    indicatorHost = null;
  }

  function buildRow(row) {
    const wrap = el('div', 'flow-brief-row');
    wrap.setAttribute('dir', 'ltr');
    if (row.id) wrap.setAttribute('data-message-id', row.id);

    const body = el('div', 'flow-brief-row-body');
    body.appendChild(el('span', 'flow-chip-process-name', row.title));
    if (row.subtitle) {
      const sub = el('span', 'flow-brief-row-subtitle', row.subtitle);
      sub.setAttribute('data-glance-user', 'subtitle');
      body.appendChild(sub);
    }
    wrap.appendChild(body);

    const actions = el('div', 'flow-brief-row-actions');

    // Reuses the exact .flow-chip class family — same shell/ring/shine
    // child structure the live chip's own Do It button builds (chip.css's
    // premium glass look lives on those children, not the button itself) —
    // so onDoIt's own setChipState (pending/error) and
    // showMultiActionReceipt's success replacement work on this button/row
    // completely unmodified. The Brief borrows the chip's states instead of
    // inventing its own.
    const doIt = el('button', 'flow-chip flow-brief-doit');
    doIt.type = 'button';
    doIt.appendChild(el('span', 'shell'));
    doIt.appendChild(el('span', 'ring'));
    doIt.appendChild(el('span', 'shine'));
    doIt.appendChild(el('span', 'flow-chip-do-label', words().doIt));
    doIt.addEventListener('click', () => row.onDoIt(wrap, doIt));
    actions.appendChild(doIt);

    const dismiss = el('button', 'flow-brief-row-x', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', words().dismiss);
    dismiss.addEventListener('click', () => row.onDismiss(wrap));
    actions.appendChild(dismiss);

    wrap.appendChild(actions);
    return wrap;
  }

  // Contextual Resurfacing: one specific older process, surfaced because the
  // thread it belongs to was just reopened — not "here is everything open"
  // (that's the indicator/panel above), so this is deliberately a single row
  // with its own small label, not another entry point into the full list.
  // Reuses buildRow verbatim: content-gmail.js hands it the exact same
  // { title, subtitle, onDoIt, onDismiss } shape a Brief panel row gets, so
  // Do It / Dismiss here behave identically to everywhere else they appear.
  function showResurface(row) {
    hideResurface();
    resurfaceHost = el('div', 'flow-resurface');
    resurfaceHost.id = RESURFACE_ID;
    resurfaceHost.setAttribute('dir', 'ltr');
    const resurfaceWords = words();
    resurfaceHost.appendChild(el('span', 'flow-resurface-label', resurfaceWords.resurface || 'Still open from this thread'));
    resurfaceHost.appendChild(buildRow(row));
    document.body.appendChild(resurfaceHost);
  }

  // Called whenever content-gmail.js decides nothing in the currently open
  // thread still qualifies — switching to a different thread, or the one
  // match there resolving — same "remove outright, no idle empty state"
  // contract as hide() above.
  function hideResurface() {
    if (resurfaceHost && resurfaceHost.parentNode) resurfaceHost.parentNode.removeChild(resurfaceHost);
    resurfaceHost = null;
  }

  // A brief is a brief. Rows arrive in the caller's rank order (Still Open
  // puts the highest stakes × deadline first, and never hands over more
  // than three). Truncation keeps the front of that list. The indicator
  // shows the same count the panel was given — Still Open does not keep a
  // hidden backlog behind a smaller number.
  const PANEL_MAX_ROWS = 12;

  function overflowLabel(hidden) {
    const L = words();
    if (hidden === 1) return L.moreOpenOne || '1 more still open — close these first and it moves up';
    if (L.moreOpenMany) return fillN(L.moreOpenMany, hidden);
    return hidden + ' more still open — close these first and they move up';
  }

  // rows: [{ id, title, subtitle, onDoIt(rowHost, doItBtn), onDismiss(rowHost) }]
  // opts: { onClose }
  function openPanel(rows, opts) {
    opts = opts || {};
    closePanel();

    panelHost = el('div', 'flow-brief-panel');
    panelHost.id = PANEL_ID;
    panelHost.setAttribute('dir', 'ltr');

    const head = el('div', 'flow-brief-panel-head');
    head.appendChild(el('span', 'flow-brief-panel-head-label', panelHeadLabel()));
    const close = el('button', 'flow-brief-panel-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', words().close || 'Close');
    close.addEventListener('click', () => { closePanel(); if (opts.onClose) opts.onClose(); });
    head.appendChild(close);
    panelHost.appendChild(head);

    const visible = rows.slice(0, PANEL_MAX_ROWS);
    const list = el('div', 'flow-brief-rows');
    for (const row of visible) list.appendChild(buildRow(row));
    panelHost.appendChild(list);

    if (rows.length > visible.length) {
      panelHost.appendChild(el('div', 'flow-brief-panel-more', overflowLabel(rows.length - visible.length)));
    }

    document.body.appendChild(panelHost);
  }

  function closePanel() {
    if (panelHost && panelHost.parentNode) panelHost.parentNode.removeChild(panelHost);
    panelHost = null;
  }

  function isPanelOpen() {
    return Boolean(panelHost);
  }

  return { show, hide, openPanel, closePanel, isPanelOpen, showResurface, hideResurface, setUiLang };
})();
