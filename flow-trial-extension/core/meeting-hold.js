// Close map C1. One named clock becomes one hold on the person's calendar.
// Portable: no chrome.*, no DOM, no network. The host performs the HTTP.
// Switch MEETING_HOLD defaults off. Nothing in the worker calls this yet.
//
// "Can we meet Thursday at 16:00?" Detect, show one card, wait for approve,
// create the event with no guests, GET that id, and only then fetchedBack.
// Undo deletes it only while the read still matches what Glance wrote.
//
// A find-a-time, two clocks, two days, an invite, a move, a cancel, a file
// dropped on the calendar, a promise, and a slot that already has an event
// stay silent. sendUpdates=none. Glance does not send mail and does not
// invite anyone. A reply the sentence also asks for is a later preview,
// not this close.
const FlowMeetingHold = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'MEETING_HOLD';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/calendar';
  const DURATION_MIN = 30;

  const MEET_EN = /\b(?:let'?s|let us)\s+(?:meet|sync|hop on|jump on)\b|\b(?:can|could|would|shall)\s+(?:we|you)\s+meet\b|\bhold\s+a\s+meeting\b|\bquick sync\b|\b(?:team|our)\s+meeting\b/i;
  const MEET_HE = /ניפגש|(?:^|[^\u0590-\u05FF])נפגש(?![\u0590-\u05FF])|נקבע(?!\s*מחדש)|פגישת\s+צוות/;
  const FIND_EN = /\bfind\s+(?:us\s+)?(?:a\s+|some\s+)?time\b|\bfind\s+(?:us\s+)?a\s+slot\b/i;
  const FIND_HE = /(?:למצוא|נמצא|תמצא|תחפש|נחפש)\s+זמן/;
  const HEDGE = /\b(?:maybe|perhaps|possibly|no rush|whenever|not sure|if you feel)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|לא\s+בטוח/i;
  const NEG = /\b(?:do not|don't|dont|never mind)\b|אל\s|אין\s+צורך|לא\s+ניפגש/i;
  const PAST = /\b(?:already\s+met|we\s+met|i\s+met|already\s+(?:scheduled|booked))\b|כבר\s+נפגש|נפגשנו/i;
  const STATUS = /\b(?:did|have)\s+we\s+meet\b|האם\s+נפגש/i;
  const INVITE_EN = /\b(?:invite|send)\b[^.]{0,60}\b(?:hold|invite)\b|\binvite\s+[A-Za-z]/i;
  const INVITE_HE = /תזמינ/;
  const MOVE_EN = /\b(?:reschedul\w*|postpone|push\b[^.]{0,40}\b(?:call|meeting|sync)|move\s+(?:the\s+|our\s+|this\s+)?(?:call|meeting|sync))\b/i;
  const MOVE_HE = /(?:לדחות|להזיז את ה|נקבע מחדש)/;
  const CANCEL_EN = /\b(?:cancel(?:led|ing)?|called off)\b/i;
  const CANCEL_HE = /(?:מבוטלת|לבטל את ה)/;
  const FILE_CAL = /\b(?:add|put|save|attach)\b[^.]{0,48}\bcalendar\b|ליומן|ביומן/i;
  const THIRD_EN = /\b(?:ask|have|get|tell)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to|if)\b/i;
  const THIRD_HE = /תבקש(?:י|ו)?\s*מ/;
  const THANKS = /תודה|\bthanks\b|\bthank you\b/i;
  const BEFORE = /לפני\s+פגיש|\bbefore\s+the\s+(?:meeting|call)\b/i;
  const RECAP = /סיכום|\brecap\b|\bdebrief\b|\bmeeting notes\b/i;
  const FYI = /\bFYI\b|\bfor your information\b|לידיעה/i;
  const DAYS_EN = /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
  const DAYS_HE = /יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/g;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function wall(dateIso, hour, minute, addMinutes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return '';
    let total = hour * 60 + minute + (addMinutes || 0);
    let shift = Math.floor(total / 1440);
    total = ((total % 1440) + 1440) % 1440;
    let iso = dateIso;
    if (shift) {
      const parts = dateIso.split('-').map(Number);
      const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + shift));
      iso = dt.toISOString().slice(0, 10);
    }
    return iso + 'T' + pad(Math.floor(total / 60)) + ':' + pad(total % 60) + ':00';
  }

  function clockLabel(ask) {
    return pad(ask.hour) + ':' + pad(ask.minute);
  }

  function dayCount(text) {
    const en = text.match(DAYS_EN) || [];
    const he = text.match(DAYS_HE) || [];
    let n = en.length + he.length;
    if (/\b(?:today|tomorrow)\b/i.test(text)) n++;
    if (/(?:^|[^\u0590-\u05FF])מחרתיים(?![\u0590-\u05FF])/.test(text)) n++;
    else if (/(?:^|[^\u0590-\u05FF])מחר(?![\u0590-\u05FF])/.test(text)) n++;
    return n;
  }

  function clockCount(text) {
    const en = text.match(/\bat\s+\d{1,2}(?::\d{2})?/gi) || [];
    const he = text.match(/(?:בשעה|בשעות)\s*\d{1,2}(?::\d{2})?/g) || [];
    return en.length + he.length;
  }

  function summaryOf(text, lang) {
    if (lang === 'he') {
      const m = text.match(/(?:על|בנושא)\s+([^\s,.?]{2,40})/);
      return m ? m[1].slice(0, 60) : 'פגישה';
    }
    const m = text.match(/\babout\s+(?:the\s+)?([A-Za-z][\w'-]{1,40})/i);
    return m ? m[1] : 'Meeting';
  }

  function blockReason(text) {
    if (FIND_EN.test(text) || FIND_HE.test(text)) return 'find-a-time';
    if (NEG.test(text)) return 'negation';
    if (HEDGE.test(text)) return 'hedge';
    if (PAST.test(text)) return 'already-done';
    if (STATUS.test(text)) return 'status-question';
    if (INVITE_EN.test(text) || INVITE_HE.test(text)) return 'invite';
    if (MOVE_EN.test(text) || MOVE_HE.test(text)) return 'move';
    if (CANCEL_EN.test(text) || CANCEL_HE.test(text)) return 'cancel';
    if (FILE_CAL.test(text)) return 'file-on-calendar';
    if (THIRD_EN.test(text) || THIRD_HE.test(text)) return 'third-party';
    if (THANKS.test(text)) return 'thanks';
    if (BEFORE.test(text)) return 'before-the-meeting';
    if (RECAP.test(text)) return 'recap';
    if (FYI.test(text)) return 'fyi';
    if (clockCount(text) > 1) return 'two-clocks';
    if (dayCount(text) > 1) return 'two-days';
    return '';
  }

  function detect(text, now) {
    const s = String(text || '').replace(/[\u200B-\u200F\u202A-\u202E\u00A0]/g, ' ').slice(0, 2000);
    if (!s.trim()) return { kind: 'ignore' };
    if (!MEET_EN.test(s) && !MEET_HE.test(s)) {
      if (FIND_EN.test(s) || FIND_HE.test(s)) return { kind: 'block', reason: 'find-a-time' };
      return { kind: 'ignore' };
    }
    const reason = blockReason(s);
    if (reason) return { kind: 'block', reason: reason };
    if (!extract || typeof extract.parseDate !== 'function' || typeof extract.parseTime !== 'function') {
      return { kind: 'block', reason: 'no-extract' };
    }
    const when = now instanceof Date ? now : null;
    if (!when) return { kind: 'block', reason: 'no-day' };
    const date = extract.parseDate(s, when);
    const time = extract.parseTime(s);
    if (!date || !date.iso) return { kind: 'block', reason: 'no-day' };
    if (!time) return { kind: 'block', reason: 'no-clock' };
    const lang = MEET_HE.test(s) && (!MEET_EN.test(s) || /[\u0590-\u05FF]/.test(s)) ? 'he' : 'en';
    return {
      kind: 'clear',
      lang: lang,
      dateIso: date.iso,
      hour: time.hour,
      minute: time.minute,
      summary: summaryOf(s, lang),
      sentence: s.replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
    };
  }

  function occupies(events, ask) {
    const key = ask.dateIso + 'T' + clockLabel(ask);
    return events.some((ev) => ev && ev.start && typeof ev.start.dateTime === 'string' && ev.start.dateTime.indexOf(key) === 0);
  }

  function card(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const ask = detect(input.text, input.now);
    if (ask.kind !== 'clear') return { action: 'silence', reason: ask.reason || 'no-ask' };
    if (!Array.isArray(input.events)) return { action: 'silence', reason: 'not-searched' };
    if (occupies(input.events, ask)) return { action: 'silence', reason: 'already-held' };
    const when = ask.dateIso + ' ' + clockLabel(ask);
    return {
      action: 'offer',
      approval: 'Do It',
      sends: false,
      ask: ask,
      line: ask.lang === 'he' ? 'לקבוע ביומן ' + when + '?' : 'Hold ' + when + ' on your calendar?',
      steps: [
        { id: 'create', kind: 'calendar', label: ask.lang === 'he' ? 'קביעה ביומן' : 'Create the hold' },
        { id: 'read-back', kind: 'calendar', label: ask.lang === 'he' ? 'קריאה חוזרת' : 'Read the event back', proof: SYSTEM }
      ]
    };
  }

  function approve(cardResult, accepted) {
    if (!cardResult || cardResult.action !== 'offer' || accepted !== true) {
      return { approved: false, reason: accepted === true ? 'no-card' : 'not-approved' };
    }
    return { approved: true, ask: cardResult.ask, line: cardResult.line };
  }

  function eventBody(ask, timeZone) {
    if (!ask || !ask.dateIso || ask.hour == null || ask.minute == null) return null;
    const start = wall(ask.dateIso, ask.hour, ask.minute, 0);
    const end = wall(ask.dateIso, ask.hour, ask.minute, DURATION_MIN);
    if (!start || !end) return null;
    const zone = String(timeZone || 'UTC').replace(/[\r\n]/g, '').trim().slice(0, 80) || 'UTC';
    return {
      summary: String(ask.summary || 'Meeting').replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || 'Meeting',
      description: String(ask.sentence || '').slice(0, 500),
      start: { dateTime: start, timeZone: zone },
      end: { dateTime: end, timeZone: zone },
      attendees: []
    };
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

  function sameWritten(json, ref) {
    if (!json || json.summary !== ref.summary) return false;
    const start = json.start && json.start.dateTime;
    if (typeof start !== 'string' || start.indexOf(ref.start) !== 0) return false;
    if (Array.isArray(json.attendees) && json.attendees.length) return false;
    return true;
  }

  function eventPath(id) {
    return '/calendars/primary/events/' + encodeURIComponent(id) + '?sendUpdates=none';
  }

  async function execute(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (input.approved !== true) return miss('not-approved');
    const offered = card(input);
    if (offered.action !== 'offer') return miss(offered.reason || 'no-ask');
    if (typeof io.calendar !== 'function') return miss('no-host');
    const body = eventBody(offered.ask, input.timeZone);
    if (!body || body.attendees.length !== 0) return miss('invalid');
    const post = await io.calendar('POST', '/calendars/primary/events?sendUpdates=none', body);
    if (post && (post.status === 401 || post.status === 403)) return miss('not-connected');
    const id = post && post.json && post.json.id;
    if (!post || !post.ok || !safeId(id)) return miss('verify_failed');
    const got = await io.calendar('GET', eventPath(id));
    const ref = { eventId: id, summary: body.summary, start: body.start.dateTime, end: body.end.dateTime };
    if (!got || !got.ok || !sameWritten(got.json, ref)) {
      if (got && got.ok && got.json) await io.calendar('DELETE', eventPath(id));
      return Object.assign(miss('verify_failed'), { ref: ref });
    }
    const at = verifiedAt(input);
    const proof = proofs && proofs.buildProof ? proofs.buildProof({
      system: SYSTEM,
      externalId: id,
      fetchedBack: true,
      verifiedAt: at
    }) : null;
    if (!proof) return Object.assign(miss('verify_failed'), { ref: ref });
    return { ok: true, handled: true, proof: proof, ref: ref };
  }

  async function undo(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const ref = input.ref;
    if (!ref || !safeId(ref.eventId) || typeof io.calendar !== 'function') return miss('invalid');
    const path = eventPath(ref.eventId);
    const got = await io.calendar('GET', path);
    if (got && got.status === 404) return miss('already-gone');
    if (!got || !got.ok || !got.json) return miss('verify_failed');
    if (!sameWritten(got.json, ref)) return Object.assign(miss('edited'), { leftAlone: true });
    const del = await io.calendar('DELETE', path);
    if (!del || (!del.ok && del.status !== 204)) return miss('verify_failed');
    const again = await io.calendar('GET', path);
    if (again && again.status === 404) return { ok: true, removed: true, proof: null };
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
    eventBody: eventBody,
    execute: execute,
    undo: undo
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowMeetingHold };
