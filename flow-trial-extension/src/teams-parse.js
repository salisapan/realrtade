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

  function chatIdFromHref(href) {
    const p = page(href);
    if (!p) return '';
    let u;
    try { u = new URL(String(href || '')); } catch (e) { return ''; }
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.indexOf('chat');
    if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]);
    const j = parts.indexOf('channel');
    if (j >= 0 && parts[j + 1]) return decodeURIComponent(parts[j + 1]);
    return '';
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
    if (typeof globalThis !== 'undefined' && globalThis.FlowGroupWord && globalThis.FlowGroupWord.counts(title)) return 'group';
    if (/,|&|\band\b|\d+\s+members|\bparticipants\b|משתתפים/i.test(title)) return 'group';
    return 'dm';
  }

  function titleOf(root) {
    if (!root) return '';
    const marked = root.querySelector('[data-glance-title]');
    if (marked) return fresh(marked.getAttribute('title') || marked.textContent);
    const h = root.querySelector('header h1, header h2, header h3, [role="banner"] h1, [role="banner"] h2');
    if (h) {
      const t = fresh(h.textContent);
      if (t && !SKIP_TITLE.test(t)) return t;
    }
    return '';
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

  function authorOf(node) {
    if (!node) return 'unknown';
    const raw = (node.getAttribute && node.getAttribute('data-author')) || '';
    if (raw === 'me' || raw === 'them') return raw;
    const aria = String(node.getAttribute('aria-label') || '');
    if (/you sent|הודעה שלך/i.test(aria)) return 'me';
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

  function messageRows(root) {
    if (!root) return [];
    const list = Array.from(root.querySelectorAll('[data-glance-message], [data-tid="chat-pane-message"]'));
    return list.slice(-40);
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

  function threadIdFor(href, title, root) {
    const fromUrl = chatIdFromHref(href);
    if (fromUrl) return 'teams:' + fromUrl;
    const t = fresh(title);
    if (t) return 'teams:title:' + t.toLowerCase();
    if (/\/dev\/teams-fixture\.html/i.test(String(href || ''))) return 'teams:dev-fixture';
    return '';
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
