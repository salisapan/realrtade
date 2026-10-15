// Messenger (messenger.com and facebook.com/messages). Off until the person turns it on.
//
// Reads the open one-to-one conversation and, when the newest message asks for one
// answer the core judge can find, places a draft in the message box. The person sends it.
// What it never does: press Enter, click Send, react, mark as read, open a chat, or touch a group.
//
// The page is not a public interface. If the open chat cannot be read, Glance says so once and stays silent.
(() => {
  if (window.__glanceLaneChat) return;
  if (typeof FlowMessengerParse === 'undefined') return;
  window.__glanceLaneChat = { observers: 0 };
  const P = FlowMessengerParse;
  const DEBOUNCE_MS = 1200;
  const RETRY_MS = 1000;
  const RETRY_LIMIT = 8;
  const MAX_ROWS = 40;
  const STALE_MS = 14 * 24 * 60 * 60 * 1000;
  // Two minutes of clock skew is intentional. A timestamp further ahead than
  // that is in the future, and the thread stays quiet (whyNotShown: future).
  const FUTURE_SKEW_MS = 2 * 60 * 1000;
  const DRAFT_STORE = 'glanceLaneDrafts';
  let timer = null;
  let observer = null;
  let stopped = false;
  let tries = 0;
  let lastReportedHealth = null;
  const drafted = new Set();
  const inflight = new Set();
  const quietLogged = new Set();

  function whyNot(reason, key) {
    const id = String(reason || 'silence') + '\n' + String(key || '');
    if (quietLogged.has(id)) return;
    quietLogged.add(id);
    try { console.info('[Glance] whyNotShown: ' + reason); } catch (e) { /* the console can be missing */ }
  }

  function root() {
    return document.querySelector('[data-glance-chat], [role="main"]') || document.body;
  }

  function titleOf(main) {
    const marked = main.querySelector('[data-glance-title]');
    if (marked) {
      const text = (marked.getAttribute('title') || marked.textContent || '').trim();
      if (text) return text;
    }
    const list = Array.from(main.querySelectorAll('header h1, header h2, header h3, [role="banner"] h1, [role="banner"] h2, [role="banner"] h3, h1, h2, h3'));
    const h = list.find((n) => !n.closest('[role="row"]') && !/^(conversation information|messages|chat details)$/i.test((n.textContent || '').trim()));
    if (!h) return '';
    return (h.getAttribute('title') || h.textContent || '').trim();
  }

  function rows(main) {
    return Array.from(main.querySelectorAll('[role="row"]')).filter((n) => n.querySelector('[dir="auto"]')).slice(-MAX_ROWS);
  }

  function author(row) {
    const surface = String(row.getAttribute('data-surface') || '');
    if (/message_out|from_page/.test(surface)) return 'me';
    if (/message_in|from_user/.test(surface)) return 'them';
    return P.authorOf({
      author: row.getAttribute('data-author'),
      label: row.getAttribute('aria-label') || '',
      outgoing: Boolean(row.querySelector('[data-scope="outgoing"], [data-testid="outgoing"]')),
      incoming: Boolean(row.querySelector('[data-scope="incoming"], [data-testid="incoming"]'))
    });
  }

  function sentAt(row) {
    const node = row.querySelector('time[datetime]');
    if (!node) return null;
    const n = Date.parse(node.getAttribute('datetime') || '');
    return Number.isFinite(n) ? n : null;
  }

  function textOf(row) {
    const pieces = Array.from(row.querySelectorAll('[dir="auto"]')).map((s) => ({
      text: s.innerText || s.textContent || '',
      quoted: Boolean(s.closest('[data-quoted="1"], blockquote'))
    }));
    return P.joinText(pieces);
  }

  function forwarded(row) {
    return row.getAttribute('data-forwarded') === '1' || Boolean(row.querySelector('[data-testid="forwarded"]'));
  }

  function composerBox(main) {
    const all = Array.from(main.querySelectorAll('[contenteditable="true"], textarea'));
    for (const el of all) {
      if (el.getAttribute('data-glance-composer') === '1') return el;
      const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
      if (/search|חפש/.test(label)) continue;
      if (/message|הודעה|reply|השב|תגובה/.test(label)) return el;
    }
    return null;
  }

  function boxText(el) {
    if (!el) return '';
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') return String(el.value || '');
    return String(el.innerText || el.textContent || '');
  }

  function runtimeAlive() {
    try { return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  function isFixturePath() {
    try { return /\/dev\/messenger-fixture\.html$/i.test(String(location.pathname || '')); }
    catch (e) { return false; }
  }

  function stopQuietly() {
    if (stopped) return;
    stopped = true;
    try { if (observer) observer.disconnect(); } catch (e) { /* already gone */ }
    observer = null;
    if (timer) { try { clearTimeout(timer); } catch (e) { /* already gone */ } timer = null; }
    try {
      if (window.__glanceLaneChat && window.__glanceLaneChat.observers > 0) window.__glanceLaneChat.observers -= 1;
    } catch (e) { /* the page is closing */ }
  }

  function guard() {
    if (stopped) return false;
    if (runtimeAlive()) return true;
    stopQuietly();
    return false;
  }

  // The live Gate page. A store build has update_url, so the flag cannot turn it on.
  async function readDevFlag() {
    if (!runtimeAlive()) return false;
    try {
      const manifest = typeof chrome.runtime.getManifest === 'function' ? chrome.runtime.getManifest() : null;
      if (manifest && manifest.update_url) return false;
    } catch (e) { return false; }
    if (!chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== 'function') return false;
    try {
      const bag = await chrome.storage.local.get('glanceDevFixture');
      if (!runtimeAlive()) { stopQuietly(); return false; }
      return Boolean(bag && bag.glanceDevFixture === true);
    } catch (e) {
      if (/invalidated/i.test(String(e && e.message || e)) || !runtimeAlive()) stopQuietly();
      return false;
    }
  }

  function draftStore() {
    if (!runtimeAlive()) return null;
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function draftKey(threadId, id, text) {
    if (typeof FlowLaneDraftStore === 'undefined') return null;
    return FlowLaneDraftStore.hashKey(threadId, id, text);
  }

  async function remembered(key) {
    const area = draftStore();
    if (!area || typeof area.get !== 'function' || typeof FlowLaneDraftStore === 'undefined') return null;
    try {
      const bag = await area.get(DRAFT_STORE);
      const got = FlowLaneDraftStore.get((bag && bag[DRAFT_STORE]) || {}, key, Date.now());
      if (got.row && typeof area.set === 'function') await area.set({ [DRAFT_STORE]: got.all });
      return got.row;
    } catch (e) {
      if (/invalidated/i.test(String(e && e.message || e)) || !runtimeAlive()) stopQuietly();
      return null;
    }
  }

  async function remember(key, row) {
    if (!runtimeAlive()) { stopQuietly(); return; }
    const area = draftStore();
    if (!area || typeof area.get !== 'function' || typeof area.set !== 'function' || typeof FlowLaneDraftStore === 'undefined') return;
    try {
      const bag = await area.get(DRAFT_STORE);
      if (!runtimeAlive()) { stopQuietly(); return; }
      const next = FlowLaneDraftStore.put((bag && bag[DRAFT_STORE]) || {}, key, row, Date.now());
      await area.set({ [DRAFT_STORE]: next });
    } catch (e) {
      if (/invalidated/i.test(String(e && e.message || e)) || !runtimeAlive()) stopQuietly();
    }
  }

  function report(ok, reason) {
    if (!guard()) return;
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'messenger', ok: ok, reason: reason || null }, () => void chrome.runtime.lastError); }
    catch (e) {
      if (/invalidated/i.test(String(e && e.message || e)) || !runtimeAlive()) stopQuietly();
    }
  }

  function maybeDraft(main, list, party, direct, threadId) {
    if (typeof FlowChatLane === 'undefined' || !direct) {
      if (!direct) whyNot('not-one-to-one', location.href);
      else whyNot('missing-lane', location.href);
      return;
    }
    const last = list[list.length - 1];
    if (!last) return;
    const who = author(last);
    const text = textOf(last);
    const id = last.getAttribute('data-message-id') || text.slice(0, 80);
    const key = draftKey(threadId, id, text);
    if (!key) { whyNot('no-thread-id', location.href); return; }
    if (who !== 'them') { whyNot(who === 'me' ? 'from-me' : 'sender-not-identified', key); return; }
    if (!text || inflight.has(key)) return;
    const when = sentAt(last);
    if (when != null && when - Date.now() > FUTURE_SKEW_MS) { whyNot('future', key); return; }
    if (when != null && Date.now() - when > STALE_MS) { whyNot('stale', key); return; }
    inflight.add(key);
    const box = composerBox(main);
    const finish = (async () => {
      if (!runtimeAlive()) { stopQuietly(); return; }
      const saved = await remembered(key);
      if (!runtimeAlive()) { stopQuietly(); return; }
      const shown = boxText(box).trim();
      const shownHash = FlowLaneDraftStore.hashKey('draft', key, shown);
      if (saved && saved.state === 'closed') { whyNot('closed', key); return; }
      if (saved && saved.hash && shownHash !== saved.hash) {
        await remember(key, { hash: saved.hash, state: 'closed' });
        whyNot('closed', key);
        return;
      }
      if (saved && saved.hash) return;
      if (drafted.has(key)) return;
      const r = await FlowChatLane.draftInto(box, {
        text: text,
        fromMe: false,
        oneToOne: true,
        group: false,
        quoted: forwarded(last),
        channel: 'messenger',
        now: when == null ? Date.now() : when,
        sender: { name: party.name }
      });
      if (!runtimeAlive() || (r && r.reason === 'invalidated')) { stopQuietly(); return; }
      if (r && r.reason === 'no-box') { whyNot('no-box', key); return; }
      if (r && r.ok && r.judged && r.judged.draft) {
        await remember(key, { hash: FlowLaneDraftStore.hashKey('draft', key, r.judged.draft), state: 'open' });
      }
      drafted.add(key);
    })();
    finish.catch(() => { whyNot('draft-failed', key); drafted.add(key); }).finally(() => { inflight.delete(key); });
  }

  async function scan() {
    if (!guard()) return;
    const onFixture = isFixturePath();
    if (onFixture) {
      const devOn = await readDevFlag();
      if (!guard()) return;
      if (!devOn) { whyNot('dev-fixture-off', location.href); return; }
    } else if (!P.page(location.href)) { whyNot('not-a-messenger-page', location.href); return; }
    const main = root();
    const list = rows(main);
    if (!list.length) {
      if (tries < RETRY_LIMIT) { tries += 1; clearTimeout(timer); timer = setTimeout(() => { if (guard()) scan(); }, RETRY_MS); return; }
      whyNot('no-messages-recognised', location.href);
      report(false, 'no-messages-recognised');
      return;
    }
    tries = 0;
    const thread = P.classify(main, location.href);
    const t = String((thread && thread.name) || titleOf(main) || '').replace(/\s+/g, ' ').trim();
    if (!t) { whyNot('chat-not-identified', location.href); report(false, 'chat-not-identified'); return; }
    const direct = thread && thread.kind === 'one-to-one';
    globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
    globalThis.__glanceChatSurfaces.messenger = globalThis.__glanceChatSurfaces.messenger || {};
    globalThis.__glanceChatSurfaces.messenger.name = t;
    if (!direct) { whyNot('not-one-to-one', t); report(true); return; }
    const threadId = onFixture ? ('ms:dev-fixture' + (location.search || '')) : P.threadIdFor(location.href, t, main);
    if (!threadId) { whyNot('no-thread-id', location.href); report(true); return; }
    report(true);
    const party = { name: t, phone: null, email: null };
    const ctx = {
      channel: 'messenger',
      strict: true,
      messages: list,
      isOwn: (n) => author(n) === 'me',
      messageId: (n) => n.getAttribute('data-message-id') || textOf(n).slice(0, 40),
      counterpart: () => party,
      partyOf: () => party,
      extractSender: (n) => (author(n) === 'me' ? { email: null, name: null, phone: null } : { email: null, name: t, phone: null }),
      ownMessageText: textOf,
      messageText: textOf,
      threadIdFrom: () => threadId,
      subject: t || 'Messenger chat',
      threadUrl: () => location.href.split('#')[0],
      attachmentsOf: () => []
    };
    if (typeof FlowFollow !== 'undefined') FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Messenger follow-up check failed', e));
    maybeDraft(main, list, party, direct, threadId);
  }

  function schedule() {
    if (!guard()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (guard()) scan(); }, DEBOUNCE_MS);
  }
  const watch = document.documentElement || document.body;
  if (watch) {
    observer = new MutationObserver(() => { if (guard()) schedule(); });
    observer.observe(watch, { childList: true, subtree: true });
    window.__glanceLaneChat.observers += 1;
  }
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.messenger = { scan: scan };
})();
