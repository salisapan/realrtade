// Thin wrapper around chrome.storage.local. Everything Glance persists —
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
    referralDismissed: false,
    // A random per-install identifier — never an email, never tied to a
    // Google/workspace identity. It exists for two things only: telling one
    // install's anonymous usage events apart from another's in aggregate
    // product analytics, and doubling as the referral code in the "copy a
    // link" flow so a share can actually be attributed. Generated once,
    // reused forever; see getInstallId below.
    installId: null
  };

  function get() {
    return new Promise((resolve) => chrome.storage.local.get(DEFAULTS, resolve));
  }

  function set(patch) {
    return new Promise((resolve) => chrome.storage.local.set(patch, resolve));
  }

  // chrome.storage.local has no atomic read-modify-write, and appendLog,
  // markSeen, and calibrate are all read-then-write. Two calls to the SAME
  // one of these — e.g. a debounced scan appending a 'shown' entry for one
  // message while the user's own click on a different, still-visible chip
  // appends a 'clicked' entry — can both read the old array before either
  // writes back, so whichever set() lands second silently overwrites the
  // first caller's change instead of building on it. Serializing each of
  // these three through its own queue means only one call to that function
  // is ever "between" its get() and its set() at a time.
  //
  // A patch to a *different* top-level key (e.g. calibrate's `calibration`
  // vs appendLog's `log`) doesn't need this: chrome.storage.local.set only
  // touches the keys named in its patch, so concurrent writes to different
  // keys never collide — only same-key, same-function concurrency does.
  //
  // This only serializes calls made from within one script's own execution
  // context. It does not protect against two Gmail tabs open at once, each
  // running an independent copy of this file against the same underlying
  // storage — that cross-tab race is real but far narrower (it needs
  // near-simultaneous activity in two tabs) and closing it fully would mean
  // routing every write through the single background service worker
  // instead of writing directly from content scripts, a larger change left
  // for a follow-up.
  function serialize(fn) {
    let queue = Promise.resolve();
    return (...args) => {
      const run = queue.then(() => fn(...args));
      queue = run.catch(() => {}); // one failure must not wedge later calls
      return run;
    };
  }

  const appendLog = serialize(async function appendLog(entry) {
    const state = await get();
    const log = [{ ts: Date.now(), ...entry }, ...state.log].slice(0, 200);
    await set({ log });
    return log;
  });

  const markSeen = serialize(async function markSeen(messageId) {
    const state = await get();
    if (state.seenMessageIds.includes(messageId)) return;
    await set({ seenMessageIds: [messageId, ...state.seenMessageIds].slice(0, 500) });
  });

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

  const calibrate = serialize(async function calibrate(kind) {
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
  });

  const getInstallId = serialize(async function getInstallId() {
    const state = await get();
    if (state.installId) return state.installId;
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 12);
    await set({ installId: id });
    return id;
  });

  return { get, set, appendLog, markSeen, wasSeen, hasTerminalOutcome, calibrate, getInstallId, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowStorage };
