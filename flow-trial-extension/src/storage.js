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
    // The empirical, real-usage answer to a question this product used to
    // only be able to answer by hand-writing more test sentences: of every
    // message the local pass (core/intent.js + core/judgment.js — free,
    // instant, on-device) ever looked at, how many did it resolve on its
    // own, how many did the one remote AI fallback attempt then rescue, and
    // how many stayed fully unresolved either way. See
    // core/classification-metrics.js and getClassificationSnapshot below.
    // Same durable-counter shape and same distinct-messageId dedup rule as
    // shownStats/writeStats above, for the same reason — a capped log alone
    // would undercount a heavy account and let the rate drift as old rows
    // evict. Deliberately counts and rates only, never message text, sender,
    // or subject — this file's privacy posture applies here exactly as
    // everywhere else.
    classificationStats: { localFired: 0, localMissed: 0, aiFired: 0, aiMissed: 0, recent: [] },
    // Personal-close quality for this account only: full-write success,
    // day-level return, and dismiss-or-undo false-Do-It. The shape and the
    // rules live in core/close-quality-metrics.js; this is just the
    // chrome.storage.local copy. Counts, message ids, and a calendar-day
    // string — never message text. See docs/close-quality-metrics.md.
    closeQuality: {
      success: 0,
      return: 0,
      falseDoIt: 0,
      lastDoItDay: null,
      successIds: [],
      falseDoItIds: [],
      recent: []
    },
    // Trusted closes per week, and silence decisions by reason code.
    // Counts and ids only — see core/quiet-metrics.js and
    // docs/quiet-metrics.md. No message text.
    quietMetrics: {
      weeks: {},
      handled: [],
      silenceIds: [],
      silenceWeeks: {},
      silenceTotal: {}
    },
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
    installId: null,
    // Inbox rows Glance classified locally and has not yet opened as a
    // thread. Compact snapshots only (no body). The morning list merges
    // these with unresolved 'shown' entries — see getStillOpen. Capped.
    stillOpenScan: [],
    // shown / Do It / undo / false-close for the morning list. Same local
    // posture as closeQuality. Null until the first event.
    stillOpenMetrics: null,
    // "Waiting on": things the account asked someone else for and has not
    // had answered (core/follow-up.js owns the shape). Each is a compact
    // record — the asking sentence, who, when to chase — never the message.
    // Local to this device, capped, oldest settled records dropped first.
    followWatches: [],
    // Meetings Glance put on the Calendar, kept so the day after they can be
    // debriefed ("what came out of it?"). { id, title, dateIso, threadUrl, done }.
    // Title and date only, never the message. Capped.
    meetings: [],
    // core/recurrence.js: when you opened loops with the same person for the
    // same kind of thing, as dates only. Local, capped, never the message text.
    loopHistory: {},
    // Predictions already shown or accepted: { key: 'YYYY-MM-DD' }.
    recurrenceAck: {},
    // core/intent-model.js on-device adaptation: small sparse nudges to what the
    // model believes, learned from what this person confirms or turns down.
    // Feature indexes and numbers only, never any text. Capped.
    intentAdapt: { act: {}, topic: {}, action: {} },
    // core/learning-ledger.js: one plain sentence per time the engine moved because of this person. Capped; local.
    learningLedger: [],
    // core/style-profile.js: counts of how this person opens and closes a note. No text, no names. Local.
    styleProfile: null,
    // core/local-lm.js: the result of the on-device language model's self-test on THIS device (counts and flags only).
    localLm: null,
    // core/ai-ladder.js: what was already asked of the server (hashes of masked sentences, never a sentence) and counts of how it went. Local.
    aiLadder: { cache: [], stats: null },
    // core/local-lm-server.js: a model the person runs on THEIR computer (Ollama, LM Studio). Off until they turn it on AND it passes the self-test. Loopback addresses only.
    localLmServer: { enabled: false, provider: 'ollama', baseUrl: '', model: '', status: null },
    // core/identity-graph.js: which names, addresses and numbers are the same person across apps. No message text. Local, capped.
    identityGraph: null,
    // core/resolution.js: payments seen in bank/processor mail (amount, currency, day: numbers only, never text; capped, expire) and who issues the person's receipts (an address they typed).
    paymentsSeen: [],
    issuers: {},
    // src/outlook.js: the Microsoft sign-in (kept only on this device), the last check, and what waits for an answer. Never message text beyond the loop's own sentence.
    outlookAuth: null,
    outlookSync: {},
    // A suggested save is recorded here and not drawn. suggestDismissals is
    // the store API for Not now and Undo. No button writes it in 0.9.38.
    suggestLog: [],
    suggestDismissals: {},
    // src/content-outlook.js writes this directly. The panel's Why not shown
    // list reads it through get(); a key absent from DEFAULTS never arrives.
    outlookPageDiag: [],
    outlookPending: { offers: [], asks: [], incoming: [] },
    outlookMigrateVersion: 0,
    // core/active-question.js: the one question waiting for an answer, plus the rationing counters. Local.
    activeQuestion: { pending: null, asked: [], skips: 0, pausedUntil: null, answered: 0 },
    // core/recognition-stats.js: how many decisions our own code made versus left
    // unresolved. Counts only, never any text.
    recognitionStats: { localHit: 0, localSilence: 0, residual: 0, remote: 0, byTier: {}, since: null },
    // Keys of messages already counted, so a re-render or a page reload does not
    // count one message twice. Opaque ids only, capped.
    recognitionSeen: [],
    // core/outcome-labels.js: how many labels the product earned from what happened next (counts
    // and opaque keys only, never text), so the same moment is not counted twice.
    outcomeLabels: { missedAsk: 0, missedPromise: 0, confirmedAsk: 0, confirmedPromise: 0, autoClosed: 0, reopened: 0, seen: [] }
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

  // A written row is a close only after the read-back. Same rule as
  // still-open.js todoProofRow. Anything else is still the loop.
  const VERIFY_MS = 60 * 1000;

  function writeFetched(entry) {
    if (!entry) return null;
    if (entry.fetchedBack === true || (entry.proof && entry.proof.fetchedBack === true)) return true;
    if (entry.fetchedBack === false || (entry.proof && entry.proof.fetchedBack === false)) return false;
    return null;
  }

  // 'proved' is final. 'verifying' is the short window with no answer yet.
  // 'open' is a failed read-back, a missing answer that has timed out, or a
  // row with no timestamp to measure.
  function writeGate(entry, now) {
    const got = writeFetched(entry);
    if (got === true) return 'proved';
    if (got === false) return 'open';
    const ts = entry && entry.ts;
    const t = now == null ? Date.now() : now;
    if (ts && (t - ts) < VERIFY_MS) return 'verifying';
    return 'open';
  }

  function countsAsClosedRow(entry) {
    if (!entry || !entry.messageId) return false;
    if (entry.kind === 'dismissed' || entry.kind === 'undone') return true;
    return entry.kind === 'written' && writeFetched(entry) === true;
  }

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
    // A draft-only Outlook undo (outlookReopen) is not a trusted close: the ask
    // must be eligible again for the popup Still Open list AND the in-page card.
    // Clear any durable resolve from the prior write; do not count a close.
    const reopenUndone = isReopenUndone(row);
    const provedWrite = row.kind === 'written' && writeFetched(row) === true;
    if (reopenUndone && row.messageId) {
      if (resolved.has(row.messageId)) {
        patch.resolvedMessageIds = (state.resolvedMessageIds || []).filter((id) => id !== row.messageId);
      }
    } else if (row.messageId && (row.kind === 'dismissed' || provedWrite) && !resolved.has(row.messageId)) {
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
  // What should actually stay gone is a proved close or a dismissal. A
  // 'written' row is that close only when fetchedBack is true. Until the
  // read-back answers, the page says Verifying…. A failed or timed-out
  // read-back is open again, with one Do It. The log is prepended (newest
  // first), so the first matching entry for a messageId is its most recent
  // outcome. A message that only ever logged 'shown' has no recorded user
  // decision, so it's safe — and correct — to judge and show again after
  // Gmail rebuilds its node.
  // Undo returns the loop to open. A dismissed chip stays closed. An older
  // UNDONE row is the same reopen: close memory must not keep the Do It hidden.
  function isReopenUndone(entry) {
    return !!(entry && entry.kind === 'undone');
  }

  // 'proved' | 'verifying' | 'open'. Newest log row for this message wins.
  // An id left in resolvedMessageIds still means proved when the log no
  // longer has a row (a dismissal or a proved write that rolled off).
  function verifyGateFrom(state, messageId, now) {
    if (!messageId) return 'open';
    const log = (state && state.log) || [];
    for (const entry of log) {
      if (!entry || entry.messageId !== messageId) continue;
      if (isReopenUndone(entry)) return 'open';
      if (entry.kind === 'dismissed') return 'proved';
      if (entry.kind === 'written') return writeGate(entry, now);
      return 'open';
    }
    if (((state && state.resolvedMessageIds) || []).includes(messageId)) return 'proved';
    return 'open';
  }

  // Pure over a fetched state so corpora and content scripts share one definition
  // with getPendingFrom (popup still-open) and hasTerminalOutcome (page card).
  function hasTerminalOutcomeFrom(state, messageId, now) {
    return verifyGateFrom(state, messageId, now) === 'proved';
  }

  async function hasTerminalOutcome(messageId) {
    return hasTerminalOutcomeFrom(await get(), messageId);
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
  function getPendingFrom(state, now) {
    const resolved = new Set((state && state.resolvedMessageIds) || []);
    const listed = new Set();
    const open = [];
    // Newest first (how the log is stored). A proved write or a dismissal
    // closes a message. A written row without fetchedBack does not: while
    // the read-back is still in the window the ask stays off this list
    // (the page says Verifying…), and a failed or timed-out read-back
    // lists the shown row again. An id already sitting in
    // resolvedMessageIds must not hide that row.
    // Taking the first entry of any kind used to close it too, which meant
    // a Do It whose writes all FAILED — a 'clicked' row with no 'written'
    // after it — dropped the process out of the Brief even though nothing
    // had been written and hasTerminalOutcome still said it was open.
    const reopened = new Set();
    const unproved = new Set();
    const verifying = new Set();
    const t = now == null ? Date.now() : now;
    for (const entry of (state && state.log) || []) {
      if (!entry || !entry.messageId) continue;
      // Newest row wins. An undone row reopens even when an older write left
      // the id in resolvedMessageIds.
      if (isReopenUndone(entry)) {
        reopened.add(entry.messageId);
        continue;
      }
      if (reopened.has(entry.messageId)) {
        if (entry.kind === 'written' || entry.kind === 'dismissed') continue;
      } else if (entry.kind === 'written') {
        const gate = writeGate(entry, t);
        if (gate === 'proved') { resolved.add(entry.messageId); continue; }
        if (gate === 'verifying') { verifying.add(entry.messageId); continue; }
        unproved.add(entry.messageId);
        continue;
      } else if (entry.kind === 'dismissed') {
        resolved.add(entry.messageId);
        continue;
      }
      if (verifying.has(entry.messageId)) continue;
      if (!reopened.has(entry.messageId) && !unproved.has(entry.messageId) && resolved.has(entry.messageId)) continue;
      if (entry.kind !== 'shown' || !entry.process) continue;
      if (listed.has(entry.messageId)) continue;
      listed.add(entry.messageId);
      open.push(entry);
    }
    return open.reverse(); // oldest-still-open first
  }

  async function getPending(now) {
    return getPendingFrom(await get(), now);
  }

  // A decision already recorded under a different id for the same matter
  // (the inbox scan's scan:<threadId> id, once the real message is open).
  // Adds the id to the resolved set only — it does not count another close.
  const markAlreadyClosed = serialize(async function markAlreadyClosed(messageId) {
    if (!messageId) return;
    const state = await get();
    if ((state.resolvedMessageIds || []).indexOf(messageId) !== -1) return;
    await set({
      resolvedMessageIds: [messageId, ...(state.resolvedMessageIds || [])].slice(0, RESOLVED_CAP)
    });
  });

  // How many inbox-row snapshots the morning scan keeps. Older than this
  // fall off; a thread the user actually opened is remembered via the log
  // instead, and forgetStillOpenScan drops the row copy at that moment.
  const STILL_OPEN_SCAN_CAP = 40;

  // Unresolved chip snapshots plus local inbox-scan snapshots, deduped.
  // A shown entry wins over a scan row for the same message or thread —
  // the chip saw the full text. Resolved messages are already gone from
  // getPending; scan rows are filtered here because they are not log entries.
  function candidatesFromState(state, now) {
    const resolved = new Set((state && state.resolvedMessageIds) || []);
    const reopenedIds = new Set();
    const verifyingIds = new Set();
    const unprovedIds = new Set();
    const t = now == null ? Date.now() : now;
    for (const entry of (state && state.log) || []) {
      if (!entry || !entry.messageId || reopenedIds.has(entry.messageId)) continue;
      if (isReopenUndone(entry)) { reopenedIds.add(entry.messageId); continue; }
      if (verifyingIds.has(entry.messageId) || unprovedIds.has(entry.messageId) || resolved.has('seen:' + entry.messageId)) continue;
      if (entry.kind === 'dismissed') {
        resolved.add(entry.messageId);
        resolved.add('seen:' + entry.messageId);
      } else if (entry.kind === 'written') {
        const gate = writeGate(entry, t);
        if (gate === 'proved') {
          resolved.add(entry.messageId);
          resolved.add('seen:' + entry.messageId);
        } else if (gate === 'verifying') verifyingIds.add(entry.messageId);
        else unprovedIds.add(entry.messageId);
      }
    }
    const pending = getPendingFrom(state, now).map((entry) => FlowStillOpen.fromLogEntry(entry));
    const seenMsg = new Set(pending.map((c) => c.messageId).filter(Boolean));
    const seenKey = new Set(pending.map((c) => FlowStillOpen.promiseKey(c)).filter(Boolean));
    const scan = [];
    for (const raw of (state && state.stillOpenScan) || []) {
      const c = FlowStillOpen.fromLogEntry(raw);
      if (!c.messageId || verifyingIds.has(c.messageId)) continue;
      if (resolved.has(c.messageId) && !reopenedIds.has(c.messageId) && !unprovedIds.has(c.messageId)) continue;
      if (seenMsg.has(c.messageId)) continue;
      const key = FlowStillOpen.promiseKey(c);
      if (key && seenKey.has(key)) continue;
      seenMsg.add(c.messageId);
      if (key) seenKey.add(key);
      scan.push(c);
    }
    return pending.concat(scan);
  }

  // The morning list. Cap, ranking, and silence live in core/still-open.js.
  // When that module is not loaded this returns nothing — an unfiltered
  // backlog is not a stand-in for Still Open.
  async function getStillOpen(now) {
    if (typeof FlowStillOpen === 'undefined') return [];
    const state = await get();
    return FlowStillOpen.select(candidatesFromState(state, now), now || Date.now(), state.log);
  }

  // Weekly summary's "still open" count. Hosts that have not loaded
  // still-open.js keep the older unresolved-shown count so a test sandbox
  // can exercise the trigger without the morning filter. The extension
  // always loads the module, and then this number matches the Brief.
  function stillOpenCountFrom(state, now) {
    if (typeof FlowStillOpen === 'undefined') return getPendingFrom(state, now).length;
    return FlowStillOpen.select(candidatesFromState(state, now), now || Date.now(), state && state.log).length;
  }

  const upsertStillOpenScan = serialize(async function upsertStillOpenScan(candidate) {
    if (!candidate || !candidate.messageId || !candidate.process) return;
    const state = await get();
    const candKey = (typeof FlowStillOpen.promiseKey === 'function') ? FlowStillOpen.promiseKey(candidate) : '';
    const scan = (state.stillOpenScan || []).filter((row) => {
      if (!row) return false;
      if (row.messageId === candidate.messageId) return false;
      if (candKey && FlowStillOpen.promiseKey(row) === candKey) return false;
      return true;
    });
    scan.unshift(candidate);
    await set({ stillOpenScan: scan.slice(0, STILL_OPEN_SCAN_CAP) });
  });

  const forgetStillOpenScan = serialize(async function forgetStillOpenScan(threadId, messageId) {
    if (!threadId && !messageId) return;
    const state = await get();
    const prev = state.stillOpenScan || [];
    const scan = prev.filter((row) => {
      if (!row) return false;
      if (messageId && row.messageId === messageId) return false;
      if (threadId && row.threadId === threadId) return false;
      return true;
    });
    if (scan.length !== prev.length) await set({ stillOpenScan: scan });
  });

  const recordStillOpenMetric = serialize(async function recordStillOpenMetric(event) {
    if (typeof FlowStillOpen === 'undefined') return null;
    const state = await get();
    const applied = FlowStillOpen.applyMetric(state.stillOpenMetrics, event || {});
    if (!applied.changed) return applied.recorded;
    await set({ stillOpenMetrics: applied.state });
    return applied.recorded;
  });

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
  // above, just over closeStats and a proved write, a dismissal, or an undo,
  // instead of writeStats/'written'. Kept as a genuinely separate function rather than a filtered
  // call into writeCountsFrom: "closed" and "written" are different claims
  // (a dismiss closes a process without ever writing anything), and folding
  // them into one function with a mode flag is how two callers quietly start
  // disagreeing about which one they meant.
  function closeCountsFrom(state) {
    const cs = (state && state.closeStats) || { total: 0, recent: [] };
    const log = (state && state.log) || [];
    const legacy = new Set(log.filter(countsAsClosedRow).map((e) => e.messageId));

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = new Set((cs.recent || []).filter((w) => w && w.ts >= weekAgo).map((w) => w.id));
    for (const e of log) {
      if (countsAsClosedRow(e) && e.ts >= weekAgo) week.add(e.messageId);
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

  // `outcome` is one of 'local' (the free local pass resolved a real type on
  // its own), 'ai' (the local pass gave up but the one remote fallback
  // attempt then found a type), or 'miss' (both passes gave up — nothing
  // ever fired for this message). Same distinct-messageId dedup as
  // shownStats/writeStats above: content-gmail.js's scanReadingPane() can
  // re-run classification on the same still-open, still-chipless message
  // across several debounced DOM mutations, and each of those re-runs must
  // count once toward this account's real miss rate, not once per mutation.
  const recordClassificationOutcome = serialize(async function recordClassificationOutcome(messageId, outcome) {
    if (!messageId || (outcome !== 'local' && outcome !== 'ai' && outcome !== 'miss')) return;
    const state = await get();
    const cs = state.classificationStats || { localFired: 0, localMissed: 0, aiFired: 0, aiMissed: 0, recent: [] };
    const recent = cs.recent || [];
    if (recent.some((r) => r && r.id === messageId)) return; // already counted once, ever
    const next = {
      localFired: cs.localFired || 0,
      localMissed: cs.localMissed || 0,
      aiFired: cs.aiFired || 0,
      aiMissed: cs.aiMissed || 0
    };
    if (outcome === 'local') {
      next.localFired += 1;
    } else {
      // Both 'ai' and 'miss' only ever happen after the local pass already
      // gave up — see content-gmail.js's own recordClassificationOutcome
      // call site for exactly where these three cases are told apart.
      next.localMissed += 1;
      if (outcome === 'ai') next.aiFired += 1;
      else next.aiMissed += 1;
    }
    await set({
      classificationStats: Object.assign({}, next, {
        recent: [{ id: messageId, ts: Date.now() }, ...recent].slice(0, WRITE_RECENT_CAP)
      })
    });
  });

  // The rates core/classification-metrics.js computes from the durable
  // counters above: how much of everything Glance ever looked at the free
  // local pass alone resolved, how much of what it missed the one remote
  // fallback rescued, and the true ground-level miss rate this account is
  // actually experiencing — the real-usage answer this product needed
  // instead of continuing to hand-write more test sentences to guess at it.
  // Same console-only access pattern as getPmfSnapshot above — deliberately
  // not surfaced in any UI.
  async function getClassificationSnapshot() {
    return FlowClassificationMetrics.computeSnapshot((await get()).classificationStats);
  }

  // Records one personal-close event and returns the event that was
  // stored, or null when the call was a duplicate or not one of the three
  // signals (a first Do It, a same-day Do It, a second success for the
  // same message). `event.kind` is 'success' | 'doIt' | 'falseDoIt'.
  // falseDoIt also needs `reason`: 'dismiss' | 'undo'. Day defaults to
  // today's local calendar day — the same Date#toDateString() key the
  // return definition uses. Nothing here leaves the device.
  // One queue for quietMetrics. recordCloseQuality and recordSilence both
  // write that key; two queues would let one set() drop the other's week.
  const writeQuiet = serialize(async function writeQuiet(mutator) {
    if (typeof FlowQuietMetrics === 'undefined') return null;
    const state = await get();
    const current = state.quietMetrics || FlowQuietMetrics.emptyState();
    const next = mutator(current);
    if (JSON.stringify(current) !== JSON.stringify(next)) await set({ quietMetrics: next });
    return next;
  });

  const recordCloseQuality = serialize(async function recordCloseQuality(event) {
    if (!event || (event.kind !== 'success' && event.kind !== 'doIt' && event.kind !== 'falseDoIt')) return null;
    const state = await get();
    const current = state.closeQuality || FlowCloseQuality.emptyState();
    const ts = event.ts || Date.now();
    const applied = FlowCloseQuality.applyEvent(current, {
      kind: event.kind,
      messageId: event.messageId,
      reason: event.reason,
      day: event.day || new Date().toDateString(),
      ts: ts
    });
    if (JSON.stringify(current) !== JSON.stringify(applied.state)) {
      await set({ closeQuality: applied.state });
    }
    // Trusted close: the same full write (Handled.) and the same Undo.
    // A dismiss is a false-Do-It and is not an Undo of a write.
    if (event.kind === 'success') {
      await writeQuiet((s) => FlowQuietMetrics.noteHandled(s, { messageId: event.messageId, ts: ts }));
    } else if (event.kind === 'falseDoIt' && event.reason === 'undo') {
      await writeQuiet((s) => FlowQuietMetrics.noteUndo(s, { messageId: event.messageId }));
    }
    return applied.recorded;
  });

  // One silence decision. reason is a code from FlowQuietMetrics.REASONS.
  // A body, a subject, or an unknown string is not stored.
  const recordSilence = serialize(async function recordSilence(event) {
    if (!event || typeof FlowQuietMetrics === 'undefined') return false;
    const ts = event.ts || Date.now();
    let counted = false;
    await writeQuiet((current) => {
      const next = FlowQuietMetrics.noteSilence(current, {
        messageId: event.messageId,
        reason: event.reason,
        ts: ts
      });
      counted = JSON.stringify(current) !== JSON.stringify(next);
      return next;
    });
    return counted;
  });

  // The three counts plus the recent event list, for the Activity tab and
  // for a background-page console. Same local-only posture as
  // getPmfSnapshot — not an org dashboard and not a network call.
  async function getCloseQualitySnapshot() {
    return FlowCloseQuality.computeSnapshot((await get()).closeQuality);
  }

  // Trusted closes for the current local week, plus silence by reason.
  // Same console-and-Activity posture as getCloseQualitySnapshot.
  async function getQuietSnapshot(now) {
    if (typeof FlowQuietMetrics === 'undefined') return null;
    return FlowQuietMetrics.snapshot((await get()).quietMetrics, now || Date.now());
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
    const open = stillOpenCountFrom(state);
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

  // ---- Waiting on (core/follow-up.js) -----------------------------------------
  const FOLLOW_CAP = 60;

  function trimWatches(list) {
    if (list.length <= FOLLOW_CAP) return list;
    // Keep every active watch; drop the oldest settled ones first.
    const active = list.filter((w) => w && w.status === 'waiting');
    const settled = list.filter((w) => w && w.status !== 'waiting')
      .sort((a, b) => (b.resolvedAt || b.createdAt || 0) - (a.resolvedAt || a.createdAt || 0));
    return active.concat(settled).slice(0, FOLLOW_CAP);
  }

  const upsertWatch = serialize(async function upsertWatch(watch) {
    if (!watch || !watch.id) return null;
    const state = await get();
    const list = (state.followWatches || []).filter((w) => w && w.id !== watch.id);
    list.unshift(watch);
    await set({ followWatches: trimWatches(list) });
    return watch;
  });

  const updateWatch = serialize(async function updateWatch(id, patch) {
    if (!id) return null;
    const state = await get();
    let updated = null;
    const list = (state.followWatches || []).map((w) => {
      if (!w || w.id !== id) return w;
      updated = Object.assign({}, w, patch);
      return updated;
    });
    if (updated) await set({ followWatches: list });
    return updated;
  });

  async function getWatches() {
    const state = await get();
    return (state.followWatches || []).filter(Boolean);
  }

  async function getWatch(id) {
    const list = await getWatches();
    return list.find((w) => w.id === id) || null;
  }

  // ---- meetings to debrief, and loop rhythms ---------------------------------------
  const MEETING_CAP = 20;

  const recordMeeting = serialize(async function recordMeeting(m) {
    if (!m || !m.id || !m.dateIso) return null;
    const state = await get();
    const list = (state.meetings || []).filter((x) => x && x.id !== m.id);
    list.unshift({ id: String(m.id), title: String(m.title || 'Meeting').slice(0, 120), dateIso: m.dateIso, threadUrl: m.threadUrl || null, done: false });
    await set({ meetings: list.slice(0, MEETING_CAP) });
    return list[0];
  });

  const updateMeeting = serialize(async function updateMeeting(id, patch) {
    const state = await get();
    let updated = null;
    const list = (state.meetings || []).map((x) => {
      if (!x || x.id !== id) return x;
      updated = Object.assign({}, x, patch);
      return updated;
    });
    if (updated) await set({ meetings: list });
    return updated;
  });

  async function getMeetings() {
    const state = await get();
    return (state.meetings || []).filter(Boolean);
  }

  // A loop was opened: remember the day, for rhythm detection.
  const recordLoopOpen = serialize(async function recordLoopOpen(watch) {
    const state = await get();
    const next = FlowRecurrence.record(state.loopHistory || {}, watch, Date.now());
    await set({ loopHistory: next });
    return next;
  });

  async function getLoopHistory() {
    const state = await get();
    return { history: state.loopHistory || {}, acked: state.recurrenceAck || {} };
  }

  async function getIntentAdapt() {
    const state = await get();
    return state.intentAdapt || { act: {}, topic: {}, action: {} };
  }
  async function getLedger() {
    const state = await get();
    return Array.isArray(state.learningLedger) ? state.learningLedger : [];
  }
  async function getStyleProfile() {
    const state = await get();
    return state.styleProfile || null;
  }
  // Returns { before, after } summaries so the caller can say when a habit became clear. Counts only.
  const observeStyle = serialize(async function observeStyle(text) {
    if (typeof FlowStyle === 'undefined') return null;
    const state = await get();
    const before = state.styleProfile || null;
    const after = FlowStyle.observe(before, text);
    await set({ styleProfile: after });
    return { before: FlowStyle.summary(before, 'en') || FlowStyle.summary(before, 'he'), after: FlowStyle.summary(after, 'en') || FlowStyle.summary(after, 'he') };
  });
  async function getLocalLm() {
    const state = await get();
    return state.localLm || null;
  }
  const setLocalLm = serialize(async function setLocalLm(r) {
    await set({ localLm: r });
    return true;
  });
  async function getLadder() {
    const state = await get();
    return Object.assign({ cache: [], stats: null }, state.aiLadder || {});
  }
  const setLadder = serialize(async function setLadder(patch) {
    const cur = await getLadder();
    await set({ aiLadder: Object.assign({}, cur, patch || {}) });
    return true;
  });
  async function getLocalLmServer() {
    const state = await get();
    return Object.assign({ enabled: false, provider: 'ollama', baseUrl: '', model: '', status: null }, state.localLmServer || {});
  }
  const setLocalLmServer = serialize(async function setLocalLmServer(cfg) {
    const c = cfg || {};
    await set({ localLmServer: { enabled: Boolean(c.enabled), provider: c.provider === 'lmstudio' ? 'lmstudio' : 'ollama', baseUrl: String(c.baseUrl || ''), model: String(c.model || '').slice(0, 120), status: c.status || null } });
    return true;
  });
  async function getIdentityGraph() {
    const state = await get();
    return state.identityGraph || (typeof FlowIdentity !== 'undefined' ? FlowIdentity.empty() : null);
  }
  // One sighting of a person -> { pid, suggested }. The graph itself is stored; callers only need the key and any new question.
  const observeIdentity = serialize(async function observeIdentity(party) {
    if (typeof FlowIdentity === 'undefined') return null;
    const state = await get();
    const r = FlowIdentity.observe(state.identityGraph, party, Date.now());
    await set({ identityGraph: r.graph });
    return { pid: r.pid, suggested: r.suggested };
  });
  const answerIdentity = serialize(async function answerIdentity(a, b, same) {
    if (typeof FlowIdentity === 'undefined') return false;
    const state = await get();
    await set({ identityGraph: FlowIdentity.answer(state.identityGraph, a, b, Boolean(same)) });
    return true;
  });
  // A payment confirmation was opened: keep the amount and the day, nothing else. Same amount within a day is one sighting.
  const PAYMENTS_SEEN_CAP = 40;
  const recordPaymentSeen = serialize(async function recordPaymentSeen(p) {
    if (!p || typeof p.value !== 'number' || !(p.value > 0)) return false;
    const now = typeof p.at === 'number' ? p.at : Date.now();
    const state = await get();
    const list = (state.paymentsSeen || []).filter((x) => x && now - x.at < 120 * 24 * 3600 * 1000);
    if (list.some((x) => x.value === p.value && (x.currency || null) === (p.currency || null) && Math.abs(now - x.at) < 24 * 3600 * 1000)) return false;
    list.unshift({ value: p.value, currency: p.currency || null, at: now, trusted: p.trusted !== false });
    await set({ paymentsSeen: list.slice(0, PAYMENTS_SEEN_CAP) });
    return true;
  });
  async function getPaymentsSeen() {
    const state = await get();
    return (state.paymentsSeen || []).filter(Boolean);
  }
  async function getIssuer(object) {
    const state = await get();
    return (state.issuers && state.issuers[object]) || null;
  }
  // The address the person typed for "who issues your receipts". Only a plausible address is kept.
  const setIssuer = serialize(async function setIssuer(object, who) {
    const email = String((who && who.email) || '').trim();
    if (!object || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return null;
    const state = await get();
    const issuers = Object.assign({}, state.issuers || {});
    issuers[object] = { email, name: who.name ? String(who.name).slice(0, 80) : null };
    await set({ issuers });
    return issuers[object];
  });
  async function getActiveQuestion() {
    const state = await get();
    return Object.assign({ pending: null, asked: [], skips: 0, pausedUntil: null, answered: 0 }, state.activeQuestion || {});
  }
  const setActiveQuestion = serialize(async function setActiveQuestion(q) {
    await set({ activeQuestion: q });
    return true;
  });
  const appendLedger = serialize(async function appendLedger(entry) {
    if (typeof FlowLedger === 'undefined' || !entry) return false;
    const state = await get();
    await set({ learningLedger: FlowLedger.append(state.learningLedger, entry) });
    return true;
  });
  // "Reset": forget every adjustment and the list that explains them. Counts of outcomes stay (they are metrics).
  const resetLearning = serialize(async function resetLearning() {
    await set({ intentAdapt: { act: {}, topic: {}, action: {} }, learningLedger: [], styleProfile: null, identityGraph: null });
    return true;
  });
  const setIntentAdapt = serialize(async function setIntentAdapt(a) {
    await set({ intentAdapt: { act: (a && a.act) || {}, topic: (a && a.topic) || {}, action: (a && a.action) || {} } });
    return true;
  });

  async function getRecognitionStats() {
    const state = await get();
    return state.recognitionStats || { localHit: 0, localSilence: 0, residual: 0, remote: 0, byTier: {}, since: null };
  }
  // d: { kind: 'localHit'|'localSilence'|'residual'|'remote', tier? }
  const recordRecognition = serialize(async function recordRecognition(d) {
    const state = await get();
    const cur = Object.assign({ localHit: 0, localSilence: 0, residual: 0, remote: 0, byTier: {}, since: null }, state.recognitionStats || {});
    cur.byTier = Object.assign({}, cur.byTier || {});
    if (!d || ['localHit', 'localSilence', 'residual', 'remote'].indexOf(d.kind) < 0) return cur;
    let seen = Array.isArray(state.recognitionSeen) ? state.recognitionSeen.slice() : [];
    if (d.key) {
      if (seen.indexOf(d.key) >= 0) return cur;
      seen.push(d.key);
      if (seen.length > 300) seen = seen.slice(-300);
    }
    cur[d.kind] = (cur[d.kind] || 0) + 1;
    if (d.tier) {
      cur.byTier[d.tier] = (cur.byTier[d.tier] || 0) + 1;
      const keys = Object.keys(cur.byTier);
      if (keys.length > 24) delete cur.byTier[keys[0]];
    }
    if (!cur.since) cur.since = Date.now();
    await set({ recognitionStats: cur, recognitionSeen: seen });
    return cur;
  });

  async function getOutcomeLabels() {
    const state = await get();
    return state.outcomeLabels || { missedAsk: 0, missedPromise: 0, confirmedAsk: 0, confirmedPromise: 0, autoClosed: 0, reopened: 0, seen: [] };
  }
  // Returns true when the label is NEW (so the caller teaches the model exactly once per moment).
  const recordOutcomeLabel = serialize(async function recordOutcomeLabel(kind, key) {
    if (['missedAsk', 'missedPromise', 'confirmedAsk', 'confirmedPromise', 'autoClosed', 'reopened'].indexOf(kind) < 0) return false;
    const state = await get();
    const cur = Object.assign({ missedAsk: 0, missedPromise: 0, confirmedAsk: 0, confirmedPromise: 0, autoClosed: 0, reopened: 0, seen: [] }, state.outcomeLabels || {});
    const id = kind + '|' + key;
    let seen = Array.isArray(cur.seen) ? cur.seen.slice() : [];
    if (key && seen.indexOf(id) >= 0) return false;
    if (key) { seen.push(id); if (seen.length > 300) seen = seen.slice(-300); }
    cur[kind] = (cur[kind] || 0) + 1;
    cur.seen = seen;
    await set({ outcomeLabels: cur });
    return true;
  });

  const ackRecurrence = serialize(async function ackRecurrence(key, nextIso) {
    const state = await get();
    const acked = Object.assign({}, state.recurrenceAck || {}, { [key]: nextIso });
    const keys = Object.keys(acked);
    if (keys.length > 60) delete acked[keys[0]];
    await set({ recurrenceAck: acked });
    return acked;
  });

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


  // Outlook Loops receipts: a prepared draft is shown in place until Undo or dismiss.
  // Written rows are terminal for getPending; these helpers surface the active draft
  // receipt and can reopen the ask after a draft-only undo.
  function getActiveOutlookReceiptsFrom(state) {
    const log = (state && state.log) || [];
    // An older undone (e.g. migrated 0.9.3) must not hide a NEWER draft receipt
    // for the same messageId after a fresh Do It.
    const undoTsByMsg = Object.create(null);
    const undoByRef = Object.create(null);
    for (const e of log) {
      if (!e || e.kind !== 'undone' || !e.messageId) continue;
      const ts = e.ts || 0;
      if (undoTsByMsg[e.messageId] == null || ts >= undoTsByMsg[e.messageId]) undoTsByMsg[e.messageId] = ts;
      if (e.ref) undoByRef[e.messageId + '|' + e.ref] = ts;
    }
    const out = [];
    const seen = new Set();
    const panelReceipt = (typeof FlowDisplay !== 'undefined' && FlowDisplay.isPanelReceipt)
      ? FlowDisplay.isPanelReceipt
      : function (e) { return e && e.kind === 'written' && e.connectorId === 'outlookDraft' && e.messageId && !e.undone && e.outlookReceipt !== false && !e.outlookSent; };
    for (const e of log) {
      if (!panelReceipt(e)) continue;
      const wts = e.ts || 0;
      if (e.ref && undoByRef[e.messageId + '|' + e.ref] != null && undoByRef[e.messageId + '|' + e.ref] >= wts) continue;
      if (undoTsByMsg[e.messageId] != null && undoTsByMsg[e.messageId] >= wts) continue;
      if (seen.has(e.messageId)) continue;
      seen.add(e.messageId);
      out.push(e);
    }
    return out;
  }

  async function getActiveOutlookReceipts() {
    return getActiveOutlookReceiptsFrom(await get());
  }

  // Convert the matching written Outlook draft row into undone in place (no duplicate HANDLED row).
  // Removes messageId from resolvedMessageIds so Check now can surface the ask again.

  // After a fresh Do It on a message that was previously undone, allow the next
  // Undo to increment Still Open undo again (migration may have seeded undoIds).
  const clearStillOpenUndoForMessage = serialize(async function clearStillOpenUndoForMessage(messageId) {
    if (!messageId || typeof FlowStillOpen === 'undefined') return { ok: false };
    const state = await get();
    const so = state.stillOpenMetrics || FlowStillOpen.emptyMetrics();
    const ids = (so.undoIds || []).slice();
    const i = ids.indexOf(messageId);
    if (i === -1) return { ok: true, changed: false };
    ids.splice(i, 1);
    const next = Object.assign({}, so, { undoIds: ids });
    await set({ stillOpenMetrics: next });
    return { ok: true, changed: true };
  });

  const markOutlookDraftUndone = serialize(async function markOutlookDraftUndone(messageId, ref) {
    if (!messageId) return { ok: false };
    const state = await get();
    const log = (state.log || []).slice();
    let hit = false;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || e.kind !== 'written' || e.messageId !== messageId) continue;
      if (e.connectorId && e.connectorId !== 'outlookDraft') continue;
      if (ref && e.ref && e.ref !== ref) continue;
      log[i] = Object.assign({}, e, {
        kind: 'undone',
        label: 'Reply draft removed. Not sent.',
        undone: true,
        outlookReopen: true,
        url: null,
        ref: null
      });
      hit = true;
      break;
    }
    if (!hit) {
      const calendarWritten = log.some((e) => e && e.kind === 'written' && e.messageId === messageId && e.connectorId === 'outlookCalendar');
      if (calendarWritten) return { ok: true, skipped: true };
      log.unshift({ ts: Date.now(), kind: 'undone', label: 'Reply draft removed. Not sent.', messageId, ref: ref || null, app: 'outlook', connectorId: 'outlookDraft', outlookReopen: true });
    }
    const resolved = (state.resolvedMessageIds || []).filter((id) => id !== messageId);
    await set({ log: trimLog(log, new Set(resolved)), resolvedMessageIds: resolved });
    return { ok: true };
  });

  function outlookEventRefMatches(stored, wanted) {
    if (!wanted) return true;
    if (stored === wanted) return true;
    const a = stored && typeof stored === 'object' ? stored.eventId : stored;
    const b = wanted && typeof wanted === 'object' ? wanted.eventId : wanted;
    return Boolean(a) && a === b;
  }

  // Convert the matching written Outlook calendar row into undone in place.
  // A calendar write is not a reply draft. Draft undo must not relabel it.
  const markOutlookCalendarUndone = serialize(async function markOutlookCalendarUndone(messageId, ref) {
    if (!messageId) return { ok: false };
    const state = await get();
    const log = (state.log || []).slice();
    let hit = false;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || e.kind !== 'written' || e.messageId !== messageId) continue;
      if (e.connectorId !== 'outlookCalendar') continue;
      if (!outlookEventRefMatches(e.ref, ref)) continue;
      log[i] = Object.assign({}, e, {
        kind: 'undone',
        label: 'Calendar event removed.',
        undone: true,
        outlookReopen: true,
        url: null,
        ref: null
      });
      hit = true;
      break;
    }
    if (!hit) {
      log.unshift({
        ts: Date.now(),
        kind: 'undone',
        label: 'Calendar event removed.',
        messageId,
        app: 'outlook',
        connectorId: 'outlookCalendar',
        outlookReopen: true
      });
    }
    const resolved = (state.resolvedMessageIds || []).filter((id) => id !== messageId);
    await set({ log: trimLog(log, new Set(resolved)), resolvedMessageIds: resolved });
    return { ok: true };
  });

  // The Activity card is the written row. Appending a second "undone" row
  // left that card saying HANDLED after the task was already deleted.
  // Rewrite the Google Task row in place. Match the message id, the legacy
  // id, the thread id, or the task id — a reload hash is not required.
  const markGoogleTaskUndone = serialize(async function markGoogleTaskUndone(messageId, ref, threadId) {
    const state = await get();
    const log = (state.log || []).slice();
    const ext = (ref && (ref.externalId || ref.taskId)) || '';
    let hit = false;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || e.kind !== 'written') continue;
      const rowExt = e.externalId || (e.ref && (e.ref.externalId || e.ref.taskId)) || '';
      const taskRow = e.connectorId === 'googleTask' || e.connectorId === 'googleTasks' || e.system === 'google/tasks';
      if (!taskRow) continue;
      if (ext && rowExt && rowExt !== ext) continue;
      const idHit = messageId && (e.messageId === messageId || e.legacyMessageId === messageId);
      const extHit = ext && rowExt === ext;
      const threadHit = threadId && e.threadId && e.threadId === threadId && (!ext || !rowExt || rowExt === ext);
      if (!idHit && !extHit && !threadHit) continue;
      log[i] = Object.assign({}, e, {
        kind: 'undone',
        undone: true,
        connectorId: e.connectorId || 'googleTask',
        url: null,
        ref: null,
        where: null
      });
      hit = true;
      break;
    }
    if (!hit && (messageId || ext || threadId)) {
      log.unshift({
        ts: Date.now(),
        kind: 'undone',
        undone: true,
        label: 'Google Task removed.',
        messageId: messageId || null,
        threadId: threadId || null,
        externalId: ext || null,
        app: 'gmail',
        connectorId: 'googleTask'
      });
      hit = true;
    }
    await set({ log: trimLog(log, new Set(state.resolvedMessageIds || [])) });
    return { ok: true, hit: hit };
  });

  // Same as the Google Task row: rewriting in place is what stops Activity
  // from keeping HANDLED after the To Do task is deleted.
  const markMicrosoftTodoUndone = serialize(async function markMicrosoftTodoUndone(messageId, ref, threadId) {
    const state = await get();
    const log = (state.log || []).slice();
    const ext = (ref && (ref.externalId || ref.taskId)) || '';
    let hit = false;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || e.kind !== 'written') continue;
      const rowExt = e.externalId || (e.ref && (e.ref.externalId || e.ref.taskId)) || '';
      const taskRow = e.connectorId === 'outlookTask' || e.connectorId === 'microsoftTodo' || e.system === 'microsoft/todo';
      if (!taskRow) continue;
      if (ext && rowExt && rowExt !== ext) continue;
      const idHit = messageId && (e.messageId === messageId || e.itemId === messageId || e.pathId === messageId || e.outlookIncomingId === messageId);
      const extHit = ext && rowExt === ext;
      const threadHit = threadId && ((e.threadId && e.threadId === threadId) || (e.outlookConversationId && e.outlookConversationId === threadId));
      if (!idHit && !extHit && !threadHit) continue;
      log[i] = Object.assign({}, e, {
        kind: 'undone',
        undone: true,
        outlookReopen: true,
        connectorId: e.connectorId || 'outlookTask',
        url: null,
        ref: null,
        where: null
      });
      hit = true;
      break;
    }
    if (!hit && (messageId || ext || threadId)) {
      log.unshift({
        ts: Date.now(),
        kind: 'undone',
        undone: true,
        outlookReopen: true,
        label: 'To Do task removed.',
        messageId: messageId || null,
        threadId: threadId || null,
        externalId: ext || null,
        app: 'outlook',
        connectorId: 'outlookTask',
        system: 'microsoft/todo'
      });
      hit = true;
    }
    const resolved = (state.resolvedMessageIds || []).filter((id) => !messageId || id !== messageId);
    await set({ log: trimLog(log, new Set(resolved)), resolvedMessageIds: resolved });
    return { ok: true, hit: hit };
  });

  // Same in-place rewrite for the OneDrive file. A second HANDLED row is
  // not how Undo clears the close.
  const markOnedriveFileUndone = serialize(async function markOnedriveFileUndone(messageId, ref, threadId) {
    const state = await get();
    const log = (state.log || []).slice();
    const ext = (ref && (ref.externalId || ref.fileId || ref.itemId)) || '';
    let hit = false;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || e.kind !== 'written') continue;
      const rowExt = e.externalId || (e.ref && (e.ref.externalId || e.ref.fileId || e.ref.itemId)) || '';
      const fileRow = e.connectorId === 'onedriveFile' || e.system === 'microsoft/onedrive';
      if (!fileRow) continue;
      if (ext && rowExt && rowExt !== ext) continue;
      const idHit = messageId && (e.messageId === messageId || e.itemId === messageId || e.pathId === messageId || e.outlookIncomingId === messageId);
      const extHit = ext && rowExt === ext;
      const threadHit = threadId && ((e.threadId && e.threadId === threadId) || (e.outlookConversationId && e.outlookConversationId === threadId));
      if (!idHit && !extHit && !threadHit) continue;
      log[i] = Object.assign({}, e, {
        kind: 'undone',
        undone: true,
        connectorId: e.connectorId || 'onedriveFile',
        url: null,
        ref: null,
        where: null
      });
      hit = true;
      break;
    }
    if (!hit && (messageId || ext || threadId)) {
      log.unshift({
        ts: Date.now(),
        kind: 'undone',
        undone: true,
        label: 'OneDrive file removed.',
        messageId: messageId || null,
        threadId: threadId || null,
        externalId: ext || null,
        app: 'outlook',
        connectorId: 'onedriveFile',
        system: 'microsoft/onedrive'
      });
      hit = true;
    }
    await set({ log: trimLog(log, new Set(state.resolvedMessageIds || [])) });
    return { ok: true, hit: hit };
  });

  // Own-computer close. Rewrite the written row so Activity does not stay
  // HANDLED. The page driver is not called from here.
  const markComputerUndone = serialize(async function markComputerUndone(messageId, ref, threadId) {
    const Proof = typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null;
    if (!Proof || typeof Proof.applyComputerUndo !== 'function') {
      return { ok: false, hit: false, available: false, inverseVerified: false, stayedHandled: true, askSali: false };
    }
    const state = await get();
    const applied = Proof.applyComputerUndo(state.log || [], {
      messageId: messageId || '',
      threadId: threadId || '',
      externalId: (ref && (ref.externalId || ref.taskId)) || ''
    }, ref, null);
    const next = applied && Array.isArray(applied.log) ? applied.log : (state.log || []);
    await set({ log: trimLog(next, new Set(state.resolvedMessageIds || [])) });
    return {
      ok: !!(applied && applied.ok),
      hit: !!(applied && applied.hit),
      available: !!(applied && applied.available),
      inverseVerified: !!(applied && applied.inverseVerified),
      stayedHandled: applied ? applied.stayedHandled === true : true,
      askSali: false
    };
  });

  function migrateMod() {
    if (typeof FlowOutlookStateMigrate !== 'undefined') return FlowOutlookStateMigrate;
    try { return typeof require !== 'undefined' ? require('../core/outlook-state-migrate.js').FlowOutlookStateMigrate : null; }
    catch (e) { return null; }
  }

  // One-shot upgrade from 0.9.3/0.9.4 leftovers: merge HANDLED+UNDONE, scrub false-close.

  // Clears Outlook loop UI state: pending cards, draft receipts, and draft-undo
  // false-close leftovers. Used by "Clear close memory" so the button matches
  // what the person sees in Loops / Activity.
  const clearOutlookLoopsState = serialize(async function clearOutlookLoopsState() {
    const state = await get();
    const log0 = state.log || [];
    const dropIds = new Set();
    const dropRow = (typeof FlowDisplay !== 'undefined' && FlowDisplay.dropOutlookLoopRow)
      ? FlowDisplay.dropOutlookLoopRow
      : function (e) { return e && e.app === 'outlook'; };
    const dropDiag = (typeof FlowDisplay !== 'undefined' && FlowDisplay.dropAlreadyHandledDiag)
      ? FlowDisplay.dropAlreadyHandledDiag
      : function (d) { return d && d.reason === 'page:already-handled'; };
    const log = [];
    for (const e of log0) {
      if (!e) continue;
      if (dropRow(e)) {
        if (e.messageId) dropIds.add(e.messageId);
        if (e.itemId) dropIds.add(e.itemId);
        if (e.pathId) dropIds.add(e.pathId);
        if (e.outlookConversationId) dropIds.add(e.outlookConversationId);
        continue;
      }
      log.push(e);
    }
    // Scrub false-close ids that belonged to dropped outlook drafts.
    let cq = state.closeQuality;
    let so = state.stillOpenMetrics;
    const M = migrateMod();
    if (M && dropIds.size) {
      const scrub = M.scrubFalseClose(cq, so, dropIds);
      cq = scrub.closeQuality || cq;
      so = scrub.stillOpenMetrics || so;
    }
    const resolved = (state.resolvedMessageIds || []).filter((id) => !dropIds.has(id));
    const scan = (state.stillOpenScan || []).filter((row) => {
      if (!row) return false;
      if (row.app === 'outlook') return false;
      if (row.messageId && dropIds.has(row.messageId)) return false;
      return true;
    });
    const pageDiag = (state.outlookPageDiag || []).filter((d) => d && !dropDiag(d));
    const sync = state.outlookSync && typeof state.outlookSync === 'object' ? Object.assign({}, state.outlookSync) : {};
    if (Array.isArray(sync.diagnostics)) sync.diagnostics = sync.diagnostics.filter((d) => d && !dropDiag(d));
    await set({
      log: trimLog(log, new Set(resolved)),
      resolvedMessageIds: resolved,
      outlookPending: { offers: [], asks: [], incoming: [] },
      closeQuality: cq,
      stillOpenMetrics: so,
      stillOpenScan: scan,
      outlookPageDiag: pageDiag,
      outlookSync: sync,
      glanceUndoneBanners: {}
    });
    return { ok: true, dropped: dropIds.size };
  });

  const migrateOutlookDraftState = serialize(async function migrateOutlookDraftState() {
    const M = migrateMod();
    if (!M) return { ok: false, skipped: true };
    const state = await get();
    const r = M.migrate(state);
    if (!r.migrated) return { ok: true, skipped: true };
    await set({
      log: r.state.log,
      resolvedMessageIds: r.state.resolvedMessageIds,
      closeQuality: r.state.closeQuality,
      stillOpenMetrics: r.state.stillOpenMetrics,
      outlookMigrateVersion: r.state.outlookMigrateVersion
    });
    return { ok: true, migrated: true, draftUndoIds: r.draftUndoIds || [] };
  });

  // Draft was sent (no longer a draft): keep closed, drop receipt surface.
  const markOutlookDraftSent = serialize(async function markOutlookDraftSent(messageId, ref) {
    if (!messageId) return { ok: false };
    const state = await get();
    const log = (state.log || []).slice();
    let hit = false;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (!e || e.kind !== 'written' || e.messageId !== messageId) continue;
      if (e.connectorId && e.connectorId !== 'outlookDraft') continue;
      if (ref && e.ref && e.ref !== ref) continue;
      log[i] = Object.assign({}, e, {
        label: 'Reply sent from Outlook.',
        outlookReceipt: false,
        outlookSent: true,
        url: e.url || null
      });
      hit = true;
      break;
    }
    const resolved = state.resolvedMessageIds || [];
    const nextResolved = resolved.indexOf(messageId) === -1
      ? [messageId].concat(resolved).slice(0, RESOLVED_CAP)
      : resolved;
    await set({ log: trimLog(log, new Set(nextResolved)), resolvedMessageIds: nextResolved });
    return { ok: true, hit: hit };
  });

  return { get, set, writeCountsFrom, getWriteCounts, closeCountsFrom, getCloseCounts, appendLog, markSeen, wasSeen, hasTerminalOutcome, hasTerminalOutcomeFrom, verifyGateFrom, VERIFY_MS, isReopenUndone, markAlreadyClosed, getPending, getPendingFrom, getStillOpen, candidatesFromState, upsertStillOpenScan, forgetStillOpenScan, recordStillOpenMetric, getActiveOutlookReceipts, getActiveOutlookReceiptsFrom, markOutlookDraftUndone, markOutlookCalendarUndone, markGoogleTaskUndone, markMicrosoftTodoUndone, markOnedriveFileUndone, markComputerUndone, clearStillOpenUndoForMessage, migrateOutlookDraftState, markOutlookDraftSent, clearOutlookLoopsState, consumeDailyBriefTrigger, consumeDailyActiveTrigger, consumeWeeklySummaryTrigger, consumeWeeklyHabitTrigger, upsertWatch, updateWatch, getWatches, getWatch, recordMeeting, updateMeeting, getMeetings, recordLoopOpen, getLoopHistory, ackRecurrence, getIntentAdapt, setIntentAdapt, getLedger, appendLedger, resetLearning, getStyleProfile, observeStyle, getLocalLm, setLocalLm, getLadder, setLadder, getLocalLmServer, setLocalLmServer, getIdentityGraph, recordPaymentSeen, getPaymentsSeen, getIssuer, setIssuer, observeIdentity, answerIdentity, getActiveQuestion, setActiveQuestion, getRecognitionStats, recordRecognition, getOutcomeLabels, recordOutcomeLabel, markMemoryInsightSeen, markPrecisionAutoTuned, wasPrecisionAutoTuned, calibrate, getInstallId, getPmfSnapshot, recordClassificationOutcome, getClassificationSnapshot, recordCloseQuality, getCloseQualitySnapshot, recordSilence, getQuietSnapshot, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { FlowStorage };
