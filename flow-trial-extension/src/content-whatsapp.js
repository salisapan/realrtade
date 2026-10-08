// WhatsApp Web, read-only, one-to-one chats only, off until the person turns it on (popup: "Where Glance watches").
//
// What it does: when the newest message in the open chat is yours and asks for something, the same small card as in Gmail offers to
// stay on it; when the other person answers, the same rules close it (or not). An answer here can also settle a loop you opened by
// email (core/cross-channel.js), and the other way round.
// The follow path never types, sends, reacts, marks as read, opens a chat, or touches a group, a broadcast list, a channel or a status.
// When src/whatsapp-composer.js is loaded, a place question in this 1:1 chat can show one draft. That script types the line only
// after the approve click. This file does not send on its own.
//
// Honesty: WhatsApp Web's page structure is not a public interface and changes without notice. This file reads message ids
// (data-id), the chat title and the message text spans, and checks on every pass that it can still make sense of the page.
// If it cannot, it says so once (popup) and stays silent. Chat messages are short and informal, so this surface is stricter than
// Gmail: only requests that match a known wording create an offer; the learned model, the language-model tier and the single
// question never act here until there is a labelled set of real chats to measure them on (docs/multi-platform.md).
(() => {
  if (typeof FlowFollow === 'undefined' || typeof FlowWhatsAppParse === 'undefined') return;
  const P = FlowWhatsAppParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  let timer = null;
  let lastReportedHealth = null;

  function chatPane() { return document.getElementById('main'); }

  function rows(main) {
    const all = Array.from(main.querySelectorAll('[data-id]')).filter((n) => P.parseDataId(n.getAttribute('data-id')));
    return all.slice(-MAX_ROWS);
  }

  function title(main) {
    const h = main.querySelector('header');
    if (!h) return '';
    const s = h.querySelector('span[title]') || h.querySelector('span[dir="auto"]');
    return s ? (s.getAttribute('title') || s.textContent || '') : '';
  }

  function textOf(node) {
    const pieces = Array.from(node.querySelectorAll('span.selectable-text, span[data-testid="selectable-text"]')).map((s) => ({
      text: s.innerText || s.textContent || '',
      quoted: Boolean(s.closest('[aria-label^="Quoted"], [data-testid="quoted-message"], [data-testid="quoted-msg"]'))
    }));
    return P.joinText(pieces);
  }

  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'whatsapp', ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
  }

  function scan() {
    const main = chatPane();
    if (!main) return;                                  // no chat open: nothing to read, nothing to report
    const list = rows(main);
    if (!list.length) { report(false, 'no-messages-recognised'); return; }
    const ids = list.map((n) => n.getAttribute('data-id'));
    if (!P.isOneToOne(ids)) { report(true); return; }   // a group, a list or a channel: left alone, on purpose
    const t = title(main);
    const party = P.partyFromChat(t, ids);
    const threadId = P.threadIdFor(t, ids);
    if (!threadId || (!party.name && !party.phone)) { report(false, 'chat-not-identified'); return; }
    report(true);
    const idOf = (n) => n.getAttribute('data-id');
    const ctx = {
      channel: 'whatsapp',
      strict: true,
      messages: list,
      isOwn: (n) => Boolean(P.parseDataId(idOf(n)) && P.parseDataId(idOf(n)).fromMe),
      messageId: idOf,
      counterpart: () => ({ name: party.name, phone: party.phone, email: null }),
      partyOf: () => ({ name: party.name, phone: party.phone, email: null }),
      extractSender: (n) => (P.parseDataId(idOf(n)) && P.parseDataId(idOf(n)).fromMe ? { email: null, name: null, phone: null } : { email: null, name: party.name, phone: party.phone }),
      ownMessageText: textOf,
      messageText: textOf,
      threadIdFrom: () => threadId,
      subject: party.name || party.phone || 'WhatsApp chat',
      threadUrl: () => (party.phone ? 'https://wa.me/' + String(party.phone).replace(/\D/g, '') : 'https://web.whatsapp.com/'),
      attachmentsOf: () => []
    };
    FlowFollow.consider(ctx).catch((e) => console.error('[Glance] WhatsApp follow-up check failed', e));
    try {
      if (typeof FlowWhatsAppComposer !== 'undefined' && FlowWhatsAppComposer.consider) {
        FlowWhatsAppComposer.consider({
          main: main,
          oneToOne: true,
          host: location.hostname,
          messages: list.map((n) => ({
            id: idOf(n),
            fromMe: Boolean(P.parseDataId(idOf(n)) && P.parseDataId(idOf(n)).fromMe),
            text: textOf(n),
            node: n
          }))
        });
      }
    } catch (e) { /* the answer card is absent until its script is registered */ }
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); }

  const app = document.getElementById('app') || document.body;
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
