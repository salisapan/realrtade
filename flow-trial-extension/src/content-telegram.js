// Telegram Web, read-only, one-to-one chats with a person only, off until the person turns it on (popup: "Where Glance watches").
//
// What it does: when the newest message in the open chat is yours and asks for something, the same small card as in Gmail offers to
// stay on it; when the other person answers, the same rules close it (or not).
// What it never does: type, send, react, mark as read, open a chat, or touch a group, a channel or a bot.
//
// Honesty: Telegram Web's page structure is not a public interface and changes without notice. This file reads the address (which
// peer, and whether it is a person), each message's id, whether it is yours, and the text, and checks on every pass that it can still
// make sense of the page. If it cannot, it says so once (popup) and stays silent. Built and tested against a page that imitates
// Telegram Web's markup; not verified on the real Telegram Web (docs/multi-platform.md).
(() => {
  if (typeof FlowFollow === 'undefined' || typeof FlowTelegramParse === 'undefined') return;
  const P = FlowTelegramParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  let timer = null;
  let lastReportedHealth = null;

  function rows() {
    return Array.from(document.querySelectorAll('.Message[id^="message-"], .bubble[data-mid]')).filter((n) => P.messageId(n.id || n.getAttribute('data-mid'))).slice(-MAX_ROWS);
  }
  const idOf = (n) => P.messageId(n.id || n.getAttribute('data-mid'));
  const isOwnNode = (n) => n.classList.contains('own') || n.classList.contains('is-out');
  function title() {
    const h = document.querySelector('.ChatInfo .title, .chat-info .peer-title, .MiddleHeader .title');
    return h ? (h.textContent || '').trim() : '';
  }
  function textOf(n) {
    const pieces = Array.from(n.querySelectorAll('.text-content, .message')).map((s) => ({ text: s.innerText || s.textContent || '', quoted: Boolean(s.closest('.EmbeddedMessage, .reply')) }));
    return P.joinText(pieces.length ? pieces : [{ text: n.innerText || '' }]);
  }
  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'telegram', ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
  }

  function scan() {
    const where = P.parseHash(location.href);
    if (!where || !where.peer) return;                    // no chat open
    if (!where.oneToOne) { report(true); return; }        // a group or a channel: left alone, on purpose
    const list = rows();
    if (!list.length) { report(false, 'no-messages-recognised'); return; }
    const t = title();
    if (!t) { report(false, 'chat-not-identified'); return; }
    report(true);
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
      threadIdFrom: () => P.threadIdFor(where),
      subject: t || 'Telegram chat',
      threadUrl: () => 'https://web.telegram.org/a/#' + where.peer,
      attachmentsOf: () => []
    };
    FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Telegram follow-up check failed', e));
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
