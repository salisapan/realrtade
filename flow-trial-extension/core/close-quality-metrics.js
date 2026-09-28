// Personal-close quality for THIS account, on this device. Three events,
// and nothing else — no message text, no sender, no cloud pipe.
//
// success — a Trusted Do It close that fully wrote. Every step the chip
// proposed came back ok (isFullWrite: succeededCount === proposedStepCount
// and proposedStepCount > 0). That is the same full-write condition
// content-gmail.js's closedSummary already calls isFullClose before it
// will use the catalog's closedLine. On current main the receipt lead
// line also says "Handled." (or the early-close "that's handled" line)
// when only SOME steps wrote. This metric does not count those partials.
// Draft PR #33 narrows the literal "Handled." string to full closes; this
// count does not wait on that copy. A partial write the user leaves alone
// is not a success and not a false-Do-It.
//
// return — day-level. The user used Do It again on a later local calendar
// day than their previous Do It. "Used Do It" is the click that actually
// starts a close, after the already-closed and empty-step guards — not a
// chip merely being shown, and not a write that happened to succeed. The
// first Do It ever is not a return. Further Do Its on the same calendar
// day are not extra returns: one return per new day. The day key is
// Date#toDateString(), the same local calendar day storage.js already
// uses for activeDays. A browser "session" is not used: the extension
// service worker restarts, and a calendar day is the durable line.
//
// falseDoIt — the user rejected a surfaced chip. One definition: they
// dismissed the chip, OR they Undid after a write that actually landed
// (at least one step reverted). Counted once per message. A dismiss and
// a later undo of the same message are not two rejects. A full write
// that is later undone counts as both a success (the write happened)
// and a false-Do-It (the user took it back). Speculative "the chip
// should have stayed quiet" misses are not this metric.
//
// Pure. No chrome.*, no clock read. Callers pass day and ts. See
// core/README.md for why this lives in core/ and storage.js only persists it.
const FlowCloseQuality = (() => {
  const RECENT_CAP = 40;
  const ID_CAP = 300;

  function emptyState() {
    return {
      success: 0,
      return: 0,
      falseDoIt: 0,
      lastDoItDay: null,
      successIds: [],
      falseDoItIds: [],
      recent: []
    };
  }

  function isFullWrite(proposedStepCount, succeededCount) {
    const proposed = proposedStepCount || 0;
    const succeeded = succeededCount || 0;
    return proposed > 0 && succeeded === proposed;
  }

  // Local calendar day, matching storage.js. A string is already a day
  // key (tests pass one so they don't depend on the host timezone).
  function dayKey(date) {
    if (typeof date === 'string') return date;
    if (date == null) return '';
    return new Date(date).toDateString();
  }

  function clone(state) {
    state = state || {};
    return {
      success: state.success || 0,
      return: state.return || 0,
      falseDoIt: state.falseDoIt || 0,
      lastDoItDay: state.lastDoItDay || null,
      successIds: (state.successIds || []).slice(),
      falseDoItIds: (state.falseDoItIds || []).slice(),
      recent: (state.recent || []).slice()
    };
  }

  function remember(ids, id) {
    return [id, ...ids.filter((x) => x !== id)].slice(0, ID_CAP);
  }

  function pushRecent(state, recorded) {
    state.recent = [recorded, ...state.recent].slice(0, RECENT_CAP);
  }

  // Returns { state, recorded }. recorded is the event that was stored,
  // or null when this call changed nothing the three metrics count
  // (a duplicate, a first Do It, a same-day Do It, or an ignored input).
  // A first Do It still updates state.lastDoItDay — that is how the next
  // day becomes a return — with recorded === null.
  function applyEvent(state, event) {
    const next = clone(state);
    event = event || {};

    if (event.kind === 'success') {
      if (!event.messageId || next.successIds.indexOf(event.messageId) !== -1) {
        return { state: next, recorded: null };
      }
      next.success += 1;
      next.successIds = remember(next.successIds, event.messageId);
      const recorded = { kind: 'success', id: event.messageId, ts: event.ts || 0, day: event.day || null, reason: null };
      pushRecent(next, recorded);
      return { state: next, recorded };
    }

    if (event.kind === 'doIt') {
      if (!event.day) return { state: next, recorded: null };
      const prev = next.lastDoItDay;
      next.lastDoItDay = event.day;
      if (!prev || prev === event.day) return { state: next, recorded: null };
      next.return += 1;
      const recorded = { kind: 'return', id: event.day, ts: event.ts || 0, day: event.day, reason: null };
      pushRecent(next, recorded);
      return { state: next, recorded };
    }

    if (event.kind === 'falseDoIt') {
      if (!event.messageId || next.falseDoItIds.indexOf(event.messageId) !== -1) {
        return { state: next, recorded: null };
      }
      if (event.reason !== 'dismiss' && event.reason !== 'undo') {
        return { state: next, recorded: null };
      }
      next.falseDoIt += 1;
      next.falseDoItIds = remember(next.falseDoItIds, event.messageId);
      const recorded = { kind: 'falseDoIt', id: event.messageId, ts: event.ts || 0, day: event.day || null, reason: event.reason };
      pushRecent(next, recorded);
      return { state: next, recorded };
    }

    return { state: next, recorded: null };
  }

  // Still Open week-1 bar: false closes / messages the user actually
  // judged. A message is judged when it fully wrote, or the user turned
  // the chip down (dismiss or undo). A full write that is later undone
  // is one message and it counts as false — the success row stays, and
  // it is not a second message in the denominator. Returns do not enter
  // this ratio. Null when nothing has been judged yet; a readout of 0%
  // would invent a measurement.
  const FALSE_CLOSE_BAR = 0.15;

  function falseCloseRate(state) {
    const successIds = (state && state.successIds) || [];
    const falseIds = (state && state.falseDoItIds) || [];
    const seen = Object.create(null);
    for (let i = 0; i < successIds.length; i++) seen[successIds[i]] = true;
    for (let i = 0; i < falseIds.length; i++) seen[falseIds[i]] = true;
    const judged = Object.keys(seen).length;
    if (!judged) return null;
    return falseIds.length / judged;
  }

  function computeSnapshot(state) {
    const next = clone(state);
    const rate = falseCloseRate(next);
    return {
      success: next.success,
      return: next.return,
      falseDoIt: next.falseDoIt,
      falseCloseRate: rate,
      falseCloseWithinBar: rate == null ? null : rate <= FALSE_CLOSE_BAR,
      lastDoItDay: next.lastDoItDay,
      recent: next.recent
    };
  }

  // One line for the Activity tab. Blank when all three are zero — a new
  // install has nothing to report, and a readout of zeros would be the
  // product announcing a measurement it has not made yet.
  function activityLine(snapshot) {
    snapshot = snapshot || computeSnapshot(null);
    const success = snapshot.success || 0;
    const returned = snapshot.return || 0;
    const falseDoIt = snapshot.falseDoIt || 0;
    if (!success && !returned && !falseDoIt) return '';
    let line = 'Full closes ' + success + ' · Returns ' + returned + ' · Turned down ' + falseDoIt;
    if (snapshot.falseCloseRate != null) {
      line += ' · False-close ' + Math.round(snapshot.falseCloseRate * 100) + '%';
    }
    return line;
  }

  return { emptyState, isFullWrite, dayKey, applyEvent, computeSnapshot, falseCloseRate, activityLine, FALSE_CLOSE_BAR, RECENT_CAP, ID_CAP };
})();

if (typeof module !== 'undefined') module.exports = { FlowCloseQuality };
