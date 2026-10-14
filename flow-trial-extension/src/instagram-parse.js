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

  // TODO-LIVE-DOM: David, save a real instagram.com/direct header here:
  // test/fixtures/chat/TODO-LIVE-DOM.html. One one-to-one thread and one group.
  // These checks use signals a published script reads on the live page. A title
  // is not one of them. If none of the signals below are on the page, this
  // returns false and no draft is written.
  //
  // Selectors, each with the page that shows it:
  // - header button[aria-label*="Chat details"]
  //   The conversation-info control in the open-thread header. Groups have it
  //   too, so it is not one-to-one proof by itself.
  //   Source: https://github.com/otterai/IG-GroupBot/blob/main/main.py
  //   (`header button[aria-label*='Chat details']`). We never click it.
  //   If the live control is a link rather than a button, that node is
  //   TODO-LIVE-DOM and this stays closed until the snapshot names it.
  // - header img
  //   How many avatars are already in the header. Exactly one, together with
  //   Chat details and no group wording, is the one-to-one proof. Two or more
  //   is a group. Zero is not proof.
  //   Source: the same script counts `div[role='dialog'] img[alt]` after the
  //   click, and the alt is "Username's profile picture". Counting those
  //   images requires opening the panel, which we do not do, so the count is
  //   `header img` instead. That substitution is TODO-LIVE-DOM. A message row
  //   link `a[aria-label^="Open the profile page"]` (https://greasyfork.org/en/scripts/578524-instagram-dm-exporter/code)
  //   says who sent a message, including in a group, so it is not used.
  // - header text and aria-label: /\bmembers\b/i, /\bparticipants\b/i,
  //   /\bgroup chat\b/i, /\bgroup conversation\b/i, and משתתפים
  //   A group word on the header or on the Chat details control is a group.
  //   Source: the details panel that script opens is the member list. The
  //   exact live string is not in a snapshot yet (TODO-LIVE-DOM).

  const GROUP_WORD = /\bmembers\b|\bparticipants\b|\bgroup chat\b|\bgroup conversation\b|משתתפים/i;

  function headerOf(root) {
    return root.querySelector('header');
  }

  function infoControl(root) {
    const header = headerOf(root);
    if (!header) return null;
    const nodes = Array.from(header.querySelectorAll('button[aria-label]'));
    return nodes.find((el) => /chat details/i.test(el.getAttribute('aria-label') || '')) || null;
  }

  function headerAvatars(header) {
    if (!header) return [];
    return Array.from(header.querySelectorAll('img'));
  }

  function groupWording(header, info) {
    const nodes = [];
    if (header) nodes.push(header);
    if (info && (!header || !header.contains(info))) nodes.push(info);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const own = node.getAttribute ? (node.getAttribute('aria-label') || '') : '';
      if (GROUP_WORD.test(own) || GROUP_WORD.test(node.textContent || '')) return true;
      const labelled = node.querySelectorAll ? Array.from(node.querySelectorAll('[aria-label]')) : [];
      for (let j = 0; j < labelled.length; j++) {
        if (GROUP_WORD.test(labelled[j].getAttribute('aria-label') || '')) return true;
      }
    }
    return false;
  }

  // One-to-one only when the live header proves it. A title does not. A
  // missing signal does not. Fixture-only attributes are ignored.
  function isOneToOne(root) {
    if (!root || typeof root.querySelector !== 'function') return false;
    const header = headerOf(root);
    const info = infoControl(root);
    const avatars = headerAvatars(header);
    if (avatars.length >= 2) return false;
    if (groupWording(header, info)) return false;
    if (!info || avatars.length !== 1) return false;
    return true;
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
