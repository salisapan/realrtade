// Slack on the web. Off until the person turns it on (optional host https://app.slack.com/*).
//
// One-to-one direct messages only. A self-chat ask gets one Do It. Do It places a draft in the compose box.
// Undo clears that draft only while it is still the same text. Glance never presses Send.
// A channel, a group direct message, a thread, and an FYI stay quiet.
// If the page cannot be read, the reason is logged again when the reason or the bubble count changes: [Glance] slack why-not …
(() => {
  if (typeof FlowSlackParse === 'undefined') return;
  const P = FlowSlackParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  const ORIGINS = ['https://app.slack.com/*'];
  let timer = null;
  let lastReportedHealth = null;

  function markLane() {
    try {
      if (document.documentElement) document.documentElement.setAttribute('data-glance-lane-slack', 'on');
    } catch (e) { /* document not ready */ }
    trace('[Glance] slack lane injected ' + here());
  }

  function here() {
    try { return String(location.href || ''); } catch (e) { return ''; }
  }

  function onRealHost() {
    try { return location.hostname === 'app.slack.com'; } catch (e) { return false; }
  }

  function pane() { return document.querySelector('[data-qa="message_pane"]'); }

  function tsMatch(raw) {
    const m = String(raw || '').match(/(\d{9,11}\.\d{6})/);
    return m ? m[1] : '';
  }

  function messageIdOf(n) {
    if (!n) return '';
    const host = n.closest ? (n.closest('[data-msg-ts], [data-item-key]') || n) : n;
    if (!host.getAttribute) return '';
    const ts = tsMatch(host.getAttribute('data-msg-ts') || host.getAttribute('data-item-key'));
    return ts && P.parseTs(ts) ? ts : '';
  }

  function title() {
    const h = document.querySelector('[data-qa="channel_name"], [data-qa="channel_header_title"], [data-qa="conversation_header_title"]');
    if (h && (h.textContent || '').trim()) return (h.textContent || '').trim();
    const header = document.querySelector('.p-view_header [data-qa="channel_name"], .p-view_header');
    return header ? (header.textContent || '').trim() : '';
  }
  function rowOf(n) {
    return (n && n.closest && n.closest('[data-qa="virtual-list-item"], [data-qa="message_container"], [data-qa="message_content"], .c-message_kit__blocks')) || n;
  }
  function senderOf(n) {
    const row = rowOf(n);
    const s = row && row.querySelector ? row.querySelector('[data-qa="message_sender_name"], [data-qa="message_sender"]') : null;
    return s ? (s.textContent || '').trim() : '';
  }
  function textOf(n) {
    if (n && n.getAttribute && n.getAttribute('data-qa') === 'message-text') {
      return P.joinText([{ text: n.innerText || n.textContent || '', quoted: Boolean(n.closest && n.closest('blockquote, [data-qa="message_attachment"]')) }]);
    }
    const nodes = n && n.querySelectorAll ? Array.from(n.querySelectorAll('[data-qa="message-text"]')) : [];
    const pieces = (nodes.length ? nodes : [n]).map((s) => ({ text: (s && (s.innerText || s.textContent)) || '', quoted: Boolean(s && s.closest && s.closest('blockquote, [data-qa="message_attachment"]')) }));
    return P.joinText(pieces);
  }
  function composerBox() {
    const marked = document.querySelector('[data-glance-composer]');
    if (marked) return marked;
    const input = document.querySelector('[data-qa="message_input"]');
    if (input) {
      const editor = input.matches && input.matches('[contenteditable="true"]') ? input : input.querySelector('.ql-editor, [contenteditable="true"]');
      if (editor) return editor;
    }
    return document.querySelector('.ql-editor[contenteditable="true"], [aria-label="Message yourself"]');
  }
  function selfBlob() {
    const box = composerBox();
    const aria = box ? ((box.getAttribute('aria-label') || '') + ' ' + (box.getAttribute('data-placeholder') || '') + ' ' + (box.getAttribute('placeholder') || '')) : '';
    const hint = document.querySelector('[data-qa="message_input"] .ql-placeholder, [data-qa="message_input"] [data-placeholder]');
    const hintText = hint ? ((hint.getAttribute && hint.getAttribute('data-placeholder')) || hint.textContent || '') : '';
    return title() + ' ' + aria + ' ' + hintText;
  }

  function attrOf(node, names) {
    if (!node || !node.getAttribute) return '';
    for (let i = 0; i < names.length; i++) {
      const value = node.getAttribute(names[i]);
      if (value) return String(value).trim();
    }
    return '';
  }

  function signedInId(team) {
    let fromStore = '';
    try { fromStore = P.selfIdFromStore(localStorage.getItem('localConfig_v2'), team); } catch (e) { fromStore = ''; }
    if (fromStore) return fromStore;
    const own = document.querySelector('[data-qa="user-button"], [data-qa="nav_user"], [data-qa-own-user="1"]');
    const id = attrOf(own, ['data-user-id', 'data-member-id', 'data-qa-user-id']);
    return /^U[A-Z0-9]+$/.test(id) ? id : '';
  }

  function counterpartId() {
    const nodes = [pane(), document.querySelector('[data-qa="channel_name"]'), document.querySelector('[aria-selected="true"]')];
    const names = ['data-user-id', 'data-member-id', 'data-qa-user-id', 'data-qa-member-id'];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const id = attrOf(node, names);
      if (/^U[A-Z0-9]+$/.test(id)) return id;
      if (node && node.querySelector) {
        const child = node.querySelector('[data-user-id], [data-member-id], [data-qa-user-id]');
        const childId = attrOf(child, names);
        if (/^U[A-Z0-9]+$/.test(childId)) return childId;
      }
    }
    return '';
  }

  function trace(line) {
    const text = String(line || '').slice(0, 1600);
    try { console.info(text); } catch (e) { /* no console */ }
    try {
      chrome.runtime.sendMessage({ type: 'flow:slack-trace', line: text }, () => { void chrome.runtime.lastError; });
    } catch (e) { /* the page may be closing */ }
  }

  let lastWhyKey = '';
  function whyNot(reason, bubbles, chat) {
    const count = bubbles == null ? '' : String(bubbles);
    const id = chat || '';
    const key = reason + '|' + count + '|' + id;
    if (key === lastWhyKey) return;
    lastWhyKey = key;
    const bits = [reason];
    if (count !== '') bits.push('bubbles=' + count);
    bits.push('chat=' + (id || 'missing'));
    trace('[Glance] slack why-not ' + bits.join(' '));
  }

  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'slack', ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* the page may be closing */ }
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

  function ownName() {
    const button = document.querySelector('[data-qa="user-button"], [data-qa="nav_user"], [data-qa-own-user="1"]');
    return button ? (button.textContent || '').trim() : '';
  }

  function offerSelf(list, self, bubbles, chat) {
    if (typeof FlowChatSelfCard === 'undefined') return;
    const last = list[list.length - 1];
    const text = textOf(last);
    const result = FlowChatSelfCard.paint({
      self: self,
      fyi: P.isFyi(text),
      ask: P.isAsk(text),
      text: text,
      draft: (value) => P.selfDraft(value),
      composer: composerBox,
      whyNot: (reason) => whyNot(reason, bubbles, chat)
    });
    if (self && result && result.reason === 'fyi') whyNot('fyi', bubbles, chat);
  }

  async function scan(liveIn) {
    if (!(await hostOpen())) return;
    const live = liveIn && liveIn.bubbles ? liveIn : P.readLive(document);
    const parsed = P.parseUrl(location.href);
    if (!parsed) { report(false, 'chat-not-identified'); whyNot('chat-not-identified', live.bubbleCount, 'missing'); return; }
    const who = { id: signedInId(parsed.team), name: ownName() };
    const where = P.identify(location.href, document, who, live);
    if (!where || where.unresolved) { report(false, 'chat-not-identified'); whyNot('chat-not-identified', live.bubbleCount, 'missing'); return; }
    if (!where.oneToOne || where.inThread) { report(true); whyNot('not-one-to-one', live.bubbleCount, where.conversation); return; }
    const list = live.bubbles.slice(-MAX_ROWS);
    if (!list.length) { report(false, 'no-messages-recognised'); whyNot('no-messages-recognised', live.bubbleCount, where.conversation || 'missing'); return; }
    const t = title();
    if (!t) { report(false, 'chat-not-identified'); whyNot('chat-not-identified', live.bubbleCount, where.conversation || 'missing'); return; }
    const self = where.self === true || P.isSelfDm({ selfId: who.id, counterpartId: counterpartId(), titleBlob: selfBlob() }) || (who.name && t.toLowerCase() === who.name.toLowerCase());
    const filled = P.fillSenders(list.map((n) => ({ sender: senderOf(n) })));
    const own = filled.map((r) => (self ? true : P.isOwn(r.sender, t)));
    if (!self && own.some((x) => x === null)) { whyNot('sender-not-identified', live.bubbleCount, where.conversation); return; }
    whyNot('recognised', live.bubbleCount, where.conversation);
    report(true);
    const threadId = P.threadIdFor(where) || ('slack:' + where.team + ':' + where.conversation);
    const last = list[list.length - 1];
    remember(threadId, self ? (who.id || senderOf(last) || 'me') : (senderOf(last) || (own[own.length - 1] === true ? 'me' : 'them')));
    offerSelf(list, self, live.bubbleCount, where.conversation);
    const lastText = textOf(last);
    const ownLast = self || own[own.length - 1] === true;
    // A self-DM has nobody else to wait on. An FYI, or any last message that
    // is not an open ask, drops a follow-up card left by the message before it.
    if (self || (ownLast && !P.isAsk(lastText))) {
      if (typeof FlowFollow !== 'undefined' && typeof FlowFollow.dismiss === 'function') FlowFollow.dismiss();
      return;
    }
    if (typeof FlowFollow === 'undefined') return;
    const idx = new Map(list.map((n, i) => [n, i]));
    const party = { name: t, phone: null, email: null };
    const ctx = {
      channel: 'slack',
      strict: true,
      messages: list,
      isOwn: (n) => own[idx.get(n)] === true,
      messageId: messageIdOf,
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

  let seenHref = '';
  let listRoot = null;
  let listObserver = null;
  let bodyObserver = null;
  let lastProbeAt = 0;

  function targetName(node) {
    if (!node) return 'none';
    if (node === document.body) return 'document.body';
    const qa = node.getAttribute && node.getAttribute('data-qa');
    if (qa) return '[data-qa="' + qa + '"]';
    if (node.classList && node.classList.contains('p-view_header')) return '.p-view_header';
    return (node.nodeName || 'node').toLowerCase();
  }

  function probe(reason, live) {
    const now = Date.now();
    if (now - lastProbeAt < 2000) return live || P.readLive(document);
    lastProbeAt = now;
    const reading = live || P.readLive(document);
    const parts = P.PROBE_SELECTORS.map((sel) => sel + ':' + (reading.counts[sel] == null ? 0 : reading.counts[sel]));
    trace('[Glance] slack probe url=' + here() + ' sel=' + parts.join(' '));
    trace('[Glance] slack rescan reason=' + (reason || 'mutation'));
    return reading;
  }

  function schedule(reason) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ensureObservers();
      const live = P.readLive(document);
      probe(reason || 'mutation', live);
      scan(live).catch((e) => console.error('[Glance] Slack scan failed', e));
    }, DEBOUNCE_MS);
  }

  function onNav() {
    lastWhyKey = '';
    lastReportedHealth = null;
    schedule('nav');
  }

  function attach(node) {
    const obs = new MutationObserver(() => { ensureObservers(); schedule('mutation'); });
    obs.observe(node, { childList: true, subtree: true });
    trace('[Glance] slack observer attached target=' + targetName(node));
    return obs;
  }

  function ensureObservers() {
    const body = document.body;
    if (body && !bodyObserver) bodyObserver = attach(body);
    const root = pane();
    if (root && root !== listRoot) {
      if (listObserver) listObserver.disconnect();
      listRoot = root;
      listObserver = attach(root);
    }
  }

  function watchHref() {
    let href = '';
    try { href = String(location.href || ''); } catch (e) { href = ''; }
    if (href === seenHref) return;
    seenHref = href;
    onNav();
  }

  markLane();
  ensureObservers();
  try { window.addEventListener('popstate', onNav); } catch (e) { /* no window */ }
  try { window.addEventListener('hashchange', onNav); } catch (e) { /* no window */ }
  seenHref = here();
  setInterval(watchHref, 500);
  setInterval(() => schedule('mutation'), 2000);
  schedule('nav');
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.slack = { scan: () => scan() };
})();
