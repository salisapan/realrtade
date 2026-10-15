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
  //    That h3 sits inside a numeric-id link. The title text is not the proof.
  //    The page URL /messages/t/1358224314037055 matches that id, so the live
  //    header is one-to-one. A group thread has its own id.
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
  //    One participant line is the person. A second participant line, a Group
  //    chip, or a group word stays quiet. A label (VIP), "Assigned to",
  //    the agent's name, and the Page's name are not the person.
  //
  // Inside the chosen region, a draft needs one header profile link that
  // names the same person as the header title. The title's own text does not
  // count when that title sits inside the link. A draft then needs a username
  // in the URL that matches the name. A numeric id with no other signal stays
  // quiet. A username that is one plain word (bookclub, weekendcrew, team) is
  // not a first-and-last name and stays quiet. A numeric id is not a name.
  // It proves a one-to-one chat only when the page thread id (/t/<id> or
  // /e2ee/t/<id>) equals that id, or when the conversation info panel shows
  // one person (View profile, or a block/mute action) and no members list.
  // Link text still counts for a username slug. Group checks read the
  // raw title before digits and emoji are stripped. "Active now", "Active 5m ago", "פעיל/ה עכשיו",
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

  // Word edge, including a Hebrew ה/ו prefix. \b does not see Hebrew letters.
  const GROUP_WORD = /(?:^|[^\p{L}\p{N}])(?:members|participants|group chat|group conversation|family|department|dept|team|group|squad|crew|staff)(?![\p{L}\p{N}])|(?:^|[^\p{L}\p{N}])ו?ה?(?:מחלקת|מחלקה|משתתפים|משפחה|קבוצתי|קבוצה|צוות)(?![\p{L}\p{N}])/iu;
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

  const INBOX_SKIP = /\/lib:(label|assignee|agent|page_name)(?:\/|$)/;
  const INBOX_GROUP = /\/lib:group_chip(?:\/|$)/;
  const LABEL_LINE = /^(?:\(?\s*vip\s*\)?|labels?)$/i;
  const ASSIGNED_LINE = /^(?:assigned to|הוקצה(?:\s+ל)?)\b/i;
  const GROUP_CHIP = /^(?:group|קבוצה)$/i;

  // Participant lines in a Page inbox. The first text node is not the person.
  function inboxFacts(region) {
    const names = [];
    let group = false;
    function consider(text) {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (GROUP_CHIP.test(t) || GROUP_WORD.test(t) || countSaysGroup(t)) { group = true; return; }
      if (ASSIGNED_LINE.test(t) || LABEL_LINE.test(t) || statusLine(t)) return;
      if (!/\p{L}/u.test(t)) return;
      names.push(t);
    }
    function walk(node) {
      if (!node || node.nodeType !== 1) return;
      const role = node.getAttribute && node.getAttribute('role');
      if (role === 'button' || role === 'row') return;
      const surface = (node.getAttribute && node.getAttribute('data-surface')) || '';
      if (INBOX_GROUP.test(surface)) { group = true; return; }
      if (INBOX_SKIP.test(surface)) return;
      const kids = Array.from(node.childNodes || []);
      let nested = false;
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i];
        if (kid.nodeType === 1 && !(kid.getAttribute && kid.getAttribute('role') === 'button')) nested = true;
      }
      if (!nested) {
        consider(kids.filter((kid) => kid.nodeType === 3).map((kid) => kid.textContent).join(' '));
        return;
      }
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i];
        if (kid.nodeType === 3) consider(kid.textContent);
        else if (kid.nodeType === 1) walk(kid);
      }
    }
    walk(region);
    return { names: names, group: group };
  }

  function nameIn(region, via) {
    if (!region || typeof region.querySelector !== 'function') return '';
    if (via === 'inbox') {
      const facts = inboxFacts(region);
      return facts.names.length === 1 ? facts.names[0] : '';
    }
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

  function statusLine(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (ACTIVE_STATUS.test(t) && t.length < 40) return true;
    if (/^(?:messenger|instagram|facebook|whatsapp)$/i.test(t)) return true;
    if (/^[·•∙]\s*\d{1,4}\s*[smhdw]$/i.test(t)) return true;
    return false;
  }
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

  // A comma, an "and" / "&", "and N others", a digit, an emoji, a group word,
  // or a group-looking title (Book club, Team, Weekend crew). A thread id
  // never overrides this.
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
    if (groupLooking(t)) return true;
    return false;
  }

  function groupLooking(title) {
    const words = String(title || '').trim().split(/\s+/).map((word) => word.toLowerCase().replace(/[^\p{L}]/gu, '')).filter(Boolean);
    return words.length > 0 && words.every((word) => PLAIN_USER.has(word));
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

  // A participant count other than 1, a multi-person title, or a header
  // marker (members, group chat) is a group, and a group stays quiet.
  function imgsIn(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return [];
    return Array.from(node.querySelectorAll('img')).filter((img) => !inRow(img));
  }

  // A group stays quiet even when a profile link matches the title.
  function isGroup(scope, via) {
    if (via === 'inbox') {
      const facts = inboxFacts(scope);
      if (facts.group || facts.names.length > 1) return true;
    }
    if (groupTitle(regionTitle(scope, via))) return true;
    if (headerSaysGroup(scope)) return true;
    if (imgsIn(scope).length >= 2) return true;
    return false;
  }

  // Group checks have already read the raw title. Digits and emoji stripped
  // here are for comparison only, so "Team 7" and "Dana 👯" never arrive.
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
    if (parsed && parsed.id && !parsed.slug) return [];
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

  function matchingProfile(scope, via) {
    const raw = regionTitle(scope, via);
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

  function isProfileAnchor(el) {
    if (!el || !el.getAttribute) return false;
    if (String(el.tagName || '').toUpperCase() !== 'A') return false;
    if (inRow(el)) return false;
    if (el.getAttribute('role') === 'button') return false;
    if (infoAnchor(el)) return false;
    return profileHref(el.getAttribute('href'));
  }

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

  // Active status is recorded and then ignored unless the profile link
  // already matches. It cannot fill in a missing or mismatched link.
  function headerActive(scope) {
    return headerMatches(scope, ACTIVE_STATUS);
  }

  // Page URL thread id. Group threads use their own id, not a member's.
  function threadIdFromPage(href) {
    let u;
    try { u = new URL(String(href || ''), 'https://www.messenger.com'); } catch (e) { return ''; }
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'messenger.com' && host !== 'facebook.com' && host !== 'business.facebook.com') return '';
    if (/\/direct\//.test(u.pathname)) return '';
    const m = u.pathname.match(/\/(?:e2ee\/)?t\/(\d+)\/?$/);
    return m ? m[1] : '';
  }

  function threadMatches(scope, href, via) {
    if (groupTitle(regionTitle(scope, via))) return false;
    const thread = threadIdFromPage(href);
    if (!thread) return false;
    const found = profileGroups(scope);
    return found.order.length === 1 && found.order[0] === 'id:' + thread;
  }

  function outsideRowText(root) {
    function walk(node) {
      if (!node) return '';
      if (node.nodeType === 1) {
        if (node.getAttribute && node.getAttribute('role') === 'row') return '';
        return Array.from(node.childNodes || []).map(walk).join(' ');
      }
      if (node.nodeType === 3) return node.textContent || '';
      return '';
    }
    return walk(root).replace(/\s+/g, ' ').trim();
  }

  function membersListed(root) {
    const text = outsideRowText(root);
    if (countSaysGroup(text)) return true;
    return /\bmembers\b|\bparticipants\b|\badd people\b|משתתפים/i.test(text);
  }

  // "Block Dana" / "Mute Dana" / "חסום דנה" / "השתק את דנה" only, and the
  // name has to be the title. A bare Block or Mute is not a signal.
  function namedAction(label, rawTitle) {
    const text = String(label || '').replace(/\s+/g, ' ').trim();
    const english = text.match(/^(?:block|mute)\s+(.+)$/i);
    const hebrew = text.match(/^(?:חסום|השתק)(?:\s+את)?\s+(.+)$/);
    const named = (english && english[1]) || (hebrew && hebrew[1]) || '';
    if (!named) return false;
    return sameIdentity(identityTokens(named), identityTokens(rawTitle));
  }

  function personControl(el, rawTitle) {
    if (!el || inRow(el) || !el.getAttribute) return false;
    const tag = String(el.tagName || '').toUpperCase();
    const role = el.getAttribute('role') || '';
    if (tag !== 'A' && tag !== 'BUTTON' && role !== 'button' && role !== 'link') return false;
    const label = ((el.getAttribute('aria-label') || '') + ' ' + plainText(el)).replace(/\s+/g, ' ').trim();
    if (/\bview profile\b/i.test(label)) return true;
    return namedAction(label, rawTitle);
  }

  // Backup when the URL id is absent. One person, and no members list.
  function singlePersonPanel(root, rawTitle) {
    if (!root || typeof root.querySelectorAll !== 'function') return false;
    if (membersListed(root)) return false;
    const ids = new Set();
    profileLinks(root).forEach((el) => {
      const key = profileKey(el.getAttribute('href'));
      if (key) ids.add(key);
    });
    if (ids.size > 1) return false;
    return Array.from(root.querySelectorAll('a, button, [role="button"], [role="link"]')).some((el) => personControl(el, rawTitle));
  }

  function firstHeading(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return '';
    const list = Array.from(node.querySelectorAll('h1, h2, h3'));
    for (let i = 0; i < list.length; i++) {
      if (inRow(list[i])) continue;
      const text = plainText(list[i]);
      if (text && !SKIP_HEADING.test(text)) return text;
    }
    return '';
  }

  function decide(scope, via, href, root) {
    const name = nameIn(scope, via);
    const active = headerActive(scope);
    const raw = regionTitle(scope, via);
    const whole = root || scope;
    if (isGroup(scope, via) || groupTitle(firstHeading(whole)) || membersListed(whole)) return { kind: 'group', via: via, name: name, active: active };
    if (via === 'inbox') {
      const facts = inboxFacts(scope);
      const person = facts.names.length === 1 ? facts.names[0] : '';
      if (facts.group || facts.names.length > 1 || (person && groupTitle(person))) {
        return { kind: 'group', via: via, name: person, active: active };
      }
      if (person) return { kind: 'one-to-one', via: via, name: person, active: active };
      return { kind: 'unknown', via: via, name: '', active: false };
    }
    const proved = matchingProfile(scope, via) || threadMatches(scope, href, via) || singlePersonPanel(whole, raw);
    if (attachedVav(raw) === 'unclear' && !slugConfirmsPerson(scope, raw) && !threadMatches(scope, href, via) && !singlePersonPanel(whole, raw)) {
      return { kind: 'unknown', via: via, name: name, active: active };
    }
    if (active && !proved) return { kind: 'unknown', via: via, name: name, active: true };
    if (proved) return { kind: 'one-to-one', via: via, name: name, active: active };
    return { kind: 'unknown', via: via, name: name, active: false };
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

  function classify(root, href) {
    if (!root || typeof root.querySelector !== 'function') return { kind: 'unknown', via: null, name: '' };
    const info = infoControl(root);
    if (info) return decide(headerRow(info) || scopeFor(info, root), 'aria', href, root);
    const banner = root.querySelector('[role="banner"]');
    if (banner && !inRow(banner)) return decide(banner, 'banner', href, root);
    const heading = headingIn(root);
    if (heading) return decide(regionAround(heading), 'heading', href, root);
    const inbox = root.querySelector('[data-surface$="inbox:detail_view_header"]');
    if (inbox && !inRow(inbox)) return decide(inbox, 'inbox', href, root);
    return { kind: 'unknown', via: null, name: '' };
  }

  function isOneToOne(root, href) {
    return classify(root, href).kind === 'one-to-one';
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

  function threadIdFor(href, title, root) {
    const where = page(href);
    if (!where) return null;
    let u = null;
    try { u = new URL(String(href || '')); } catch (e) { u = null; }
    const host = u ? u.hostname.replace(/^www\./, '') : '';
    if (host === 'business.facebook.com') {
      const q = u.searchParams.get('selected_item_id') || u.searchParams.get('thread_id') || u.searchParams.get('thread');
      const pathMatch = u.pathname.match(/\/(?:t|thread)\/([^/]+)/);
      const pathId = pathMatch && pathMatch[1] && pathMatch[1] !== 'all' ? decodeURIComponent(pathMatch[1]) : '';
      let headerId = '';
      if (root && typeof root.querySelector === 'function') {
        const el = root.querySelector('[data-thread-id], [data-selected-item-id]');
        if (el) headerId = el.getAttribute('data-thread-id') || el.getAttribute('data-selected-item-id') || '';
      }
      const id = String(q || pathId || headerId || '').trim();
      return id ? 'ms:' + id : null;
    }
    const path = u ? u.pathname : '';
    const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return 'ms:' + (path || name || 'open');
  }

  return { page, isOneToOne, classify, authorOf, joinText, threadIdFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowMessengerParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowMessengerParse = FlowMessengerParse;
