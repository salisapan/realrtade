// Inject a chat lane only after an explicit gesture (command / message). No background reads.
import '../core/chat-kill-switch.js';
import '../lane-chat/surfaces.js';

const READ_COUNTER_KEY = 'glanceChatReadCounters';
const USER_READ_MSG = 'flow:chat-user-read';

async function readCounters() {
  try {
    const bag = await chrome.storage.local.get(READ_COUNTER_KEY);
    return (bag && bag[READ_COUNTER_KEY]) || { background: 0, user: 0 };
  } catch (e) {
    return { background: 0, user: 0 };
  }
}

async function bump(field) {
  const cur = await readCounters();
  cur[field] = (cur[field] || 0) + 1;
  try { await chrome.storage.local.set({ [READ_COUNTER_KEY]: cur }); } catch (e) { /* ignore */ }
  return cur;
}

function tabUrlAllowed(url, origins) {
  if (!url || !origins || !origins.length) return false;
  try {
    const u = new URL(url);
    return origins.some((pattern) => {
      const m = String(pattern).match(/^(https?):\/\/([^/]+)(\/.*)?$/);
      if (!m || m[1] + ':' !== u.protocol) return false;
      const hostOk = m[2] === u.hostname;
      if (!hostOk) return false;
      const pathPattern = (m[3] || '/*').split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      return new RegExp('^' + pathPattern + '$').test(u.pathname + u.search);
    });
  } catch (e) {
    return false;
  }
}

async function glanceSwitchOn(name) {
  try {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    return Boolean(bag.glanceSwitches && bag.glanceSwitches[name] === true);
  } catch (e) {
    return false;
  }
}

function laneFilesFor(surface) {
  const lane = (globalThis.__glanceLaneChatDefs || []).find((row) => row.id === surface.laneId);
  if (!lane || typeof globalThis.__glanceLaneChatScripts !== 'function') return null;
  const base = globalThis.__glanceLaneChatScripts(lane);
  const extra = [
    'core/chat-kill-switch.js',
    'src/chat-redact.js',
    'src/chat-indicator.js'
  ];
  const out = base.slice();
  extra.forEach((f) => { if (out.indexOf(f) < 0) out.push(f); });
  return out;
}

async function runOnTab(tabId, surfaceId) {
  const surface = globalThis.FlowChatSurfaces && globalThis.FlowChatSurfaces.byId(surfaceId);
  if (!surface) return { ok: false, reason: 'unknown-surface' };
  if (!(await glanceSwitchOn(surface.switchId))) return { ok: false, reason: 'switch-off' };
  if (typeof globalThis.FlowChatKillSwitch !== 'undefined' && await globalThis.FlowChatKillSwitch.silenced(surface.killSurface)) {
    return { ok: false, reason: 'kill-switch' };
  }
  const files = laneFilesFor(surface);
  if (!files) return { ok: false, reason: 'missing-lane' };
  try {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: files });
    const reply = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async () => {
        const row = globalThis.__glanceChatSurfaces && globalThis.__glanceChatSurfaces.messenger;
        if (row && typeof row.runUserRead === 'function') return await row.runUserRead();
        return { ok: false, reason: 'no-handler' };
      }
    });
    await bump('user');
    const result = Array.isArray(reply) && reply[0] ? reply[0].result : null;
    return result || { ok: false, reason: 'no-result' };
  } catch (e) {
    return { ok: false, reason: 'inject-failed' };
  }
}

async function activeMessengerTab() {
  const origins = globalThis.FlowChatSurfaces.messengerOrigins;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (e) { tabs = []; }
  const tab = (tabs || [])[0];
  if (!tab || typeof tab.id !== 'number') return null;
  if (!tabUrlAllowed(tab.url, origins)) return null;
  return tab;
}

export function installChatOnDemand() {
  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command !== 'glance-read-chat') return;
      const tab = await activeMessengerTab();
      if (!tab) return;
      await runOnTab(tab.id, 'messenger');
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== USER_READ_MSG) return;
    (async () => {
      let tabId = msg.tabId;
      if (typeof tabId !== 'number' && _sender && _sender.tab && typeof _sender.tab.id === 'number') tabId = _sender.tab.id;
      if (typeof tabId !== 'number') { sendResponse({ ok: false, reason: 'no-tab' }); return; }
      const surfaceId = msg.surface || 'messenger';
      const out = await runOnTab(tabId, surfaceId);
      sendResponse(out);
    })();
    return true;
  });
}

export { READ_COUNTER_KEY, USER_READ_MSG, readCounters, bump, runOnTab, tabUrlAllowed };
