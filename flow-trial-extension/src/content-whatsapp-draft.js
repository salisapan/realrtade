// WhatsApp Web draft lane. A second reader beside src/content-whatsapp.js, which
// stays read-only and is owned by another open pull request. This file does not
// call FlowFollow, so a loop is not opened twice.
//
// What it does: when the newest message in the open one-to-one chat asks for one
// place or one fact the core judge can find, it places that answer in the box.
// What it never does: press Enter, click Send, react, mark as read, open a chat,
// or touch a group. The person sends the draft. A draft is not a closed loop.
(() => {
  if (typeof FlowWhatsAppParse === 'undefined' || typeof FlowChatLane === 'undefined') return;
  const P = FlowWhatsAppParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  let timer = null;
  const drafted = new Set();
  const inflight = new Set();

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
      quoted: Boolean(s.closest('[data-quoted="1"], [aria-label^="Quoted"], [data-testid="quoted-message"], [data-testid="quoted-msg"]'))
    }));
    return P.joinText(pieces);
  }

  function quoted(node) {
    return node.getAttribute('data-forwarded') === '1'
      || Boolean(node.querySelector('[data-quoted="1"], [data-testid="quoted-message"], [data-testid="quoted-msg"], [data-testid="forwarded"]'));
  }

  function composerBox(main) {
    const marked = main.querySelector('[data-glance-composer="1"]');
    if (marked) return marked;
    const all = Array.from(main.querySelectorAll('footer [contenteditable="true"], [data-testid="conversation-compose-box-input"], footer div[role="textbox"]'));
    for (const el of all) {
      const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
      if (/search|חפש/.test(label)) continue;
      return el;
    }
    return null;
  }

  function maybeDraft(main, list) {
    const last = list[list.length - 1];
    if (!last) return;
    const parsed = P.parseDataId(last.getAttribute('data-id') || '');
    if (parsed && parsed.fromMe) {
      // The person's own newest message: a dated promise in it is offered as a task (CHAT_PROMISE_CARD, off).
      const mine = textOf(last);
      const mineKey = (last.getAttribute('data-id') || '') + '\n' + mine;
      if (typeof FlowChatTaskCard !== 'undefined') {
        FlowChatTaskCard.sync(mineKey);
        if (mine && !quoted(last)) FlowChatTaskCard.offer({ text: mine, channel: 'whatsapp', oneToOne: true, group: false, fromMe: true, own: true, quoted: false, sender: { name: P.partyFromChat(title(main), list.map((n) => n.getAttribute('data-id'))).name }, key: mineKey, now: Date.now() }).catch(() => {});
      }
      return;
    }
    if (!parsed) { if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(null); return; }
    const text = textOf(last);
    const key = (last.getAttribute('data-id') || '') + '\n' + text;
    if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(key);
    if (!text || drafted.has(key) || inflight.has(key)) return;
    inflight.add(key);
    const ids = list.map((n) => n.getAttribute('data-id'));
    const party = P.partyFromChat(title(main), ids);
    const input = {
      text: text,
      fromMe: false,
      oneToOne: true,
      group: false,
      quoted: quoted(last),
      channel: 'whatsapp',
      now: Date.now(),
      sender: { name: party.name, phone: party.phone },
      key: key
    };
    const box = composerBox(main);
    FlowChatLane.draftInto(box, input).then((r) => {
      if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.afterDraft(r, input, box);
      if (!r || r.reason !== 'no-box') drafted.add(key);
    }).catch(() => { drafted.add(key); }).finally(() => { inflight.delete(key); });
  }

  function scan() {
    const main = chatPane();
    if (!main) return;
    if (main.getAttribute('data-glance-chat') === 'group') return;
    const list = rows(main);
    if (!list.length) return;
    const ids = list.map((n) => n.getAttribute('data-id'));
    if (!P.isOneToOne(ids)) return;
    maybeDraft(main, list);
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); }
  const app = document.getElementById('app') || document.body;
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.whatsapp = { scan: scan };
})();
