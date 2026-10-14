// Instagram direct messages (instagram.com/direct). Pure checks only. A title is
// not proof of a one-to-one thread. The content script reads the open thread.
// This file does not type or send.
const FlowInstagramParse = (() => {
  function page(href) {
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'instagram.com' && (u.pathname === '/direct' || u.pathname.indexOf('/direct/') === 0)) return { host: 'instagram' };
    return null;
  }

  function normKind(value) {
    return String(value || '').toLowerCase().replace(/[\s_]+/g, '-');
  }

  function threadType(root) {
    if (!root || typeof root.getAttribute !== 'function') return '';
    const own = root.getAttribute('data-thread-type');
    if (own) return normKind(own);
    if (typeof root.querySelector !== 'function') return '';
    const marked = root.querySelector('[data-thread-type]');
    return marked ? normKind(marked.getAttribute('data-thread-type')) : '';
  }

  function participantCount(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    const nodes = Array.from(root.querySelectorAll('[data-testid="participant-count"], [data-glance-participants], [data-members-count]'));
    const labelled = Array.from(root.querySelectorAll('[aria-label]')).filter((el) => /participant|member|משתתפ/i.test(el.getAttribute('aria-label') || ''));
    for (const el of nodes.concat(labelled)) {
      const raw = el.getAttribute('data-glance-participants') || el.getAttribute('data-members-count') || el.getAttribute('aria-label') || el.textContent || '';
      const m = String(raw).match(/(\d+)/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  // A direct chat is proven by the thread type, and only when the page does not
  // also show a group. A title is never that proof. Missing proof is not a direct chat.
  function isOneToOne(root) {
    if (!root || typeof root.querySelector !== 'function') return false;
    const kind = threadType(root);
    if (kind === 'group' || kind === 'community' || kind === 'broadcast') return false;
    if (root.querySelector('[data-testid="group-avatar"], [data-glance-avatar="group"]')) return false;
    if (root.querySelector('a[href*="members"], [data-testid="members-link"], a[data-glance-members="1"]')) return false;
    const count = participantCount(root);
    if (count != null && count !== 1) return false;
    return kind === 'one-to-one' || kind === 'direct';
  }

  function authorOf(row) {
    const a = row && row.author;
    if (a === 'me' || a === 'them') return a;
    const label = String(row && row.label || '');
    if (/^you(?: sent|:)/i.test(label)) return 'me';
    if (row && row.outgoing) return 'me';
    if (row && row.incoming) return 'them';
    return null;
  }

  function joinText(pieces) {
    return (pieces || []).filter((p) => p && !p.quoted).map((p) => String(p.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 4000);
  }

  function threadIdFor(href, title) {
    if (!page(href)) return null;
    let path = '';
    try { path = new URL(String(href)).pathname; } catch (e) { path = ''; }
    const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return 'ig:' + (path || name || 'open');
  }

  return { page, isOneToOne, authorOf, joinText, threadIdFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowInstagramParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowInstagramParse = FlowInstagramParse;
