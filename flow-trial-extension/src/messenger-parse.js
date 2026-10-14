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
  // header in test/fixtures/chat/TODO-LIVE-DOM.html. The parsers do not read
  // that file. Until it holds a snapshot, the open thread is classified from
  // the first region in this chain. A later region is not consulted.
  //
  // 1. aria-label. [aria-label="Conversation information"]
  //    The conversation-info control. Any tag: the published selector names
  //    none. Matched case-insensitively ("Conversation Information").
  //    Source: https://gist.github.com/ariankordi/bae839598cd20680a5b2f85cd565336e
  //    Source: https://bugzilla.mozilla.org/show_bug.cgi?id=1620508
  //    (`<h3>Conversation Information</h3>`). We never click this control.
  //    The chat-name link `[role="main"] a[role="link"][tabindex="0"][aria-label]`
  //    in that gist is the title, so it is not this control.
  // 2. [role="banner"]
  //    The header landmark, used when the info control is absent.
  //    Source: https://www.w3.org/TR/wai-aria-1.2/#banner
  //    There is no live Messenger snapshot of this node (TODO-LIVE-DOM).
  // 3. h1, h2, h3 inside [role="main"]
  //    The chat-name heading, used when neither control nor banner is present.
  //    Source: bug 1620508 (`<h2>` is the chat name). A heading alone is not
  //    one-to-one proof.
  //
  // Inside the chosen region, img elements that are not inside a message row
  // are the avatars. Exactly one, and no group wording, is one-to-one. Two or
  // more, or a group word, is a group. Anything else is unknown.
  // Group words: /\bmembers\b/i, /\bparticipants\b/i, /\bgroup chat\b/i,
  // /\bgroup conversation\b/i, and משתתפים.
  // Source: the conversation-info panel lists the people (same gist; the
  // blacklist script reads that panel as "Conversation Information":
  // https://greasyfork.org/en/scripts/384707-messenger-blacklist/code).
  // The exact live string is TODO-LIVE-DOM.
  // Unknown and group both refuse a draft.

  const GROUP_WORD = /\bmembers\b|\bparticipants\b|\bgroup chat\b|\bgroup conversation\b|משתתפים/i;
  const SKIP_HEADING = /^(conversation information|messages|chat details)$/i;

  function inRow(el) {
    return Boolean(el && el.closest && el.closest('[role="row"]'));
  }

  function infoControl(root) {
    const nodes = Array.from(root.querySelectorAll('[aria-label]'));
    return nodes.find((el) => !inRow(el) && /^conversation information$/i.test(String(el.getAttribute('aria-label') || '').trim())) || null;
  }

  function isThread(el, root) {
    if (!el || el === root) return true;
    return el.getAttribute && el.getAttribute('role') === 'main';
  }

  function scopeFor(el, root) {
    if (el.closest) {
      const box = el.closest('header, [role="banner"]');
      if (box && !isThread(box, root)) return box;
    }
    const parent = el.parentElement;
    if (!isThread(parent, root)) return parent;
    return el;
  }

  function headingIn(root) {
    const main = root.getAttribute && root.getAttribute('role') === 'main' ? root : (root.querySelector('[role="main"]') || root);
    const list = Array.from(main.querySelectorAll('h1, h2, h3'));
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (inRow(h)) continue;
      const text = String(h.textContent || '').replace(/\s+/g, ' ').trim();
      if (SKIP_HEADING.test(text)) continue;
      return h;
    }
    return null;
  }

  function imgsIn(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return [];
    return Array.from(node.querySelectorAll('img')).filter((img) => !inRow(img));
  }

  function groupWording(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.getAttribute && node.getAttribute('role') === 'row') return false;
    const label = node.getAttribute ? (node.getAttribute('aria-label') || '') : '';
    if (GROUP_WORD.test(label)) return true;
    const kids = node.childNodes ? Array.from(node.childNodes) : [];
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (kid.nodeType === 3) {
        if (GROUP_WORD.test(kid.textContent || '')) return true;
      } else if (kid.nodeType === 1 && groupWording(kid)) return true;
    }
    return false;
  }

  function decide(scope, via) {
    const avatars = imgsIn(scope);
    if (avatars.length >= 2 || groupWording(scope)) return { kind: 'group', via: via };
    if (avatars.length === 1) return { kind: 'one-to-one', via: via };
    return { kind: 'unknown', via: via };
  }

  // First matching region wins. No positive one-to-one or group signal there
  // is unknown, and the next region is not tried. A title is not proof.
  function classify(root) {
    if (!root || typeof root.querySelector !== 'function') return { kind: 'unknown', via: null };
    const info = infoControl(root);
    if (info) return decide(scopeFor(info, root), 'aria');
    const banner = root.querySelector('[role="banner"]');
    if (banner && !inRow(banner)) return decide(banner, 'banner');
    const heading = headingIn(root);
    if (heading) return decide(heading.parentElement || heading, 'heading');
    return { kind: 'unknown', via: null };
  }

  function isOneToOne(root) {
    return classify(root).kind === 'one-to-one';
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

  return { page, isOneToOne, classify, authorOf, joinText, threadIdFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowMessengerParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowMessengerParse = FlowMessengerParse;
