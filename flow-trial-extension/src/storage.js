// Thin wrapper around chrome.storage.local. Everything Glance persists —
// what you connected, what it noticed, and how loud it should be — lives here,
// on the device. Nothing in this file sends anything anywhere.

const FlowStorage = (() => {
  const DEFAULTS = {
    onboarded: false,
    domainId: null,
    connectorId: null,
    // Set once content-gmail.js's automatic Google connect (see
    // ensureGoogleAutoConnect there) has actually shown the interactive
    // account chooser and the account either declined it or it failed for a
    // real reason — never set for the "Google isn't configured on this
    // build yet" case, which fails instantly with no UI shown at all and is
    // safe (and meant) to retry silently on the next actionable email. This
    // flag exists purely to stop a declined/failed real prompt from
    // reopening on every subsequent email, which would be exactly the kind
    // of nagging the automatic flow exists to avoid.
    autoConnectAttempted: false,
    // { ts, kind: 'shown'|'clicked'|'written'|'undone'|'dismissed', label, messageId, score, signals, where, url, ref }
    // A 'shown' entry additionally carries { process, threadUrl, sender,
    // subject, intent } — a full, DOM-free snapshot of what was proposed —
    // so the Morning Brief (below) can re-run Do It / Dismiss on a message
    // that isn't open in Gmail anymore, using the exact same process/action
    // machinery as the live chip. Every other kind stays exactly as before.
    log: [],
    seenMessageIds: [],
    // The last calendar day (local time, via Date#toDateString) the Morning
    // Brief auto-opened itself. Never touched on a day with nothing pending
    // — see consumeDailyBriefTrigger below — so the first day something
    // really is open still gets a real auto-open, not a silently-burned turn.
    briefLastShownDate: null,
    // The last calendar day this install told the anonymous, aggregate-only
    // usage pipe it was active — see consumeDailyActiveTrigger below and
    // content-gmail.js's trackDailyActive(). This is the entire "is anyone
    // still using this" signal: no content, no per-message detail, just one
    // fired-once-a-day event per install id.
    activeLastTrackedDate: null,
    // The only thing that learns. Clicks make Flow slightly more willing to
    // speak; dismissals make it quieter. The user never sees or sets a number.
    calibration: { clicks: 0, dismissals: 0, ts: 0 },
    // Same shape as `calibration`, one bucket per FlowIntent type ('decision',
    // 'followup', 'request', 'event', 'commitment') — see calibrate() below
    // and core/judgment.js's applyTypeAdjustment(). The account-wide
    // `calibration` above answers "should Flow be louder or quieter
    // overall"; this answers the finer question the precision/harm audit
    // asked for: "is THIS kind of decision one this account actually wants
    // surfaced." A type this account keeps dismissing (or, worse, undoing
    // after execution) gets a quieter bar than the account-wide baseline,
    // without ever touching the baseline other types still rely on.
    calibrationByType: {},
    // Whether the one-time "share with a teammate" prompt in the Activity
    // tab has been dismissed. It earns its place after real usage (see
    // popup.js renderReferral) and, once dismissed, never comes back.
    referralDismissed: false,
    // Which Execution Memory insight cards ("Glance noticed you usually
    // remove X in Y — keep it that way?") the popup has already shown and
    // gotten an answer to, keyed "processId:stepKind". Once a combo is in
    // here it never resurfaces — confirming or rejecting are both a real
    // answer, not a snooze. See popup.js's renderMemoryInsight/
    // wireMemoryInsight and FlowExecutionMemory.recordPin.
    memoryInsightsSeen: [],
    // Which process ids have already had a one-time, silent precision
    // self-tune applied (see content-gmail.js's checkPrecisionSelfTune) —
    // a process type this account has whole-dismissed repeatedly and never
    // once closed gets its intent type(s) nudged quieter automatically, no
    // chip, no popup, nothing rendered. Fires at most once per process id,
    // ever, so a slow account doesn't get progressively quieter forever.
    precisionAutoTuned: [],
    // Every messageId the user has actually closed — written, dismissed, or
    // undone. This exists because `log` above is a CAPPED DISPLAY FEED and a
    // decision is not a display concern: a single Do It can append up to five
    // 'written' rows, so ~40 multi-step closes push the oldest entries out of
    // the 200-entry window entirely. Before this set existed, that eviction
    // silently un-resolved the message — hasTerminalOutcome went back to
    // false, the chip re-injected on an email already written to Google
    // Tasks, and clicking Do It wrote it a SECOND time. A duplicate write is
    // the one failure this product cannot absorb; "no date beats a wrong one"
    // applies with even more force to a record it already created. Ids only,
    // so the cap buys roughly an order of magnitude more history than the
    // same bytes of log would.
    resolvedMessageIds: [],
    // The write counters the Activity tab shows, kept here rather than
    // recomputed from `log` for the same reason: derived from a capped feed,
    // a number labelled "all-time" GOES DOWN as the log churns. `total` is
    // monotonic and counts distinct messages with at least one successful
    // write; `recent` holds one {id, ts} per distinct message so the
    // "this week" figure stays right even for someone closing more in a week
    // than the raw log can hold.
    writeStats: { total: 0, recent: [] },
    // The Weekly Closing Summary's "X closed" half, kept exactly like
    // writeStats above and for the same reason: recomputing "closed this
    // week" from the capped `log` alone undercounts anyone who closes more
    // in a week than the log can hold, and would even go DOWN as old rows
    // evict. Bumped in appendLog at the exact moment a messageId first
    // becomes resolved (dismissed, written, or undone all count — the
    // process's fate is settled either way), never a second time for the
    // same message. See closeCountsFrom below.
    closeStats: { total: 0, recent: [] },
    // PMF measurement (see core/pmf-metrics.js and getPmfSnapshot below) —
    // shownStats is the closure-rate denominator (distinct intentions ever
    // detected), undoneStats is its "but not undone" numerator correction.
    // Same durable-counter shape as writeStats/closeStats, for the same
    // reason: a capped log alone would undercount a heavy account and let
    // the rate drift as old rows evict.
    shownStats: { total: 0, recent: [] },
    undoneStats: { total: 0, recent: [] },
    // One local calendar-day string (Date#toDateString, matching every
    // other daily flag in this file) per day this install was ever active
    // in a watched tab — the actual history retention/habit measurement
    // needs, as opposed to activeLastTrackedDate above, which only ever
    // remembers the SINGLE most recent day and answers a different
    // question (today's once-a-day gate). Capped generously (ACTIVE_DAYS_CAP
    // below) — comfortably past the longest window any PMF metric here
    // looks back over.
    activeDays: [],
    // The most recent ISO week ('YYYY-Www', local time) this install's
    // weekly-habit crossing was reported to the anonymous, aggregate
    // pipe — see consumeWeeklyHabitTrigger below. Ensures the
    // weekly_habit_formed event fires at most once per calendar week per
    // install, the same "at most once" discipline every other anonymous
    // signal in this file already follows.
    lastHabitReportedWeek: null,
    // When the Weekly Closing Summary last actually rendered (ms epoch, not
    // a date string — this one needs to measure a 7-day gap, not just "not
    // today yet"). 0 means never shown. See consumeWeeklySummaryTrigger.
    weeklySummaryLastShownTs: 0,
    // The ms timestamp of the last time a Glance-watched tab called init() —
    // i.e. "the user was last here." Its only job is measuring the GAP
    // before it gets overwritten, which is what lets
    // consumeWeeklySummaryTrigger tell "it's been a normal few hours" apart
    // from "this person hasn't opened Gmail in five days and just came
    // back" — activeLastTrackedDate above is a date STRING, precise only to
    // the day, which is enough for its own once-a-day analytics gate but not
    // for measuring a multi-day inactivity gap in milliseconds.
    lastActiveTs: 0,
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

  const TERMINAL_KINDS = new Set(['dismissed', 'written', 'undone']);

  // How many entries the Activity feed keeps. Unchanged — this is a display
  // window, and the popup only ever renders 40 rows out of it anyway.
  const LOG_CAP = 200;
  // How many STILL-OPEN 'shown' entries may be carried past that window. The
  // Morning Brief's only record that a process exists is its 'shown' entry,
  // so plain oldest-first eviction quietly deleted open work from a panel
  // whose own headline is "This is waiting to be closed." Carrying them is
  // bounded (never more than LOG_CAP + OPEN_CARRY_CAP rows total) and costs
  // the Activity tab nothing, since it filters 'shown' out.
  const OPEN_CARRY_CAP = 60;
  const RESOLVED_CAP = 1000;
  const WRITE_RECENT_CAP = 300;
  // ~4 months of daily entries — comfortably past the longest lookback any
  // PMF metric in core/pmf-metrics.js actually uses (4 weeks), so trimming
  // never affects a real calculation; it only bounds long-lived installs.
  const ACTIVE_DAYS_CAP = 120;

  // Trims to the newest LOG_CAP entries, then puts back the still-open
  // 'shown' entries that just fell off the end. An entry is skipped if the
  // user already closed it, or if a newer entry inside the window already
  // speaks for that message.
  function trimLog(log, resolved) {
    if (log.length <= LOG_CAP) return log;
    const head = log.slice(0, LOG_CAP);
    const spokenFor = new Set(head.map((e) => e.messageId).filter(Boolean));
    const carried = [];
    for (const e of log.slice(LOG_CAP)) {
      if (carried.length >= OPEN_CARRY_CAP) break; // oldest open work is what gets sacrificed
      if (e.kind !== 'shown' || !e.process || !e.messageId) continue;
      if (resolved.has(e.messageId) || spokenFor.has(e.messageId)) continue;
      spokenFor.add(e.messageId);
      carried.push(e);
    }
    return head.concat(carried);
  }

  // The single place the durable derived state above is maintained, so it can
  // never drift from the log it is derived from: one read, one write, inside
  // the same serialized queue that already protects `log`.
  const appendLog = serialize(async function appendLog(entry) {
    const state = await get();
    const row = { ts: Date.now(), ...entry };
    const patch = {};

    const resolved = new Set(state.resolvedMessageIds || []);
    if (row.messageId && TERMINAL_KINDS.has(row.kind) && !resolved.has(row.messageId)) {
      resolved.add(row.messageId);
      patch.resolvedMessageIds = [row.messageId, ...(state.resolvedMessageIds || [])].slice(0, RESOLVED_CAP);
      // The one moment a process's fate is settled for good, whichever of
      // the three terminal kinds got it there — exactly the definition the
      // Weekly Closing Summary means by "closed." Piggybacking on this
      // branch (rather than a second dedup check) means it can never fire
      // more than once for the same message, for free.
      const cs = state.closeStats || { total: 0, recent: [] };
      patch.closeStats = {
        total: (cs.total || 0) + 1,
        recent: [{ id: row.messageId, ts: row.ts }, ...(cs.recent || [])].slice(0, WRITE_RECENT_CAP)
      };
    }

    // Distinct messages, not rows: one Do It can append five 'written' rows
    // for the same message and must count once — the same rule the Activity
    // tab's own counter has always used, just made durable.
    if (row.kind === 'written' && row.messageId) {
      const ws = state.writeStats || { total: 0, recent: [] };
      const recent = ws.recent || [];
      if (!recent.some((w) => w && w.id === row.messageId)) {
        patch.writeStats = {
          total: (ws.total || 0) + 1,
          recent: [{ id: row.messageId, ts: row.ts }, ...recent].slice(0, WRITE_RECENT_CAP)
        };
      }
    }

    // shownStats: the PMF closure-rate denominator — "how many distinct
    // intentions did Glance ever actually detect," same durable-counter
    // shape and same distinct-message dedup rule as writeStats above. Only
    // a 'shown' entry that carries a real process snapshot counts — the
    // same gate trimLog (above) already uses to decide what's worth
    // carrying past the log's own cap, so this can never disagree with
    // what getPending() considers a real detected process.
    if (row.kind === 'shown' && row.process && row.messageId) {
      const ss = state.shownStats || { total: 0, recent: [] };
      const recent = ss.recent || [];
      if (!recent.some((w) => w && w.id === row.messageId)) {
        patch.shownStats = {
          total: (ss.total || 0) + 1,
          recent: [{ id: row.messageId, ts: row.ts }, ...recent].slice(0, WRITE_RECENT_CAP)
        };
      }
    }

    // undoneStats: the PMF closure-rate's "but not undone" half. A message
    // can only ever be undone after it was written, so this durably counts
    // distinct messages whose write was later reversed — see
    // core/pmf-metrics.js's computeClosureRate for how this and writeStats
    // combine into "accepted and not undone."
    if (row.kind === 'undone' && row.messageId) {
      const us = state.undoneStats || { total: 0, recent: [] };
      const recent = us.recent || [];
      if (!recent.some((w) => w && w.id === row.messageId)) {
        patch.undoneStats = {
          total: (us.total || 0) + 1,
          recent: [{ id: row.messageId, ts: row.ts }, ...recent].slice(0, WRITE_RECENT_CAP)
        };
      }
    }

    patch.log = trimLog([row, ...state.log], resolved);
    await set(patch);
    return patch.log;
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

  // Same shape as markSeen — a small append-once set, capped generously
  // since there are only ever a handful of (processId, stepKind) combos in
  // the whole catalog to begin with.
  const markMemoryInsightSeen = serialize(async function markMemoryInsightSeen(key) {
    const state = await get();
    if (state.memoryInsightsSeen.includes(key)) return;
    await set({ memoryInsightsSeen: [key, ...state.memoryInsightsSeen].slice(0, 100) });
  });

  // Same append-once shape as markMemoryInsightSeen, for the same reason:
  // the catalog only ever has a handful of process ids, so a generous cap
  // costs nothing and this only ever needs to remember "already tuned."
  const markPrecisionAutoTuned = serialize(async function markPrecisionAutoTuned(processId) {
    const state = await get();
    if (state.precisionAutoTuned.includes(processId)) return;
    await set({ precisionAutoTuned: [processId, ...state.precisionAutoTuned].slice(0, 100) });
  });

  async function wasPrecisionAutoTuned(processId) {
    const state = await get();
    return state.precisionAutoTuned.includes(processId);
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
  async function hasTerminalOutcome(messageId) {
    const state = await get();
    // The durable set first — it outlives log eviction, which is the whole
    // point of it. The log scan behind it is the migration path for installs
    // that recorded decisions before resolvedMessageIds existed.
    if ((state.resolvedMessageIds || []).includes(messageId)) return true;
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

  // 'undo' is a stronger negative signal than a pre-execution 'dismiss' —
  // the user only found out they didn't want it after Flow actually acted,
  // which is a costlier mistake than a click that never happened. Weighted
  // as two dismissals rather than a separate counter so it moves the same
  // clicks/dismissals math thresholdFrom already reads, instead of teaching
  // that function a third input.
  const CALIBRATE_WEIGHTS = {
    click: { clicks: 1, dismissals: 0 },
    dismiss: { clicks: 0, dismissals: 1 },
    undo: { clicks: 0, dismissals: 2 }
  };

  // Decays both counters by elapsed time, then applies `kind`'s weight and
  // re-caps at 6 — the exact math calibrate() below always used for the
  // account-wide `calibration` object, factored out so calibrationByType can
  // apply the identical decay/cap rule to each of its own per-type buckets
  // without a second, potentially drifting copy of this formula.
  function bumpCalibration(c, kind, now) {
    c = c || { clicks: 0, dismissals: 0, ts: 0 };
    const decay = c.ts ? Math.pow(0.5, Math.max(0, now - c.ts) / HALF_LIFE_MS) : 1;
    const w = CALIBRATE_WEIGHTS[kind] || { clicks: 0, dismissals: 0 };
    return {
      clicks: Math.min(6, (c.clicks || 0) * decay + w.clicks),
      dismissals: Math.min(6, (c.dismissals || 0) * decay + w.dismissals),
      ts: now
    };
  }

  // `type`, when given, is one of FlowIntent.TYPES — the classified intent
  // this click/dismiss/undo actually belonged to. Bumping the account-wide
  // `calibration` and the per-type `calibrationByType[type]` bucket together
  // means an account with no type-specific history yet behaves exactly as
  // before (judgment.js's applyTypeAdjustment is a no-op with no bucket),
  // and every call site keeps working even before it's updated to pass one.
  const calibrate = serialize(async function calibrate(kind, type) {
    const state = await get();
    const now = Date.now();
    const next = bumpCalibration(state.calibration, kind, now);
    const patch = { calibration: next };
    if (type) {
      const byType = Object.assign({}, state.calibrationByType);
      byType[type] = bumpCalibration(byType[type], kind, now);
      patch.calibrationByType = byType;
    }
    await set(patch);
    return next;
  });

  // The Morning Brief's entire data source: every process that was shown and
  // has no terminal outcome yet, oldest-still-open first. Deliberately not a
  // second, separately-tracked store — a message is "still open" by the same
  // definition hasTerminalOutcome already uses (its most recent log entry
  // isn't dismissed/written/undone), computed in bulk instead of one message
  // at a time. This means resolving a message the ordinary way (the live
  // chip's own Do It or dismiss, from any tab) automatically drops it from
  // the next getPending() call with nothing extra to keep in sync — the log
  // is the only thing stored, exactly like Execution Memory's own event log.
  // The core logic, taking an already-fetched state so callers that already
  // hold one (consumeWeeklySummaryTrigger, below) don't pay for a second
  // chrome.storage.local round trip inside their own serialized transaction.
  function getPendingFrom(state) {
    const resolved = new Set(state.resolvedMessageIds || []);
    const listed = new Set();
    const open = [];
    // Newest first (how the log is stored). Only a TERMINAL entry closes a
    // message. Taking the first entry of any kind used to close it too, which
    // meant a Do It whose writes all FAILED — a 'clicked' row with no
    // 'written' after it — dropped the process out of the Brief even though
    // nothing had been written and hasTerminalOutcome still said it was open.
    // The two functions claimed to share one definition of "still open" and
    // did not. Non-terminal rows are now simply passed over.
    for (const entry of state.log) {
      if (!entry.messageId || resolved.has(entry.messageId)) continue;
      if (TERMINAL_KINDS.has(entry.kind)) { resolved.add(entry.messageId); continue; }
      if (entry.kind !== 'shown' || !entry.process) continue;
      if (listed.has(entry.messageId)) continue;
      listed.add(entry.messageId);
      open.push(entry);
    }
    return open.reverse(); // oldest-still-open first
  }

  async function getPending() {
    return getPendingFrom(await get());
  }

  // The one definition of "how many separate decisions has this person
  // actually closed." It lived in the popup as an ad-hoc log filter, got
  // fixed once (count distinct MESSAGES, not rows — one Do It on a
  // three-step process appends three 'written' rows) and left unfixed in the
  // second caller right below it, whose own gate then fired after a single
  // click. Two callers deriving the same number two ways is how that happens,
  // so there is now one, next to the data it reads.
  //
  // writeStats is authoritative; the log is folded in only so an install that
  // wrote things before writeStats existed doesn't watch its total reset to
  // zero on upgrade. Neither number may ever go down.
  function writeCountsFrom(state) {
    const ws = (state && state.writeStats) || { total: 0, recent: [] };
    const log = (state && state.log) || [];
    const legacy = new Set(log.filter((e) => e.kind === 'written' && e.messageId).map((e) => e.messageId));

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = new Set((ws.recent || []).filter((w) => w && w.ts >= weekAgo).map((w) => w.id));
    for (const e of log) {
      if (e.kind === 'written' && e.messageId && e.ts >= weekAgo) week.add(e.messageId);
    }

    return { total: Math.max(ws.total || 0, legacy.size), week: week.size };
  }

  async function getWriteCounts() {
    return writeCountsFrom(await get());
  }

  // The Weekly Closing Summary's "closed" number — same shape and same
  // never-goes-down/legacy-log-fallback guarantees as writeCountsFrom right
  // above, just over closeStats/TERMINAL_KINDS instead of writeStats/
  // 'written'. Kept as a genuinely separate function rather than a filtered
  // call into writeCountsFrom: "closed" and "written" are different claims
  // (a dismiss closes a process without ever writing anything), and folding
  // them into one function with a mode flag is how two callers quietly start
  // disagreeing about which one they meant.
  function closeCountsFrom(state) {
    const cs = (state && state.closeStats) || { total: 0, recent: [] };
    const log = (state && state.log) || [];
    const legacy = new Set(log.filter((e) => TERMINAL_KINDS.has(e.kind) && e.messageId).map((e) => e.messageId));

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = new Set((cs.recent || []).filter((w) => w && w.ts >= weekAgo).map((w) => w.id));
    for (const e of log) {
      if (TERMINAL_KINDS.has(e.kind) && e.messageId && e.ts >= weekAgo) week.add(e.messageId);
    }

    return { total: Math.max(cs.total || 0, legacy.size), week: week.size };
  }

  async function getCloseCounts() {
    return closeCountsFrom(await get());
  }

  // Product-market-fit visibility, computed entirely on-device from the
  // durable counters above: closure rate, retention, and this week's habit
  // status. See core/pmf-metrics.js for the actual math — this is just the
  // one place that reads current state and hands it the shape it needs.
  // Callable directly from a background-page console for local review
  // ("chrome.storage.local" plus a calculator, made honest) — deliberately
  // not surfaced in any UI, per this product's own no-heavy-dashboard rule.
  async function getPmfSnapshot() {
    return FlowPmfMetrics.computeSnapshot(await get());
  }

  // Shared by every "at most once per calendar day (local time)" flag this
  // file keeps — the Morning Brief's auto-open and the anonymous daily-active
  // ping both need exactly this, just against a different stored date key.
  // Each caller wraps its own call in serialize() itself (below) so two
  // near-simultaneous callers racing the SAME flag (two Gmail tabs) can't
  // both read "not consumed today yet" before either writes back — but the
  // two flags are different top-level keys, so they never contend with each
  // other (see this file's own note on serialize()).
  async function consumeDailyTrigger(key) {
    const state = await get();
    const today = new Date().toDateString();
    if (state[key] === today) return false;
    await set({ [key]: today });
    return true;
  }

  const consumeDailyBriefTrigger = serialize(() => consumeDailyTrigger('briefLastShownDate'));

  // The one anonymous, aggregate signal for "is anyone still using this" —
  // fired at most once per install per day, carrying nothing but the fact
  // that Glance was active in a Gmail tab. See content-gmail.js's
  // trackDailyActive() for where this actually turns into an event.
  //
  // Also the ONLY place activeDays (this file's actual local retention
  // history — see core/pmf-metrics.js) gets appended to, for the same
  // "at most once per calendar day" reason: consumeDailyTrigger already
  // proved this is a genuinely new day before this function runs, so
  // there's no separate dedup to get wrong.
  const consumeDailyActiveTrigger = serialize(async function consumeDailyActiveTrigger() {
    const isNewDay = await consumeDailyTrigger('activeLastTrackedDate');
    if (!isNewDay) return false;
    const state = await get();
    const today = new Date().toDateString();
    if (!(state.activeDays || []).includes(today)) {
      await set({ activeDays: [today, ...(state.activeDays || [])].slice(0, ACTIVE_DAYS_CAP) });
    }
    return true;
  });

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  // "A normal gap between two Gmail visits" vs "this person went quiet and
  // just came back" — three days with nothing from this install is well
  // past a weekend, so a return after this long is treated the same as the
  // weekly cadence itself: worth one honest summary, not a notification.
  const INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000;
  // Never fire twice from two near-simultaneous init() calls (e.g. two Gmail
  // tabs opened together) even if both cadence checks below would otherwise
  // pass — a floor under the whole function, independent of the weekly and
  // inactivity conditions it gates.
  const MIN_GAP_MS = 24 * 60 * 60 * 1000;

  // Weekly Closing Summary's entire trigger policy in one place: fires at
  // most once a day regardless, and then only on a real weekly cadence OR a
  // return from several days of inactivity — never both counted as two
  // reasons, never neither. Returns null (render nothing) whenever it isn't
  // due, OR when it IS due but there is nothing to say — "0 closed, 0 open"
  // is exactly the silence Zero-Prompt asks for, not a summary that says
  // zero twice. serialize()d for the same reason appendLog/markSeen/
  // calibrate are: two near-simultaneous callers must not both read
  // "not shown recently" before either writes back weeklySummaryLastShownTs.
  const consumeWeeklySummaryTrigger = serialize(async function consumeWeeklySummaryTrigger() {
    const state = await get();
    const now = Date.now();
    const lastShown = state.weeklySummaryLastShownTs || 0;
    const lastActive = state.lastActiveTs || 0;
    const gapSinceActive = lastActive ? now - lastActive : 0;
    // Recorded unconditionally, whether or not a summary ends up showing —
    // "the user was just here" is true regardless, and this is the only
    // place that fact gets stamped.
    await set({ lastActiveTs: now });

    if (now - lastShown < MIN_GAP_MS) return null;
    const weeklyDue = now - lastShown >= WEEK_MS;
    const returningDue = gapSinceActive >= INACTIVITY_MS;
    if (!weeklyDue && !returningDue) return null;

    const closed = closeCountsFrom(state).week;
    const open = getPendingFrom(state).length;
    if (!closed && !open) return null; // nothing to close, nothing waiting — stay silent

    await set({ weeklySummaryLastShownTs: now });
    return { closed, open };
  });

  // The one anonymous, aggregate signal for "did this account form a real
  // weekly habit" — fires at most once per calendar week, and only the
  // first time THIS week crosses core/pmf-metrics.js's bar (real, spread-
  // out activity plus at least one real closure), never once per check.
  // Mirrors consumeDailyActiveTrigger's own shape one level up: a local,
  // on-device computation (FlowPmfMetrics.computeWeeklyHabit) decides
  // whether it's true; this function only decides whether it's NEW.
  const consumeWeeklyHabitTrigger = serialize(async function consumeWeeklyHabitTrigger() {
    const state = await get();
    const habit = FlowPmfMetrics.computeWeeklyHabit(state.activeDays, state.closeStats, Date.now());
    if (!habit.metThisWeek || state.lastHabitReportedWeek === habit.week) return false;
    await set({ lastHabitReportedWeek: habit.week });
    return true;
  });

  // Two independent contexts used to each generate their own installId the
  // first time THEY happened to need one — this file (called from the
  // popup's referral link) and background.js's own copy (used internally
  // for analytics, and the far more frequent first-mover in practice, since
  // it fires on the very first tracked event). Two generators writing the
  // same chrome.storage.local key is duplicated state by definition: if
  // both ever ran for the very first time close together, whichever wrote
  // second would silently overwrite the other's id, and a shared referral
  // link would stop matching the id analytics attributes events to.
  //
  // background.js's service worker is the one long-lived instance this
  // extension has, so it's the natural single source of truth — this
  // function now asks it first via message and only falls back to
  // generating locally if that fails (no listener yet, or running
  // somewhere — a test sandbox — with no background page at all), which
  // also happens to be exactly backward-compatible with every install that
  // already has an id: get() below still returns instantly for those,
  // since it's checked before either code path runs.
  const getInstallId = serialize(async function getInstallId() {
    const state = await get();
    if (state.installId) return state.installId;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'flow:get-install-id' }, (res) => {
          if (chrome.runtime.lastError || !res || !res.id) reject(chrome.runtime.lastError || new Error('no install id in response'));
          else resolve(res);
        });
      });
      await set({ installId: response.id });
      return response.id;
    } catch (e) {
      // No background page reachable — fall through to local generation so
      // this function still always resolves to a usable id.
    }

    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 12);
    await set({ installId: id });
    return id;
  });

  return { get, set, writeCountsFrom, getWriteCounts, closeCountsFrom, getCloseCounts, appendLog, markSeen, wasSeen, hasTerminalOutcome, getPending, getPendingFrom, consumeDailyBriefTrigger, consumeDailyActiveTrigger, consumeWeeklySummaryTrigger, consumeWeeklyHabitTrigger, markMemoryInsightSeen, markPrecisionAutoTuned, wasPrecisionAutoTuned, calibrate, getInstallId, getPmfSnapshot, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowStorage };
