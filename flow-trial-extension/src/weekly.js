// The Weekly Closing Summary's UI: one small, dismissible banner — "Glance
// closed X for you this week / Y still open" — never a dashboard, never a
// recurring nag. content-gmail.js decides WHEN this is due (storage.js's
// consumeWeeklySummaryTrigger already encodes the whole "once a week, or on
// return from inactivity, and never if there's nothing to say" policy); this
// file only ever renders the two numbers it's handed and calls back for
// "show me what's open" / dismiss. Same split of responsibility as brief.js.
//
// Zero-Prompt, applied here specifically: there is no persistent shell for
// this banner the way there is for the Brief's own indicator — it mounts
// once, gets dismissed or clicked through, and is gone. The next time
// anything shows here is the next time the trigger itself decides it's due,
// which could be a week away. Nothing idle is ever left on the page.

const FlowWeekly = (() => {
  const HOST_ID = 'flow-weekly-host';
  let host = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // "Glance closed 3 things for you this week." / "1 thing is still open."
  // — two short declarative sentences, closure-framed like the rest of the
  // product's copy, never "you have 3 notifications."
  function closedLine(closed) {
    if (!closed) return null;
    return 'Glance closed ' + (closed === 1 ? '1 thing' : closed + ' things') + ' for you this week.';
  }

  function openLine(open) {
    if (!open) return null;
    return (open === 1 ? '1 thing is' : open + ' things are') + ' still open.';
  }

  // summary: { closed, open } — the exact shape consumeWeeklySummaryTrigger
  // resolves to, already guaranteed non-empty (never both zero) by the time
  // it reaches here. opts: { onOpenList, onDismiss }
  function showSummary(summary, opts) {
    opts = opts || {};
    hide();

    host = el('div', 'flow-weekly-banner');
    host.id = HOST_ID;
    host.setAttribute('dir', 'ltr');
    host.setAttribute('role', 'status');

    const body = el('div', 'flow-weekly-body');
    const closed = closedLine(summary.closed);
    const open = openLine(summary.open);
    if (closed) body.appendChild(el('span', 'flow-weekly-line', closed));
    if (open) body.appendChild(el('span', 'flow-weekly-line', open));
    host.appendChild(body);

    const actions = el('div', 'flow-weekly-actions');
    if (summary.open) {
      const view = el('button', 'flow-weekly-link', 'See what’s open');
      view.type = 'button';
      view.addEventListener('click', () => { hide(); if (opts.onOpenList) opts.onOpenList(); });
      actions.appendChild(view);
    }
    const dismiss = el('button', 'flow-weekly-x', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.addEventListener('click', () => { hide(); if (opts.onDismiss) opts.onDismiss(); });
    actions.appendChild(dismiss);
    host.appendChild(actions);

    document.body.appendChild(host);
  }

  function hide() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  return { showSummary, hide };
})();
