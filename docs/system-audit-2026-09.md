# System audit — stabilization pass (2026-09)

> Requested as a full, honest audit across every major layer, followed by
> targeted hardening — no new features. This documents what was actually
> found: what's already solid (and why), what was broken and got fixed in
> this pass, and what's a known, accepted limitation rather than an
> oversight. Read alongside `docs/decision-filter.md` (the filter this
> audit was run under) and `flow-trial-extension/core/README.md` (the
> core/src boundary this audit checked for leaks in).

## Method

This was a real re-read of the current code, not a summary of past commit
messages. Two genuine bugs were found and fixed (both below, both with a
new regression test that fails on the pre-fix code and passes on the fix,
per this project's own testing discipline). Everything else in each
section is either confirmed-solid (with the reason it's solid) or an
honestly-labeled known limitation.

---

## 1. Intention detection & classification — solid, one documented gap

`core/judgment.js` (the scorer/threshold) and `core/intent.js` (the
five-way classifier) are heavily tested (`test/judgment-corpus.cjs`,
`test/intent-actions-corpus.cjs`) and precision-biased by design. The
per-intent-type calibration added in the previous pass
(`applyTypeAdjustment`) is real and verified to change actual classify()
output, not just record data (see intent-actions-corpus.cjs's "per-type
calibration nudges the gating threshold" tests).

**Known, accepted gap:** `intent.js`'s `classify()` hardcodes
`domain = FLOW_DOMAINS[0]` regardless of the account's own `domainId`. The
domain picker exists in the popup and is used for connector selection and
analytics labeling, but never actually reaches the classifier. This is a
pre-existing feature gap, not something this pass introduced — flagged
here because "is precision logic actually influencing behavior" is exactly
this audit's question, and the honest answer for the *domain* dimension
(as opposed to the *intent-type* dimension, which does work) is no. Not
fixed here: it touches the same precision-critical scoring path this
entire file exists to keep stable, and isn't a coherence/reliability bug —
it's a scoped feature that was never wired end to end.

## 2. Process engine — solid

`core/actions.js`'s `processFor()`/`planFor()`/`applyMemory()` are a small,
fully-tested, pure mapping from classified intent to a named process with
memory-biased step ordering. `PROCESS_CATALOG` is the single source both
the live chip and the popup's Execution Memory insight card read from —
confirmed no second, hand-copied catalog exists anywhere.

## 3. Execution layer — solid, one real concurrency bug found and fixed

The three live writers (`googleTasksWrite`, `googleCalendarWrite`,
`gmailDraftWrite` in `src/background.js`) already handle 401/403 (treated
as disconnected), 404 recovery (Tasks list recreated if deleted
externally), and undo functions that correctly treat "already gone"
(404/410) as success rather than failure. This layer was already solid
going into this pass.

**Found and fixed:** `background.js`'s own internal `getInstallId()` (used
by `trackEvent()` and the `flow:get-install-id` message handler) did a
plain, unserialized read-then-write of `chrome.storage.local`. Two
messages arriving close together on a fresh install (a `chip_shown`
tracking event and a content script's own first-ever `flow:get-install-id`
request, say) could each read "no id yet" before either wrote back, and
whichever `set()` landed second would silently win — the exact
duplicated-generator race that a *previous* pass fixed **between**
`storage.js` and `background.js`, still present **inside** `background.js`'s
own function. Fixed by caching the in-flight promise itself, so every
concurrent caller during generation awaits the same call instead of racing
a second one. Verified with a new test in `test/badge-corpus.cjs` that
fails (two different ids) on the pre-fix code and passes on the fix.

## 4. Execution Memory — solid, real strategic use confirmed

`core/execution-memory.js`'s per-step accept/remove/undo/pin folding
(`getAll()`) demonstrably changes future step ordering and demotion via
`actions.js`'s `applyMemory()`/`isNetRejected()` — this is not passive
logging, it measurably changes what the next chip proposes. The
process-level `wholeDismissCount` (added last pass) is a genuinely
higher-level pattern beyond simple counts, and it does something: it
drives `checkPrecisionSelfTune()`'s silent threshold nudge. The visible,
one-click "keep this preference?" insight card in the popup is real and
wired to the same `isNetRejected()` predicate the live chip uses, so it
can never disagree with what's actually happening.

**Known, accepted scope limit:** `checkPrecisionSelfTune()` only acts on
the `'log-it'` process id, because it's the only catalog entry whose
resulting intent types (`decision`/`followup`) actually consult a
calibrated threshold — the other three process types
(`schedule`/`schedule-confirm`/`reply-track`/`follow-through`) map to hard
evidentiary gates with no threshold to adjust. A whole-dismiss pattern on
those is real signal that currently has no lever to act on. Not a bug —
extending it would mean changing what those gates evidentially mean, which
is a deliberate, separate decision outside a hardening pass's scope.

## 5. Precision vs. Harm — now a real, ordered pipeline (one correctness bug fixed)

Confirmed end to end: `calibrate('click'|'dismiss'|'undo', type)` writes
both the account-wide and per-type buckets → `applyTypeAdjustment` reads
the per-type bucket and measurably shifts the gating threshold for
`decision`/`followup` messages → `checkPrecisionSelfTune` closes the loop
by silently bumping calibration when a whole-process pattern is severe
enough that waiting for organic accumulation would take too long. This is
a real, living feedback loop, not a static claim — independently verified
per intent type (a `'decision'`-type history has zero effect on
`'followup'`-type messages, confirmed in `intent-actions-corpus.cjs`).

**Found and fixed:** the self-tune's own bookkeeping had an ordering bug.
It previously ran `Promise.all([calibrate('dismiss','decision'),
calibrate('dismiss','followup'), markPrecisionAutoTuned('log-it')])` as one
flat array. Array position does not guarantee resolution order — if either
`calibrate()` call failed while `markPrecisionAutoTuned` still completed,
the account would be permanently marked "already tuned" without the
threshold actually having moved, with no future page load able to retry
it. Fixed by sequencing: both `calibrate()` calls must resolve before
`markPrecisionAutoTuned` runs at all, so a genuine failure here just
retries on the next page load instead of silently and permanently losing
the correction.

**Also hardened:** `onDismiss`'s and `showMultiActionReceipt`'s own
`Promise.all` calls (recording a dismiss to three separate stores; logging
each successful write) previously had no per-call error handling. A
failure in *any one* of them would reject the whole `Promise.all` — for
`showMultiActionReceipt` specifically, that meant a real write that had
**already succeeded** could surface as "Something went wrong. Try again."
to the user, which invites exactly the retry-produces-a-duplicate-write
scenario this product has always treated as unacceptable. Both sites now
catch and log each call independently, so one bookkeeping failure can
never mask, block, or falsely error-out the others. This is a genuinely
narrow risk in practice (`chrome.storage.local` calls in this codebase
essentially never reject; see storage.js's own `get()`/`set()` wrappers),
but the fix is cheap, safe, and directly answers this audit's own request
to make failures "visible and recoverable instead of silent."

**Residual, accepted risk:** if `FlowStorage.appendLog({kind:'written',...})`
genuinely fails after a real write succeeds, `resolvedMessageIds` never
gets that message added, so `hasTerminalOutcome()` would still read it as
open and the chip could re-inject on next scan. The fix above stops the
*false error message*; it does not add a retry-with-backoff for the log
write itself. Given how rarely this path can fail in practice, adding that
would be over-engineering relative to the actual risk — noted here rather
than silently left unmentioned.

## 6. Sticky surfaces — consistent, single source of truth confirmed

Re-verified this pass: the badge, the Morning Brief panel/indicator,
Contextual Resurfacing, the popup's Open tab, and the Weekly Closing
Summary's "open" count all derive from the exact same
`FlowStorage.getPending()` / `hasTerminalOutcome()` definitions in
`storage.js` — there is no second, competing notion of "still open"
anywhere in the codebase. `src/brief.js` and `src/weekly.js` are pure,
stateless renderers driven entirely by data `content-gmail.js` computes;
they cannot drift from each other because neither one computes anything
itself. Weekly Habit Formation's own "closed this week" count
(`core/pmf-metrics.js`'s `computeWeeklyHabit`) deliberately reuses
`closeStats.recent` rather than re-deriving a second definition of
"closed."

No overlap/confusion issue found: each surface answers a different
question (badge = count right now; Brief = the actual list; Resurfacing =
one specific thing tied to the thread you're looking at; Weekly Summary =
a once-a-week retrospective) and none of them render at the same time by
design (Zero-Prompt's "nothing pending is silence" rule, applied
consistently across all four).

## 7. Data layer / state management — coherent, no new drift found

The bulk of this work was the previous two passes (serialized
`appendLog`/`calibrate`/`execution-memory` writes, `hasTerminalOutcome`
guards before every act-on-a-message call, `resolvedMessageIds` as the
durable "already decided" set independent of the capped display log). This
pass re-checked for NEW drift introduced by the PMF counters
(`shownStats`/`undoneStats`) added last time: confirmed they follow the
exact same dedup-by-recent-list pattern as `writeStats`/`closeStats`, are
bumped inside the same serialized `appendLog` transaction, and cannot
double-count a re-injected 'shown' entry (Gmail rebuilding the DOM node)
or a repeated undo on the same message. No new state-management debt
found.

## 8. Core vs. Glance-specific UI — clean, one convention gap closed last pass

Already documented in `core/README.md`'s "Adding a new inbox host"
section from the previous pass: `core/` has zero `chrome.*`/DOM references
by construction, and `src/brief.js`/`src/weekly.js` turned out to already
be 100% host-agnostic. The one real gap found last pass (only `'shown'`
log entries were tagged with a source app) was closed by introducing
`content-gmail.js`'s `SOURCE_APP` constant on every `appendLog` call. This
pass found no further entanglement.

## 9. Measurement / retention

`core/pmf-metrics.js`'s closure rate, retention, and weekly-habit
computations are real, tested, and privacy-preserving (every function
takes plain counters and returns counts/rates/week-keys — no message
content, no per-event identifiers). Re-confirmed this pass that the
underlying counters (`shownStats`, `writeStats`, `undoneStats`,
`activeDays`, `closeStats`) are all durable and immune to the capped
display log's own eviction — a heavy account's PMF numbers won't silently
drift as `log` rolls over. The one cross-account signal
(`weekly_habit_formed`) reuses the already-reviewed anonymous GA4 relay
rather than inventing new infrastructure.

---

## Summary

| Area | Status |
|---|---|
| Intention detection | Solid; one documented, pre-existing, out-of-scope gap (domain picker not wired to classify()) |
| Process engine | Solid |
| Execution layer | Solid; **one concurrency bug found and fixed** (background.js's own getInstallId race) |
| Execution Memory | Solid, demonstrably influences behavior; one documented scope limit (log-it only) |
| Precision vs. Harm | Real, verified feedback loop; **one ordering bug fixed** (self-tune could mark itself done without actually tuning); **silent-failure hardening added** at two sites |
| Sticky surfaces | Consistent, single source of truth confirmed, no overlap found |
| Data layer | Coherent; no new drift from the latest additions |
| Core/Glance separation | Clean; nothing further found this pass |
| Measurement | Real, tested, privacy-preserving; no issues found |

Two genuine bugs fixed, two failure-handling gaps hardened, everything
else confirmed rather than assumed. No new features were added, matching
this pass's own mandate.
