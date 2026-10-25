// WhatsApp Web follow-up lane (gesture-only). No background reads.
(() => {
  if (typeof FlowFollow === 'undefined' || typeof FlowWhatsAppParse === 'undefined') return;
  const P = FlowWhatsAppParse;
  const MAX_ROWS = 40;
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

  function scan(opts) {
    if (!opts || opts.gesture !== true) return { ok: false, reason: 'no-gesture' };
    const main = chatPane();
    if (!main) return { ok: false, reason: 'no-chat' };
    const list = rows(main);
    if (!list.length) { report(false, 'no-messages-recognised'); return { ok: false, reason: 'no-messages' }; }
    const ids = list.map((n) => n.getAttribute('data-id'));
    if (!P.isOneToOne(ids)) { report(true); return { ok: true, reason: 'group-skipped' }; }
    const t = title(main);
    const party = P.partyFromChat(t, ids);
    const threadId = P.threadIdFor(t, ids);
    if (!threadId || (!party.name && !party.phone)) { report(false, 'chat-not-identified'); return { ok: false, reason: 'chat-not-identified' }; }
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
    return { ok: true };
  }

  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  if (!globalThis.__glanceChatSurfaces.whatsapp) globalThis.__glanceChatSurfaces.whatsapp = {};
  globalThis.__glanceChatSurfaces.whatsapp.followScan = scan;
})();
