// Slack on the web, read-only, one-to-one direct messages only, off until the person turns it on (popup: "Where Glance watches").
//
// What it does: when the newest message in the open direct message is yours and asks for something, the same small card as in Gmail
// offers to stay on it; when the other person answers, the same rules close it (or not). An answer here can also settle a loop you
// opened by email (core/cross-channel.js), and the other way round.
// What it never does: type, send, react, mark as read, open a conversation, or touch a channel, a group direct message or a thread.
//
// Honesty: Slack's page structure is not a public interface and changes without notice. This file reads the address (which
// conversation, and whether it is one-to-one), the data-msg-ts of each message, the sender and the text, and checks on every pass
// that it can still make sense of the page. If it cannot, it says so once (popup) and stays silent. Chat is short and informal, so
// this surface is as strict as WhatsApp: only requests that match a known wording create an offer. Built and tested against a page
// that imitates Slack's markup; not verified on the real Slack (docs/multi-platform.md).
(() => {
  if (typeof FlowFollow === 'undefined' || typeof FlowSlackParse === 'undefined') return;
  const P = FlowSlackParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  let timer = null;
  let lastReportedHealth = null;

  function pane() { return document.querySelector('[data-qa="message_pane"], [data-qa="slack_kit_list"], .p-workspace__primary_view_body'); }
  function rows() {
    const root = pane() || document;
    return Array.from(root.querySelectorAll('[data-qa="message_container"][data-msg-ts]')).filter((n) => P.parseTs(n.getAttribute('data-msg-ts'))).slice(-MAX_ROWS);
  }
  function title() {
    const h = document.querySelector('[data-qa="channel_name"], [data-qa="channel_header_title"], [data-qa="conversation_header_title"]');
    return h ? (h.textContent || '').trim() : '';
  }
  function senderOf(n) { const s = n.querySelector('[data-qa="message_sender_name"], [data-qa="message_sender"]'); return s ? (s.textContent || '').trim() : ''; }
  function textOf(n) {
    const pieces = Array.from(n.querySelectorAll('[data-qa="message-text"], .p-rich_text_section')).map((s) => ({ text: s.innerText || s.textContent || '', quoted: Boolean(s.closest('blockquote, [data-qa="message_attachment"]')) }));
    return P.joinText(pieces);
  }
  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'slack', ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
  }

  function scan() {
    const where = P.parseUrl(location.href);
    if (!where) return;                                   // not a conversation view: nothing to read
    if (!where.oneToOne || where.inThread) { report(true); return; }   // a channel, a group message or a thread: left alone, on purpose
    const list = rows();
    if (!list.length) { report(false, 'no-messages-recognised'); return; }
    const t = title();
    if (!t) { report(false, 'chat-not-identified'); return; }
    const filled = P.fillSenders(list.map((n) => ({ sender: senderOf(n) })));
    const own = filled.map((r) => P.isOwn(r.sender, t));
    if (own.some((x) => x === null)) { report(false, 'sender-not-identified'); return; }
    report(true);
    const idx = new Map(list.map((n, i) => [n, i]));
    const threadId = P.threadIdFor(where);
    const party = { name: t, phone: null, email: null };
    const ctx = {
      channel: 'slack',
      strict: true,
      messages: list,
      isOwn: (n) => own[idx.get(n)] === true,
      messageId: (n) => n.getAttribute('data-msg-ts'),
      counterpart: () => party,
      partyOf: () => party,
      extractSender: (n) => (own[idx.get(n)] === true ? { email: null, name: null, phone: null } : { email: null, name: t, phone: null }),
      ownMessageText: textOf,
      messageText: textOf,
      threadIdFrom: () => threadId,
      subject: t || 'Slack message',
      threadUrl: () => location.origin + '/client/' + where.team + '/' + where.conversation,
      attachmentsOf: () => []
    };
    FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Slack follow-up check failed', e));
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
