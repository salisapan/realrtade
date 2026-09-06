// Thin wrapper around chrome.storage.local. Everything Flow Trial persists —
// what you connected, what it noticed, and how loud it should be — lives here,
// on the device. Nothing in this file sends anything anywhere.

const FlowStorage = (() => {
  const DEFAULTS = {
    onboarded: false,
    domainId: null,
    connectorId: null,
    // { ts, kind: 'shown'|'clicked'|'written'|'undone'|'dismissed', label, messageId, score, signals, where, url, ref }
    log: [],
    seenMessageIds: [],
    // The only thing that learns. Clicks make Flow slightly more willing to
    // speak; dismissals make it quieter. The user never sees or sets a number.
    calibration: { clicks: 0, dismissals: 0 },
    // Whether the one-time "share with a teammate" prompt in the Activity
    // tab has been dismissed. It earns its place after real usage (see
    // popup.js renderReferral) and, once dismissed, never comes back.
    referralDismissed: false
  };

  function get() {
    return new Promise((resolve) => chrome.storage.local.get(DEFAULTS, resolve));
  }

  function set(patch) {
    return new Promise((resolve) => chrome.storage.local.set(patch, resolve));
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
    await set({ seenMessageIds: [messageId, ...state.seenMessageIds].slice(0, 500) });
  }

  async function wasSeen(messageId) {
    const state = await get();
    return state.seenMessageIds.includes(messageId);
  }

  // Recent behaviour should count for more than something from three months ago,
  // so both counters decay rather than accumulating forever.
  async function calibrate(kind) {
    const state = await get();
    const c = state.calibration || { clicks: 0, dismissals: 0 };
    const next = {
      clicks: Math.min(6, kind === 'click' ? c.clicks + 1 : c.clicks * 0.9),
      dismissals: Math.min(6, kind === 'dismiss' ? c.dismissals + 1 : c.dismissals * 0.9)
    };
    await set({ calibration: next });
    return next;
  }

  return { get, set, appendLog, markSeen, wasSeen, calibrate, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowStorage };
