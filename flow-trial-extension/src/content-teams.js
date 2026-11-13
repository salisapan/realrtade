// Microsoft Teams on the web. Read-only on the open conversation's recent messages.
// One Do It through the shared chat task card; a reply ask inserts a draft in the compose box.
// Never sends. Graph read (Chat.Read) only when the DOM is not enough.
(() => {
  try {
    if (document.documentElement && document.documentElement.getAttribute('data-glance-lane-teams') !== 'on') {
      document.documentElement.setAttribute('data-glance-lane-teams', 'on');
    }
  } catch (e) { /* document not ready */ }
  if (window.__glanceLaneTeams) return;
  if (typeof FlowTeamsParse === 'undefined') {
    try { console.info('[Glance] whyNotShown: teams-parse-missing'); } catch (e) { /* no console */ }
    return;
  }
  window.__glanceLaneTeams = { observers: 0 };
  const P = FlowTeamsParse;
  const DEBOUNCE_MS = 1200;
  const MAX_ROWS = 40;
  let timer = null;
  let observer = null;
  let lastReportedHealth = null;
  const drafted = new Set();
  const inflight = new Set();

  function root() {
    return document.querySelector('[data-glance-teams-root], [role="main"]') || document.body;
  }

  function composerBox(main) {
    const marked = main.querySelector('[data-glance-composer]');
    if (marked) return marked;
    const all = Array.from(main.querySelectorAll('[contenteditable="true"], textarea'));
    for (const el of all) {
      const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
      if (/search|חפש/.test(label)) continue;
      if (/type a message|הקלד|message|הודעה|reply|השב/.test(label)) return el;
    }
    return null;
  }

  function runtimeAlive() {
    try { return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  function isFixturePath() {
    try { return /\/dev\/teams-fixture\.html$/i.test(String(location.pathname || '')); }
    catch (e) { return false; }
  }

  async function readDevFlag() {
    if (!runtimeAlive() || !chrome.storage || !chrome.storage.local) return false;
    try {
      const manifest = typeof chrome.runtime.getManifest === 'function' ? chrome.runtime.getManifest() : null;
      if (manifest && manifest.update_url) return false;
      const bag = await chrome.storage.local.get('glanceDevFixture');
      return Boolean(bag && bag.glanceDevFixture === true);
    } catch (e) { return false; }
  }

  function report(ok, reason) {
    const key = ok ? 'ok' : 'bad:' + reason;
    if (key === lastReportedHealth) return;
    lastReportedHealth = key;
    try { chrome.runtime.sendMessage({ type: 'flow:surface-health', id: 'teams', ok: ok, reason: reason || null }, () => void chrome.runtime.lastError); } catch (e) { /* page closing */ }
  }

  function whyNot(reason, detail) {
    const extra = detail ? ' ' + String(detail) : '';
    const line = '[Glance] whyNotShown: ' + reason + extra;
    try { console.info(line); } catch (e) { /* no console */ }
    try {
      const node = document.querySelector('[data-glance-quiet]');
      if (node) { node.hidden = false; node.textContent = line; }
    } catch (e) { /* gone */ }
  }

  function askWorker(chatId) {
    return new Promise((resolve) => {
      if (!runtimeAlive()) { resolve({ ok: false }); return; }
      try {
        chrome.runtime.sendMessage({ type: 'flow:teams-web-read', payload: { chatId: chatId } }, (r) => {
          void chrome.runtime.lastError;
          resolve(r || { ok: false });
        });
      } catch (e) { resolve({ ok: false }); }
    });
  }

  async function loadMessages(main) {
    if (P.domSufficient(main)) return P.messagesFromDom(main).slice(-MAX_ROWS);
    const chatId = P.chatIdFromHref(location.href);
    if (!chatId) return P.messagesFromDom(main).slice(-MAX_ROWS);
    const remote = await askWorker(chatId);
    if (remote && remote.ok && Array.isArray(remote.messages) && remote.messages.length) return remote.messages.slice(-MAX_ROWS);
    return P.messagesFromDom(main).slice(-MAX_ROWS);
  }

  async function maybeAct(main, list, party, oneToOne, threadId) {
    const last = list[list.length - 1];
    if (!last) return;
    const who = last.author || P.authorOf(last.node);
    const text = last.text || P.textOf(last.node);
    const id = last.id || '';
    const key = (threadId || '') + '\n' + id + '\n' + text;
    if (typeof FlowChatTaskCard !== 'undefined') {
      FlowChatTaskCard.sync(who === 'them' || who === 'me' ? key : null);
      if (who === 'me' && text) {
        const ownIn = P.judgeInput(last, party, { oneToOne: oneToOne, group: !oneToOne, key: key, now: Date.now() });
        FlowChatTaskCard.offer(Object.assign({}, ownIn, { own: true, fromMe: true })).catch(() => {});
      }
    }
    if (who !== 'them') {
      if (who === 'me') whyNot('from-me', key);
      else whyNot('sender-not-identified', key);
      return;
    }
    if (!text || inflight.has(key)) return;
    inflight.add(key);
    const input = P.judgeInput(last, party, { oneToOne: oneToOne, group: !oneToOne, key: key, now: Date.now() });
    const box = composerBox(main);
    const finish = (async () => {
      if (typeof FlowChatLane === 'undefined') {
        if (typeof FlowChatTaskCard !== 'undefined') await FlowChatTaskCard.offer(Object.assign({}, input, { composer: box }));
        return;
      }
      const r = await FlowChatLane.draftInto(box, input);
      if (typeof FlowChatTaskCard !== 'undefined') await FlowChatTaskCard.afterDraft(r, input, box);
      if (!(r && r.ok && r.judged && r.judged.draft)) whyNot((r && r.reason) || 'silence', key);
      else drafted.add(key);
    })();
    finish.catch(() => whyNot('draft-failed', key)).finally(() => { inflight.delete(key); });
  }

  async function offerLoop(main, last, party, threadId) {
    const text = last.text || P.textOf(last.node);
    const id = last.id || '';
    const key = (threadId || '') + '\n' + id + '\n' + text;
    if (!text || inflight.has(key)) return;
    inflight.add(key);
    const input = P.judgeInput(last, party, { oneToOne: true, group: false, key: key, now: Date.now(), selfChat: true });
    const asLoop = Object.assign({}, input, { fromMe: false, own: false, selfChat: true, oneToOne: true, group: false });
    const finish = (async () => {
      if (typeof FlowChatTaskCard === 'undefined') { whyNot('card-missing', threadId); return; }
      FlowChatTaskCard.sync(key);
      const offered = await FlowChatTaskCard.offer(asLoop);
      if (!(offered && offered.shown)) whyNot((offered && offered.reason) || 'silence', threadId);
    })();
    finish.catch(() => whyNot('draft-failed', threadId)).finally(() => { inflight.delete(key); });
    await finish;
  }

  async function scan() {
    if (!P.page(location.href) && !isFixturePath()) { whyNot('not-teams-page', location.href); return; }
    if (isFixturePath() && !(await readDevFlag())) { whyNot('dev-fixture-off', location.href); return; }
    const main = root();
    const found = P.identify(location.href, main);
    if (!found.id) {
      report(false, 'chat-not-identified');
      whyNot('chat-not-identified', P.missingSignals(found.signals));
      return;
    }
    const kind = P.threadKind(main);
    if (kind === 'group') { report(true); whyNot('not-one-to-one', found.signals.title || found.id); return; }
    const oneToOne = kind === 'dm';
    const title = found.signals.title || P.titleOf(main);
    const list = await loadMessages(main);
    if (!list.length) { report(false, 'no-messages-recognised'); whyNot('no-messages-recognised', 'bubbles=0'); return; }
    report(true);
    const party = { name: P.partyName(title) || 'Teams chat', email: null };
    try { document.documentElement.setAttribute('data-glance-lane-teams', 'on'); } catch (e) { /* */ }
    if (found.signals.self) {
      await offerLoop(main, list[list.length - 1], party, found.id);
      return;
    }
    await maybeAct(main, list, party, oneToOne, found.id);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { scan().catch((e) => console.error('[Glance] Teams scan failed', e)); }, DEBOUNCE_MS);
  }

  const watch = document.documentElement || document.body;
  if (watch) {
    observer = new MutationObserver(schedule);
    observer.observe(watch, { childList: true, subtree: true });
    window.__glanceLaneTeams.observers += 1;
  }
  schedule();
  globalThis.__glanceChatSurfaces = globalThis.__glanceChatSurfaces || {};
  globalThis.__glanceChatSurfaces.teams = { scan: () => scan() };
})();
