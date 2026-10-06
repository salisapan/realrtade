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

  return {
    computeClosureRate, computeWeeklyActivity, computeRetention, computeWeeklyHabit, computeSnapshot,
    weekKey, HABIT_MIN_ACTIVE_DAYS, HABIT_MIN_CLOSES, DEFAULT_RETENTION_WEEKS
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowPmfMetrics };
