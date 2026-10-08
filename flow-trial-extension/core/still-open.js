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
// The trust-finish silence bar (families A–J) is a zero factor, same as
// a missed stake. Hedge, more than one candidate, a weak / low / unsure
// score, an ask that lives only in the quoted history, and newsletter
// noise do not get a card — even when an older snapshot still carries
// a personalClose tag. A fact ask stays off too: the morning list has
// no Sheet or Doc cell to check. Wrong card over silence.
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
  // The family module is the bar when it is loaded. These patterns are
  // the same classes, so a host that only has this file still omits them.
  const SOFT = /\b(unread|newsletter|no action needed|just (?:checking|circling|bumping)|fyi|for your information|hope this (?:email )?finds you well|unsubscribe|book a demo|free trial|circling back|quick bump)\b/i;
  const SOFT_HE = /(אין צורך בפעולה|לידיעה בלבד|ניוזלטר|לא נקרא|לידיעתך)/;
  const HEDGE = /\b(?:maybe|perhaps|possibly|no rush|if possible|tentatively|might|whenever you|if you feel|sometime|if you(?:'re| are) (?:free|available)|if (?:that|this|it) works)\b|(?:אולי|ייתכן|אם אפשר|אין לחץ|מתישהו)/i;
  const ASK_CUE = /\b(?:can you|could you|would you|please|kindly|send|forward|chase|nudge|will send|agreed|confirming)\b|(?:תשלח|בבקשה|סוכם|מאשר)/;

  function closeKind(intent) {
    if (!intent || typeof intent !== 'object') return null;
    if (!intent.type || intent.type === 'event' || intent.type === 'fact') return null;
    if (intent.googleSilence || intent.googleWait) return null;
    if (intent.closeFamily === 'J') return null;
    if (intent.confidence === 'low' || intent.confidence === 'unsure') return null;
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

  function clockOf(now) {
    if (now instanceof Date) return now;
    if (typeof now === 'number') return new Date(now);
    return new Date();
  }

  // The sentence the chip would judge. A stored snapshot may only have
  // the subject and the quoted close; a scan that kept the message
  // passes it as item.text.
  function evidenceText(item) {
    if (item && typeof item.text === 'string' && item.text.trim()) return item.text;
    return blob(item);
  }

  function sentencesOf(text) {
    return String(text || '').split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  }

  // Every ask in the message is hedged, or the message is newsletter
  // noise. One clean sentence keeps the close — "I might also call"
  // after a dated promise is not this.
  function localAskBlocked(text) {
    if (SOFT.test(text) || SOFT_HE.test(text)) return true;
    let saw = false;
    let open = false;
    const sentences = sentencesOf(text);
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (!ASK_CUE.test(sentence)) continue;
      saw = true;
      if (!HEDGE.test(sentence)) open = true;
    }
    return saw && !open;
  }

  // Two places to put one file, or a doc comment we cannot write.
  // Same silence as family B when close-families.js is not on the page.
  function localMulti(text) {
    const cal = /\b(?:on the calendar|calendar invite|calendar note)\b|ביומן/i.test(text);
    const task = /\b(?:on the task|in the task note|task note|as a task)\b|במשימה/i.test(text);
    const doc = /\b(?:docs? comment|comment on the doc)\b|הערה במסמך/i.test(text);
    const file = /\b(?:send|forward|attach|שלח|תשלח)\b/i.test(text);
    const places = (cal ? 1 : 0) + (task ? 1 : 0) + (doc ? 1 : 0);
    if (doc && file) return true;
    return places > 1 && file;
  }

  function freshIntent(text, item, now) {
    if (!text || typeof FlowIntent === 'undefined' || !FlowIntent.classify) return null;
    return FlowIntent.classify(text, {
      now: clockOf(now),
      senderEmail: item && item.sender && item.sender.email
    });
  }

  // True when this row would stay silent on the chip, or it is a fact
  // ask the morning list cannot check. A personalClose tag does not win.
  function silenceClass(item, now) {
    const intent = (item && item.intent) || {};
    if (intent.googleSilence || intent.googleWait) return true;
    if (intent.confidence === 'low' || intent.confidence === 'unsure') return true;
    if (intent.closeFamily === 'J' || intent.type === 'fact') return true;

    const text = evidenceText(item);
    if (!text) return false;

    let judged = text;
    if (typeof FlowJudgment !== 'undefined' && FlowJudgment.newContent) {
      const fresh = FlowJudgment.newContent(text);
      if (!String(fresh || '').trim()) return true;
      if (fresh !== String(text).trim()) {
        const again = freshIntent(fresh, item, now);
        const headIsClose = again && again.type &&
          (!FlowIntent.shouldShowChip || FlowIntent.shouldShowChip(again)) &&
          closeKind(again);
        if (!headIsClose) return true;
        judged = fresh;
      }
    }

    const blocked = (typeof FlowCloseFamilies !== 'undefined' && FlowCloseFamilies.askBlocked)
      ? FlowCloseFamilies.askBlocked(judged)
      : localAskBlocked(judged);
    if (blocked) return true;

    if (typeof FlowCloseFamilies !== 'undefined' && FlowCloseFamilies.assess) {
      const hit = FlowCloseFamilies.assess(judged, intent.facts || null, {
        now: clockOf(now),
        senderEmail: item && item.sender && item.sender.email
      });
      if (hit && hit.suppress) return true;
    } else if (localMulti(judged)) return true;

    if (typeof FlowFactReply !== 'undefined' && FlowFactReply.blocksInbox && FlowFactReply.blocksInbox(intent, judged)) return true;

    // Full message: the current classifier is the bar, not the snapshot.
    if (item && typeof item.text === 'string' && item.text.trim()) {
      const again = freshIntent(item.text, item, now);
      if (!again || !again.type) return true;
      if (again.googleSilence || again.googleWait) return true;
      if (again.confidence === 'low' || again.confidence === 'unsure') return true;
      if (typeof FlowIntent !== 'undefined' && FlowIntent.shouldShowChip && !FlowIntent.shouldShowChip(again)) return true;
      if (!closeKind(again)) return true;
    }
    return false;
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
    if (silenceClass(item, now)) return 0;
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
      text: entry.text || '',
      ts: entry.ts || 0,
      app: entry.app || 'gmail',
      intent: intent,
      process: entry.process || null
    };
  }

  function normPiece(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  function dueIsoOf(item) {
    const date = item && item.intent && item.intent.facts && item.intent.facts.date;
    return date && date.iso ? String(date.iso) : '';
  }

  function senderKeyOf(item) {
    const sender = item && item.sender;
    return String((sender && (sender.email || sender.address)) || '').toLowerCase();
  }

  // Same promise, same day, same person: one Do It. A second mail in the
  // thread, or another mail from that sender, does not open a second task.
  function commitmentDedupeKey(item) {
    let title = '';
    if (typeof FlowCommitmentTitle !== 'undefined' && item && item.text && typeof FlowCommitmentTitle.titleFromBody === 'function') {
      title = normPiece(FlowCommitmentTitle.titleFromBody(item.text));
    }
    if (!title) {
      const intent = (item && item.intent) || {};
      const entities = intent.entities || {};
      title = normPiece(entities.what || intent.label || '');
    }
    const due = dueIsoOf(item);
    if (!title || !due) return '';
    const who = senderKeyOf(item);
    if (who) return title + '\n' + due + '\n' + who;
    const thread = String((item && (item.threadId || item.outlookConversationId)) || '');
    if (thread) return title + '\n' + due + '\nthread:' + thread;
    return '';
  }

  function todoProofRow(row) {
    if (!row || row.kind !== 'written' || row.undone === true) return false;
    const todo = row.connectorId === 'outlookTask' || row.connectorId === 'microsoftTodo' || row.system === 'microsoft/todo'
      || row.connectorId === 'googleTask' || row.connectorId === 'googleTasks';
    if (!todo) return false;
    return row.fetchedBack === true || (row.proof && row.proof.fetchedBack === true);
  }

  // A fetched-back task for this promise is already the close. Undo clears
  // that row, and then one Do It may create the task again.
  function activeProofFor(log, item) {
    const key = commitmentDedupeKey(item);
    if (!key) return null;
    const rows = Array.isArray(log) ? log : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!todoProofRow(row)) continue;
      if (commitmentDedupeKey(row) === key) return row;
    }
    return null;
  }

  function select(candidates, now, log) {
    const best = new Map();
    const list = Array.isArray(candidates) ? candidates : [];
    for (const raw of list) {
      if (!raw || !raw.messageId || !raw.process || !raw.process.steps || !raw.process.steps.length) continue;
      if (activeProofFor(log, raw)) continue;
      const score = scoreOf(raw, now);
      if (!score) continue;
      const key = raw.threadId || raw.messageId;
      const prev = best.get(key);
      if (!prev || score > prev.score) best.set(key, { item: raw, score: score });
    }
    const merged = new Map();
    best.forEach((row) => {
      const commit = commitmentDedupeKey(row.item);
      const key = commit || ('id:' + row.item.messageId);
      const prev = merged.get(key);
      if (!prev || row.score > prev.score || (row.score === prev.score && (row.item.ts || 0) > (prev.item.ts || 0))) {
        merged.set(key, row);
      }
    });
    const ranked = Array.from(merged.values());
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
      // A prepared Outlook reply draft is not a trusted close. Undoing it
      // counts as undo, not as false-close (docs/close-quality-metrics.md:
      // false-Do-It is reject of a chip / undo of a write that closed).
      if (!event.draftOnly && id && next.falseCloseIds.indexOf(id) === -1) {
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

  // How long something has been waiting on YOU. Three days is where a reply
  // starts to feel late; a week is where it starts to cost something. Display
  // only: this never adds a card, a notification or a nudge (silence rule).
  const STALE_DAYS = 3;
  const OVERDUE_DAYS = 7;
  function agingOf(entry, now) {
    const ts = entry && entry.ts;
    if (!ts) return { days: 0, level: 'fresh', label: '' };
    const t = typeof now === 'number' ? now : Date.now();
    const a = new Date(ts); const b = new Date(t);
    const days = Math.max(0, Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000));
    const level = days >= OVERDUE_DAYS ? 'late' : days >= STALE_DAYS ? 'stale' : 'fresh';
    const label = days === 0 ? 'On you since today' : 'On you ' + days + (days === 1 ? ' day' : ' days');
    return { days: days, level: level, label: label };
  }

  return {
    CAP: CAP,
    agingOf: agingOf,
    MIN_SCORE: MIN_SCORE,
    closeKind: closeKind,
    scoreOf: scoreOf,
    fromLogEntry: fromLogEntry,
    select: select,
    promiseKey: commitmentDedupeKey,
    activeProofFor: activeProofFor,
    whyLine: whyLine,
    notificationText: notificationText,
    emptyMetrics: emptyMetrics,
    applyMetric: applyMetric,
    activityLine: activityLine
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowStillOpen };
