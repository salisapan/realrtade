// One classifier for Messenger, Instagram, and Business Suite. No name lists.
// A person-shaped title (1–3 words, letters only) cancels a group-word veto.
// It is not proof. A draft still needs a profile link, a matching thread id,
// or a one-person panel. A title that is only the group word stays a group.
const FlowGroupWord = (() => {
  const EN = new Set(['members', 'participants', 'family', 'department', 'dept', 'team', 'group', 'squad', 'crew', 'staff']);
  const HE = new Set(['מחלקת', 'מחלקה', 'משתתפים', 'משפחה', 'קבוצתי', 'קבוצת', 'קבוצה', 'צוות']);

  function bare(text) {
    return String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function wordsOf(text) {
    return bare(text).split(' ').filter(Boolean);
  }

  function letters(word) {
    return String(word || '').replace(/[^\p{L}]/gu, '');
  }

  function groupStem(word) {
    const raw = letters(word);
    if (!raw) return '';
    if (EN.has(raw.toLowerCase())) return raw.toLowerCase();
    if (HE.has(raw)) return raw;
    const prefixed = raw.match(/^([בלהו]{1,3})(.+)$/u);
    return prefixed && HE.has(prefixed[2]) ? prefixed[2] : '';
  }

  // True only when the title is the group word by itself.
  function counts(text) {
    const words = wordsOf(text);
    return words.length === 1 && Boolean(groupStem(words[0]));
  }

  // 1–3 words of letters. Digits, emoji, and punctuation are not a person.
  function personShaped(text) {
    const title = bare(text);
    if (!title) return false;
    if (/\p{Extended_Pictographic}/u.test(title) || /\d/.test(title)) return false;
    if (/[^\p{L}\s]/u.test(title)) return false;
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) return false;
    return words.every((word) => /^\p{L}+$/u.test(word));
  }

  function chip(text) {
    return /^(?:group|קבוצה)(?:\s+(?:chat|conversation))?$/i.test(String(text || '').replace(/\s+/g, ' ').trim());
  }

  // "3 members" / "participants" / "Add people" as the whole text of a
  // header or subtitle element. A word inside a name is not this.
  function memberLine(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/^add people$/i.test(t)) return true;
    return /^(?:\d{1,4}\s+)?(?:members|participants|משתתפים)$/i.test(t);
  }

  const COUNT_WORD = /\b(\d{1,4})\s*(members|participants|people|others|משתתפים|אנשים)\b/i;
  const ACTIVE_STATUS = /\bactive\s+now\b|\bactive\s+\d{1,4}\s*[smhd]\s+ago\b|פעיל\/ה\s+עכשיו|פעילה\s+עכשיו|פעיל\s+עכשיו|פעיל\/ה\s+לפני\s+\S+|פעילה\s+לפני\s+\S+|פעיל\s+לפני\s+\S+/i;
  const SKIP_HEADING = /^(conversation information|messages|chat details)$/i;
  const PLAIN_USER = new Set(['bookclub', 'weekendcrew', 'team', 'book', 'club', 'weekend', 'crew', 'family', 'group', 'chat', 'friends', 'squad']);
  const RESERVED_PROFILE = /^(direct|explore|accounts|reels|stories|p|tv|messages|t|groups|watch|latest|inbox)$/i;
  const GROUP_MENU = /^(?:leave(?:\s+(?:group|chat|conversation))?|block\s+(?:group|conversation)|mute\s+(?:group|conversation|chat|person)|עזוב(?:\s+את\s+הקבוצה)?|חסום\s+קבוצה|השתק\s+שיחה)$/i;
  const INBOX_SKIP = /\/lib:(label|assignee|agent|page_name)(?:\/|$)/;
  const INBOX_GROUP = /\/lib:group_chip(?:\/|$)/;

  function plain(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function inRow(el) {
    return Boolean(el && el.closest && el.closest('[role="row"]'));
  }

  function countLine(text) {
    const m = String(text || '').match(COUNT_WORD);
    return Boolean(m) && Number(m[1]) !== 1;
  }

  function multiPersonTitle(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/[,，、]/.test(t)) return true;
    if (/\s(?:&|and)\s/i.test(t)) return true;
    if (/\band\s+\d{1,4}\s+others\b/i.test(t)) return true;
    if (/ועוד\s*\d|\d\s*אחרים/.test(t)) return true;
    if (/\S\s+ו\s+\S/.test(t)) return true;
    return false;
  }

  function firstHeading(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return '';
    const list = Array.from(root.querySelectorAll('h1, h2, h3'));
    for (let i = 0; i < list.length; i++) {
      if (inRow(list[i])) continue;
      const text = plain(list[i]);
      if (text && !SKIP_HEADING.test(text)) return text;
    }
    return '';
  }

  function inboxNames(root) {
    const header = root && root.querySelector && root.querySelector('[data-surface$="inbox:detail_view_header"]');
    if (!header) return { names: [], group: false };
    const names = [];
    let group = false;
    function consider(text) {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (chip(t) || counts(t) || countLine(t) || memberLine(t)) { group = true; return; }
      if (/^(?:assigned to|הוקצה(?:\s+ל)?)\b/i.test(t) || /^(?:\(?\s*vip\s*\)?|labels?)$/i.test(t)) return;
      if (ACTIVE_STATUS.test(t) && t.length < 40) return;
      if (/^(?:messenger|instagram|facebook|whatsapp)$/i.test(t)) return;
      if (/^[·•∙]\s*\d{1,4}\s*[smhdw]$/i.test(t)) return;
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
        if (kids[i].nodeType === 1 && !(kids[i].getAttribute && kids[i].getAttribute('role') === 'button')) nested = true;
      }
      if (!nested) {
        consider(kids.filter((kid) => kid.nodeType === 3).map((kid) => kid.textContent).join(' '));
        return;
      }
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].nodeType === 3) consider(kids[i].textContent);
        else if (kids[i].nodeType === 1) walk(kids[i]);
      }
    }
    walk(header);
    return { names: names, group: group };
  }

  function leafTexts(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const out = [];
    const nodes = Array.from(root.querySelectorAll('span, div, p, li, h4, h5, h6, a, button'));
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (inRow(el)) continue;
      const tag = String(el.tagName || '').toUpperCase();
      if (tag === 'H1' || tag === 'H2' || tag === 'H3') continue;
      if (el.querySelector && el.querySelector('h1, h2, h3, span, div, p, li')) continue;
      const text = plain(el);
      if (text) out.push({ el: el, text: text });
    }
    return out;
  }

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

  function infoAnchor(el) {
    const label = String(el.getAttribute && el.getAttribute('aria-label') || '').trim();
    return /^conversation information$/i.test(label) || /chat details/i.test(label);
  }

  function profileAnchors(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('a[href]')).filter((el) => {
      if (inRow(el) || infoAnchor(el)) return false;
      if (el.getAttribute('role') === 'button') return false;
      return Boolean(parsedProfile(el.getAttribute('href')));
    });
  }

  function profileKey(href) {
    const parsed = parsedProfile(href);
    if (!parsed) return '';
    if (parsed.id) return 'id:' + parsed.id;
    const tokens = identityTokens(parsed.slug);
    return tokens.length ? 'name:' + tokens.join('') : '';
  }

  function letterParts(slug) {
    return String(slug || '').split(/[._]+/).map((part) => part.replace(/\d+/g, '')).filter((part) => part.length >= 2);
  }

  function titleIsFirstLast(raw) {
    const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    return words.every((word) => {
      if (PLAIN_USER.has(word.toLowerCase())) return false;
      if (/^[\u0590-\u05FF]/.test(word)) return true;
      if (/\d/.test(word) || /\p{Extended_Pictographic}/u.test(word)) return false;
      return /^\p{Lu}/u.test(word);
    });
  }

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
    const words = String(rawTitle || '').trim().split(/\s+/).filter((word) => word && !/\p{Extended_Pictographic}/u.test(word));
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

  function threadDigits(href) {
    let u;
    try { u = new URL(String(href || ''), 'https://www.messenger.com'); } catch (e) { return ''; }
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'messenger.com' && host !== 'facebook.com' && host !== 'business.facebook.com') return '';
    if (/\/direct\//.test(u.pathname)) return '';
    const m = u.pathname.match(/\/(?:e2ee\/)?t\/(\d+)\/?$/);
    return m ? m[1] : '';
  }

  function businessSelected(root, href) {
    let u = null;
    try { u = new URL(String(href || '')); } catch (e) { u = null; }
    if (!u || u.hostname.replace(/^www\./, '') !== 'business.facebook.com') return false;
    const q = u.searchParams.get('selected_item_id') || u.searchParams.get('thread_id') || u.searchParams.get('thread');
    const pathMatch = u.pathname.match(/\/(?:t|thread)\/([^/]+)/);
    const pathId = pathMatch && pathMatch[1] && pathMatch[1] !== 'all' ? decodeURIComponent(pathMatch[1]) : '';
    let headerId = '';
    if (root && root.querySelector) {
      const el = root.querySelector('[data-thread-id], [data-selected-item-id]');
      if (el && !inRow(el)) headerId = el.getAttribute('data-thread-id') || el.getAttribute('data-selected-item-id') || '';
    }
    return Boolean(String(q || pathId || headerId || '').trim());
  }

  function controlLabel(el) {
    return ((el.getAttribute && el.getAttribute('aria-label')) || '') + ' ' + plain(el);
  }

  function factsFrom(root, href) {
    const inbox = inboxNames(root);
    const heading = firstHeading(root);
    const title = heading || (inbox.names.length === 1 ? inbox.names[0] : '');
    const leaves = leafTexts(root);
    let member = inbox.group;
    let chipSeen = inbox.group && leaves.some((item) => chip(item.text));
    leaves.forEach((item) => {
      if (memberLine(item.text) || (countLine(item.text) && item.text !== title)) member = true;
      if (chip(item.text) || chip(item.el.getAttribute && item.el.getAttribute('aria-label') || '')) chipSeen = true;
      const surface = (item.el.getAttribute && item.el.getAttribute('data-surface')) || '';
      if (INBOX_GROUP.test(surface)) chipSeen = true;
    });
    if (root && root.querySelectorAll) {
      Array.from(root.querySelectorAll('[aria-label]')).forEach((el) => {
        if (!inRow(el) && chip(el.getAttribute('aria-label') || '')) chipSeen = true;
      });
    }
    const anchors = profileAnchors(root);
    const keys = [];
    anchors.forEach((el) => {
      const key = profileKey(el.getAttribute('href'));
      if (key && keys.indexOf(key) < 0) keys.push(key);
    });
    const imgs = root && root.querySelectorAll ? Array.from(root.querySelectorAll('img')).filter((img) => !inRow(img)) : [];
    let participants = 0;
    if (multiPersonTitle(title) || inbox.names.length > 1 || keys.length > 1 || imgs.length >= 2) participants = 2;
    let groupMenu = false;
    let panel = false;
    if (root && root.querySelectorAll) {
      Array.from(root.querySelectorAll('a, button, [role="button"], [role="link"]')).forEach((el) => {
        if (inRow(el)) return;
        const bits = [plain(el), String(el.getAttribute && el.getAttribute('aria-label') || '')];
        bits.forEach((label) => {
          const text = String(label || '').replace(/\s+/g, ' ').trim();
          if (!text) return;
          if (GROUP_MENU.test(text)) groupMenu = true;
          if (/\bview profile\b/i.test(text)) panel = true;
          const english = text.match(/^(?:block|mute)\s+(.+)$/i);
          const hebrew = text.match(/^(?:חסום|השתק)(?:\s+את)?\s+(.+)$/);
          const named = (english && english[1]) || (hebrew && hebrew[1]) || '';
          if (named && sameIdentity(identityTokens(named), identityTokens(title))) panel = true;
        });
      });
    }
    let nestedNumeric = false;
    anchors.forEach((el) => {
      const parsed = parsedProfile(el.getAttribute('href'));
      if (!parsed || !parsed.id || !headingInside(el)) return;
      const extra = textOutsideHeading(el);
      if (memberLine(extra) || countLine(extra) || chip(extra) || /\bgroup\b|קבוצה/i.test(extra)) nestedNumeric = true;
    });
    let profileLink = false;
    if (keys.length === 1 && keys[0].indexOf('name:') === 0) {
      const el = anchors.filter((item) => profileKey(item.getAttribute('href')) === keys[0])[0];
      const parsed = parsedProfile(el.getAttribute('href'));
      if (parsed && parsed.slug && slugProvesPerson(parsed.slug, title)) {
        const signals = [];
        const visible = headingInside(el) ? textOutsideHeading(el) : plain(el);
        if (visible) signals.push(identityTokens(visible));
        signals.push(identityTokens(parsed.slug));
        profileLink = signals.length > 0 && signals.every((tokens) => tokens.length && sameIdentity(tokens, identityTokens(title)));
      }
    }
    const numericIds = keys.filter((key) => key.indexOf('id:') === 0).map((key) => key.slice(3));
    const threadMatch = numericIds.length === 1 && numericIds[0] === threadDigits(href);
    let active = false;
    if (root && root.querySelectorAll) {
      active = Array.from(root.querySelectorAll('[aria-label], span, div')).some((el) => {
        if (inRow(el)) return false;
        return ACTIVE_STATUS.test(plain(el)) || ACTIVE_STATUS.test((el.getAttribute && el.getAttribute('aria-label')) || '');
      });
    }
    return {
      title: title,
      name: inbox.names.length === 1 ? inbox.names[0] : title,
      memberLine: member,
      participants: participants,
      groupMenu: groupMenu,
      nestedNumericGroup: nestedNumeric,
      groupChip: chipSeen,
      profileLink: profileLink,
      threadMatch: threadMatch,
      selectedItem: businessSelected(root, href) && inbox.names.length === 1,
      onePersonPanel: panel && keys.length <= 1,
      active: active
    };
  }

  // 'person' is the only title that may reach proof. Digits and emoji are
  // unknown, and unknown stays quiet even when a profile link is present.
  // A title that is only the group word is a group.
  function titleVerdict(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (!t) return 'unknown';
    if (/\p{Extended_Pictographic}/u.test(t) || /\d/.test(t)) return 'unknown';
    if (counts(t)) return 'group';
    if (personShaped(t)) return 'person';
    return 'unknown';
  }

  // One order for every surface. A structural signal is quiet, and proof
  // cannot override it. inbox selected_item_id is step 3, never a bypass.
  function pipeline(rootOrFacts, href) {
    const facts = rootOrFacts && typeof rootOrFacts.querySelector === 'function'
      ? factsFrom(rootOrFacts, href)
      : (rootOrFacts || {});
    const participants = Number(facts.participants) || 0;
    if (facts.memberLine || participants > 1 || facts.groupMenu || facts.nestedNumericGroup || facts.groupChip) {
      return { kind: 'group', name: facts.name || '', active: Boolean(facts.active) };
    }
    const titleKind = titleVerdict(facts.title);
    if (titleKind !== 'person') {
      return { kind: titleKind === 'group' ? 'group' : 'unknown', name: facts.name || '', active: Boolean(facts.active) };
    }
    if (facts.profileLink || facts.threadMatch || facts.selectedItem || facts.onePersonPanel) {
      return { kind: 'one-to-one', name: facts.name || facts.title || '', active: Boolean(facts.active) };
    }
    return { kind: 'unknown', name: facts.name || '', active: Boolean(facts.active) };
  }

  return { counts, personShaped, chip, memberLine, titleVerdict, pipeline };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowGroupWord = FlowGroupWord;
if (typeof module !== 'undefined' && module.exports) module.exports = { FlowGroupWord };
