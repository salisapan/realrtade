// Close map C2. "Push Thursday's call to Friday at 11:00" moves the one
// matching event on the person's own calendar, then reads it back.
// Portable: no chrome.*, no DOM, no network. The host performs the HTTP.
// Switch MEETING_MOVE defaults off. Nothing in the worker calls this yet.
//
// Detect, show one card with the event it will move, wait for approve, PATCH
// the start and end only, GET that id, and only then fetchedBack. Undo puts
// the old time back, and only while the event still reads as Glance left it.
//
// Silence, because a wrong move is worse than none: no unique event on the
// named day, an event with guests (moving it without telling them is not
// ours to do, and Glance does not send an update), a recurring series, an
// event someone else organizes, a target slot that already has an event, a
// slot in the past, a move that changes nothing, two target clocks, a
// cancel, an invite, a hedge, a negation, a status question, a third party.
// sendUpdates=none. Glance does not send mail and does not invite anyone.
const FlowMeetingMove = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'MEETING_MOVE';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/calendar';
  const DURATION_MIN = 30;
  const MAX_DURATION_MIN = 24 * 60;

  const MOVE_EN = /\b(?:reschedul\w*|postpone|push\s+(?:the\s+|our\s+|this\s+)?(?:\w+(?:'s)?\s+)?(?:call|meeting|sync)|move\s+(?:the\s+|our\s+|this\s+)?(?:\w+(?:'s)?\s+)?(?:call|meeting|sync))\b/i;
  const MOVE_HE = /לדחות|להזיז\s+את\s+ה|תזיז(?:ו|י)?\s+את\s+ה|תדחה\s+את\s+ה|תדחו\s+את\s+ה/;
  const CANCEL = /\b(?:cancel(?:led|ing)?|called off)\b|מבוטלת|לבטל\s+את\s+ה/i;
  const NEG = /\b(?:do not|don't|dont|never mind|no need to)\b|(?:^|\s)אל\s|אין\s+צורך/i;
  const HEDGE = /\b(?:maybe|perhaps|possibly|no rush|whenever|not sure|if you feel)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|לא\s+בטוח/i;
  const DONE = /\b(?:already|was|were|has been|have been)\s+(?:moved|pushed|rescheduled|postponed)\b|\bwe\s+(?:moved|pushed|rescheduled|postponed)\b|כבר\s+(?:הזזנו|דחינו)|הוזזה|נדחתה/i;
  const STATUS = /\b(?:did|have|has)\s+(?:we|you|they)\s+(?:move|push|reschedule|postpone)\w*\b/i;
  const INVITE = /\b(?:invite|send)\b[^.]{0,60}\b(?:hold|invite|update)\b|\binvite\s+[A-Za-z]|תזמינ/i;
  const THIRD = /\b(?:ask|have|get|tell)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to|if)\b|תבקש(?:י|ו)?\s*מ/i;
  const THANKS = /תודה|\bthanks\b|\bthank you\b/i;
  const FIND = /\bfind\s+(?:us\s+)?(?:a\s+|some\s+)?(?:time|slot)\b|(?:למצוא|נמצא|תמצא|תחפש|נחפש)\s+זמן/i;
  const MEETING_LIKE = /\b(?:call|meeting|sync|standup|catch-?up|1:1)\b|פגישה|שיחה|סינק|ישיבה/i;
  const WEEKDAY_EN = /\b((?:on|this|next|last)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:'s)?\b/gi;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function wall(dateIso, hour, minute, addMinutes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return '';
    let total = hour * 60 + minute + (addMinutes || 0);
    const shift = Math.floor(total / 1440);
    total = ((total % 1440) + 1440) % 1440;
    let iso = dateIso;
    if (shift) {
      const parts = dateIso.split('-').map(Number);
      const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + shift));
      iso = dt.toISOString().slice(0, 10);
    }
    return iso + 'T' + pad(Math.floor(total / 60)) + ':' + pad(total % 60) + ':00';
  }

  function slotLabel(dateIso, hour, minute) {
    return dateIso + ' ' + pad(hour) + ':' + pad(minute);
  }

  function replacementIndex(s) {
    const lower = s.toLowerCase();
    let idx = lower.lastIndexOf(' to ');
    const he = Math.max(s.lastIndexOf('ליום'), s.lastIndexOf('למחר'));
    if (he > idx) idx = he;
    return idx;
  }

  function targetClock(clause) {
    const t = extract.parseTime(clause);
    if (t) return t;
    const m = clause.match(/\bto\s+(\d{1,2}):(\d{2})\b/i);
    if (m && +m[1] <= 23 && +m[2] <= 59) return { hour: +m[1], minute: +m[2] };
    return null;
  }

  function clockCount(text) {
    const en = text.match(/\bat\s+\d{1,2}(?::\d{2})?/gi) || [];
    const he = text.match(/(?:בשעה|בשעות)\s*\d{1,2}(?::\d{2})?/g) || [];
    const bare = text.match(/\bto\s+\d{1,2}:\d{2}\b/gi) || [];
    return en.length + he.length + bare.length;
  }

  function blockReason(s) {
    if (FIND.test(s)) return 'find-a-time';
    if (CANCEL.test(s)) return 'cancel';
    if (NEG.test(s)) return 'negation';
    if (HEDGE.test(s)) return 'hedge';
    if (STATUS.test(s)) return 'status-question';
    if (DONE.test(s)) return 'already-done';
    if (INVITE.test(s)) return 'invite';
    if (THIRD.test(s)) return 'third-party';
    if (THANKS.test(s)) return 'thanks';
    return '';
  }

  function nowWall(now) {
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':00';
  }

  function detect(text, now) {
    const s = String(text || '').replace(/[\u200B-\u200F\u202A-\u202E\u00A0]/g, ' ').slice(0, 2000);
    if (!s.trim()) return { kind: 'ignore' };
    if (!MOVE_EN.test(s) && !MOVE_HE.test(s)) return { kind: 'ignore' };
    const reason = blockReason(s);
    if (reason) return { kind: 'block', reason: reason };
    if (!extract || typeof extract.parseDate !== 'function' || typeof extract.parseTime !== 'function') {
      return { kind: 'block', reason: 'no-extract' };
    }
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return { kind: 'block', reason: 'no-day' };
    const idx = replacementIndex(s);
    if (idx < 0) return { kind: 'block', reason: 'no-target' };
    const before = s.slice(0, idx).replace(WEEKDAY_EN, (m, lead, day) => (lead || 'on ') + day).replace(/(^|[^\u0590-\u05FF])מיום/g, '$1ביום');
    const clause = s.slice(idx);
    if (clockCount(clause) > 1) return { kind: 'block', reason: 'two-clocks' };
    const from = extract.parseDate(before, now);
    if (!from || !from.iso) return { kind: 'block', reason: 'no-source-day' };
    const fromTime = extract.parseTime(before);
    const to = extract.parseDate(clause, now);
    const toTime = targetClock(clause);
    if (!toTime) return { kind: 'block', reason: 'no-target-clock' };
    const toIso = to && to.iso ? to.iso : from.iso;
    if (fromTime && toIso === from.iso && fromTime.hour === toTime.hour && fromTime.minute === toTime.minute) {
      return { kind: 'block', reason: 'no-change' };
    }
    if (wall(toIso, toTime.hour, toTime.minute, 0) <= nowWall(now)) return { kind: 'block', reason: 'past' };
    const lang = /[\u0590-\u05FF]/.test(s) ? 'he' : 'en';
    return {
      kind: 'clear',
      lang: lang,
      from: { dateIso: from.iso, hour: fromTime ? fromTime.hour : null, minute: fromTime ? fromTime.minute : null },
      to: { dateIso: toIso, hour: toTime.hour, minute: toTime.minute },
      sentence: s.replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
    };
  }

  function startsAt(ev, dateIso, hour, minute) {
    const start = ev && ev.start && ev.start.dateTime;
    if (typeof start !== 'string') return false;
    const key = hour == null ? dateIso : dateIso + 'T' + pad(hour) + ':' + pad(minute);
    return start.indexOf(key) === 0;
  }

  function others(ev) {
    const list = Array.isArray(ev.attendees) ? ev.attendees : [];
    return list.filter((a) => a && !a.self && !a.organizer);
  }

  function movable(ev) {
    if (!ev || typeof ev.id !== 'string') return 'bad-event';
    if (ev.status === 'cancelled') return 'cancelled';
    if (ev.recurringEventId || (Array.isArray(ev.recurrence) && ev.recurrence.length)) return 'recurring';
    if (others(ev).length) return 'has-guests';
    if (ev.organizer && ev.organizer.self === false) return 'not-organizer';
    return '';
  }

  function pickEvent(events, ask) {
    const day = events.filter((ev) => startsAt(ev, ask.from.dateIso, null, null));
    if (ask.from.hour != null) {
      const exact = day.filter((ev) => startsAt(ev, ask.from.dateIso, ask.from.hour, ask.from.minute));
      if (exact.length !== 1) return { reason: exact.length ? 'ambiguous' : 'no-event' };
      return { event: exact[0] };
    }
    const like = day.filter((ev) => MEETING_LIKE.test(String(ev.summary || '')));
    if (like.length !== 1) return { reason: like.length ? 'ambiguous' : 'no-event' };
    return { event: like[0] };
  }

  function cleanSummary(ev) {
    return String(ev.summary || 'Meeting').replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || 'Meeting';
  }

  function durationMin(ev) {
    const a = Date.parse(ev && ev.start && ev.start.dateTime);
    const b = Date.parse(ev && ev.end && ev.end.dateTime);
    const mins = (b - a) / 60000;
    if (!Number.isFinite(mins) || mins <= 0 || mins > MAX_DURATION_MIN) return DURATION_MIN;
    return Math.round(mins);
  }

  function card(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const ask = detect(input.text, input.now);
    if (ask.kind !== 'clear') return { action: 'silence', reason: ask.reason || 'no-ask' };
    if (!Array.isArray(input.events)) return { action: 'silence', reason: 'not-searched' };
    const picked = pickEvent(input.events, ask);
    if (!picked.event) return { action: 'silence', reason: picked.reason };
    const why = movable(picked.event);
    if (why) return { action: 'silence', reason: why };
    if (input.events.some((ev) => ev !== picked.event && startsAt(ev, ask.to.dateIso, ask.to.hour, ask.to.minute))) {
      return { action: 'silence', reason: 'target-busy' };
    }
    const ev = picked.event;
    const was = String(ev.start.dateTime).slice(0, 16).replace('T', ' ');
    const will = slotLabel(ask.to.dateIso, ask.to.hour, ask.to.minute);
    const name = cleanSummary(ev);
    return {
      action: 'offer',
      approval: 'Do It',
      sends: false,
      ask: ask,
      event: { id: ev.id, summary: name, start: ev.start, end: ev.end },
      line: ask.lang === 'he'
        ? 'להזיז את "' + name + '" מ-' + was + ' ל-' + will + '?'
        : 'Move "' + name + '" from ' + was + ' to ' + will + '?',
      steps: [
        { id: 'move', kind: 'calendar', label: ask.lang === 'he' ? 'הזזה ביומן' : 'Move the event' },
        { id: 'read-back', kind: 'calendar', label: ask.lang === 'he' ? 'קריאה חוזרת' : 'Read the event back', proof: SYSTEM }
      ]
    };
  }

  function approve(cardResult, accepted) {
    if (!cardResult || cardResult.action !== 'offer' || accepted !== true) {
      return { approved: false, reason: accepted === true ? 'no-card' : 'not-approved' };
    }
    return { approved: true, ask: cardResult.ask, event: cardResult.event, line: cardResult.line };
  }

  function patchBody(ev, ask, timeZone) {
    const start = wall(ask.to.dateIso, ask.to.hour, ask.to.minute, 0);
    const end = wall(ask.to.dateIso, ask.to.hour, ask.to.minute, durationMin(ev));
    if (!start || !end) return null;
    const zone = String((ev.start && ev.start.timeZone) || timeZone || 'UTC').replace(/[\r\n]/g, '').trim().slice(0, 80) || 'UTC';
    return { start: { dateTime: start, timeZone: zone }, end: { dateTime: end, timeZone: zone } };
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function safeId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(id);
  }

  function verifiedAt(input) {
    if (input.now instanceof Date && !Number.isNaN(input.now.getTime())) return input.now.toISOString();
    return '';
  }

  function eventPath(id) {
    return '/calendars/primary/events/' + encodeURIComponent(id) + '?sendUpdates=none';
  }

  function startMatches(json, wallStart) {
    const start = json && json.start && json.start.dateTime;
    return typeof start === 'string' && start.indexOf(wallStart.slice(0, 16)) === 0;
  }

  function sameAs(json, ref, wallStart) {
    if (!json || json.id !== ref.eventId || (json.summary || '') !== ref.summary) return false;
    if (!startMatches(json, wallStart)) return false;
    if (others(json).length) return false;
    return true;
  }

  function wallOf(slot) {
    return String((slot && slot.dateTime) || '').slice(0, 19);
  }

  async function execute(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (input.approved !== true) return miss('not-approved');
    const offered = card(input);
    if (offered.action !== 'offer') return miss(offered.reason || 'no-ask');
    if (typeof io.calendar !== 'function') return miss('no-host');
    const picked = pickEvent(input.events, offered.ask).event;
    if (!safeId(picked.id)) return miss('invalid');
    const body = patchBody(picked, offered.ask, input.timeZone);
    if (!body) return miss('invalid');
    const path = eventPath(picked.id);
    const ref = {
      eventId: picked.id,
      summary: picked.summary || '',
      previousStart: picked.start,
      previousEnd: picked.end,
      start: body.start.dateTime,
      end: body.end.dateTime
    };

    const before = await io.calendar('GET', path);
    if (before && (before.status === 401 || before.status === 403)) return miss('not-connected');
    if (!before || !before.ok || !before.json) return miss('verify_failed');
    if ((before.json.summary || '') !== ref.summary || !startMatches(before.json, wallOf(picked.start)) || movable(before.json)) {
      return miss('changed');
    }

    const patched = await io.calendar('PATCH', path, body);
    if (patched && (patched.status === 401 || patched.status === 403)) return miss('not-connected');
    if (!patched || !patched.ok) return miss('verify_failed');
    const got = await io.calendar('GET', path);
    if (!got || !got.ok || !sameAs(got.json, ref, ref.start)) {
      if (got && got.ok && got.json) {
        await io.calendar('PATCH', path, { start: picked.start, end: picked.end });
      }
      return Object.assign(miss('verify_failed'), { ref: ref });
    }
    const proof = proofs && proofs.buildProof ? proofs.buildProof({
      system: SYSTEM,
      externalId: picked.id,
      fetchedBack: true,
      verifiedAt: verifiedAt(input)
    }) : null;
    if (!proof) return Object.assign(miss('verify_failed'), { ref: ref });
    return { ok: true, handled: true, proof: proof, ref: ref };
  }

  async function undo(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const ref = input.ref;
    if (!ref || !safeId(ref.eventId) || !ref.previousStart || !ref.previousEnd || typeof io.calendar !== 'function') return miss('invalid');
    const path = eventPath(ref.eventId);
    const got = await io.calendar('GET', path);
    if (got && got.status === 404) return miss('already-gone');
    if (!got || !got.ok || !got.json) return miss('verify_failed');
    if (!sameAs(got.json, ref, ref.start)) return Object.assign(miss('edited'), { leftAlone: true });
    const put = await io.calendar('PATCH', path, { start: ref.previousStart, end: ref.previousEnd });
    if (!put || !put.ok) return miss('verify_failed');
    const again = await io.calendar('GET', path);
    if (again && again.ok && again.json && startMatches(again.json, wallOf(ref.previousStart)) && (again.json.summary || '') === ref.summary) {
      return { ok: true, restored: true, proof: null };
    }
    return miss('verify_failed');
  }

  return {
    SWITCH: SWITCH,
    SWITCH_DEFAULT: SWITCH_DEFAULT,
    SYSTEM: SYSTEM,
    enabled: enabled,
    detect: detect,
    card: card,
    approve: approve,
    patchBody: patchBody,
    execute: execute,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowMeetingMove };
