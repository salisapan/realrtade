// Per-surface chat kill switches (device only). A missing remote row is treated as on (silenced)
// until the owner hosts the signed JSON from PR-0. glanceChatOff.<surface> is the per-user off toggle.
const FlowChatKillSwitch = (() => {
  function userOff(bag, surface) {
    const key = 'glanceChatOff.' + String(surface || '');
    return Boolean(bag && bag[key] === true);
  }

  function remoteOff(bag, surface) {
    const key = 'glanceChatRemoteKill.' + String(surface || '');
    if (!bag || !Object.prototype.hasOwnProperty.call(bag, key)) return true;
    return bag[key] === true;
  }

  async function bag() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
        return await chrome.storage.local.get(null);
      }
    } catch (e) { /* storage can be missing in tests */ }
    return {};
  }

  async function silenced(surface, preloaded) {
    const b = preloaded || await bag();
    return userOff(b, surface) || remoteOff(b, surface);
  }

  return { userOff, remoteOff, silenced, bag };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatKillSwitch };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatKillSwitch = FlowChatKillSwitch;
