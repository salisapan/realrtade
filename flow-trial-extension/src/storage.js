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
    calibration: { clicks: 0, dismissals: 0, ts: 0 },
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

  // "Seen" alone isn't enough to decide whether to (re)inject a chip. Gmail
  // tears down and rebuilds div[role="listitem"] nodes constantly — expanding
  // a thread, switching labels, coming back to a tab — which destroys
  // whatever was injected into them. A message marked seen was previously
  // unrecoverable even though nothing about it had actually been resolved:
  // the chip was gone and no rescan would ever bring it back.
  //
  // What should actually stay gone is a message the user took a final action
  // on. The log is prepended (newest first), so the first matching entry for
  // a messageId is its most recent outcome; only 'dismissed', 'written', and
  // 'undone' are terminal. A message that only ever logged 'shown' has no
  // recorded user decision, so it's safe — and correct — to judge and show
  // again after Gmail rebuilds its node.
  const TERMINAL_KINDS = new Set(['dismissed', 'written', 'undone']);

  async function hasTerminalOutcome(messageId) {
    const state = await get();
    const entry = state.log.find((e) => e.messageId === messageId);
    return !!entry && TERMINAL_KINDS.has(entry.kind);
  }

  // Recent behaviour should count for more than something from three months ago,
  // so both counters decay rather than accumulating forever.
  //
  // Decay is applied against elapsed time before the new event is counted, not
  // just against the opposite event. Decaying dismissals only on a click made
  // silence self-reinforcing: enough dismissals raised the threshold past what
  // any email could score, so no chip appeared, so no click could ever arrive to
  // decay it back. FlowJudgment.thresholdFrom applies the same half-life when it
  // reads this, and folding it in here keeps the stored value from drifting.
  const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

  async function calibrate(kind) {
    const state = await get();
    const c = state.calibration || { clicks: 0, dismissals: 0, ts: 0 };
    const now = Date.now();
    const decay = c.ts ? Math.pow(0.5, Math.max(0, now - c.ts) / HALF_LIFE_MS) : 1;
    const clicks = (c.clicks || 0) * decay;
    const dismissals = (c.dismissals || 0) * decay;
    const next = {
      clicks: Math.min(6, kind === 'click' ? clicks + 1 : clicks),
      dismissals: Math.min(6, kind === 'dismiss' ? dismissals + 1 : dismissals),
      ts: now
    };
    await set({ calibration: next });
    return next;
  }

  return { get, set, appendLog, markSeen, wasSeen, hasTerminalOutcome, calibrate, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowStorage };
