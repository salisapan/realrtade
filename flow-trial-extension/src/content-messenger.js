// Messenger (messenger.com and facebook.com/messages). Off until the person turns it on.
//
// Reads the open one-to-one conversation and, when the newest message asks for one
// answer the core judge can find, places a draft in the message box. The person sends it.
// What it never does: press Enter, click Send, react, mark as read, open a chat, or touch a group.
//
// The page is not a public interface. If the open chat cannot be read, Glance says so once and stays silent.
(() => {
  if (typeof FlowMessengerParse === 'undefined') return;
  const P = FlowMessengerParse;
  const DEBOUNCE_MS = 1200;
  const RETRY_MS = 1000;
  const RETRY_LIMIT = 8;
  const MAX_ROWS = 40;
  let timer = null;
  let tries = 0;
  let lastReportedHealth = null;
  const drafted = new Set();
  const inflight = new Set();
  const quietLogged = new Set();

  function whyNot(reason, key) {
    const id = String(reason || 'silence') + '\n' + String(key || '');
    if (quietLogged.has(id)) return;
    quietLogged.add(id);
    try { console.info('[Glance] whyNotShown: ' + reason); } catch (e) { /* the console can be missing */ }
  }

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
    const surface = String(row.getAttribute('data-surface') || '');
    if (/message_out|from_page/.test(surface)) return 'me';
    if (/message_in|from_user/.test(surface)) return 'them';
    return P.authorOf({
      author: row.getAttribute('data-author'),
      label: row.getAttribute('aria-label') || '',
      outgoing: Boolean(row.querySelector('[data-scope="outgoing"], [data-testid="outgoing"]')),
      incoming: Boolean(row.querySelector('[data-scope="incoming"], [data-testid="incoming"]'))
    });
  }

  function sentAt(row) {
    const node = row.querySelector('time[datetime]');
    if (!node) return null;
    const n = Date.parse(node.getAttribute('datetime') || '');
    return Number.isFinite(n) ? n : null;
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
      if (/message|הודעה|reply|השב|תגובה/.test(label)) return el;
    }
    return null;
  }

  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'messenger', ok: ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
  }

  function maybeDraft(main, list, party, direct) {
    if (typeof FlowChatLane === 'undefined' || !direct) {
      if (!direct) whyNot('not-one-to-one', location.href);
      else whyNot('missing-lane', location.href);
      return;
    }
    const last = list[list.length - 1];
    if (!last) return;
    const who = author(last);
    const text = textOf(last);
    const id = last.getAttribute('data-message-id') || text.slice(0, 80);
    const key = (party.name || '') + '\n' + id + '\n' + text;
    if (who !== 'them') { whyNot(who === 'me' ? 'from-me' : 'sender-not-identified', key); return; }
    if (!text || drafted.has(key) || inflight.has(key)) return;
    inflight.add(key);
    const box = composerBox(main);
    const when = sentAt(last);
    FlowChatLane.draftInto(box, {
      text: text,
      fromMe: false,
      oneToOne: true,
      group: false,
      quoted: forwarded(last),
      channel: 'messenger',
      now: when == null ? Date.now() : when,
      sender: { name: party.name }
    }).then((r) => {
      if (r && r.reason === 'no-box') whyNot('no-box', key);
      if (!r || r.reason !== 'no-box') drafted.add(key);
    }).catch(() => { whyNot('draft-failed', key); drafted.add(key); }).finally(() => { inflight.delete(key); });
  }

  function scan() {
    if (!P.page(location.href)) { whyNot('not-a-messenger-page', location.href); return; }
    const main = root();
    const list = rows(main);
    if (!list.length) {
      if (tries < RETRY_LIMIT) { tries += 1; clearTimeout(timer); timer = setTimeout(scan, RETRY_MS); return; }
      whyNot('no-messages-recognised', location.href);
      report(false, 'no-messages-recognised');
      return;
    }
    tries = 0;
    const thread = P.classify(main, location.href);
    const t = String((thread && thread.name) || titleOf(main) || '').replace(/\s+/g, ' ').trim();
    if (!t) { whyNot('chat-not-identified', location.href); report(false, 'chat-not-identified'); return; }
    const direct = thread && thread.kind === 'one-to-one';
    globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
    globalThis.__glanceChatSurfaces.messenger = globalThis.__glanceChatSurfaces.messenger || {};
    globalThis.__glanceChatSurfaces.messenger.name = t;
    if (!direct) { whyNot('not-one-to-one', t); report(true); return; }
    report(true);
    const party = { name: t, phone: null, email: null };
    const threadId = P.threadIdFor(location.href, t);
    const ctx = {
      channel: 'messenger',
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
      subject: t || 'Messenger chat',
      threadUrl: () => location.href.split('#')[0],
      attachmentsOf: () => []
    };
    if (typeof FlowFollow !== 'undefined') FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Messenger follow-up check failed', e));
    maybeDraft(main, list, party, direct);
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); }
  const watch = document.documentElement || document.body;
  if (watch) new MutationObserver(schedule).observe(watch, { childList: true, subtree: true });
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.messenger = { scan: scan };
})();
