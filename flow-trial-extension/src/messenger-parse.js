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
    if (host === 'business.facebook.com' && (u.pathname === '/latest/inbox' || u.pathname.indexOf('/latest/inbox/') === 0)) return { host: 'messenger' };
    return null;
  }

  // TODO-LIVE-DOM: a Messenger group and Instagram direct still need a snapshot
  // in test/fixtures/chat/TODO-LIVE-DOM.html. The parsers do not read that file.
  // The facebook.com/messages one-to-one header and the Business Suite inbox
  // header are in test/fixtures/chat/live/. The open thread is classified from
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
  //    Live facebook.com/messages/t/<id> (test/fixtures/chat/live/messenger-1to1.html):
  //    the control is a sibling of the name. It contains no image and no name.
  //    The region is the nearest ancestor that also contains h3 and a[role="link"].
  //    The one image sits inside that link. The name is that h3's text.
  //    When no such ancestor exists, the header or banner that holds the control
  //    is the region, which is what the synthetic fixtures use.
  // 2. [role="banner"]
  //    The header landmark, used when the info control is absent.
  //    Source: https://www.w3.org/TR/wai-aria-1.2/#banner
  //    There is no live Messenger snapshot of this node (TODO-LIVE-DOM).
  // 3. h1, h2, h3 inside [role="main"]
  //    The chat-name heading, used when neither control nor banner is present.
  //    Source: bug 1620508 (`<h2>` is the chat name). A heading alone is not
  //    one-to-one proof.
  // 4. [data-surface$="inbox:detail_view_header"]
  //    Business Suite inbox, business.facebook.com/latest/inbox.
  //    Fixture: test/fixtures/chat/live/messenger-page-inbox.html.
  //    The name is the first text that is not inside [role="button"].
  //    The live inbox has a name and one image and no one-to-one signal, so
  //    it stays quiet. A group word is a group and also stays quiet.
  //
  // Inside the chosen region, a draft needs one header profile link that
  // names the same person as the header title. Link text, aria-label, and a
  // name slug in the href each have to agree with that title when present
  // (normalized). A numeric id carries no name, so the text or aria-label
  // has to carry it. "Active now", "Active 5m ago", "פעיל/ה עכשיו",
  // "פעיל עכשיו", "פעילה עכשיו", and "פעיל/ה לפני X" are secondary: they
  // never draft a chat whose link is missing or names someone else, and
  // the same line inside a message row is ignored. A group stays quiet
  // even when the link matches: members, participants, group chat, family,
  // משפחה, a comma or "&" or "and", "and N others", or two or more avatars.
  // Group words: /\bmembers\b/i, /\bparticipants\b/i, /\bgroup chat\b/i,
  // /\bgroup conversation\b/i, and משתתפים.
  // Source: the conversation-info panel lists the people (same gist; the
  // blacklist script reads that panel as "Conversation Information":
  // https://greasyfork.org/en/scripts/384707-messenger-blacklist/code).
  // The exact live string is TODO-LIVE-DOM.
  // Unknown and group both refuse a draft.

  const GROUP_WORD = /\bmembers\b|\bparticipants\b|\bgroup chat\b|\bgroup conversation\b|\bfamily\b|משתתפים|משפחה|קבוצה|קבוצתי/i;
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

  // The live Conversation information button is beside the name link, so the
  // button itself is not the region. Climb to the header row that holds both.
  function headerRow(info) {
    let node = info && info.parentElement;
    while (node) {
      if (!inRow(node) && node.querySelector && node.querySelector('h3') && node.querySelector('a[role="link"]')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function plainText(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function looseName(region) {
    function walk(node) {
      if (!node) return '';
      if (node.nodeType === 1 && node.getAttribute && node.getAttribute('role') === 'button') return '';
      if (node.nodeType === 3) return plainText(node);
      const kids = node.childNodes ? Array.from(node.childNodes) : [];
      for (let i = 0; i < kids.length; i++) {
        const found = walk(kids[i]);
        if (found) return found;
      }
      return '';
    }
    return walk(region);
  }

  function nameIn(region, via) {
    if (!region || typeof region.querySelector !== 'function') return '';
    if (via === 'inbox') return looseName(region);
    const h3 = region.querySelector('h3');
    if (!h3 || inRow(h3)) return '';
    const text = plainText(h3);
    if (!text || SKIP_HEADING.test(text)) return '';
    return text;
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
  // Secondary only. Never sufficient for a draft.
  const ACTIVE_STATUS = /\bactive\s+now\b|\bactive\s+\d{1,4}\s*[smhd]\s+ago\b|פעיל\/ה\s+עכשיו|פעילה\s+עכשיו|פעיל\s+עכשיו|פעיל\/ה\s+לפני\s+\S+|פעילה\s+לפני\s+\S+|פעיל\s+לפני\s+\S+/i;
  const RESERVED_PROFILE = /^(direct|explore|accounts|reels|stories|p|tv|messages|t|groups|watch|latest|inbox)$/i;

  function countSaysGroup(text) {
    const m = String(text || '').match(COUNT_WORD);
    return Boolean(m) && Number(m[1]) !== 1;
  }

  function regionTitle(scope, via) {
    const named = nameIn(scope, via);
    if (named) return named;
    if (!scope || typeof scope.querySelectorAll !== 'function') return '';
    const list = Array.from(scope.querySelectorAll('h1, h2, h3'));
    for (let i = 0; i < list.length; i++) {
      if (inRow(list[i])) continue;
      const text = plainText(list[i]);
      if (text && !SKIP_HEADING.test(text)) return text;
    }
    return '';
  }

  // A comma, an "and" / "&", "and N others", a group emoji, or a group word
  // in the title. משפחה and family are group words. Book club is not.
  function groupTitle(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/[,，、]/.test(t)) return true;
    if (/\s(?:&|and)\s/i.test(t)) return true;
    if (/\band\s+\d{1,4}\s+others\b/i.test(t)) return true;
    if (/ועוד\s*\d|\d\s*אחרים/.test(t)) return true;
    if (/\sו[\u0590-\u05FF]/.test(t)) return true;
    if (/🏠|👥/.test(t)) return true;
    if (GROUP_WORD.test(t)) return true;
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

  // A participant count other than 1, a multi-person title, or a header
  // marker (members, group chat) is a group, and a group stays quiet.
  function imgsIn(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return [];
    return Array.from(node.querySelectorAll('img')).filter((img) => !inRow(img));
  }

  // A group stays quiet even when a profile link matches the title.
  function isGroup(scope, via) {
    if (groupTitle(regionTitle(scope, via))) return true;
    if (headerSaysGroup(scope)) return true;
    if (imgsIn(scope).length >= 2) return true;
    return false;
  }

  function normPerson(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
      .replace(/[🏠👥]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function samePerson(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    return a.replace(/ /g, '') === b.replace(/ /g, '');
  }

  function slugName(href) {
    const raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') return '';
    let u;
    try { u = new URL(raw, 'https://example.com'); } catch (e) { return ''; }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/profile.php') return '';
    const seg = path.split('/').filter(Boolean).pop() || '';
    if (!seg || /^\d+$/.test(seg)) return '';
    if (RESERVED_PROFILE.test(seg)) return '';
    return normPerson(seg);
  }

  function linkMatchesTitle(el, title) {
    const text = normPerson(plainText(el));
    const aria = normPerson(el.getAttribute('aria-label') || '');
    const slug = slugName(el.getAttribute('href'));
    if (text && !samePerson(text, title)) return false;
    if (aria && !samePerson(aria, title)) return false;
    if (slug && !samePerson(slug, title)) return false;
    return samePerson(text, title) || samePerson(aria, title) || samePerson(slug, title);
  }

  function matchingProfile(scope, via) {
    const title = normPerson(regionTitle(scope, via));
    if (!title) return false;
    const links = profileLinks(scope);
    if (links.length !== 1) return false;
    return linkMatchesTitle(links[0], title);
  }

  // A header profile link is one person. A thread URL, a button, and the
  // conversation-information control are not.
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

  // Active status is recorded and then ignored unless the profile link
  // already matches. It cannot fill in a missing or mismatched link.
  function headerActive(scope) {
    return headerMatches(scope, ACTIVE_STATUS);
  }

  function decide(scope, via) {
    const name = nameIn(scope, via);
    const active = headerActive(scope);
    if (isGroup(scope, via)) return { kind: 'group', via: via, name: name, active: active };
    if (active && !matchingProfile(scope, via)) return { kind: 'unknown', via: via, name: name, active: true };
    if (matchingProfile(scope, via)) return { kind: 'one-to-one', via: via, name: name, active: active };
    return { kind: 'unknown', via: via, name: name, active: false };
  }

  // First matching region wins. No positive one-to-one or group signal there
  // is unknown, and the next region is not tried. A title is not proof.
  function classify(root) {
    if (!root || typeof root.querySelector !== 'function') return { kind: 'unknown', via: null, name: '' };
    const info = infoControl(root);
    if (info) return decide(headerRow(info) || scopeFor(info, root), 'aria');
    const banner = root.querySelector('[role="banner"]');
    if (banner && !inRow(banner)) return decide(banner, 'banner');
    const heading = headingIn(root);
    if (heading) return decide(heading.parentElement || heading, 'heading');
    const inbox = root.querySelector('[data-surface$="inbox:detail_view_header"]');
    if (inbox && !inRow(inbox)) return decide(inbox, 'inbox');
    return { kind: 'unknown', via: null, name: '' };
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
