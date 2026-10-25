// Instagram direct messages (instagram.com/direct). Off until the person turns it on.
//
// Same model as Messenger: read the open one-to-one thread, and when the core judge
// finds one answer, place a draft in the message box. The person sends it.
// What it never does: press Enter, click Send, react, mark as read, open a thread, or touch a group.
(() => {
  if (typeof FlowInstagramParse === 'undefined') return;
  const P = FlowInstagramParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  let timer = null;
  let lastReportedHealth = null;
  const drafted = new Set();
  const inflight = new Set();

  function root() {
    return document.querySelector('[data-glance-chat], [role="main"]') || document.body;
  }

  function titleOf(main) {
    const marked = main.querySelector('[data-glance-title]');
    if (marked) {
      const text = (marked.getAttribute('title') || marked.textContent || '').trim();
      if (text) return text;
    }
    const list = Array.from(main.querySelectorAll('header h1, header h2, header h3, [role="banner"] h1, [role="banner"] h2, [role="banner"] h3, h1, h2, h3'));
    const h = list.find((n) => !n.closest('[role="row"]') && !/^(conversation information|messages|chat details)$/i.test((n.textContent || '').trim()));
    if (!h) return '';
    return (h.getAttribute('title') || h.textContent || '').trim();
  }

  function rows(main) {
    return Array.from(main.querySelectorAll('[role="row"]')).filter((n) => n.querySelector('[dir="auto"]')).slice(-MAX_ROWS);
  }

  function author(row) {
    return P.authorOf({
      author: row.getAttribute('data-author'),
      label: row.getAttribute('aria-label') || '',
      outgoing: Boolean(row.querySelector('[data-scope="outgoing"], [data-testid="outgoing"]')),
      incoming: Boolean(row.querySelector('[data-scope="incoming"], [data-testid="incoming"]'))
    });
  }

  function textOf(row) {
    const pieces = Array.from(row.querySelectorAll('[dir="auto"]')).map((s) => ({
      text: s.innerText || s.textContent || '',
      quoted: Boolean(s.closest('[data-quoted="1"], blockquote'))
    }));
    return P.joinText(pieces);
  }

  function forwarded(row) {
    return row.getAttribute('data-forwarded') === '1' || Boolean(row.querySelector('[data-testid="forwarded"]'));
  }

  function composerBox(main) {
    const all = Array.from(main.querySelectorAll('[contenteditable="true"], textarea'));
    for (const el of all) {
      if (el.getAttribute('data-glance-composer') === '1') return el;
      const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
      if (/search|חפש/.test(label)) continue;
      if (/message|הודעה/.test(label)) return el;
    }
    return null;
  }

  function oneToOne(main) {
    return P.isOneToOne(main, location.href) === true;
  }

  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'instagram', ok: ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
  }

  function maybeDraft(main, list, party, direct) {
    if (typeof FlowChatLane === 'undefined' || !direct) return;
    const last = list[list.length - 1];
    if (!last) return;
    const who = author(last);
    if (who !== 'them') { if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(null); return; }
    const text = textOf(last);
    const id = last.getAttribute('data-message-id') || text.slice(0, 80);
    const key = id + '\n' + text;
    if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(key);
    if (!text || drafted.has(key) || inflight.has(key)) return;
    inflight.add(key);
    const box = composerBox(main);
    const input = {
      text: text,
      fromMe: false,
      oneToOne: true,
      group: false,
      quoted: forwarded(last),
      channel: 'instagram',
      now: Date.now(),
      sender: { name: party.name },
      key: key
    };
    FlowChatLane.draftInto(box, input).then((r) => {
      if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.afterDraft(r, input);
      if (!r || r.reason !== 'no-box') drafted.add(key);
    }).catch(() => { drafted.add(key); }).finally(() => { inflight.delete(key); });
  }

  function scan() {
    if (!P.page(location.href)) return;
    const main = root();
    const list = rows(main);
    if (!list.length) { report(false, 'no-messages-recognised'); return; }
    const t = titleOf(main);
    if (!t) { report(false, 'chat-not-identified'); return; }
    const direct = oneToOne(main);
    if (!direct) { report(true); return; }
    if (list.some((n) => author(n) == null)) { report(false, 'sender-not-identified'); return; }
    report(true);
    const party = { name: t, phone: null, email: null };
    const threadId = P.threadIdFor(location.href, t);
    const ctx = {
      channel: 'instagram',
      strict: true,
      messages: list,
      isOwn: (n) => author(n) === 'me',
      messageId: (n) => n.getAttribute('data-message-id') || textOf(n).slice(0, 40),
      counterpart: () => party,
      partyOf: () => party,
      extractSender: (n) => (author(n) === 'me' ? { email: null, name: null, phone: null } : { email: null, name: t, phone: null }),
      ownMessageText: textOf,
      messageText: textOf,
      threadIdFrom: () => threadId,
      subject: t || 'Instagram message',
      threadUrl: () => location.href.split('#')[0],
      attachmentsOf: () => []
    };
    if (typeof FlowFollow !== 'undefined') FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Instagram follow-up check failed', e));
    maybeDraft(main, list, party, direct);
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.instagram = { scan: scan };
})();
