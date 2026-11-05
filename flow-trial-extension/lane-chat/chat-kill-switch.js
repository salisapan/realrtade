// Per-user and global kill switch for WhatsApp share intake (thin adapter; PR-0 may replace).
const FlowChatKillSwitch = (() => {
  const USER_KEY = 'whatsappShareUserKill';
  const GLOBAL_KEY = 'whatsappShareGlobalKill';
  const GLOBAL_URL = 'https://theflow-ai.com/.netlify/functions/glance-flags?v=1';
  const HOURLY_MS = 60 * 60 * 1000;
  const SWITCH = 'WHATSAPP_SHARE_INTAKE';

  function storageGet(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        try { chrome.storage.local.get(keys, (bag) => resolve(bag || {})); } catch (e) { resolve({}); }
      });
    }
    return Promise.resolve({});
  }

  function storageSet(patch) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        try { chrome.storage.local.set(patch, () => resolve()); } catch (e) { resolve(); }
      });
    }
    return Promise.resolve();
  }

  async function refreshGlobalKill() {
    const now = Date.now();
    const bag = await storageGet({ [GLOBAL_KEY]: null, whatsappShareGlobalKillAt: 0 });
    const last = Number(bag.whatsappShareGlobalKillAt || 0);
    if (now - last < HOURLY_MS && bag[GLOBAL_KEY] != null) return bag[GLOBAL_KEY] === true;
    let killed = false;
    try {
      const res = await fetch(GLOBAL_URL, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        killed = !!(data && (data.whatsappShareKill === true || data.whatsappShareGlobalKill === true));
      }
    } catch (e) { /* stay with last known */ killed = bag[GLOBAL_KEY] === true; }
    await storageSet({ [GLOBAL_KEY]: killed, whatsappShareGlobalKillAt: now });
    return killed;
  }

  async function blocked() {
    const bag = await storageGet({ glanceSwitches: {}, [USER_KEY]: false, [GLOBAL_KEY]: false });
    if (!(bag.glanceSwitches && bag.glanceSwitches[SWITCH] === true)) return { blocked: true, reason: 'switch-off' };
    if (bag[USER_KEY] === true) return { blocked: true, reason: 'user-kill' };
    const globalKill = await refreshGlobalKill();
    if (globalKill) return { blocked: true, reason: 'global-kill' };
    return { blocked: false, reason: '' };
  }

  return { SWITCH, USER_KEY, GLOBAL_KEY, blocked, refreshGlobalKill };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatKillSwitch };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatKillSwitch = FlowChatKillSwitch;
