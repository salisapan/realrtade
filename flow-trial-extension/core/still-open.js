// Still Open — the morning list. Glance finds a few personal closes the
// user is not looking at and offers each one Do It. This file decides
// which candidates clear that bar and in what order. It does not read
// Gmail, write anywhere, or touch chrome.* / document / window.
//
// What counts, and only when the evidence is already explicit:
//   1. dated-commitment — a promise with a real date, including the
//      reader's own dated promise (intent type "commitment").
//   2. follow-up-ask — an explicit follow-up or send ask.
//   3. confirmed-amount — a figure someone actually confirmed.
// Meetings, triage, unread noise, and anything the classifier did not
// tag stay off the list. A short list is the product. An empty list is
// a win: never pad up to the cap.
//
// Rank = stakes × explicitness × recency-of-deadline × confidence.
// Any factor of 0 drops the candidate. The cap is 3. Fewer pass, fewer
// show.
//
// Metrics (shown / Do It / undo / false-close) live here as a pure fold
// so they stay consistent with close-quality-metrics.js: local counts,
// no message text, callers pass the clock. storage.js persists the fold.
const FlowStillOpen = (() => {
  const CAP = 3;
  const MIN_SCORE = 0.22;
  const PERSONAL_KINDS = ['dated-commitment', 'follow-up-ask', 'confirmed-amount'];
  const STAKES = { 'dated-commitment': 1, 'confirmed-amount': 0.92, 'follow-up-ask': 0.78 };
  const ID_CAP = 300;
  const RECENT_CAP = 40;

  // Soft stakes. A tagged close that is really a nudge, a newsletter, or
  // an unread count does not get a card — silence, not a weaker card.
  const SOFT = /\b(unread|newsletter|no action needed|just (?:checking|circling|bumping)|fyi|for your information)\b/i;
  const SOFT_HE = /(אין צורך בפעולה|לידיעה בלבד|ניוזלטר|לא נקרא)/;

  function closeKind(intent) {
    if (!intent || typeof intent !== 'object') return null;
    if (intent.type === 'event') return null;
    if (PERSONAL_KINDS.indexOf(intent.personalClose) !== -1) return intent.personalClose;
    // The user's own dated promise. intent.js leaves personalClose unset
    // on this type so close-memory does not treat a reminder as a matter
    // already logged. The morning list is where that promise belongs.
    if (intent.type === 'commitment') {
      const iso = intent.facts && intent.facts.date && intent.facts.date.iso;
      if (!iso) return null;
      if (intent.confidence && intent.confidence !== 'high') return null;
      return 'dated-commitment';
    }
    return null;
  }

  function blob(item) {
    const intent = item.intent || {};
    const entities = intent.entities || {};
    return [item.subject, intent.label, entities.what, entities.requestWhat].filter(Boolean).join('\n');
  }

  function isSoft(item) {
    const text = blob(item);
    return SOFT.test(text) || SOFT_HE.test(text);
  }

  function hasHebrew(item) {
    return /[\u0590-\u05FF]/.test(blob(item));
  }

  function explicitness(intent) {
    const facts = intent.facts || {};
    const entities = intent.entities || {};
    const hasDate = Boolean(facts.date && facts.date.iso);
    const hasMoney = Boolean(facts.money || entities.amount);
    const hasObject = Boolean(entities.requestedObjectTerm || entities.what || entities.requestWhat);
    if (hasDate && (hasMoney || hasObject)) return 1;
    if (hasDate) return 0.85;
    if (hasMoney || hasObject) return 0.72;
    if (intent.label) return 0.62;
    return 0;
  }

  function confidenceFactor(intent, kind) {
    const c = intent.confidence;
    // 'low' is the chip's silence bar (score-bar catch-all). Soft, FYI,
    // hedge, past, and calendar noise never reach here: classify() returns
    // no type, and closeKind already dropped them. Unsure is not a card.
    if (c === 'low') return 0;
    if (c === 'high') return 1;
    if (kind === 'follow-up-ask' && (c === 'medium' || c == null)) return 0.8;
    if ((kind === 'dated-commitment' || kind === 'confirmed-amount') && c == null) return 1;
    return 0;
  }

  // Days from the local calendar day of `now` to the deadline. No
  // deadline is a middle weight: a real follow-up can still be owed
  // without a date, and it must not outrank a promise due tomorrow.
  // A deadline more than two weeks overdue is no longer this morning's
  // close — the factor is 0 and the card stays absent.
  function recency(iso, now) {
    if (!iso || typeof iso !== 'string') return 0.58;
    const parts = iso.split('-');
    if (parts.length < 3) return 0.58;
    const due = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (Number.isNaN(due.getTime())) return 0;
    const clock = now == null ? new Date() : new Date(now);
    const start = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate());
    const days = Math.round((due.getTime() - start.getTime()) / 86400000);
    if (days < -14) return 0;
    if (days <= 1) return 1;
    if (days <= 3) return 0.85;
    if (days <= 7) return 0.7;
    if (days <= 21) return 0.5;
    return 0.35;
  }

  function deadlineMs(item) {
    const iso = item && item.intent && item.intent.facts && item.intent.facts.date && item.intent.facts.date.iso;
    if (!iso) return null;
    const parts = String(iso).split('-');
    if (parts.length < 3) return null;
    const due = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return Number.isNaN(due.getTime()) ? null : due.getTime();
  }

  function scoreOf(item, now) {
    if (!item || typeof item !== 'object') return 0;
    const intent = item.intent;
    const kind = closeKind(intent);
    if (!kind) return 0;
    if (isSoft(item)) return 0;
    const stakes = STAKES[kind] || 0;
    const explicit = explicitness(intent);
    const recent = recency(intent.facts && intent.facts.date && intent.facts.date.iso, now);
    const confidence = confidenceFactor(intent, kind);
    if (!stakes || !explicit || !recent || !confidence) return 0;
    const score = stakes * explicit * recent * confidence;
    return score >= MIN_SCORE ? score : 0;
  }

  function fromLogEntry(entry) {
    entry = entry || {};
    const intent = entry.intent && typeof entry.intent === 'object' ? entry.intent : {};
    return {
      messageId: entry.messageId || null,
      threadId: entry.threadId || null,
      threadUrl: entry.threadUrl || null,
      sender: entry.sender || {},
      subject: entry.subject || '',
      ts: entry.ts || 0,
      app: entry.app || 'gmail',
      intent: intent,
      process: entry.process || null
    };
  }

  function select(candidates, now) {
    const best = new Map();
    const list = Array.isArray(candidates) ? candidates : [];
    for (const raw of list) {
      if (!raw || !raw.messageId || !raw.process || !raw.process.steps || !raw.process.steps.length) continue;
      const score = scoreOf(raw, now);
      if (!score) continue;
      const key = raw.threadId || raw.messageId;
      const prev = best.get(key);
      if (!prev || score > prev.score) best.set(key, { item: raw, score: score });
    }
    const ranked = Array.from(best.values());
    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ad = deadlineMs(a.item);
      const bd = deadlineMs(b.item);
      if (ad != null && bd != null && ad !== bd) return ad - bd;
      if (ad != null && bd == null) return -1;
      if (ad == null && bd != null) return 1;
      return (a.item.ts || 0) - (b.item.ts || 0);
    });
    return ranked.slice(0, CAP).map((row) => row.item);
  }

  function humanDate(iso, now) {
    if (!iso) return '';
    const parts = String(iso).split('-');
    if (parts.length < 3) return '';
    const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (Number.isNaN(dt.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const clock = now == null ? new Date() : new Date(now);
    const sameYear = dt.getFullYear() === clock.getFullYear();
    return months[dt.getMonth()] + ' ' + dt.getDate() + (sameYear ? '' : ', ' + dt.getFullYear());
  }

  // One line. The source thread is the row subtitle, not this sentence.
  function whyLine(item, now) {
    const kind = closeKind(item && item.intent);
    if (!kind || !item) return '';
    const he = hasHebrew(item);
    const when = humanDate(item.intent && item.intent.facts && item.intent.facts.date && item.intent.facts.date.iso, now);
    if (kind === 'dated-commitment') {
      if (he) return when ? 'התחייבת עד ' + when : 'התחייבות עם תאריך עדיין פתוחה';
      return when ? 'You promised this by ' + when : 'A dated promise is still open';
    }
    if (kind === 'follow-up-ask') return he ? 'עדיין חייבים תשובה' : 'A reply is still owed';
    if (kind === 'confirmed-amount') return he ? 'סכום שסוכם עדיין פתוח' : 'A confirmed amount is still open';
    return '';
  }

  // At most one morning OS notification. The count is the list length,
  // never a per-item ping. Hebrew is the line the spec names.
  function notificationText(count) {
    const n = count | 0;
    if (n <= 0) return '';
    if (n === 1) return 'Glance: דבר אחד עדיין פתוח';
    return 'Glance: ' + n + ' עדיין פתוחים';
  }

  function emptyMetrics() {
    return {
      shown: 0,
      doIt: 0,
      undo: 0,
      falseClose: 0,
      notifyDismiss: 0,
      shownIds: [],
      doItIds: [],
      undoIds: [],
      falseCloseIds: [],
      recent: []
    };
  }

  function cloneMetrics(state) {
    const base = emptyMetrics();
    if (!state || typeof state !== 'object') return base;
    base.shown = state.shown || 0;
    base.doIt = state.doIt || 0;
    base.undo = state.undo || 0;
    base.falseClose = state.falseClose || 0;
    base.notifyDismiss = state.notifyDismiss || 0;
    base.shownIds = (state.shownIds || []).slice();
    base.doItIds = (state.doItIds || []).slice();
    base.undoIds = (state.undoIds || []).slice();
    base.falseCloseIds = (state.falseCloseIds || []).slice();
    base.recent = (state.recent || []).slice();
    return base;
  }

  function remember(ids, id) {
    return [id, ...ids.filter((x) => x !== id)].slice(0, ID_CAP);
  }

  function pushRecent(state, recorded) {
    state.recent = [recorded, ...state.recent].slice(0, RECENT_CAP);
  }

  function unchanged(next) {
    return { state: next, recorded: null, changed: false };
  }

  // shown — a Still Open card was actually put in front of the user.
  // doIt — they clicked Do It on one.
  // undo — they took back a write that landed.
  // falseClose — undo, or they dismissed the card (reason 'undo'|'dismiss').
  //   Once per message. An undo records both `undo` and `falseClose`.
  // notifyDismiss — at most one "this morning ping was annoying" flag.
  function applyMetric(state, event) {
    const next = cloneMetrics(state);
    event = event || {};
    const id = event.messageId;
    const ts = event.ts || 0;

    if (event.kind === 'shown') {
      if (!id || next.shownIds.indexOf(id) !== -1) return unchanged(next);
      next.shown += 1;
      next.shownIds = remember(next.shownIds, id);
      const recorded = { kind: 'shown', id: id, ts: ts, reason: null };
      pushRecent(next, recorded);
      return { state: next, recorded: recorded, changed: true };
    }

    if (event.kind === 'doIt') {
      if (!id || next.doItIds.indexOf(id) !== -1) return unchanged(next);
      next.doIt += 1;
      next.doItIds = remember(next.doItIds, id);
      const recorded = { kind: 'doIt', id: id, ts: ts, reason: null };
      pushRecent(next, recorded);
      return { state: next, recorded: recorded, changed: true };
    }

    if (event.kind === 'undo') {
      let recorded = null;
      let changed = false;
      if (id && next.undoIds.indexOf(id) === -1) {
        next.undo += 1;
        next.undoIds = remember(next.undoIds, id);
        recorded = { kind: 'undo', id: id, ts: ts, reason: 'undo' };
        pushRecent(next, recorded);
        changed = true;
      }
      if (id && next.falseCloseIds.indexOf(id) === -1) {
        next.falseClose += 1;
        next.falseCloseIds = remember(next.falseCloseIds, id);
        recorded = { kind: 'falseClose', id: id, ts: ts, reason: 'undo' };
        pushRecent(next, recorded);
        changed = true;
      }
      return { state: next, recorded: recorded, changed: changed };
    }

    if (event.kind === 'falseClose') {
      if (!id || next.falseCloseIds.indexOf(id) !== -1) return unchanged(next);
      if (event.reason !== 'dismiss' && event.reason !== 'undo') return unchanged(next);
      next.falseClose += 1;
      next.falseCloseIds = remember(next.falseCloseIds, id);
      const recorded = { kind: 'falseClose', id: id, ts: ts, reason: event.reason };
      pushRecent(next, recorded);
      return { state: next, recorded: recorded, changed: true };
    }

    if (event.kind === 'notifyDismiss') {
      if (next.notifyDismiss) return unchanged(next);
      next.notifyDismiss = 1;
      const recorded = { kind: 'notifyDismiss', id: null, ts: ts, reason: 'annoying' };
      pushRecent(next, recorded);
      return { state: next, recorded: recorded, changed: true };
    }

    return unchanged(next);
  }

  function activityLine(snapshot) {
    snapshot = snapshot || emptyMetrics();
    const shown = snapshot.shown || 0;
    const did = snapshot.doIt || 0;
    const undo = snapshot.undo || 0;
    const falseClose = snapshot.falseClose || 0;
    if (!shown && !did && !undo && !falseClose) return '';
    return 'Still open — shown ' + shown + ' · Do It ' + did + ' · undo ' + undo + ' · false-close ' + falseClose;
  }

  return {
    CAP: CAP,
    MIN_SCORE: MIN_SCORE,
    closeKind: closeKind,
    scoreOf: scoreOf,
    fromLogEntry: fromLogEntry,
    select: select,
    whyLine: whyLine,
    notificationText: notificationText,
    emptyMetrics: emptyMetrics,
    applyMetric: applyMetric,
    activityLine: activityLine
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowStillOpen };
