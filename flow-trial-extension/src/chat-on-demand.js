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
        func: (key) => {
          const bag = window.__glanceChatSurfaces || {};
          const row = bag[key];
          if (row && typeof row.scan === 'function') return row.scan({ gesture: true });
          return { ok: false, reason: 'no-scan' };
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

  async function run(chromeApi, tab, opts) {
    const api = chromeApi || globalThis.chrome;
    if (!tab || typeof tab.id !== 'number' || !tab.url) return { ok: false, reason: 'no-tab' };
    const surfaceKey = (opts && opts.surface) || (matchSurface(tab.url) && matchSurface(tab.url).key);
    if (!surfaceKey) return { ok: false, reason: 'no-surface' };
    if (!(await metaGranted(api))) return { ok: false, reason: 'not-granted' };
    if (typeof FlowChatKillSwitch !== 'undefined') {
      const killed = await FlowChatKillSwitch.isOff(api, surfaceKey);
      if (killed && killed.off) return { ok: false, reason: killed.reason || 'kill-switch' };
    }
    return injectLane(api, tab.id, surfaceKey);
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
      FlowChatKillSwitch.fetchRemote(api)
        .catch(() => FlowChatKillSwitch.readRemoteBag(api))
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
