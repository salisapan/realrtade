// Instagram direct messages (instagram.com/direct). Closed beta: off until
// glanceSwitches.INSTAGRAM_LANE is true. Reads only after an explicit gesture
// (on-demand injection or scan({ gesture: true })). Never sends.
(() => {
  if (window.__glanceLaneChat) return;
  if (typeof FlowInstagramParse === 'undefined') return;
  window.__glanceLaneChat = { observers: 0, surface: 'instagram' };
  const P = FlowInstagramParse;
  const SURFACE = 'instagram';
  const LANE_FLAG = 'INSTAGRAM_LANE';
  const RETRY_MS = 1000;
  const RETRY_LIMIT = 8;
  const MAX_ROWS = 40;
  const STALE_MS = 14 * 24 * 60 * 60 * 1000;
  const FUTURE_SKEW_MS = 2 * 60 * 1000;
  const DRAFT_STORE = 'glanceLaneDrafts';
  let timer = null;
  let stopped = false;
  let tries = 0;
  let lastReportedHealth = null;
  let scanCount = 0;
  const drafted = new Set();
  const inflight = new Set();
  const quietLogged = new Set();

  function whyNot(reason, key) {
    const id = String(reason || 'silence') + '\n' + String(key || '');
    if (quietLogged.has(id)) return;
    quietLogged.add(id);
    const line = '[Glance] whyNotShown: ' + reason;
    try { console.info(line); } catch (e) { /* the console can be missing */ }
    try {
      const node = document.querySelector('[data-glance-quiet]');
      if (node) { node.hidden = false; node.textContent = line; }
    } catch (e) { /* the page is closing */ }
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
    return row.getAttribute('data-forwarded') === '1' || Boolean(row.querySelector('[data-testid="forwarded"], [data-testid="reel"], [data-testid="media-share"]'));
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
    try { return /\/dev\/instagram-fixture\.html$/i.test(String(location.pathname || '')); }
    catch (e) { return false; }
  }

  function isMessageRequests() {
    try {
      const path = String(location.pathname || '');
      if (/\/direct\/requests\b/i.test(path)) return true;
      if (document.querySelector('[data-testid="message-requests"], [aria-label*="Message requests"], [aria-label*="בקשות הודעה"]')) return true;
    } catch (e) { /* page closing */ }
    return false;
  }

  function stopQuietly() {
    if (stopped) return;
    stopped = true;
    if (timer) { try { clearTimeout(timer); } catch (e) { /* already gone */ } timer = null; }
    try {
      if (window.__glanceLaneChat && window.__glanceLaneChat.observers > 0) window.__glanceLaneChat.observers -= 1;
    } catch (e) { /* the page is closing */ }
    if (typeof FlowChatIndicator !== 'undefined') FlowChatIndicator.hide(document);
  }

  function guard() {
    if (stopped) return false;
    if (runtimeAlive()) return true;
    stopQuietly();
    return false;
  }

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

  async function laneFlagOn() {
    if (!runtimeAlive()) return false;
    if (!chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== 'function') return false;
    try {
      const bag = await chrome.storage.local.get({ glanceSwitches: {} });
      return !!(bag.glanceSwitches && bag.glanceSwitches[LANE_FLAG] === true);
    } catch (e) {
      return false;
    }
  }

  async function killSwitchOn() {
    if (typeof FlowChatKillSwitch === 'undefined' || typeof FlowChatKillSwitch.killed !== 'function') return false;
    try {
      return await FlowChatKillSwitch.killed(SURFACE, chrome.storage && chrome.storage.local);
    } catch (e) {
      return true;
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
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: SURFACE, ok: ok, reason: reason || null }, () => void chrome.runtime.lastError); }
    catch (e) {
      if (/invalidated/i.test(String(e && e.message || e)) || !runtimeAlive()) stopQuietly();
    }
  }

  function maybeDraft(main, list, party, direct, threadId) {
    if (typeof FlowChatLane === 'undefined' || !direct) {
      if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.sync(null);
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
    if (typeof FlowChatTaskCard !== 'undefined') {
      FlowChatTaskCard.sync(who === 'them' || who === 'me' ? key : null);
      if (who === 'me' && text && !forwarded(last)) {
        FlowChatTaskCard.offer({ text: text, channel: 'instagram', oneToOne: true, group: false, fromMe: true, own: true, quoted: false, sender: { name: party.name }, key: key, now: Date.now() }).catch(() => {});
      }
    }
    if (who !== 'them') { whyNot(who === 'me' ? 'from-me' : 'sender-not-identified', key); return; }
    if (!text || inflight.has(key)) return;
    const when = sentAt(last);
    if (when != null && when - Date.now() > FUTURE_SKEW_MS) { whyNot('future', key); return; }
    if (when != null && Date.now() - when > STALE_MS) { whyNot('stale', key); return; }
    inflight.add(key);
    const box = composerBox(main);
    const redactNames = [party.name, titleOf(main)].filter(Boolean);
    const finish = (async () => {
      if (!runtimeAlive()) { stopQuietly(); return; }
      const saved = await remembered(key);
      if (!runtimeAlive()) { stopQuietly(); return; }
      if (saved && saved.state === 'closed') { whyNot('closed', key); return; }
      const shown = boxText(box).trim();
      const shownHash = FlowLaneDraftStore.hashKey('draft', key, shown);
      if (saved && saved.hash && shownHash !== saved.hash) {
        await remember(key, { hash: saved.hash, state: 'closed' });
        whyNot('closed', key);
        return;
      }
      if (saved && saved.hash) return;
      if (drafted.has(key)) return;
      const input = {
        text: text,
        fromMe: false,
        oneToOne: true,
        group: false,
        quoted: forwarded(last),
        channel: 'instagram',
        now: when == null ? Date.now() : when,
        sender: { name: party.name },
        key: key,
        redactNames: redactNames
      };
      const r = await FlowChatLane.draftInto(box, input);
      if (typeof FlowChatTaskCard !== 'undefined') FlowChatTaskCard.afterDraft(r, input, box);
      if (!runtimeAlive() || (r && r.reason === 'invalidated')) { stopQuietly(); return; }
      if (r && r.reason === 'no-box') { whyNot('no-box', key); return; }
      if (!(r && r.ok && r.judged && r.judged.draft)) {
        whyNot((r && r.reason) || 'silence', key);
        return;
      }
      await remember(key, { hash: FlowLaneDraftStore.hashKey('draft', key, r.judged.draft), state: 'open' });
      drafted.add(key);
    })();
    finish.catch(() => { whyNot('draft-failed', key); drafted.add(key); }).finally(() => { inflight.delete(key); });
  }

  function testHarness() {
    try { return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id === 'glance-test'; }
    catch (e) { return false; }
  }

  async function scan(opts) {
    const gesture = opts && opts.gesture === true;
    if (!gesture && !isFixturePath() && !testHarness()) {
      whyNot('no-gesture', location.href);
      return;
    }
    scanCount += 1;
    if (!guard()) return;
    if (isMessageRequests()) { whyNot('message-requests', location.href); report(true); return; }
    const onFixture = isFixturePath();
    if (onFixture) {
      const devOn = await readDevFlag();
      if (!guard()) return;
      if (!devOn) { whyNot('dev-fixture-off', location.href); return; }
    } else {
      if (!P.page(location.href)) { whyNot('not-instagram-direct', location.href); return; }
      if (!(await laneFlagOn())) { whyNot('flag-off', location.href); return; }
      if (await killSwitchOn()) { whyNot('kill-switch', location.href); return; }
    }
    if (typeof FlowChatIndicator !== 'undefined') FlowChatIndicator.show(document);
    try {
      await runScanBody(onFixture);
    } finally {
      if (typeof FlowChatIndicator !== 'undefined') FlowChatIndicator.hide(document);
    }
  }

  async function runScanBody(onFixture) {
    if (!guard()) return;
    const main = root();
    const list = rows(main);
    if (!list.length) {
      if (tries < RETRY_LIMIT) {
        tries += 1;
        clearTimeout(timer);
        timer = setTimeout(() => { if (guard()) scan({ gesture: true }); }, RETRY_MS);
        return;
      }
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
    globalThis.__glanceChatSurfaces.instagram = globalThis.__glanceChatSurfaces.instagram || {};
    globalThis.__glanceChatSurfaces.instagram.name = t;
    globalThis.__glanceChatSurfaces.instagram.scanCount = scanCount;
    if (!direct) { whyNot('not-one-to-one', t); report(true); return; }
    const threadId = onFixture ? ('ig:dev-fixture' + (location.search || '')) : P.threadIdFor(location.href, t);
    if (!threadId) { whyNot('no-thread-id', location.href); report(true); return; }
    report(true);
    const party = { name: t, phone: null, email: null };
    const ctx = {
      channel: 'instagram',
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
      subject: t || 'Instagram message',
      threadUrl: () => location.href.split('#')[0],
      attachmentsOf: () => []
    };
    if (typeof FlowFollow !== 'undefined') FlowFollow.consider(ctx).catch((e) => console.error('[Glance] Instagram follow-up check failed', e));
    maybeDraft(main, list, party, direct, threadId);
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (!msg || msg.type !== 'flow:lane-chat-scan' || msg.surface !== SURFACE) return;
      scan({ gesture: true }).then(() => { if (reply) reply({ ok: true }); }).catch(() => { if (reply) reply({ ok: false }); });
      return true;
    });
  } catch (e) { /* no runtime */ }

  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.instagram = { scan: scan, scanCount: () => scanCount };
})();
