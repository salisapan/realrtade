// A Glance offer that sits below the fold is not an offer the person can act on. The card is injected at the end of
// the open message, so on a long mail it is out of view and Glance looks like it did nothing.
// The peek pins a copy of that same card into view on its own: the same card rule, the same sentence, the same
// loop mark and brand, the same dismiss, and the canonical Do It button (shell, ring, shine). It adds no design of
// its own (see the #glance-peek rules in chip.css, which only place it).
// Do It on the peek brings the real card into view and runs the real card's Do It, so the same code path, the
// same read-back, the receipt and Undo all stay on the card. Nothing is written here and nothing is sent.
// Used by the Gmail content script; pure DOM, no chrome.* calls.
const FlowChipPeek = (() => {
  const PEEK_ID = 'glance-peek';
  const dismissed = new WeakSet();
  let timer = null;

  // The real Do It button of a card. The step-list card keeps it as .flow-chip.do-halo.
  function chipOf(host) {
    return host && host.querySelector ? host.querySelector('.flow-chip') : null;
  }

  // A card that offers something: it has the Do It chip and is not already handled, working or failed.
  function isOffer(host) {
    if (!host || !host.querySelector || !host.isConnected) return false;
    if (host.getAttribute('data-glance-verifying') != null) return false;
    if (host.querySelector('.flow-chip-handled, .flow-chip-done-icon, .flow-chip-pending, .flow-chip-error, .flow-chip-done')) return false;
    return Boolean(chipOf(host));
  }

  function inView(rect, vh) {
    return rect.bottom > 0 && rect.top < vh - 24;
  }

  function labelOf(host) {
    const l = host.querySelector('.flow-chip-do-label');
    return String((l && l.textContent) || '').trim() || 'Do It';
  }

  function build(doc, host, onDoIt, onDismiss) {
    const root = doc.createElement('div');
    root.id = PEEK_ID;
    root.setAttribute('role', 'status');
    root.setAttribute('dir', host.getAttribute('dir') || 'ltr');
    root.setAttribute('lang', host.getAttribute('lang') || '');
    const name = host.querySelector('.flow-chip-process-name');
    if (name) root.appendChild(name.cloneNode(true));
    const text = host.querySelector('.flow-chip-text');
    if (text) root.appendChild(text.cloneNode(true));
    const row = doc.createElement('div');
    row.className = 'flow-chip-main-row';
    row.setAttribute('dir', 'ltr');
    const x = doc.createElement('button');
    x.type = 'button';
    x.className = 'flow-chip-dismiss';
    const hostX = host.querySelector('.flow-chip-dismiss');
    x.setAttribute('aria-label', (hostX && hostX.getAttribute('aria-label')) || 'Dismiss');
    x.textContent = '×';
    x.addEventListener('click', (e) => { e.stopPropagation(); onDismiss(); });
    row.appendChild(x);
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'flow-chip';
    ['shell', 'ring', 'shine'].forEach((c) => { const s = doc.createElement('span'); s.className = c; chip.appendChild(s); });
    const label = doc.createElement('span');
    label.className = 'flow-chip-do-label';
    label.textContent = labelOf(host);
    chip.appendChild(label);
    chip.addEventListener('click', onDoIt);
    row.appendChild(chip);
    root.appendChild(row);
    return root;
  }

  function remove(doc) {
    const n = doc.getElementById(PEEK_ID);
    if (n) n.remove();
  }

  // One pass. Idempotent: call it on a timer and on scroll.
  function tick(doc, win) {
    const vh = win.innerHeight || doc.documentElement.clientHeight || 0;
    const hosts = Array.prototype.slice.call(doc.querySelectorAll('.flow-chip-host')).filter(isOffer);
    if (!hosts.length) { remove(doc); return null; }
    if (hosts.some((h) => inView(h.getBoundingClientRect(), vh))) { remove(doc); return null; }
    const host = hosts.find((h) => !dismissed.has(h));
    if (!host) { remove(doc); return null; }
    const key = (host.textContent || '').replace(/\s+/g, ' ').trim();
    const existing = doc.getElementById(PEEK_ID);
    if (existing && existing.getAttribute('data-for') === key) return existing;
    remove(doc);
    const node = build(doc, host, () => {
      try { host.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { host.scrollIntoView(); }
      remove(doc);
      const real = chipOf(host);
      if (real && host.isConnected) real.click();
    }, () => { dismissed.add(host); remove(doc); });
    node.setAttribute('data-for', key);
    (doc.body || doc.documentElement).appendChild(node);
    return node;
  }

  function start(doc, win) {
    if (timer) return;
    const run = () => { try { tick(doc, win); } catch (e) { /* a page we cannot read: show nothing */ } };
    timer = win.setInterval(run, 700);
    win.addEventListener('scroll', run, { passive: true, capture: true });
    win.addEventListener('resize', run, { passive: true });
    run();
  }

  function stop(doc, win) {
    if (timer) { win.clearInterval(timer); timer = null; }
    remove(doc);
  }

  return { start, stop, tick, isOffer };
})();
if (typeof module !== 'undefined') module.exports = { FlowChipPeek };
