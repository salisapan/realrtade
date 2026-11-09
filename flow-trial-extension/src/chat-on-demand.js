// Service-worker side: inject lane scripts on gesture (action, command, or in-page button).
const FlowChatOnDemand = (() => {
  const INJECTED = new Set();

  function laneDefs() {
    if (typeof globalThis.__glanceLaneChatDefs === 'undefined' || !Array.isArray(globalThis.__glanceLaneChatDefs)) return [];
    return globalThis.__glanceLaneChatDefs;
  }

  function laneChatScripts() {
    return typeof globalThis.__glanceLaneChatScripts === 'function' ? globalThis.__glanceLaneChatScripts : null;
  }

  function laneCss() {
    return Array.isArray(globalThis.__glanceLaneChatCss) ? globalThis.__glanceLaneChatCss : ['design/step-states-v1/scoped.css', 'src/chip.css'];
  }

  function surfaceRow(key) {
    if (typeof FlowLaneChatSurfaces !== 'undefined' && Array.isArray(FlowLaneChatSurfaces.SURFACES)) {
      return FlowLaneChatSurfaces.SURFACES.find((s) => s.key === key) || null;
    }
    return laneDefs().find((l) => l.id === 'glance-lane-' + key) || null;
  }

  function matchSurface(url) {
    if (typeof FlowLaneChatSurfaces !== 'undefined' && FlowLaneChatSurfaces.matchSurface) {
      return FlowLaneChatSurfaces.matchSurface(url);
    }
    const href = String(url || '');
    for (const lane of laneDefs()) {
      for (const origin of lane.origins || []) {
        const prefix = origin.replace(/\*$/, '');
        if (href.indexOf(prefix) === 0) return { key: lane.id.replace('glance-lane-', ''), id: lane.id, origins: lane.origins, laneJs: lane.js };
      }
    }
    return null;
  }

  async function metaGranted(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    const origins = (typeof FlowMetaConsent !== 'undefined' && FlowMetaConsent.ORIGINS) ? FlowMetaConsent.ORIGINS.slice() : [];
    if (!origins.length || !api || !api.permissions) return false;
    try { return await api.permissions.contains({ origins: origins }); }
    catch (e) { return false; }
  }

  async function injectLane(chromeApi, tabId, surfaceKey) {
    const api = chromeApi || globalThis.chrome;
    const scriptsFn = laneChatScripts();
    const row = surfaceRow(surfaceKey);
    const lane = row && row.id ? laneDefs().find((l) => l.id === row.id) : laneDefs().find((l) => l.id === 'glance-lane-' + surfaceKey);
    if (!api || !api.scripting || !lane || !scriptsFn) return { ok: false, reason: 'no-lane' };
    const files = scriptsFn(lane);
    const css = laneCss();
    const token = tabId + ':' + surfaceKey;
    try {
      if (css.length) await api.scripting.insertCSS({ target: { tabId: tabId }, files: css });
      await api.scripting.executeScript({ target: { tabId: tabId }, files: files });
      INJECTED.add(token);
      await api.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          window.__glanceChatDomReads = (window.__glanceChatDomReads || 0) + 1;
          if (typeof FlowChatIndicator !== 'undefined') FlowChatIndicator.show(document, document.documentElement.lang || 'en');
        }
      });
      const scanResult = await api.scripting.executeScript({
        target: { tabId: tabId },
        func: async (key) => {
          const bag = window.__glanceChatSurfaces || {};
          const row = bag[key];
          let out = { ok: false, reason: 'no-scan' };
          if (row && typeof row.scan === 'function') out = await row.scan({ gesture: true }) || out;
          if (row && typeof row.followScan === 'function') await row.followScan({ gesture: true });
          return out;
        },
        args: [surfaceKey]
      });
      await api.scripting.executeScript({
        target: { tabId: tabId },
        func: () => { if (typeof FlowChatIndicator !== 'undefined') FlowChatIndicator.hide(document); }
      });
      const first = Array.isArray(scanResult) && scanResult[0] ? scanResult[0].result : null;
      return { ok: true, scan: first };
    } catch (e) {
      return { ok: false, reason: 'inject-failed' };
    }
  }

  function execute(api, tabId, world, func, args) {
    const opts = { target: { tabId: tabId }, func: func, args: args || [] };
    if (world) opts.world = world;
    return api.scripting.executeScript(opts);
  }

  async function paintWhatsAppGate(api, tabId, world) {
    await execute(api, tabId, world, () => {
      globalThis.__glanceWhatsAppWebRead = true;
      globalThis.__glanceWhatsAppWebConsent = true;
      globalThis.__glanceWhatsAppUserOff = false;
      globalThis.__glanceWhatsAppRemoteOff = false;
    }, []);
  }

  async function invokeScan(api, tabId, surfaceKey, world) {
    const scanResult = await execute(api, tabId, world, async (key) => {
      const row = (window.__glanceChatSurfaces || {})[key];
      if (!row || typeof row.scan !== 'function') return { ok: false, reason: 'no-scan' };
      let draft = { ok: false, reason: 'no-scan' };
      try { draft = await row.scan({ gesture: true }) || { ok: true }; } catch (e) { return { ok: false, reason: 'scan-threw' }; }
      try { if (typeof row.followScan === 'function') await row.followScan({ gesture: true }); } catch (e2) { /* follow is optional */ }
      return draft;
    }, [surfaceKey]);
    const first = scanResult && scanResult[0] ? scanResult[0].result : null;
    if (!first || first.ok === false) return { ok: false, reason: (first && first.reason) || 'no-scan', scan: first };
    return { ok: true, scan: first };
  }

  async function whatsappGate(api) {
    const G = globalThis.FlowWhatsAppWebGate;
    if (!G) return { ok: false, reason: 'flag-off' };
    let bag = {};
    try { bag = await api.storage.local.get([G.FLAG_KEY, G.CONSENT_KEY, G.USER_KILL_KEY, G.REMOTE_KEY]); } catch (e) { bag = {}; }
    return G.allowed({
      flag: bag[G.FLAG_KEY] === true,
      consent: bag[G.CONSENT_KEY] === true,
      userOff: bag[G.USER_KILL_KEY] === true,
      remote: bag[G.REMOTE_KEY]
    });
  }

  async function run(chromeApi, tab, opts) {
    const api = chromeApi || globalThis.chrome;
    if (!tab || typeof tab.id !== 'number' || !tab.url) return { ok: false, reason: 'no-tab' };
    const fixture = /whatsapp-fixture\.html/.test(String(tab.url));
    const surfaceKey = (opts && opts.surface) || (matchSurface(tab.url) && matchSurface(tab.url).key) || (fixture ? 'whatsapp' : null);
    if (!surfaceKey) return { ok: false, reason: 'no-surface' };
    // The extension fixture is the dev stand-in. Its stub scan is the explicit
    // gesture in the chat-lane spec. It is not WhatsApp Web and it does not
    // read a person's chats. Production web.whatsapp.com stays behind the gate.
    if (fixture && surfaceKey === 'whatsapp') {
      // The fixture is an extension page. Its scan lives in the page, so the
      // gesture is a message, not an injected script.
      return new Promise((resolve) => {
        try {
          api.tabs.sendMessage(tab.id, { type: 'flow:fixture-scan' }, (r) => {
            let err = null;
            try { err = api.runtime && api.runtime.lastError; } catch (e) { err = e; }
            if (err) { resolve({ ok: false, reason: 'inject-failed' }); return; }
            if (!r || r.ok === false) resolve({ ok: false, reason: (r && r.reason) || 'no-scan', scan: r });
            else resolve({ ok: true, scan: r });
          });
        } catch (e) { resolve({ ok: false, reason: 'inject-failed' }); }
      });
    }
    if (surfaceKey === 'whatsapp') {
      const decision = await whatsappGate(api);
      if (!decision.ok) return decision;
      // The WhatsApp host alone is enough. A full Meta grant is not required to read the open chat.
    } else {
      if (typeof FlowChatKillSwitch !== 'undefined') {
        const killed = await FlowChatKillSwitch.isOff(api, surfaceKey);
        if (killed && killed.off) return { ok: false, reason: killed.reason || 'kill-switch' };
      }
      if (!(await metaGranted(api))) return { ok: false, reason: 'not-granted' };
    }
    for (let i = 0; i < 25; i++) {
      try {
        const probe = await execute(api, tab.id, null, (key) => Boolean(
          window.__glanceChatSurfaces && window.__glanceChatSurfaces[key] && typeof window.__glanceChatSurfaces[key].scan === 'function'
        ), [surfaceKey]);
        if (probe && probe[0] && probe[0].result) {
          if (surfaceKey === 'whatsapp') await paintWhatsAppGate(api, tab.id, null);
          return invokeScan(api, tab.id, surfaceKey, null);
        }
      } catch (e) { /* the tab is not scriptable yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, reason: 'no-scan' };
  }

  function registerTriggerScripts(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.scripting || !api.scripting.registerContentScripts) return Promise.resolve();
    const trigger = (typeof FlowLaneChatSurfaces !== 'undefined' && FlowLaneChatSurfaces.TRIGGER_JS)
      ? FlowLaneChatSurfaces.TRIGGER_JS
      : ['src/chat-indicator.js', 'src/chat-lane-trigger.js'];
    const surfaces = (typeof FlowLaneChatSurfaces !== 'undefined' && FlowLaneChatSurfaces.SURFACES)
      ? FlowLaneChatSurfaces.SURFACES
      : laneDefs().map((l) => ({ id: l.id, key: l.id.replace('glance-lane-', ''), origins: l.origins }));
    const jobs = surfaces.map((row) => ({
      id: row.id + '-trigger',
      matches: row.origins,
      js: ['lane-chat/surfaces.js'].concat(trigger),
      runAt: 'document_idle',
      persistAcrossSessions: true
    }));
    return (async () => {
      for (const job of jobs) {
        try { await api.scripting.unregisterContentScripts({ ids: [job.id] }); } catch (e) { /* first run */ }
        const surfaceKey = job.id.replace('glance-lane-', '').replace('-trigger', '');
        if (typeof FlowChatKillSwitch !== 'undefined' && FlowChatKillSwitch.isAllowed) {
          const allowed = await FlowChatKillSwitch.isAllowed(api, surfaceKey);
          if (!allowed) continue;
        }
        try { await api.scripting.registerContentScripts([job]); } catch (e) { /* host not granted yet */ }
      }
    })();
  }

  function wire(chromeApi) {
    const api = chromeApi || globalThis.chrome;
    if (!api || !api.runtime) return;
    if (api.commands && api.commands.onCommand) {
      api.commands.onCommand.addListener(async (command) => {
        if (command !== 'glance-analyze-chat') return;
        const tabs = api.tabs ? await api.tabs.query({ active: true, currentWindow: true }).catch(() => []) : [];
        const tab = tabs && tabs[0];
        if (tab) await run(api, tab, { source: 'command' });
      });
    }
    if (api.action && api.action.onClicked) {
      api.action.onClicked.addListener(async (tab) => {
        if (!tab) return;
        await run(api, tab, { source: 'action' });
      });
    }
    if (api.contextMenus && api.contextMenus.create) {
      try {
        api.contextMenus.removeAll(() => {
          api.contextMenus.create({
            id: 'glance-analyze-chat',
            title: 'Analyze this chat (Glance)',
            contexts: ['page'],
            documentUrlPatterns: ['https://web.whatsapp.com/*', 'https://www.messenger.com/*', 'https://messenger.com/*', 'https://www.facebook.com/messages*', 'https://facebook.com/messages*', 'https://www.instagram.com/direct*', 'https://instagram.com/direct*']
          });
        });
      } catch (e) { /* menu may already exist */ }
      if (api.contextMenus.onClicked) {
        api.contextMenus.onClicked.addListener(async (info, tab) => {
          if (!info || info.menuItemId !== 'glance-analyze-chat' || !tab) return;
          await run(api, tab, { source: 'context-menu' });
        });
      }
    }
    api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== 'flow:chat-on-demand') return;
      const tabId = sender && sender.tab && sender.tab.id;
      const tab = sender && sender.tab;
      if (!tabId || !tab) {
        try { sendResponse({ ok: false, reason: 'no-tab' }); } catch (e) { /* caller gone */ }
        return true;
      }
      run(api, tab, { surface: msg.surface, source: msg.source || 'message' }).then((r) => {
        try { sendResponse(r); } catch (e) { /* caller gone */ }
      });
      return true;
    });
    if (typeof FlowChatKillSwitch !== 'undefined') {
      FlowChatKillSwitch.wireAlarm(api);
      FlowChatKillSwitch.schedulePoll(api);
      // Do not fetch on startup. A load-time fetch is a network call the rest of
      // the worker did not make, and never-fetched stays off until the alarm.
      FlowChatKillSwitch.readRemoteBag(api)
        .then(() => FlowChatKillSwitch.applyTriggers(api))
        .catch(() => {});
    } else {
      registerTriggerScripts(api).catch(() => {});
    }
  }

  function domReadCountForTab(tabId, surfaceKey) {
    return INJECTED.has(tabId + ':' + surfaceKey);
  }

  return { run, wire, registerTriggerScripts, matchSurface, domReadCountForTab };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatOnDemand };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatOnDemand = FlowChatOnDemand;
