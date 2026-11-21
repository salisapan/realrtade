// Service-worker side on-demand chat injection (thin PR-0 adapter).
(function () {
  const SCAN_MSG = 'flow:lane-chat-scan';

  function surfaceDef(id) {
    const reg = typeof FlowChatSurfaces !== 'undefined' ? FlowChatSurfaces : null;
    return reg && typeof reg.byId === 'function' ? reg.byId(id) : null;
  }

  async function laneEnabled(surface) {
    const row = surfaceDef(surface);
    if (!row || !row.flag) return false;
    try {
      const bag = await chrome.storage.local.get({ glanceSwitches: {} });
      return !!(bag.glanceSwitches && bag.glanceSwitches[row.flag] === true);
    } catch (e) {
      return false;
    }
  }

  async function injectAndScan(tabId, surface) {
    const row = surfaceDef(surface);
    if (!row || !Array.isArray(row.js) || !row.js.length) return { ok: false, reason: 'unknown-surface' };
    if (!(await laneEnabled(surface))) return { ok: false, reason: 'flag-off' };
    if (typeof FlowChatKillSwitch !== 'undefined' && FlowChatKillSwitch.killed) {
      const off = await FlowChatKillSwitch.killed(row.killKey || surface, chrome.storage.local);
      if (off) return { ok: false, reason: 'kill-switch' };
    }
    const css = ['design/step-states-v1/scoped.css', 'src/chip.css'];
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: css });
      await chrome.scripting.executeScript({ target: { tabId }, files: row.js });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (msg, id) => {
          if (globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces[id] && typeof globalThis.__glanceChatSurfaces[id].scan === 'function') {
            globalThis.__glanceChatSurfaces[id].scan({ gesture: true });
          }
          try { chrome.runtime.sendMessage({ type: msg, surface: id }); } catch (e) { /* tab may close */ }
        },
        args: [SCAN_MSG, surface]
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'inject-failed' };
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.FlowChatOnDemand = { injectAndScan, SCAN_MSG, laneEnabled };
  }
})();
