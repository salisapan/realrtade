// Microsoft Teams on the web (teams.microsoft.com, teams.live.com). Pure parsing:
// which conversation is open, the last messages, and judge input for the shared stack.
// The content script reads the page. This file does not type or send.
const FlowTeamsParse = (() => {
  const SKIP_TITLE = /^(conversation|chat|channel|teams|messages|פרטי שיחה|פרטי צ'אט)$/i;

  function page(href) {
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'teams.microsoft.com' || host === 'teams.live.com') return { host: host };
    return null;
  }

  function fresh(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function decoded(value) {
    const raw = String(value || '');
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function idIn(text) {
    const m = decoded(text).match(/(?:^|[/#?=&])((?:19|48):[^/?#&\s]+)/);
    return m ? m[1] : '';
  }

  function segmentAfter(parts, name) {
    const i = parts.indexOf(name);
    if (i < 0 || !parts[i + 1]) return '';
    const seg = decoded(parts[i + 1]);
    if (seg === 'conversations' || seg === 'messages') return '';
    return seg;
  }

  function chatIdFromHref(href) {
    const raw = String(href || '');
    const direct = idIn(raw);
    if (direct) return direct;
    let u;
    try { u = new URL(raw); } catch (e) { return ''; }
    if (!page(raw)) return '';
    const hash = String(u.hash || '').replace(/^#/, '');
    const hashParts = hash.split(/[/?=&]/).filter(Boolean);
    const pathParts = u.pathname.split('/').filter(Boolean);
    return segmentAfter(hashParts, 'chat') || segmentAfter(hashParts, 'conversations') || segmentAfter(hashParts, 'channel')
      || segmentAfter(pathParts, 'chat') || segmentAfter(pathParts, 'conversations') || segmentAfter(pathParts, 'channel')
      || '';
  }

  function chatIdFromDom(root) {
    if (!root || !root.querySelector) return '';
    const own = (root.getAttribute && (root.getAttribute('data-conversation-id') || root.getAttribute('data-glance-conversation-id'))) || '';
    if (own) return decoded(own);
    const marked = root.querySelector('[data-conversation-id], [data-glance-conversation-id]');
    if (marked) {
      const v = marked.getAttribute('data-conversation-id') || marked.getAttribute('data-glance-conversation-id') || '';
      if (v) return decoded(v);
    }
    const nodes = root.querySelectorAll('[id]');
    const list = Array.from(nodes).slice(0, 80);
    for (let i = 0; i < list.length; i++) {
      const hit = idIn(list[i].getAttribute('id') || '');
      if (hit) return hit;
    }
    return '';
  }

  const TITLE_SELECTORS = [
    '[data-glance-title]',
    '[data-tid="chat-title"]',
    '[data-tid="chat-header-title"]',
    '[data-tid="chat-header-text"]',
    '[data-tid="channel-header-title"]',
    '[data-tid="conversationHeader"]',
    '[data-tid="chat-header"] [role="heading"]',
    '[data-tid="chat-header"] h1',
    '[data-tid="chat-header"] h2',
    'header h1',
    'header h2',
    'header h3',
    '[role="banner"] h1',
    '[role="banner"] h2',
    '[role="heading"][aria-level="2"]'
  ];
  const SELF_MARK = /\(\s*(?:you|אתה|את|את\/ה)\s*\)/i;
  const SELF_NAME = /^(?:you|אתה|את|את\/ה)$/i;

  function usableTitle(text) {
    const t = fresh(text);
    if (!t || SKIP_TITLE.test(t)) return '';
    return t;
  }

  function plainName(text) {
    const t = usableTitle(text);
    if (!t || t.length > 80) return '';
    if (/^\d{1,2}:\d{2}/.test(t)) return '';
    return t;
  }

  function titleOf(root) {
    if (!root || !root.querySelector) return '';
    for (let i = 0; i < TITLE_SELECTORS.length; i++) {
      const el = root.querySelector(TITLE_SELECTORS[i]);
      if (!el) continue;
      const t = usableTitle(el.getAttribute('data-glance-title') || el.getAttribute('aria-label') || el.textContent);
      if (t) return t;
    }
    const header = root.querySelector('[data-tid="chat-header"]');
    if (!header) return '';
    const bits = Array.from(header.querySelectorAll('span, h1, h2, h3, [role="heading"]'));
    for (let i = 0; i < bits.length; i++) {
      if (bits[i].closest && bits[i].closest('button, [role="button"]')) continue;
      const t = plainName(bits[i].textContent);
      if (t) return t;
    }
    return plainName(header.textContent);
  }

  function titleFromDocument(title) {
    const raw = fresh(title);
    if (!raw) return '';
    if (!/microsoft teams/i.test(raw) && !/^(?:chat|conversation|צ'אט|שיחה)\s*[|–-]/.test(raw)) return '';
    let t = raw.replace(/\s*[|–-]\s*Microsoft Teams\s*$/i, '');
    t = t.replace(/^(?:chat|conversation|צ'אט|שיחה)\s*[|–-]\s*/i, '');
    if (/^microsoft teams$/i.test(fresh(t))) return '';
    return plainName(t);
  }

  function bestHref(own, parentHref) {
    const a = String(own || '');
    if (chatIdFromHref(a)) return a;
    const b = String(parentHref || '');
    if (b && b !== a && page(b) && chatIdFromHref(b)) return b;
    return a;
  }

  function headerAria(root) {
    if (!root || !root.querySelector) return '';
    const el = root.querySelector('[data-tid="chat-header"], [data-tid="chat-title"], header, [role="banner"]');
    if (!el) return '';
    return usableTitle(el.getAttribute('aria-label') || '');
  }

  function isSelfChat(title, aria, chatId) {
    const blob = fresh((title || '') + ' ' + (aria || ''));
    if (SELF_MARK.test(blob)) return true;
    if (SELF_NAME.test(fresh(title)) || SELF_NAME.test(fresh(aria))) return true;
    return /(?:^|[/])48:notes(?:$|[/])/.test(String(chatId || '')) || String(chatId || '') === '48:notes';
  }

  function partyName(title) {
    return fresh(String(title || '').replace(SELF_MARK, ''));
  }

  function threadKind(root) {
    const marked = root && root.getAttribute && root.getAttribute('data-glance-teams-thread');
    if (marked === 'dm' || marked === 'channel') return marked;
    const hint = root && root.querySelector && root.querySelector('[data-glance-teams-thread]');
    if (hint) {
      const k = hint.getAttribute('data-glance-teams-thread');
      if (k === 'dm' || k === 'channel') return k;
    }
    const title = titleOf(root);
    if (isSelfChat(title, headerAria(root), chatIdFromDom(root))) return 'dm';
    if (typeof globalThis !== 'undefined' && globalThis.FlowGroupWord && globalThis.FlowGroupWord.counts(title)) return 'group';
    if (/,|&|\band\b|\d+\s+members|\bparticipants\b|משתתפים/i.test(title)) return 'group';
    return 'dm';
  }

  function joinText(pieces) {
    const out = [];
    (pieces || []).forEach((p) => {
      const t = fresh(p && p.text);
      if (!t || (p && p.quoted)) return;
      out.push(t);
    });
    return out.join(' ');
  }

  function textOf(node) {
    if (!node) return '';
    const marked = node.getAttribute && node.getAttribute('data-glance-text');
    if (marked) return fresh(marked);
    const pieces = Array.from(node.querySelectorAll('[dir="auto"], [data-testid="message-body-content"]')).map((s) => ({
      text: s.innerText || s.textContent || '',
      quoted: Boolean(s.closest('[data-quoted="1"], blockquote'))
    }));
    if (!pieces.length) return fresh(node.textContent);
    return joinText(pieces);
  }

  const AUTHOR_SELECTOR = '[data-tid="message-author-name"], [data-tid="message-author"], [data-tid="message-username"]';

  function authorName(node) {
    if (!node || !node.querySelector) return '';
    const inside = node.querySelector(AUTHOR_SELECTOR);
    if (inside && node.contains(inside)) return fresh(inside.textContent);
    const reply = node.querySelector('[data-tid="reply-message-header"] span');
    if (reply && node.contains(reply)) {
      const named = plainName(reply.textContent);
      if (named) return named;
    }
    let prev = node.previousElementSibling;
    let hops = 0;
    while (prev && hops < 4) {
      const tid = prev.getAttribute && prev.getAttribute('data-tid');
      if (tid === 'message-author-name' || tid === 'message-author' || tid === 'message-username') return fresh(prev.textContent);
      const nested = prev.querySelector && prev.querySelector(AUTHOR_SELECTOR);
      if (nested) return fresh(nested.textContent);
      if (tid === 'reply-message-header') {
        const span = prev.querySelector && prev.querySelector('span');
        const named = plainName(span ? span.textContent : prev.textContent);
        if (named) return named;
      }
      prev = prev.previousElementSibling;
      hops += 1;
    }
    return '';
  }

  function authorOf(node) {
    if (!node) return 'unknown';
    const raw = (node.getAttribute && node.getAttribute('data-author')) || '';
    if (raw === 'me' || raw === 'them') return raw;
    const aria = String((node.getAttribute && node.getAttribute('aria-label')) || '');
    if (/^(?:you|אתה|את)\b|you sent|הודעה שלך/i.test(aria)) return 'me';
    const said = aria.match(/^\s*(.{1,80}?)\s+said\b/i) || aria.match(/^\s*(.{1,80}?)\s+אמר(?:ה|ת)?\b/);
    if (said) {
      const who = fresh(said[1]);
      if (SELF_NAME.test(who) || SELF_MARK.test(who)) return 'me';
      if (who) return 'them';
    }
    const name = authorName(node);
    if (SELF_NAME.test(name)) return 'me';
    if (name) return 'them';
    if (/sent a message|שלח\/ה/i.test(aria)) return 'them';
    return 'unknown';
  }

  function attachmentsOf(node) {
    if (!node) return [];
    const names = [];
    node.querySelectorAll('[data-glance-attachment], [data-tid="file-attachment"], a[download]').forEach((el) => {
      const n = fresh(el.getAttribute('data-glance-attachment') || el.getAttribute('aria-label') || el.textContent);
      if (n) names.push({ name: n });
    });
    return names;
  }

  function shown(node) {
    if (!node) return false;
    if (node.closest && node.closest('[hidden], [aria-hidden="true"]')) return false;
    if (typeof node.getBoundingClientRect !== 'function') return true;
    const r = node.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return true;
    return r.width > 0 && r.height > 0;
  }

  function messageRows(root) {
    if (!root || !root.querySelectorAll) return [];
    const marked = Array.from(root.querySelectorAll('[data-glance-message]')).filter(shown);
    if (marked.length) return marked.slice(-40);
    const panes = Array.from(root.querySelectorAll('[data-tid="chat-pane-message"], [data-tid="channel-pane-message"]')).filter(shown);
    if (panes.length) return panes.slice(-40);
    const bodies = Array.from(root.querySelectorAll('[data-tid="message-body"], [data-tid="message-body-content"]')).filter(shown);
    const top = bodies.filter((el) => !bodies.some((other) => other !== el && other.contains(el)));
    return top.slice(-40);
  }

  function messagesFromDom(root) {
    return messageRows(root).map((node) => ({
      id: String((node.getAttribute('data-message-id') || node.getAttribute('id') || textOf(node).slice(0, 40))),
      author: authorOf(node),
      text: textOf(node),
      attachments: attachmentsOf(node),
      node: node
    })).filter((m) => m.text || m.attachments.length);
  }

  function identify(href, root, titleHint) {
    const urlChatId = chatIdFromHref(href);
    const domChatId = chatIdFromDom(root);
    const title = titleOf(root) || titleFromDocument(titleHint) || usableTitle(titleHint);
    const aria = headerAria(root);
    const signals = { urlChatId: urlChatId, domChatId: domChatId, title: title, headerAria: aria };
    signals.self = isSelfChat(title, aria, urlChatId || domChatId);
    const id = urlChatId || domChatId || (title ? 'title:' + title.toLowerCase() : '') || (aria ? 'aria:' + aria.toLowerCase() : '');
    if (id) return { id: 'teams:' + id, signals: signals };
    if (/\/dev\/teams-fixture\.html/i.test(String(href || '')) && !/[?&]shell=1(?:&|$)/.test(String(href || ''))) {
      return { id: 'teams:dev-fixture', signals: signals };
    }
    return { id: '', signals: signals };
  }

  function missingSignals(signals) {
    const s = signals || {};
    const parts = [];
    if (!s.urlChatId) parts.push('urlChatId=missing');
    if (!s.domChatId) parts.push('domChatId=missing');
    if (!s.title) parts.push('title=missing');
    if (!s.headerAria) parts.push('headerAria=missing');
    return parts.join(' ');
  }

  function threadIdFor(href, title, root) {
    return identify(href, root, title).id;
  }

  function judgeInput(msg, party, opts) {
    const o = opts || {};
    const text = fresh(msg && msg.text);
    const who = (msg && msg.author) || authorOf(msg && msg.node ? msg.node : null) || 'unknown';
    const attachments = (msg && msg.attachments) || attachmentsOf(msg && msg.node);
    return {
      text: text,
      fromMe: who === 'me',
      oneToOne: o.oneToOne !== false,
      group: o.group === true,
      quoted: false,
      channel: 'teams',
      now: o.now != null ? o.now : Date.now(),
      sender: who === 'me' ? { name: null } : { name: party && party.name ? party.name : null, email: party && party.email ? party.email : null },
      key: String(o.key || ((msg && msg.id) || '') + '\n' + text),
      attachments: attachments
    };
  }

  function domSufficient(root) {
    const rows = messagesFromDom(root);
    return rows.length > 0 && rows.every((r) => r.author === 'me' || r.author === 'them');
  }

  return {
    page: page,
    chatIdFromHref: chatIdFromHref,
    chatIdFromDom: chatIdFromDom,
    bestHref: bestHref,
    titleFromDocument: titleFromDocument,
    identify: identify,
    missingSignals: missingSignals,
    isSelfChat: isSelfChat,
    partyName: partyName,
    threadKind: threadKind,
    titleOf: titleOf,
    joinText: joinText,
    textOf: textOf,
    authorOf: authorOf,
    messagesFromDom: messagesFromDom,
    threadIdFor: threadIdFor,
    judgeInput: judgeInput,
    domSufficient: domSufficient
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowTeamsParse };
else if (typeof globalThis !== 'undefined') globalThis.FlowTeamsParse = FlowTeamsParse;
