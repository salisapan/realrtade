// WhatsApp Web draft lane (gesture-only). Injected on demand; never auto-reads.
(() => {
  if (typeof FlowWhatsAppParse === 'undefined' || typeof FlowChatLane === 'undefined') return;
  const P = FlowWhatsAppParse;
  const MAX_ROWS = 40;
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
    const pieces = Array.from(node.querySelectorAll('span.selectable-text, span[data-testid="selectable-text"], img[alt]')).map((s) => ({
      text: s.getAttribute && s.getAttribute('alt') ? s.getAttribute('alt') : (s.innerText || s.textContent || ''),
      quoted: Boolean(s.closest && s.closest('[data-quoted="1"], [aria-label^="Quoted"], [data-testid="quoted-message"], [data-testid="quoted-msg"]'))
    }));
    return P.joinText(pieces.filter((p) => p.text));
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

  function lastInbound(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      const parsed = P.parseDataId(list[i].getAttribute('data-id') || '');
      if (parsed && !parsed.fromMe) return list[i];
    }
    return null;
  }

  async function maybeDraft(main, list) {
    const last = lastInbound(list);
    if (!last) return { ok: false, reason: 'no-inbound' };
    const parsed = P.parseDataId(last.getAttribute('data-id') || '');
    if (!parsed) return { ok: false, reason: 'unparsed' };
    const text = textOf(last);
    const key = (last.getAttribute('data-id') || '') + '\n' + text;
    if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(key);
    if (!text || drafted.has(key) || inflight.has(key)) return { ok: false, reason: 'already-drafted' };
    inflight.add(key);
    const ids = list.map((n) => n.getAttribute('data-id'));
    const party = P.partyFromChat(title(main), ids);
    const threadId = P.threadIdFor(title(main), ids);
    const input = {
      text: text,
      fromMe: false,
      oneToOne: true,
      group: false,
      quoted: quoted(last),
      channel: 'whatsapp',
      surface: 'whatsapp',
      threadId: threadId,
      now: Date.now(),
      sender: { name: party.name, phone: party.phone },
      key: key
    };
    const box = composerBox(main);
    try {
      const r = await FlowChatLane.draftInto(box, input);
      if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.afterDraft(r, input, box);
      if (!r || r.reason !== 'no-box') drafted.add(key);
      return r || { ok: false, reason: 'silence' };
    } catch (e) {
      drafted.add(key);
      return { ok: false, reason: 'error' };
    } finally {
      inflight.delete(key);
    }
  }

  async function scan(opts) {
    if (!opts || opts.gesture !== true) return { ok: false, reason: 'no-gesture' };
    const main = chatPane();
    if (!main) return { ok: false, reason: 'no-chat' };
    if (main.getAttribute('data-glance-chat') === 'group') return { ok: false, reason: 'group' };
    const list = rows(main);
    if (!list.length) return { ok: false, reason: 'no-messages' };
    const ids = list.map((n) => n.getAttribute('data-id'));
    if (!P.isOneToOne(ids)) return { ok: false, reason: 'not-1to1' };
    return maybeDraft(main, list);
  }

  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.whatsapp = { scan: scan };
})();
