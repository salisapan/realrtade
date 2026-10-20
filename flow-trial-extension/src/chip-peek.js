// A Glance offer that sits below the fold is not an offer the person can act on. The chip is injected at the end
// of the open message, so on a long mail it is out of view and Glance looks like it did nothing.
// The peek is a small floating card that appears on its own, in view, as soon as a real offer exists and is not
// on screen. It carries no write path: it says what Glance found and scrolls to the card that does the work.
// Do It, the receipt, Undo and the read-back all stay on the card. Nothing is sent, nothing is written here.
// Used by the Gmail content script; pure DOM, no chrome.* calls.
const FlowChipPeek = (() => {
  const PEEK_ID = 'glance-peek';
  const dismissed = new WeakSet();
  let timer = null;

  // A card that offers something: it has the Do It chip and is not already handled, working or failed.
  function isOffer(host) {
    if (!host || !host.querySelector || !host.isConnected) return false;
    if (host.getAttribute('data-glance-verifying') != null) return false;
    if (host.querySelector('.flow-chip-handled, .flow-chip-done-icon, .flow-chip-pending, .flow-chip-error')) return false;
    return Boolean(host.querySelector('.flow-chip'));
  }

  function inView(rect, vh) {
    return rect.bottom > 0 && rect.top < vh - 24;
  }

  // What the card says it will do, without the brand mark. "Glance Reply & Track: …" becomes the part after it.
  function offerText(host) {
    const t = host.querySelector('.flow-chip-text');
    if (!t) return '';
    const clone = t.cloneNode(true);
    clone.querySelectorAll('.flow-chip-brand, .flow-chip-mark').forEach((n) => n.remove());
    return String(clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110);
  }

  function build(doc, text, he, onShow, onDismiss) {
    const root = doc.createElement('div');
    root.id = PEEK_ID;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('dir', he ? 'rtl' : 'ltr');
    const brand = doc.createElement('span');
    brand.className = 'glance-peek-brand';
    brand.textContent = 'Glance';
    const msg = doc.createElement('span');
    msg.className = 'glance-peek-text';
    msg.textContent = text || (he ? 'יש לי הצעה למייל הזה' : 'I have a suggestion for this mail');
    const show = doc.createElement('button');
    show.type = 'button';
    show.className = 'glance-peek-show';
    show.textContent = he ? 'הצג' : 'Show';
    show.addEventListener('click', onShow);
    const x = doc.createElement('button');
    x.type = 'button';
    x.className = 'glance-peek-x';
    x.setAttribute('aria-label', he ? 'סגור' : 'Dismiss');
    x.textContent = '×';
    x.addEventListener('click', onDismiss);
    root.appendChild(brand);
    root.appendChild(msg);
    root.appendChild(show);
    root.appendChild(x);
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
    const he = /[֐-׿]/.test(offerText(host)) || String(doc.documentElement.lang || '').toLowerCase().indexOf('he') === 0;
    const text = offerText(host);
    const existing = doc.getElementById(PEEK_ID);
    if (existing && existing.getAttribute('data-for') === text) return existing;
    remove(doc);
    const node = build(doc, text, he, () => {
      try { host.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { host.scrollIntoView(); }
      host.classList.add('glance-peek-flash');
      win.setTimeout(() => host.classList.remove('glance-peek-flash'), 1600);
      remove(doc);
    }, () => { dismissed.add(host); remove(doc); });
    node.setAttribute('data-for', text);
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

  return { start, stop, tick, isOffer, offerText };
})();
if (typeof module !== 'undefined') module.exports = { FlowChipPeek };
