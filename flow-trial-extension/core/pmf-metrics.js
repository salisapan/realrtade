// Turns the durable local counters storage.js already keeps (shownStats,
// writeStats, undoneStats, activeDays, closeStats) into the three product-
// market-fit signals this product actually needs to know whether it's
// working: closure rate, retention, and weekly habit formation.
//
// Every function here is pure — no chrome.*, no clock read internally
// beyond what's passed in — for the same reason every other core/ module
// is: this is exactly the kind of logic a future Flow runtime would need
// unchanged, regardless of what UI or storage backs it (see
// core/README.md's own decision framework for what belongs in this
// directory).
//
// Deliberately does NOT compute anything cross-account. "How many users
// form a weekly habit" is a population question no single account's local
// state can answer on its own — that half is answered by the same
// anonymous, install-id-keyed pipe every other aggregate signal in this
// product already uses (see storage.js's consumeWeeklyHabitTrigger and
// content-gmail.js's own firing of it into flow-landing's track-event
// function). This file only ever computes what's true for THIS account,
// entirely from data that already lives on the device.
const FlowPmfMetrics = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // How many distinct days active in the current calendar week, alongside
  // at least one real closure, counts as "a habit" this week. A single
  // stray open-and-glance shouldn't count, and neither should a week with
  // plenty of activity but nothing ever actually closed — that's
  // Zero-Prompt quietly failing, not a habit worth calling one.
  const HABIT_MIN_ACTIVE_DAYS = 3;
  const HABIT_MIN_CLOSES = 1;
  // How many trailing calendar weeks computeRetention looks back over by
  // default — long enough to show a real pattern, short enough that a
  // brand-new install isn't reported as "mostly inactive" for weeks it
  // couldn't possibly have been active in yet (computeWeeklyActivity still
  // reports every week in the window; it's the caller's job to know how
  // long this account has existed before reading activeWeeks as a rate).
  const DEFAULT_RETENTION_WEEKS = 8;

  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  // "Accepted and not undone," against every intention Glance ever
  // detected — the strict, real-value definition the product-market-fit
  // audit asked for, distinct from closeStats' looser "resolved one way or
  // another" (which also counts a plain dismiss as a "close"). Returns
  // null, not 0, when nothing has ever been detected yet — a 0% rate on
  // zero samples would be a fabricated fact, the exact thing this product
  // refuses to do with a real user's data.
  function computeClosureRate(shownStats, writeStats, undoneStats) {
    const shown = (shownStats && shownStats.total) || 0;
    if (!shown) return null;
    const written = (writeStats && writeStats.total) || 0;
    const undone = (undoneStats && undoneStats.total) || 0;
    return clamp01((written - undone) / shown);
  }

  // A local calendar-week key ('YYYY-Wnn'). Deliberately NOT a true ISO
  // week number (which anchors weeks to the Thursday of each year and has
  // its own leap-week rules) — this only ever needs to group a single
  // account's own activity into consistent, consecutive buckets on that
  // account's own local clock, never to compare against another account's
  // calendar or render a "week 37" badge anywhere.
  function weekKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    // Local calendar day, not elapsed milliseconds. A daylight-saving
    // shift makes (local midnight - 1 Jan local midnight) / 24h a
    // fraction under an integer, and Math.floor then files that day in
    // the previous week. activeDays are stored as local-midnight date
    // strings, so that off-by-one drops a real day out of the habit week.
    // Date.UTC on the local Y-M-D is an exact day count in any zone.
    const dayOfYear = Math.round((Date.UTC(year, d.getMonth(), d.getDate()) - Date.UTC(year, 0, 1)) / DAY_MS);
    const week = Math.floor(dayOfYear / 7);
    return year + '-W' + String(week).padStart(2, '0');
  }

  // For each of the last `weeks` calendar weeks (including the current,
  // partial one), was this account active on at least one day? Returned
  // oldest-first, the way a person reads a calendar left to right.
  function computeWeeklyActivity(activeDays, now, weeks) {
    weeks = weeks || DEFAULT_RETENTION_WEEKS;
    const activeWeekKeys = new Set((activeDays || []).map((d) => weekKey(new Date(d))));
    const anchor = new Date(now || Date.now());
    const rows = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const key = weekKey(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i * 7));
      rows.push({ week: key, active: activeWeekKeys.has(key) });
    }
    return rows;
  }

  // True Retention, distilled to the two numbers that actually answer "do
  // people come back": how many of the last N weeks had any real activity
  // at all, and the CURRENT unbroken streak of consecutive active weeks
  // ending now. A habit that's still alive today reads very differently
  // from one that happened once, three weeks ago, and never again — a
  // single "activeWeeks / weeksObserved" ratio would blur those together.
  function computeRetention(activeDays, now, weeks) {
    const rows = computeWeeklyActivity(activeDays, now, weeks);
    const activeWeeks = rows.filter((r) => r.active).length;
    let currentStreakWeeks = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!rows[i].active) break;
      currentStreakWeeks++;
    }
    return { weeksObserved: rows.length, activeWeeks, currentStreakWeeks, weeks: rows };
  }

  // Weekly Habit Formation, for THIS account: has the current calendar
  // week already met the bar (real, spread-out activity AND at least one
  // real closure)? closeStats.recent already carries {id, ts} for every
  // resolved message (dismissed/written/undone all count, matching
  // storage.js's own definition of "closed this week" everywhere else),
  // so this reuses that durable counter rather than re-deriving a second
  // definition of "closed" here.
  function computeWeeklyHabit(activeDays, closeStats, now) {
    const nowMs = now || Date.now();
    const currentWeek = weekKey(new Date(nowMs));
    const activeDaysThisWeek = (activeDays || []).filter((d) => weekKey(new Date(d)) === currentWeek).length;
    const closesThisWeek = ((closeStats && closeStats.recent) || [])
      .filter((c) => c && weekKey(new Date(c.ts)) === currentWeek).length;
    const metThisWeek = activeDaysThisWeek >= HABIT_MIN_ACTIVE_DAYS && closesThisWeek >= HABIT_MIN_CLOSES;
    return { week: currentWeek, activeDaysThisWeek, closesThisWeek, metThisWeek };
  }

  // Everything above, folded into the one snapshot storage.js's
  // getPmfSnapshot() hands back for local review. Every field here is a
  // count, a rate, or a week key — no message content, no sender, nothing
  // that was ever judgment.js's business, matching this file's core/
  // privacy posture exactly.
  function computeSnapshot(state, now) {
    now = now || Date.now();
    return {
      closureRate: computeClosureRate(state.shownStats, state.writeStats, state.undoneStats),
      detectedTotal: (state.shownStats && state.shownStats.total) || 0,
      writtenTotal: (state.writeStats && state.writeStats.total) || 0,
      undoneTotal: (state.undoneStats && state.undoneStats.total) || 0,
      retention: computeRetention(state.activeDays, now, DEFAULT_RETENTION_WEEKS),
      habit: computeWeeklyHabit(state.activeDays, state.closeStats, now)
    };
  }


  // ---- real-user A/B (dormant: CARRY.abLive in config/carry.public.js is off) -----------------------
  // One experiment arm per install, decided on the device from the install id alone, so the same install
  // always lands in the same arm and nothing needs to be stored or sent to decide it. Per-arm numbers are
  // COUNTS only: an event name and a variant, never text, an address, a subject or a name. Nothing here
  // sends anything; a future upload of these counts goes through the same anonymous install-id pipe as
  // the weekly habit, and turning it on is the owner's decision with the privacy page changed in the same commit.
  const EXPERIMENTS = { 'carry-next-move': { arms: ['A', 'B'] }, 'invoice-loop': { arms: ['A', 'B'] } };
  // Each event is one counter. A move's type is part of the name so the fold never needs free text.
  const AB_EVENTS = [
    'loop_stuck',              // a loop reached its fourth chase day with no answer (both arms)
    'move_channel', 'move_colleague', 'move_release',            // B: a move was proposed
    'move_accepted', 'move_dismissed',                           // B: the person's answer to it
    'answered_after_move',     // B: the loop got its real answer after a move was done
    'answered_after_stuck',    // both: the loop got its real answer after it was stuck
    'released',                // both: the person let it go (B by the question, A by hand)
    'reopened_after_release',  // the person reopened a loop they released: the early-release signal
    'open_at_day_90',          // both: still open 90 days after it opened
    // invoice-loop (CARRY.invoices): B opens a loop from a sent invoice; both count the payment signals that closed one.
    'invoice_sent',            // both: a sent message read as an invoice (B opens a loop, A only counts it)
    'invoice_loop_opened',     // B: the loop was offered and the person kept it
    'invoice_paid_signal',     // both: the client's paid reply, a bank or processor email, or the same in a chat
    'invoice_released'         // the person let an invoice loop go
  ];
  function fnv(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  // 'A' | 'B' | null. null when the switch is off, the experiment is unknown, or there is no install id:
  // the caller then behaves exactly as today (arm A) and counts nothing.
  function assignVariant(installId, experiment, opts) {
    if (!opts || opts.enabled !== true) return null;
    const ex = EXPERIMENTS[experiment];
    const id = typeof installId === 'string' ? installId.trim() : '';
    if (!ex || id.length < 8) return null;
    return ex.arms[fnv(experiment + ':' + id) % ex.arms.length];
  }
  // Pure fold: returns a new state; an unknown experiment, arm or event changes nothing.
  // state: { [experiment]: { A: { loop_stuck: n, ... }, B: {...} } }
  function foldAbEvent(state, experiment, variant, event) {
    const ex = EXPERIMENTS[experiment];
    if (!ex || ex.arms.indexOf(variant) < 0 || AB_EVENTS.indexOf(event) < 0) return state || {};
    const next = Object.assign({}, state || {});
    const exState = Object.assign({}, next[experiment] || {});
    const arm = Object.assign({}, exState[variant] || {});
    arm[event] = (arm[event] || 0) + 1;
    exState[variant] = arm;
    next[experiment] = exState;
    return next;
  }
  // Per-arm rates with their n. A rate on zero is null, never 0.
  function abSnapshot(state, experiment) {
    const ex = EXPERIMENTS[experiment];
    if (!ex) return null;
    const exState = (state && state[experiment]) || {};
    const rate = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
    const out = {};
    ex.arms.forEach((v) => {
      const c = exState[v] || {};
      const g = (k) => c[k] || 0;
      const proposed = g('move_channel') + g('move_colleague') + g('move_release');
      out[v] = {
        stuck: g('loop_stuck'),
        answeredAfterStuck: rate(g('answered_after_stuck'), g('loop_stuck')),
        released: rate(g('released'), g('loop_stuck')),
        openAtDay90: rate(g('open_at_day_90'), g('loop_stuck')),
        earlyRelease: rate(g('reopened_after_release'), g('released')),
        movesProposed: proposed,
        moveAccepted: rate(g('move_accepted'), proposed),
        answeredAfterMove: rate(g('answered_after_move'), g('move_accepted')),
        counts: Object.assign({}, c)
      };
    });
    return out;
  }

  return {
    computeClosureRate, computeWeeklyActivity, computeRetention, computeWeeklyHabit, computeSnapshot,
    weekKey, HABIT_MIN_ACTIVE_DAYS, HABIT_MIN_CLOSES, DEFAULT_RETENTION_WEEKS,
    assignVariant, foldAbEvent, abSnapshot, AB_EVENTS, EXPERIMENTS
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowPmfMetrics };
