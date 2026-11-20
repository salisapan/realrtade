// Slack on the web. Off until the person turns it on (optional host https://app.slack.com/*).
//
// One-to-one direct messages only. A self-chat ask gets one Do It. Do It places a draft in the compose box.
// Undo clears that draft only while it is still the same text. Glance never presses Send.
// A channel, a group direct message, a thread, and an FYI stay quiet.
// If the page cannot be read, the reason is logged once: [Glance] slack why-not …
(() => {
  if (typeof FlowSlackParse === 'undefined') return;
  const P = FlowSlackParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  const ORIGINS = ['https://app.slack.com/*'];
  let timer = null;
  let lastReportedHealth = null;
  const seenWhy = new Set();

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
    let nodes = Array.from(n.querySelectorAll('[data-qa="message-text"]'));
    if (!nodes.length) nodes = Array.from(n.querySelectorAll('.p-rich_text_section'));
    const pieces = nodes.map((s) => ({ text: s.innerText || s.textContent || '', quoted: Boolean(s.closest('blockquote, [data-qa="message_attachment"]')) }));
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

  function domConversationId() {
    const selected = document.querySelector('[aria-selected="true"][data-qa-channel-sidebar-channel-id], [aria-current="page"][data-qa-channel-sidebar-channel-id]');
    const main = pane();
    return P.conversationIdFrom([
      selected && selected.getAttribute('data-qa-channel-sidebar-channel-id'),
      main && main.getAttribute('data-qa-channel-id'),
      main && main.getAttribute('data-channel-id'),
      main && main.getAttribute('data-conversation-id')
    ]);
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
    const text = String(line || '').slice(0, 400);
    try { console.info(text); } catch (e) { /* no console */ }
    try {
      chrome.runtime.sendMessage({ type: 'flow:slack-trace', line: text }, () => { void chrome.runtime.lastError; });
    } catch (e) { /* the page may be closing */ }
  }

  function whyNot(reason, detail) {
    const extra = detail ? ' ' + String(detail) : '';
    const line = '[Glance] slack why-not ' + reason + extra;
    if (seenWhy.has(line)) return;
    seenWhy.add(line);
    trace(line);
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

  function offerSelf(list, self) {
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
      whyNot: whyNot
    });
    if (self && result && result.reason === 'fyi') whyNot('fyi');
  }

  async function scan() {
    if (!(await hostOpen())) return;
    const parsed = P.parseUrl(location.href);
    if (!parsed) { whyNot('chat-not-identified', 'url=missing'); return; }
    const where = P.resolveConversation(parsed, domConversationId());
    if (where.unresolved) { whyNot('chat-not-identified', 'dom=missing'); return; }
    if (!where.oneToOne || where.inThread) { report(true); whyNot('not-one-to-one'); return; }
    const list = rows();
    if (!list.length) { report(false, 'no-messages-recognised'); whyNot('no-messages-recognised', 'bubbles=0'); return; }
    const t = title();
    if (!t) { whyNot('chat-not-identified', 'title=missing'); return; }
    const self = P.isSelfDm({ selfId: signedInId(where.team), counterpartId: counterpartId(), titleBlob: selfBlob() });
    const filled = P.fillSenders(list.map((n) => ({ sender: senderOf(n) })));
    const own = filled.map((r) => (self ? true : P.isOwn(r.sender, t)));
    if (!self && own.some((x) => x === null)) { whyNot('sender-not-identified'); return; }
    report(true);
    const threadId = P.threadIdFor(where);
    const last = list[list.length - 1];
    remember(threadId, self ? (signedInId(where.team) || senderOf(last) || 'me') : (senderOf(last) || (own[own.length - 1] === true ? 'me' : 'them')));
    offerSelf(list, self);
    if (typeof FlowFollow === 'undefined') return;
    const idx = new Map(list.map((n, i) => [n, i]));
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

  let seenHref = '';
  let listRoot = null;
  let listObserver = null;

  function schedule() { clearTimeout(timer); timer = setTimeout(() => { scan().catch((e) => console.error('[Glance] Slack scan failed', e)); }, DEBOUNCE_MS); }

  function onNav() {
    seenWhy.clear();
    lastReportedHealth = null;
    schedule();
  }

  function watchList() {
    const root = pane();
    if (!root || root === listRoot) return;
    if (listObserver) listObserver.disconnect();
    listRoot = root;
    listObserver = new MutationObserver(schedule);
    listObserver.observe(root, { childList: true, subtree: true });
  }

  function watchHref() {
    let href = '';
    try { href = String(location.href || ''); } catch (e) { href = ''; }
    if (href === seenHref) return;
    seenHref = href;
    onNav();
  }

  markLane();
  const watch = document.documentElement || document.body;
  if (watch) new MutationObserver(() => { watchList(); schedule(); }).observe(watch, { childList: true, subtree: true });
  watchList();
  try { window.addEventListener('popstate', onNav); } catch (e) { /* no window */ }
  try { window.addEventListener('hashchange', onNav); } catch (e) { /* no window */ }
  seenHref = here();
  setInterval(watchHref, 500);
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.slack = { scan: () => scan() };
})();
