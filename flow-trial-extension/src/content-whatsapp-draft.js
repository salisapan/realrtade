// WhatsApp Web draft lane (gesture-only). Injected on demand; never auto-reads.
(() => {
  if (typeof FlowWhatsAppParse === 'undefined' || typeof FlowChatLane === 'undefined') return;
  if (window.__glanceWhatsAppDraftLane) return;
  window.__glanceWhatsAppDraftLane = true;
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

  function cardMount(main) {
    let mount = main.querySelector('#glance-wa-card');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'glance-wa-card';
      main.appendChild(mount);
    }
    return mount;
  }

  // One place in that week shows Do It. The click types one draft. Undo clears
  // it only while the box still holds those words. Nothing here sends.
  function showPlaceCard(main, box, draftText, input) {
    if (typeof FlowChipHost === 'undefined' || !box || !draftText) return { ok: false, sends: false, reason: 'no-card' };
    const mount = cardMount(main);
    const old = mount.querySelector('.flow-chip-host');
    if (old) old.remove();
    let wroteOnce = false;
    const host = FlowChipHost.inject(mount, {
      app: 'whatsapp',
      doLabel: 'Do It',
      messageId: input.key || input.threadId || 'wa',
      uiLang: 'en',
      intent: { label: String(input.text || '').slice(0, 180) },
      process: {
        id: 'chat-place-draft',
        name: 'Reply',
        closingLine: 'The place goes in the box. Nothing is sent.',
        needsDateChoice: false,
        steps: []
      }
    }, {
      onDoIt: () => {
        if (wroteOnce || typeof FlowChatCompose === 'undefined') return;
        const write = typeof FlowChatCompose.insertDraftWithProof === 'function'
          ? FlowChatCompose.insertDraftWithProof(box, draftText, { surface: 'whatsapp', threadId: input.threadId || input.key || null })
          : Promise.resolve(FlowChatCompose.insertDraft(box, draftText));
        Promise.resolve(write).then((result) => {
          if (!result || !result.ok || wroteOnce) return;
          wroteOnce = true;
          const proof = result.proof || null;
          FlowChipHost.showDraftReceipt(host, {
            status: 'Draft ready.',
            written: 'Draft in the chat box. Not sent.',
            onUndo: () => {
              const cleared = typeof FlowChatCompose.undoDraft === 'function'
                ? FlowChatCompose.undoDraft(box, draftText, proof && proof.draftHash)
                : FlowChatCompose.clearIfUnchanged(box, draftText);
              if (cleared && cleared.ok) return { ok: true, written: 'Draft removed.' };
              return { ok: false, reason: cleared && cleared.reason, written: cleared && cleared.reason === 'user-edited' ? 'You edited this. Undo left it alone.' : '' };
            }
          });
        });
      },
      onDismiss: (h) => { try { h.remove(); } catch (e) { /* already gone */ } }
    });
    if (!host) return { ok: false, sends: false, reason: 'no-card' };
    host.setAttribute('data-glance-read', String(input.text || ''));
    return { ok: true, sends: false, card: true };
  }

  function maybeDraft(main, list) {
    const last = list[list.length - 1];
    if (!last) return { ok: false, reason: 'no-inbound' };
    const parsed = P.parseDataId(last.getAttribute('data-id') || '');
    if (parsed && parsed.fromMe) {
      const mine = textOf(last);
      const mineKey = (last.getAttribute('data-id') || '') + '\n' + mine;
      if (typeof FlowChatTaskCard !== 'undefined') {
        FlowChatTaskCard.sync(mineKey);
        if (mine && !quoted(last)) FlowChatTaskCard.offer({ text: mine, channel: 'whatsapp', oneToOne: true, group: false, fromMe: true, own: true, quoted: false, sender: { name: P.partyFromChat(title(main), list.map((n) => n.getAttribute('data-id'))).name }, key: mineKey, now: Date.now() }).catch(() => {});
      }
      return { ok: true, sends: false, reason: 'own-message' };
    }
    if (!parsed) { if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(null); return { ok: false, reason: 'unparsed' }; }
    const text = textOf(last);
    const key = (last.getAttribute('data-id') || '') + '\n' + text;
    if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(key);
    if (!text || drafted.has(key) || inflight.has(key)) return { ok: false, reason: 'already-drafted' };
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
      surface: 'whatsapp',
      threadId: P.threadIdFor(title(main), ids),
      now: Date.now(),
      sender: { name: party.name, phone: party.phone },
      key: key
    };
    const box = composerBox(main);
    const plan = (typeof FlowChatLane.plan === 'function') ? FlowChatLane.plan(input) : Promise.resolve(null);
    return plan.then((planned) => {
      if (planned && planned.judged && planned.judged.draft) {
        const card = showPlaceCard(main, box, planned.judged.draft, input);
        drafted.add(key);
        return card.ok ? card : { ok: false, sends: false, reason: card.reason || 'no-card' };
      }
      const again = Object.assign({}, input, { evidence: planned && planned.evidence != null ? planned.evidence : input.evidence });
      return FlowChatLane.draftInto(box, again).then((r) => {
        if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.afterDraft(r, input, box);
        if (!r || r.reason !== 'no-box') drafted.add(key);
        return { ok: true, sends: false };
      });
    }).catch(() => {
      drafted.add(key);
      return { ok: false, sends: false, reason: 'error' };
    }).finally(() => { inflight.delete(key); });
  }

  function scan(opts) {
    const G = globalThis.FlowWhatsAppWebGate;
    const env = {
      flag: globalThis.__glanceWhatsAppWebRead === true,
      consent: globalThis.__glanceWhatsAppWebConsent === true,
      userOff: globalThis.__glanceWhatsAppUserOff === true,
      remoteOff: globalThis.__glanceWhatsAppRemoteOff === true
    };
    const decision = (G && G.readAllowed) ? G.readAllowed(env, opts) : { ok: false, reason: 'flag-off' };
    if (!decision.ok) return decision;
    const main = chatPane();
    if (!main) return { ok: false, reason: 'no-chat' };
    if (main.getAttribute('data-glance-chat') === 'group') return { ok: false, reason: 'group' };
    const list = rows(main);
    if (!list.length) return { ok: false, reason: 'no-messages' };
    window.__glanceChatDomReads = (window.__glanceChatDomReads || 0) + 1;
    document.documentElement.setAttribute('data-glance-reads', String(window.__glanceChatDomReads));
    const openText = textOf(list[list.length - 1]);
    main.setAttribute('data-glance-scanned', openText);
    const ids = list.map((n) => n.getAttribute('data-id'));
    if (!P.isOneToOne(ids)) return { ok: false, reason: 'not-1to1' };
    return maybeDraft(main, list);
  }

  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  const prev = globalThis.__glanceChatSurfaces.whatsapp || {};
  prev.scan = scan;
  globalThis.__glanceChatSurfaces.whatsapp = prev;
})();
