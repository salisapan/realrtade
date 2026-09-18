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
  const INDICATOR_ID = 'flow-brief-indicator-host';
  const PANEL_ID = 'flow-brief-panel-host';
  let indicatorHost = null;
  let panelHost = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Closing-frame, matching the rest of the product's copy ("Closed —
  // scheduled and tracked.") — this is what's LEFT to close, phrased the
  // same way, never "notifications" or "reminders."
  function indicatorLabel(count) {
    return count === 1 ? '1 thing still open' : count + ' things still open';
  }

  function panelHeadLabel(count) {
    return count === 1 ? 'This is waiting to be closed' : 'These are waiting to be closed';
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
    if (indicatorHost && indicatorHost.parentNode) indicatorHost.parentNode.removeChild(indicatorHost);
    indicatorHost = null;
  }

  function buildRow(row) {
    const wrap = el('div', 'flow-brief-row');
    wrap.setAttribute('dir', 'ltr');

    const body = el('div', 'flow-brief-row-body');
    body.appendChild(el('span', 'flow-chip-process-name', row.title));
    if (row.subtitle) body.appendChild(el('span', 'flow-brief-row-subtitle', row.subtitle));
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
    doIt.appendChild(el('span', 'flow-chip-do-label', 'Do It'));
    doIt.addEventListener('click', () => row.onDoIt(wrap, doIt));
    actions.appendChild(doIt);

    const dismiss = el('button', 'flow-brief-row-x', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', () => row.onDismiss(wrap));
    actions.appendChild(dismiss);

    wrap.appendChild(actions);
    return wrap;
  }

  // A brief is a brief. Rows arrive oldest-still-open first (storage.js's
  // getPending), which is the right order to truncate from the far end of:
  // the oldest open process is the one most likely to be genuinely forgotten,
  // and a wall of a hundred rows is a backlog you scroll past, not something
  // you close. The indicator behind this panel keeps showing the TRUE total —
  // the count is never the thing that gets rounded down — and the footer
  // below says plainly how many are not on screen, so the panel never implies
  // it is showing everything.
  const PANEL_MAX_ROWS = 12;

  function overflowLabel(hidden) {
    return hidden === 1
      ? '1 more still open — close these first and it moves up'
      : hidden + ' more still open — close these first and they move up';
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
    head.appendChild(el('span', 'flow-brief-panel-head-label', panelHeadLabel(rows.length)));
    const close = el('button', 'flow-brief-panel-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
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

  return { show, hide, openPanel, closePanel, isPanelOpen };
})();
