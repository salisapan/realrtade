// Telegram Web A and Web K. Off until the person turns it on (optional host https://web.telegram.org/*).
//
// One-to-one chats with a person only. A self-chat (Saved Messages) ask gets one Do It.
// Do It places a draft in the compose box. Undo clears that draft only while it is still the same text.
// Glance never presses Send. A group, a channel, a bot, and an FYI stay quiet.
// If the page cannot be read, the reason is logged once: [Glance] telegram why-not …
(() => {
  if (typeof FlowTelegramParse === 'undefined') return;
  const P = FlowTelegramParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  const ORIGINS = ['https://web.telegram.org/*'];
  let timer = null;
  let lastReportedHealth = null;
  const seenWhy = new Set();

  function markLane() {
    try {
      if (document.documentElement) document.documentElement.setAttribute('data-glance-lane-telegram', 'on');
    } catch (e) { /* document not ready */ }
    trace('[Glance] telegram lane injected ' + here());
  }

  function here() {
    try { return String(location.href || ''); } catch (e) { return ''; }
  }

  function onRealHost() {
    try { return location.hostname === 'web.telegram.org'; } catch (e) { return false; }
  }

  function rows() {
    return Array.from(document.querySelectorAll('.Message[id^="message-"], .bubble[data-mid]')).filter((n) => P.messageId(n.id || n.getAttribute('data-mid'))).slice(-MAX_ROWS);
  }
  const idOf = (n) => P.messageId(n.id || n.getAttribute('data-mid'));
  const isOwnNode = (n) => n.classList.contains('own') || n.classList.contains('is-out');
  function title() {
    const h = document.querySelector('.ChatInfo .title, .chat-info .peer-title, .MiddleHeader .title, .topbar .peer-title');
    return h ? (h.textContent || '').trim() : '';
  }
  function textOf(n) {
    const pieces = Array.from(n.querySelectorAll('.text-content, .message, .translatable-message')).map((s) => ({ text: s.innerText || s.textContent || '', quoted: Boolean(s.closest('.EmbeddedMessage, .reply, .reply-content')) }));
    return P.joinText(pieces.length ? pieces : [{ text: n.innerText || '' }]);
  }
  function composerBox() {
    const marked = document.querySelector('[data-glance-composer]');
    if (marked) return marked;
    return document.querySelector('#editable-message-text, #editable-message-input, .input-message-input[contenteditable="true"], .composer_rich_textarea');
  }
  function selfBlob() {
    const box = composerBox();
    const aria = box ? ((box.getAttribute('aria-label') || '') + ' ' + (box.getAttribute('data-placeholder') || '')) : '';
    return title() + ' ' + aria;
  }

  function trace(line) {
    const text = String(line || '').slice(0, 400);
    try { console.info(text); } catch (e) { /* no console */ }
    try {
      chrome.runtime.sendMessage({ type: 'flow:telegram-trace', line: text }, () => { void chrome.runtime.lastError; });
    } catch (e) { /* the page may be closing */ }
  }

  function whyNot(reason, detail) {
    const extra = detail ? ' ' + String(detail) : '';
    const line = '[Glance] telegram why-not ' + reason + extra;
    if (seenWhy.has(line)) return;
    seenWhy.add(line);
    trace(line);
  }

  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'telegram', ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
  }

  function remember(threadId, sender) {
    try {
      if (!document.documentElement) return;
      document.documentElement.setAttribute('data-glance-chat', threadId || '');
      document.documentElement.setAttribute('data-glance-sender', sender || '');
    } catch (e) { /* gone */ }
  }

  async function hostOpen() {
    if (!onRealHost()) return true;
    if (typeof chrome === 'undefined' || !chrome.permissions || typeof chrome.permissions.contains !== 'function') return true;
    let ok = false;
    try { ok = await chrome.permissions.contains({ origins: ORIGINS }); } catch (e) { ok = false; }
    if (!ok) {
      if (!document.querySelector('[data-glance-host-prompt]') && typeof FlowChatHostPrompt !== 'undefined') {
        FlowChatHostPrompt.paint(document, {
          request: () => chrome.permissions.request({ origins: ORIGINS.slice() }),
          onGranted: () => { schedule(); }
        });
      }
      whyNot('host-not-granted');
      return false;
    }
    const bar = document.querySelector('[data-glance-host-prompt]');
    if (bar && bar.remove) bar.remove();
    return true;
  }

  function offerSelf(list) {
    if (typeof FlowChatSelfCard === 'undefined') return;
    const last = list[list.length - 1];
    const text = textOf(last);
    const self = P.isSelfTitle(selfBlob());
    const result = FlowChatSelfCard.paint({
      self: self,
      fyi: P.isFyi(text),
      ask: P.isAsk(text),
      text: text,
      draft: (value) => P.selfDraft(value),
      composer: composerBox,
      whyNot: whyNot
    });
    if (self && result && result.reason === 'fyi') whyNot('fyi');
  }

  async function scan() {
    if (!(await hostOpen())) return;
    const where = P.parseHash(location.href);
    if (!where || !where.peer) { whyNot('chat-not-identified', 'url=missing'); return; }
    if (!where.oneToOne) { report(true); whyNot('not-one-to-one'); return; }
    const list = rows();
    if (!list.length) { report(false, 'no-messages-recognised'); whyNot('no-messages-recognised', 'bubbles=0'); return; }
    const t = title();
    if (!t) { report(false, 'chat-not-identified'); whyNot('chat-not-identified', 'title=missing'); return; }
    report(true);
    const threadId = P.threadIdFor(where);
    const last = list[list.length - 1];
    remember(threadId, isOwnNode(last) ? 'me' : (t || 'them'));
    offerSelf(list);
    if (typeof FlowFollow === 'undefined') return;
    const party = { name: t, phone: null, email: null };
    const ctx = {
      channel: 'telegram',
      strict: true,
      messages: list,
      isOwn: isOwnNode,
      messageId: idOf,
      counterpart: () => party,
      partyOf: () => party,
      extractSender: (n) => (isOwnNode(n) ? { email: null, name: null, phone: null } : { email: null, name: t, phone: null }),
      ownMessageText: textOf,
      messageText: textOf,
      threadIdFrom: () => threadId,
      subject: t || 'Telegram chat',
      threadUrl: () => 'https://web.telegram.org/a/#' + where.peer,
      attachmentsOf: () => []
    };
    FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Telegram follow-up check failed', e));
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(() => { scan().catch((e) => console.error('[Glance] Telegram scan failed', e)); }, DEBOUNCE_MS); }
  markLane();
  const watch = document.documentElement || document.body;
  if (watch) new MutationObserver(schedule).observe(watch, { childList: true, subtree: true });
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.telegram = { scan: () => scan() };
})();
