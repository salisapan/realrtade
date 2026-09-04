// Thin wrapper around chrome.storage.local. Everything Flow Trial persists —
// onboarding choices, the activity log, dismissed message ids — lives here,
// on the device, never sent anywhere by this file.

const FlowStorage = (() => {
  const DEFAULTS = {
    onboarded: false,
    domainId: null,
    connectorId: null,
    log: [],        // { ts, kind: 'shown'|'clicked'|'dismissed', label, messageId }
    seenMessageIds: [] // messages already judged, so we never re-evaluate one
  };

  function get() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULTS, resolve);
    });
  }

  function set(patch) {
    return new Promise((resolve) => {
      chrome.storage.local.set(patch, resolve);
    });
  }

  async function appendLog(entry) {
    const state = await get();
    const log = [{ ts: Date.now(), ...entry }, ...state.log].slice(0, 200);
    await set({ log });
    return log;
  }

  async function markSeen(messageId) {
    const state = await get();
    if (state.seenMessageIds.includes(messageId)) return;
    const seenMessageIds = [messageId, ...state.seenMessageIds].slice(0, 500);
    await set({ seenMessageIds });
  }

  async function wasSeen(messageId) {
    const state = await get();
    return state.seenMessageIds.includes(messageId);
  }

  return { get, set, appendLog, markSeen, wasSeen, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowStorage };
