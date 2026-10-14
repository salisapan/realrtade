// Messenger on the web (messenger.com and facebook.com/messages). Pure checks: which
// address is a direct conversation, and whether the open thread is one-to-one.
// A title is not that proof. The content script reads the page. This file does not type or send.
const FlowMessengerParse = (() => {
  function page(href) {
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'messenger.com') return { host: 'messenger' };
    if (host === 'facebook.com' && (u.pathname === '/messages' || u.pathname.indexOf('/messages/') === 0)) return { host: 'messenger' };
    return null;
  }

  // TODO-LIVE-DOM: David, save a real messenger.com and facebook.com/messages
  // header here: test/fixtures/chat/TODO-LIVE-DOM.html. One one-to-one thread
  // and one group. These checks use signals observers have published. A title
  // is not one of them. If none of the signals below are on the page, this
  // returns false and no draft is written.
  //
  // Selectors, each with the page that shows it:
  // - [aria-label="Conversation information"]
  //   The conversation-info control (the ellipsis). Any tag: the published
  //   selector does not name one. Matched case-insensitively because the
  //   panel heading is title case.
  //   Source: https://gist.github.com/ariankordi/bae839598cd20680a5b2f85cd565336e
  //   Source: https://bugzilla.mozilla.org/show_bug.cgi?id=1620508
  //   (`<h3>Conversation Information</h3>`). We never click this control.
  //   The chat-name link `[role="main"] a[role="link"][tabindex="0"][aria-label]`
  //   in that gist is the title, so it is not proof.
  // - header img
  //   How many avatars are already in the header. Exactly one, together with
  //   the info control and no group wording, is the one-to-one proof. Two or
  //   more is a group. Zero is not proof.
  //   Source: bug 1620508 (senders are thumbnails, not only the h5). The exact
  //   img-versus-background node is TODO-LIVE-DOM. A single composite group
  //   image is not distinguished until that snapshot.
  // - header text and aria-label: /\bmembers\b/i, /\bparticipants\b/i,
  //   /\bgroup chat\b/i, /\bgroup conversation\b/i, and משתתפים
  //   A group word on the header or on the info control is a group.
  //   Source: the conversation-info panel is where Messenger lists the people
  //   (same gist; the blacklist script reads "Conversation Information" as
  //   that panel: https://greasyfork.org/en/scripts/384707-messenger-blacklist/code).
  //   The exact live string ("members" versus another word) is TODO-LIVE-DOM.

  const GROUP_WORD = /\bmembers\b|\bparticipants\b|\bgroup chat\b|\bgroup conversation\b|משתתפים/i;

  function headerOf(root) {
    return root.querySelector('header');
  }

  function infoControl(root) {
    const nodes = Array.from(root.querySelectorAll('[aria-label]'));
    return nodes.find((el) => /^conversation information$/i.test(String(el.getAttribute('aria-label') || '').trim())) || null;
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
    const where = page(href);
    if (!where) return null;
    let path = '';
    try { path = new URL(String(href)).pathname; } catch (e) { path = ''; }
    const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return 'ms:' + (path || name || 'open');
  }

  return { page, isOneToOne, authorOf, joinText, threadIdFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowMessengerParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowMessengerParse = FlowMessengerParse;
