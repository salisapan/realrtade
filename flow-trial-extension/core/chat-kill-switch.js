// Per-surface chat kill switch (thin PR-0 adapter). Per-user off in
// glanceChatOff.<surface>. Remote signed JSON is stubbed off for Instagram until hosted.
const FlowChatKillSwitch = (() => {
  const USER_PREFIX = 'glanceChatOff.';
  const remoteCache = {};

  function testRuntime() {
    try { return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id === 'glance-test'; }
    catch (e) { return false; }
  }

  function defaultRemoteKilled(surface) {
    if (testRuntime()) return false;
    if (surface === 'instagram') return true;
    return false;
  }

  function readUserOff(area, surface) {
    if (!area || typeof area.get !== 'function') return false;
    const key = USER_PREFIX + surface;
    return area.get(key).then((bag) => Boolean(bag && bag[key] === true)).catch(() => false);
  }

  async function killed(surface, area) {
    const id = String(surface || '');
    if (!id) return true;
    const remote = remoteCache[id];
    if (remote && typeof remote.killed === 'boolean') {
      if (remote.killed) return true;
    } else if (defaultRemoteKilled(id)) {
      return true;
    }
    const userOff = await readUserOff(area || (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local), id);
    return userOff;
  }

  function killedSync(surface) {
    const id = String(surface || '');
    if (!id) return true;
    const remote = remoteCache[id];
    if (remote && typeof remote.killed === 'boolean') return remote.killed;
    return defaultRemoteKilled(id);
  }

  function setRemote(surface, killed) {
    remoteCache[String(surface || '')] = { killed: killed === true, at: Date.now() };
  }

  return { killed, killedSync, setRemote, USER_PREFIX };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatKillSwitch };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatKillSwitch = FlowChatKillSwitch;
