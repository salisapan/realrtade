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
  // Inside the chosen region, a draft needs one header profile link that
  // names the same person as the header title. The title's own text does not
  // count when that title sits inside the link. A draft then needs a username
  // in the URL that matches the name. A numeric id with no other signal stays
  // quiet. A username that is one plain word (bookclub, weekendcrew, team) is
  // not a first-and-last name and stays quiet. Link text and aria-label still
  // count when the title is not nested in that link, and a name slug has to
  // agree with the title. Group checks read the raw title before digits and
  // emoji are stripped. "Active now", "Active 5m ago",
  // "פעיל/ה עכשיו", "פעיל עכשיו", "פעילה עכשיו", and "פעיל/ה לפני X" are
  // secondary and never draft a chat on their own. A message-row profile
  // link is not the header link. A group stays quiet even when the link
  // matches: members, participants, group chat, family, משפחה, a comma or
  // "&" or "and", "and N others", or two or more avatars.
  // A message-row link `a[aria-label^="Open the profile page"]`
  // (https://greasyfork.org/en/scripts/578524-instagram-dm-exporter/code) says
  // who sent a message, including in a group, so it is not a one-to-one signal.
  // Group words: /\bmembers\b/i, /\bparticipants\b/i, /\bgroup chat\b/i,
  // /\bgroup conversation\b/i, and משתתפים. The details panel is the member
  // list. The exact live string is TODO-LIVE-DOM.
  // Unknown and group both refuse a draft.

  const GROUP_WORD = /\bmembers\b|\bparticipants\b|\bgroup chat\b|\bgroup conversation\b|\bfamily\b|משתתפים|משפחה|קבוצה|קבוצתי/i;
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
  // Secondary only. Never sufficient for a draft.
  const ACTIVE_STATUS = /\bactive\s+now\b|\bactive\s+\d{1,4}\s*[smhd]\s+ago\b|פעיל\/ה\s+עכשיו|פעילה\s+עכשיו|פעיל\s+עכשיו|פעיל\/ה\s+לפני\s+\S+|פעילה\s+לפני\s+\S+|פעיל\s+לפני\s+\S+/i;
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

  // Checked on the raw title, before identityTokens drops digits and emoji.
  const EMOJI = /\p{Extended_Pictographic}/u;
  // A word after an attached ו is a second person when it is a first name
  // (ונועה). וייס is a surname. ורד is itself a first name, so it is unclear.
  const HE_FIRST = new Set([
    'נועה', 'דנה', 'מיכל', 'תמר', 'רוני', 'מאיה', 'עומר', 'דניאל', 'יוסי', 'אבי', 'יונתן',
    'יעל', 'שירה', 'עדי', 'הדר', 'ליאור', 'אורי', 'דוד', 'משה', 'רועי', 'עידו', 'גל', 'תום',
    'נעמה', 'רחל', 'לאה', 'שרה', 'מרים', 'אסתר', 'חנה', 'רבקה', 'דינה', 'נועם', 'איתי',
    'יובל', 'שחר', 'ליאם', 'אריאל', 'מאור', 'טל', 'עדן', 'מיה', 'אגם', 'הילה', 'קרן', 'סיון',
    'מור', 'נטע', 'איתן', 'אלון', 'ניר', 'אסף', 'גיא', 'עמית', 'ירון', 'אביגיל', 'ליאת', 'ענבר',
    'נוי', 'שני', 'אברהם', 'יצחק', 'יעקב', 'אהרן', 'שלמה', 'חיים', 'רות', 'חן', 'אביב', 'סתיו',
    'איתמר', 'יואב', 'נדב', 'תומר', 'גיל', 'רון', 'דני', 'ורד'
  ]);
  // One plain word is not a first-and-last name. danalevi_88 and dana.levi.5 are.
  const PLAIN_USER = new Set([
    'bookclub', 'weekendcrew', 'team', 'book', 'club', 'weekend', 'crew',
    'family', 'group', 'chat', 'friends', 'squad'
  ]);

  function groupTitle(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (EMOJI.test(t)) return true;
    if (/\d/.test(t)) return true;
    if (/[,，、]/.test(t)) return true;
    if (/\s(?:&|and)\s/i.test(t)) return true;
    if (/\band\s+\d{1,4}\s+others\b/i.test(t)) return true;
    if (/ועוד\s*\d|\d\s*אחרים/.test(t)) return true;
    // A standalone ו between two names ("דנה ו נועה"). ו inside "דנה וייס" is not one.
    if (/\S\s+ו\s+\S/.test(t)) return true;
    if (attachedVav(t) === 'group') return true;
    if (GROUP_WORD.test(t)) return true;
    return false;
  }

  // 'group' when ו is followed by a first name. 'unclear' when the whole word
  // is a first name (ורד). null when ו belongs to the word (וייס).
  function attachedVav(title) {
    const words = String(title || '').trim().split(/\s+/);
    let unclear = false;
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      if (!/^ו[\u0590-\u05FF]{2,}$/.test(word)) continue;
      const rest = word.slice(1);
      if (HE_FIRST.has(rest)) return 'group';
      if (HE_FIRST.has(word)) unclear = true;
    }
    return unclear ? 'unclear' : null;
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

  function imgsIn(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return [];
    return Array.from(node.querySelectorAll('img')).filter((img) => !inRow(img));
  }

  function isGroup(scope) {
    if (groupTitle(regionTitle(scope))) return true;
    if (headerSaysGroup(scope)) return true;
    if (imgsIn(scope).length >= 2) return true;
    return false;
  }

  function plainText(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Lowercase, then drop digits, underscores, and dots. "danalevi_88" and
  // "Dana Levi" share the token identity danalevi. Group checks have already
  // read the raw title, so "Team 7" and "Dana 👯" never reach this strip.
  function identityTokens(value) {
    const cleaned = String(value || '')
      .normalize('NFKC')
      .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
      .replace(/[🏠👥]/g, '')
      .toLowerCase()
      .replace(/[0-9_.]/g, '')
      .replace(/[^\p{L}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned ? cleaned.split(' ') : [];
  }

  function sameIdentity(a, b) {
    if (!a.length || !b.length) return false;
    if (a.join('\n') === b.join('\n')) return true;
    return a.join('') === b.join('');
  }

  function parsedProfile(href) {
    const raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') return null;
    let u;
    try { u = new URL(raw, 'https://example.com'); } catch (e) { return null; }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/profile.php') {
      const id = u.searchParams.get('id') || '';
      return /^\d+$/.test(id) ? { id: id, slug: '' } : null;
    }
    const seg = path.split('/').filter(Boolean).pop() || '';
    if (!seg || RESERVED_PROFILE.test(seg)) return null;
    if (/^\d+$/.test(seg)) return { id: seg, slug: '' };
    return { id: '', slug: seg };
  }

  function profileKey(href) {
    const parsed = parsedProfile(href);
    if (!parsed) return '';
    if (parsed.id) return 'id:' + parsed.id;
    const tokens = identityTokens(parsed.slug);
    return tokens.length ? 'name:' + tokens.join('') : '';
  }

  function letterParts(slug) {
    return String(slug || '').split(/[._]+/)
      .map((part) => part.replace(/\d+/g, ''))
      .filter((part) => part.length >= 2);
  }

  function titleIsFirstLast(raw) {
    const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    return words.every((word) => {
      if (PLAIN_USER.has(word.toLowerCase())) return false;
      if (/^[\u0590-\u05FF]/.test(word)) return true;
      return /^\p{Lu}/u.test(word);
    });
  }

  // dana.levi and Dana Levi + danalevi_88 are a person. bookclub is not.
  function slugProvesPerson(slug, rawTitle) {
    const parts = letterParts(slug);
    if (!parts.length) return false;
    const lowers = parts.map((part) => part.toLowerCase());
    if (lowers.length >= 2) {
      if (lowers.every((part) => PLAIN_USER.has(part))) return false;
      if (PLAIN_USER.has(lowers.join(''))) return false;
      return true;
    }
    if (PLAIN_USER.has(lowers[0])) return false;
    const words = String(rawTitle || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return titleIsFirstLast(rawTitle);
    return true;
  }

  function headingInside(el) {
    return Boolean(el && el.querySelector && el.querySelector('h1, h2, h3'));
  }

  function textOutsideHeading(el) {
    function walk(node) {
      if (!node) return '';
      if (node.nodeType === 1) {
        const tag = String(node.tagName || '').toUpperCase();
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') return '';
        return Array.from(node.childNodes || []).map(walk).join(' ');
      }
      if (node.nodeType === 3) return node.textContent || '';
      return '';
    }
    return walk(el).replace(/\s+/g, ' ').trim();
  }

  // null: the username is a plain word, so the link cannot prove a person.
  function nameSignals(el, rawTitle) {
    const signals = [];
    const title = identityTokens(rawTitle);
    const nested = headingInside(el);
    const text = nested ? textOutsideHeading(el) : plainText(el);
    const aria = el.getAttribute('aria-label') || '';
    const parsed = parsedProfile(el.getAttribute('href'));
    if (parsed && parsed.slug && !slugProvesPerson(parsed.slug, rawTitle)) return null;
    function push(value, fromSlug) {
      const tokens = identityTokens(value);
      if (!tokens.length) return;
      if (!fromSlug && nested && sameIdentity(tokens, title)) return;
      signals.push(tokens);
    }
    if (text) push(text, false);
    if (aria) push(aria, false);
    if (parsed && parsed.slug) push(parsed.slug, true);
    return signals;
  }

  function groupMatchesTitle(links, title, rawTitle) {
    let saw = false;
    for (let i = 0; i < links.length; i++) {
      const signals = nameSignals(links[i], rawTitle);
      if (signals === null) return false;
      for (let j = 0; j < signals.length; j++) {
        if (!sameIdentity(signals[j], title)) return false;
        saw = true;
      }
    }
    return saw;
  }

  function profileGroups(scope) {
    const groups = new Map();
    const order = [];
    profileLinks(scope).forEach((el) => {
      const key = profileKey(el.getAttribute('href'));
      if (!key) return;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key).push(el);
    });
    return { groups: groups, order: order };
  }

  function matchingProfile(scope) {
    const raw = regionTitle(scope);
    const title = identityTokens(raw);
    if (!title.length) return false;
    const found = profileGroups(scope);
    if (found.order.length !== 1) return false;
    return groupMatchesTitle(found.groups.get(found.order[0]), title, raw);
  }

  // An unclear ו drafts only when the URL username is that one person.
  function slugConfirmsPerson(scope, raw) {
    const title = identityTokens(raw);
    const found = profileGroups(scope);
    if (found.order.length !== 1) return false;
    const el = found.groups.get(found.order[0])[0];
    const parsed = parsedProfile(el.getAttribute('href'));
    if (!parsed || !parsed.slug || !slugProvesPerson(parsed.slug, raw)) return false;
    return sameIdentity(identityTokens(parsed.slug), title);
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

  function isProfileAnchor(el) {
    if (!el || !el.getAttribute) return false;
    if (String(el.tagName || '').toUpperCase() !== 'A') return false;
    if (inRow(el)) return false;
    if (el.getAttribute('role') === 'button') return false;
    if (infoAnchor(el)) return false;
    return profileHref(el.getAttribute('href'));
  }

  // Descendants, plus the link itself when the title is nested inside it.
  // Two anchors for one profile count once.
  function profileLinks(scope) {
    const found = [];
    function push(el) {
      if (isProfileAnchor(el) && found.indexOf(el) < 0) found.push(el);
    }
    if (scope && typeof scope.querySelectorAll === 'function') {
      Array.from(scope.querySelectorAll('a[href]')).forEach(push);
    }
    if (scope && scope.closest) push(scope.closest('a[href]'));
    return found;
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

  function headerActive(scope) {
    return headerMatches(scope, ACTIVE_STATUS);
  }

  function decide(scope, via) {
    const active = headerActive(scope);
    const raw = regionTitle(scope);
    if (isGroup(scope)) return { kind: 'group', via: via, active: active };
    if (attachedVav(raw) === 'unclear' && !slugConfirmsPerson(scope, raw)) {
      return { kind: 'unknown', via: via, active: active };
    }
    if (active && !matchingProfile(scope)) return { kind: 'unknown', via: via, active: true };
    if (matchingProfile(scope)) return { kind: 'one-to-one', via: via, active: active };
    return { kind: 'unknown', via: via, active: false };
  }

  // First matching region wins. No positive one-to-one or group signal there
  // is unknown, and the next region is not tried. A title is not proof.
  function regionAround(node) {
    if (!node || !node.closest) return node;
    const header = node.closest('header, [role="banner"]');
    if (header && !inRow(header)) return header;
    const link = node.closest('a[href]');
    if (link && !inRow(link)) return link;
    return node.parentElement || node;
  }

  function classify(root) {
    if (!root || typeof root.querySelector !== 'function') return { kind: 'unknown', via: null };
    const info = infoControl(root);
    if (info) return decide(scopeFor(info, root), 'aria');
    const banner = root.querySelector('[role="banner"]');
    if (banner && !inRow(banner)) return decide(banner, 'banner');
    const heading = headingIn(root);
    if (heading) return decide(regionAround(heading), 'heading');
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
