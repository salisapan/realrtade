// Sell-ready local instrumentation for Personal Quiet → Firm Quiet.
// Two numbers, on this device only. No message body, no sender, no subject,
// no new network pipe. Persistence is src/storage.js.
//
// Trusted close. Do It ran, every proposed step wrote, and the receipt
// said Handled. (That is FlowCloseQuality.isFullWrite and
// FlowReceipt.confirmation().full — the same full-write condition.
// "Partly handled." is not one.) The user did not Undo that write.
// A later Undo removes it from the trusted count for the week of the
// write. The week's Undo count sits beside the trusted count so "low"
// is the number itself: Undo 0 is none, a small Undo is low. There is
// no second bar that still counts an undone write as trusted.
//
// Trusted closes / week. How many of those writes have their Handled
// timestamp in the current local week. The week key is the same
// YYYY-Wnn bucket as core/pmf-metrics.js (day-of-year / 7, not ISO).
// Week buckets are counts. The id list exists only so one Undo can
// find the week of that write, capped like the other local id lists.
//
// Silence quality. A decision to stay quiet, counted once per message,
// as a reason code. Not a miss the classifier never named, and not a
// chip the user then dismissed (that is already a false-Do-It).
// Codes: noise, hedge, family, low, google, calibrated, memory, file,
// fact. See docs/quiet-metrics.md.
const FlowQuietMetrics = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ID_CAP = 300;
  const WEEK_CAP = 16;
  const ID_MAX = 128;
  // Order is the Activity line order. Adding a code here is the only
  // way a reason can be stored — anything else is dropped.
  const REASONS = ['noise', 'hedge', 'family', 'low', 'google', 'calibrated', 'memory', 'file', 'fact'];

  function emptyCounts() {
    const byReason = {};
    for (let i = 0; i < REASONS.length; i++) byReason[REASONS[i]] = 0;
    return byReason;
  }

  function emptyState() {
    return {
      weeks: {},
      handled: [],
      silenceIds: [],
      silenceWeeks: {},
      silenceTotal: emptyCounts()
    };
  }

  // Same bucket as FlowPmfMetrics.weekKey. Local calendar, not ISO.
  function weekKey(date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((d - start) / DAY_MS);
    const week = Math.floor(dayOfYear / 7);
    return d.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function cleanId(id) {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    if (!trimmed || trimmed.length > ID_MAX || /\s/.test(trimmed)) return null;
    return trimmed;
  }

  function clone(state) {
    state = state || {};
    const weeks = {};
    const srcWeeks = state.weeks || {};
    const weekNames = Object.keys(srcWeeks);
    for (let i = 0; i < weekNames.length; i++) {
      const name = weekNames[i];
      const row = srcWeeks[name] || {};
      weeks[name] = { handled: row.handled || 0, undone: row.undone || 0 };
    }
    const silenceWeeks = {};
    const srcSilence = state.silenceWeeks || {};
    const silenceNames = Object.keys(srcSilence);
    for (let i = 0; i < silenceNames.length; i++) {
      silenceWeeks[silenceNames[i]] = Object.assign(emptyCounts(), srcSilence[silenceNames[i]]);
    }
    return {
      weeks: weeks,
      handled: (state.handled || []).map((h) => ({ id: h.id, week: h.week, undone: !!h.undone })),
      silenceIds: (state.silenceIds || []).slice(),
      silenceWeeks: silenceWeeks,
      silenceTotal: Object.assign(emptyCounts(), state.silenceTotal)
    };
  }

  function trimWeeks(map) {
    const names = Object.keys(map).sort();
    while (names.length > WEEK_CAP) {
      const oldest = names.shift();
      delete map[oldest];
    }
  }

  function noteHandled(state, event) {
    event = event || {};
    const id = cleanId(event.messageId);
    const base = state || emptyState();
    if (!id || !Number.isFinite(event.ts)) return base;
    const prior = base.handled || [];
    for (let i = 0; i < prior.length; i++) {
      if (prior[i].id === id) return base;
    }
    const next = clone(base);
    const week = weekKey(new Date(event.ts));
    next.handled = [{ id: id, week: week, undone: false }, ...next.handled].slice(0, ID_CAP);
    if (!next.weeks[week]) next.weeks[week] = { handled: 0, undone: 0 };
    next.weeks[week].handled += 1;
    trimWeeks(next.weeks);
    return next;
  }

  // Undo of a Handled write. An Undo of a partial, or of a message we
  // never counted, changes nothing — it was never a trusted close.
  function noteUndo(state, event) {
    event = event || {};
    const id = cleanId(event.messageId);
    const base = state || emptyState();
    if (!id) return base;
    const prior = base.handled || [];
    let found = false;
    for (let i = 0; i < prior.length; i++) {
      if (prior[i].id === id && !prior[i].undone) found = true;
    }
    if (!found) return base;
    const next = clone(base);
    for (let i = 0; i < next.handled.length; i++) {
      if (next.handled[i].id !== id) continue;
      next.handled[i].undone = true;
      if (next.weeks[next.handled[i].week]) next.weeks[next.handled[i].week].undone += 1;
      break;
    }
    return next;
  }

  function noteSilence(state, event) {
    event = event || {};
    const id = cleanId(event.messageId);
    const base = state || emptyState();
    if (!id || REASONS.indexOf(event.reason) === -1 || !Number.isFinite(event.ts)) return base;
    if ((base.silenceIds || []).indexOf(id) !== -1) return base;
    const next = clone(base);
    next.silenceIds = [id, ...next.silenceIds].slice(0, ID_CAP);
    next.silenceTotal[event.reason] += 1;
    const week = weekKey(new Date(event.ts));
    if (!next.silenceWeeks[week]) next.silenceWeeks[week] = emptyCounts();
    next.silenceWeeks[week][event.reason] += 1;
    trimWeeks(next.silenceWeeks);
    return next;
  }

  // Null when this classification would show a chip. A named silence
  // code otherwise. Does not decide silence — the caller already did.
  function reasonFor(intent) {
    if (!intent || (intent.type && intent.confidence !== 'low')) return null;
    if (intent.quiet && REASONS.indexOf(intent.quiet) !== -1) return intent.quiet;
    if (intent.googleSilence) return 'google';
    if (intent.type && intent.confidence === 'low') return 'low';
    return null;
  }

  function trustedWeek(state, now) {
    const week = weekKey(new Date(now || Date.now()));
    const bucket = (state && state.weeks && state.weeks[week]) || { handled: 0, undone: 0 };
    const handled = bucket.handled || 0;
    const undone = bucket.undone || 0;
    return {
      week: week,
      trusted: Math.max(0, handled - undone),
      handled: handled,
      undone: undone,
      undoRate: handled ? undone / handled : null
    };
  }

  function silenceSlice(state, week) {
    const counts = Object.assign(emptyCounts(), state && state.silenceWeeks && state.silenceWeeks[week]);
    let total = 0;
    for (let i = 0; i < REASONS.length; i++) total += counts[REASONS[i]] || 0;
    return { week: week, total: total, byReason: counts };
  }

  function silenceAll(state) {
    const counts = Object.assign(emptyCounts(), state && state.silenceTotal);
    let total = 0;
    for (let i = 0; i < REASONS.length; i++) total += counts[REASONS[i]] || 0;
    return { total: total, byReason: counts };
  }

  function snapshot(state, now) {
    const trusted = trustedWeek(state, now);
    return {
      trusted: trusted,
      silenceWeek: silenceSlice(state, trusted.week),
      silenceAll: silenceAll(state)
    };
  }

  function reasonBits(byReason) {
    const bits = [];
    for (let i = 0; i < REASONS.length; i++) {
      const n = byReason[REASONS[i]] || 0;
      if (n) bits.push(REASONS[i] + ' ' + n);
    }
    return bits;
  }

  // Blank when nothing has been counted. A line of zeros would announce
  // a measurement this install has not made.
  function activityLine(snapshot) {
    snapshot = snapshot || {};
    const parts = [];
    const trusted = snapshot.trusted;
    if (trusted && trusted.handled) {
      parts.push('Trusted closes ' + trusted.trusted + ' this week · Undo ' + trusted.undone);
    }
    const weekSilence = snapshot.silenceWeek;
    const allSilence = snapshot.silenceAll;
    const weekTotal = weekSilence && weekSilence.total;
    const chosen = weekTotal ? weekSilence : allSilence;
    if (chosen && chosen.total) {
      const label = weekTotal ? 'Silence this week ' : 'Silence ';
      parts.push(label + chosen.total + ' · ' + reasonBits(chosen.byReason).join(' · '));
    }
    return parts.join(' · ');
  }

  return {
    emptyState, weekKey, noteHandled, noteUndo, noteSilence, reasonFor,
    trustedWeek, snapshot, activityLine, REASONS, ID_CAP, WEEK_CAP
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowQuietMetrics };
