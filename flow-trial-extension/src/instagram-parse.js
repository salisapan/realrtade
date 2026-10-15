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

  // TODO-LIVE-DOM: David, save a real instagram.com/direct header in
  // test/fixtures/chat/TODO-LIVE-DOM.html. The parsers do not read that file.
  // Until it holds a snapshot, the open thread is classified from the first
  // region in this chain. A later region is not consulted.
  //
  // 1. aria-label. [aria-label*="Chat details"]
  //    The conversation-info control. The published node is a header button.
  //    The same accessible name on another tag still selects this region.
  //    Groups have the control too, so it is not one-to-one proof by itself.
  //    Source: https://github.com/otterai/IG-GroupBot/blob/main/main.py
  //    (`header button[aria-label*='Chat details']`). We never click it.
  // 2. [role="banner"]
  //    The header landmark, used when that control is absent.
  //    Source: https://www.w3.org/TR/wai-aria-1.2/#banner
  //    There is no live Instagram snapshot of this node (TODO-LIVE-DOM).
  // 3. h1, h2, h3 inside [role="main"]
  //    The chat-name heading, used when neither control nor banner is present.
  //    A heading alone is not one-to-one proof. The exact live heading is
  //    TODO-LIVE-DOM.
  //
  // Inside the chosen region, a draft needs a positive one-to-one signal.
  // One image is not that signal. The signals are one header profile link
  // (a single href such as /username/, not a message-row "Open the profile
  // page" link) or a header status line "Active now" / "Active <n>m ago"
  // (also h or d). The same line inside a message row is not a signal.
  // No positive signal stays quiet. A participant count, a multi-person
  // title, or a group word is a group and stays quiet.
  // A message-row link `a[aria-label^="Open the profile page"]`
  // (https://greasyfork.org/en/scripts/578524-instagram-dm-exporter/code) says
  // who sent a message, including in a group, so it is not a one-to-one signal.
  // Group words: /\bmembers\b/i, /\bparticipants\b/i, /\bgroup chat\b/i,
  // /\bgroup conversation\b/i, and משתתפים. The details panel is the member
  // list. The exact live string is TODO-LIVE-DOM.
  // Unknown and group both refuse a draft.

  const GROUP_WORD = /\bmembers\b|\bparticipants\b|\bgroup chat\b|\bgroup conversation\b|משתתפים/i;
  const SKIP_HEADING = /^(conversation information|messages|chat details)$/i;

  function inRow(el) {
    return Boolean(el && el.closest && el.closest('[role="row"]'));
  }

  function infoControl(root) {
    const nodes = Array.from(root.querySelectorAll('[aria-label]'));
    return nodes.find((el) => !inRow(el) && /chat details/i.test(el.getAttribute('aria-label') || '')) || null;
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

  const COUNT_WORD = /\b(\d{1,4})\s*(members|participants|people|others|משתתפים|אנשים)\b/i;
  const ACTIVE_STATUS = /\bactive\s+now\b|\bactive\s+\d{1,4}\s*[smhd]\s+ago\b/i;
  const RESERVED_PROFILE = /^(direct|explore|accounts|reels|stories|p|tv|messages|t|groups|watch|latest|inbox)$/i;

  function countSaysGroup(text) {
    const m = String(text || '').match(COUNT_WORD);
    return Boolean(m) && Number(m[1]) !== 1;
  }

  function regionTitle(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return '';
    const list = Array.from(scope.querySelectorAll('h1, h2, h3'));
    for (let i = 0; i < list.length; i++) {
      if (inRow(list[i])) continue;
      const text = String(list[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (text && !SKIP_HEADING.test(text)) return text;
    }
    return '';
  }

  function groupTitle(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/,/.test(t)) return true;
    if (/\s(?:&|and)\s/i.test(t)) return true;
    if (/🏠|👥/.test(t)) return true;
    return false;
  }

  function headerSaysGroup(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.getAttribute && node.getAttribute('role') === 'row') return false;
    const label = node.getAttribute ? (node.getAttribute('aria-label') || '') : '';
    if (GROUP_WORD.test(label) || countSaysGroup(label)) return true;
    const kids = node.childNodes ? Array.from(node.childNodes) : [];
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (kid.nodeType === 3) {
        if (GROUP_WORD.test(kid.textContent || '') || countSaysGroup(kid.textContent || '')) return true;
      } else if (kid.nodeType === 1 && headerSaysGroup(kid)) return true;
    }
    return false;
  }

  function isGroup(scope) {
    if (groupTitle(regionTitle(scope))) return true;
    if (headerSaysGroup(scope)) return true;
    return false;
  }

  function profileHref(href) {
    const raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') return false;
    let u;
    try { u = new URL(raw, 'https://example.com'); } catch (e) { return false; }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/profile.php') return /^\d+$/.test(u.searchParams.get('id') || '');
    if (/^\/\d{5,}$/.test(path)) return true;
    const seg = path.match(/^\/([A-Za-z0-9._]{2,30})$/);
    if (!seg) return false;
    return !RESERVED_PROFILE.test(seg[1]);
  }

  function infoAnchor(el) {
    const label = String(el.getAttribute && el.getAttribute('aria-label') || '').trim();
    return /^conversation information$/i.test(label) || /chat details/i.test(label);
  }

  function profileLinks(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return [];
    return Array.from(scope.querySelectorAll('a[href]')).filter((a) => {
      if (inRow(a)) return false;
      if (a.getAttribute('role') === 'button') return false;
      if (infoAnchor(a)) return false;
      return profileHref(a.getAttribute('href'));
    });
  }

  function headerMatches(node, re) {
    if (!node || node.nodeType !== 1) return false;
    if (node.getAttribute && node.getAttribute('role') === 'row') return false;
    const label = node.getAttribute ? (node.getAttribute('aria-label') || '') : '';
    if (re.test(label)) return true;
    const kids = node.childNodes ? Array.from(node.childNodes) : [];
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (kid.nodeType === 3) {
        if (re.test(kid.textContent || '')) return true;
      } else if (kid.nodeType === 1 && headerMatches(kid, re)) return true;
    }
    return false;
  }

  function positiveOneToOne(scope) {
    if (profileLinks(scope).length === 1) return true;
    if (headerMatches(scope, ACTIVE_STATUS)) return true;
    return false;
  }

  function decide(scope, via) {
    if (isGroup(scope)) return { kind: 'group', via: via };
    if (positiveOneToOne(scope)) return { kind: 'one-to-one', via: via };
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
    if (!page(href)) return null;
    let path = '';
    try { path = new URL(String(href)).pathname; } catch (e) { path = ''; }
    const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return 'ig:' + (path || name || 'open');
  }

  return { page, isOneToOne, classify, authorOf, joinText, threadIdFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowInstagramParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowInstagramParse = FlowInstagramParse;
