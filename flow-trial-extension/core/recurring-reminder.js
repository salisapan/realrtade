// "Send the VAT summary on the 15th each month" / "please send the sales report
// every Monday at 9:00" becomes one recurring Google Calendar reminder (close map
// row T1: a repeating commitment). Portable: no chrome.*, no DOM, no network.
// Behind the off switch RECURRING_REMINDER (default off).
//
// The close is a repeating event that exists, titled with the commitment, at the
// stated clock, with the repeat rule the mail stated. Glance offers one Do It.
// The event has no guest (nobody is invited or notified), a popup reminder at
// the start, and sendUpdates=none. Handled only when the read-back by id shows
// the same title, the same first start and the same recurrence rule. Undo
// deletes the whole series, only while title, description, start and rule are
// still the ones read back; after the person edited it, Undo leaves it. A
// repeating reminder is a standing commitment, so the ask itself is not marked
// closed by it (`loopClosed` false): each occurrence is the person's to do.
//
// Rules:
//   - one explicit request or commitment (please, can you, I will, we need to)
//     with a commitment clause of at least two words and one repeat rule:
//     every day, every weekday, every <weekday>, every week (with a weekday),
//     the Nth of each month. Several rules, "every other", a hedge, a
//     negation, FYI, a past commitment and a third party stay silent;
//   - the clock is required; no clock is silence, Glance does not pick one.
//
// The host injects calendar(method, path, body?) -> Promise<{ status, ok, json }>
// against https://www.googleapis.com/calendar/v3. `calendar.events` is already
// granted; no new scope. No src/ file calls this yet.
const FlowRecurringReminder = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const calendarMod = sibling(typeof FlowGoogleCalendar !== 'undefined' ? FlowGoogleCalendar : null, './google-calendar.js', 'FlowGoogleCalendar');

  const SWITCH = 'RECURRING_REMINDER';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/calendar';
  const CONNECTOR = 'recurringReminder';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const ASK = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|we need you to|we need to|i need to|i will|i'll|we will|we'll|let'?s|remember to|don'?t forget to)\b|בבקשה|אפשר|תוכל|תוכלי|תוכלו|צריך|צריכים|אני אשלח|אני אעביר|נשלח|תזכיר|לא לשכוח/i;
  const NEG = /\b(?:no need to|don'?t need to|do not|don'?t|stop|no longer|cancel|never)\b|אין\s+צורך|אל\s+תשלח|לא\s+צריך|להפסיק|בוטל/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if possible|when you can|no pressure|might|ideally)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|אם\s+אפשר/i;
  const FYI = /\b(?:fyi|for your information|no action needed|used to)\b|לידיעתך|לידיעה/i;
  const PAST = /\b(?:was|were|had|did|sent|used to|last)\b[^.!?\n]{0,40}\bevery\b/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:send|remind|submit|file|pay|prepare|share|update|report|post)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const OTHER_RULE = /\bevery\s+(?:other|second|third|two|three|\d+)\b|\bbi-?(?:weekly|monthly)\b|\bquarterly\b|\bannually\b|\byearly\b|\bevery\s+(?:year|quarter)\b|כל\s+(?:שבועיים|שנה|רבעון)|דו[- ]?שבועי/i;

  const RULE_WEEKDAY_EN = new RegExp('\\bevery\\s+(' + DAYS.join('|') + ')s?\\b', 'ig');
  const RULE_DAILY_EN = /\b(?:every\s+(?:day|morning|evening)|daily)\b/i;
  const RULE_WEEKDAYS_EN = /\bevery\s+(?:weekday|working\s+day|business\s+day)\b/i;
  const RULE_WEEKLY_EN = /\b(?:every\s+week|weekly|each\s+week)\b/i;
  const RULE_MONTH_EN = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\s+(?:of\s+)?(?:each|every)\s+month\b|\b(?:each|every)\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b|\bmonthly\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/i;
  const RULE_MONTH_ANY_EN = /\b(?:every|each)\s+month\b|\bmonthly\b/i;
  const RULE_WEEKDAY_HE = new RegExp('כל\\s+יום\\s+(' + DAYS_HE.join('|') + ')', 'g');
  const RULE_DAILY_HE = /כל\s+יום(?!\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))|כל\s+(?:בוקר|ערב)/;
  const RULE_MONTH_HE = /(?:ב-?|ביום\s+ה-?)(\d{1,2})\s+(?:ב)?(?:כל\s+)?(?:לחודש|בכל\s+חודש)|כל\s+חודש\s+(?:ב-?|ביום\s+ה-?)(\d{1,2})/;
  const RULE_MONTH_ANY_HE = /כל\s+חודש|חודשי/;

  const CLOCK_RE = /\b\d{1,2}:\d{2}\b|\b\d{1,2}(?:\.\d{2})?\s?(?:am|pm)\b|(?:^|[\s,(])(?:ב-?|בשעה\s+)\d{1,2}(?::\d{2})?(?![\d/.])|\bat\s+\d{1,2}(?::\d{2})?\b/gi;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The repeat rule the text states, or a reason it is not one rule.
  function ruleOf(s) {
    const found = [];
    let m;
    const re = new RegExp(RULE_WEEKDAY_EN.source, 'ig');
    const days = {};
    while ((m = re.exec(s))) days[DAYS.indexOf(m[1].toLowerCase())] = 1;
    const reHe = new RegExp(RULE_WEEKDAY_HE.source, 'g');
    while ((m = reHe.exec(s))) days[DAYS_HE.indexOf(m[1])] = 1;
    const dayKeys = Object.keys(days);
    const named = {};
    (s.match(new RegExp('\\b(' + DAYS.join('|') + ')s?\\b', 'ig')) || []).forEach((d) => { named[d.toLowerCase().replace(/s$/, '')] = 1; });
    (s.match(new RegExp('(?:' + DAYS_HE.join('|') + ')', 'g')) || []).forEach((d) => { named[d] = 1; });
    if (dayKeys.length > 1 || Object.keys(named).length > 1) return { reason: 'several-rules' };
    if (dayKeys.length === 1) found.push({ freq: 'WEEKLY', day: Number(dayKeys[0]), rrule: 'RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY[Number(dayKeys[0])] });
    if (RULE_WEEKDAYS_EN.test(s)) found.push({ freq: 'WEEKDAYS', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' });
    else if (RULE_DAILY_EN.test(s) || RULE_DAILY_HE.test(s)) found.push({ freq: 'DAILY', rrule: 'RRULE:FREQ=DAILY' });
    const mon = s.match(RULE_MONTH_EN) || s.match(RULE_MONTH_HE);
    if (mon) {
      const n = Number(mon[1] || mon[2] || mon[3]);
      if (n >= 1 && n <= 28) found.push({ freq: 'MONTHLY', dom: n, rrule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + n });
      else return { reason: 'bad-day-of-month' };
    } else if (RULE_MONTH_ANY_EN.test(s) || RULE_MONTH_ANY_HE.test(s)) {
      return { reason: 'no-day-of-month' };
    }
    if (found.length === 0 && (RULE_WEEKLY_EN.test(s))) return { reason: 'no-weekday' };
    if (found.length === 0) return { reason: 'no-rule' };
    if (found.length > 1) return { reason: 'several-rules' };
    return { rule: found[0] };
  }

  function isoOf(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  // The first occurrence strictly after today, so the first start is never in the past.
  function firstDate(rule, todayIso) {
    const t = new Date(todayIso + 'T00:00:00Z');
    for (let i = 1; i <= 62; i++) {
      const d = new Date(t.getTime() + i * 86400000);
      const dow = d.getUTCDay();
      if (rule.freq === 'DAILY') return isoOf(d);
      if (rule.freq === 'WEEKDAYS' && dow >= 1 && dow <= 5) return isoOf(d);
      if (rule.freq === 'WEEKLY' && dow === rule.day) return isoOf(d);
      if (rule.freq === 'MONTHLY' && d.getUTCDate() === rule.dom) return isoOf(d);
    }
    return null;
  }

  // The commitment clause: the words before the repeat rule, minus the ask.
  function titleOf(s) {
    let t = s.split(/\b(?:every|each|on\s+the\s+\d)|כל\s|ב-?\d{1,2}\s+(?:ב)?(?:כל\s+)?לחודש/i)[0];
    t = t.replace(/\s+(?:daily|weekly|monthly)\s*$/i, ' ');
    t = t.replace(/[\r\n]+/g, ' ');
    t = t.replace(/^[\s\S]*?(?:\bplease\b|\bcan you\b|\bcould you\b|\bwould you\b|\bwill you\b|\bkindly\b|\bi need you to\b|\bwe need you to\b|\bwe need to\b|\bi need to\b|\bremember to\b|\bdon'?t forget to\b|\bi will\b|\bi'll\b|\bwe will\b|\bwe'll\b|\blet'?s\b|בבקשה|אפשר|תוכל(?:י|ו)?|תזכיר(?:י)?|צריך|צריכים|לא לשכוח)\s*/i, '');
    t = t.replace(/[\s,.;:!?-]+$/g, '').replace(/^[\s,.;:!?-]+/g, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s+(?:on|at|by)$/i, '').trim();
    return t;
  }

  function clockOf(s) {
    // The day of the month ("ב-15 לחודש", "the 15th") is not a clock.
    const bare = s.replace(RULE_MONTH_HE, ' ').replace(RULE_MONTH_EN, ' ');
    const found = bare.match(CLOCK_RE) || [];
    const set = {};
    found.forEach((raw) => { set[raw.toLowerCase().replace(/[^\d:apm.]/g, '')] = 1; });
    if (Object.keys(set).length !== 1) return null;
    const t = extract ? extract.parseTime(bare) : null;
    if (!t || t.hour == null) return null;
    return { hour: t.hour, minute: t.minute || 0 };
  }

  // The ask, or silence with a reason.
  function recognize(text, todayIso) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim()) return { kind: 'ignore' };
    if (!/\b(?:every|each|daily|weekly|monthly)\b|כל\s|לחודש/i.test(s) && !OTHER_RULE.test(s)) return { kind: 'ignore' };
    if (OTHER_RULE.test(s)) return { kind: 'block', reason: 'other-rule' };
    if (PAST.test(s)) return { kind: 'block', reason: 'past' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    if (!ASK.test(s)) return { kind: 'block', reason: 'no-request' };
    const r = ruleOf(s);
    if (!r.rule) return { kind: 'block', reason: r.reason };
    const clock = clockOf(s);
    if (!clock) return { kind: 'block', reason: 'no-clock' };
    const title = titleOf(s);
    if (title.split(/\s+/).length < 2 || title.length > 100) return { kind: 'block', reason: 'no-title' };
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(todayIso || '')) ? todayIso : isoOf(new Date());
    const first = firstDate(r.rule, today);
    if (!first) return { kind: 'block', reason: 'no-date' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', title: title, rrule: r.rule.rrule, freq: r.rule.freq, dateIso: first, hour: clock.hour, minute: clock.minute };
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  function repeatWords(r) {
    const he = r.lang === 'he';
    if (r.freq === 'DAILY') return he ? 'כל יום' : 'every day';
    if (r.freq === 'WEEKDAYS') return he ? 'בכל יום חול' : 'every weekday';
    if (r.freq === 'MONTHLY') { const n = /BYMONTHDAY=(\d+)/.exec(r.rrule)[1]; return he ? 'ב-' + n + ' לכל חודש' : 'on the ' + n + ' of each month'; }
    const d = BYDAY.indexOf(/BYDAY=(\w\w)/.exec(r.rrule)[1]);
    return he ? 'כל יום ' + DAYS_HE[d] : 'every ' + DAYS[d].replace(/^./, (c) => c.toUpperCase());
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.todayIso);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const he = r.lang === 'he';
    const when = repeatWords(r) + ' ' + pad(r.hour) + ':' + pad(r.minute);
    return {
      action: 'offer',
      approval: 'DoIt',
      title: r.title,
      rrule: r.rrule,
      when: { dateIso: r.dateIso, hour: r.hour, minute: r.minute },
      line: he ? 'ליצור ביומן תזכורת חוזרת (' + when + '): ' + r.title + '?' : 'Add a repeating reminder to your calendar (' + when + '): ' + r.title + '?',
      steps: [{ id: 'series', kind: 'calendar', label: he ? 'יצירת האירוע החוזר ובדיקה חוזרת (בלי מוזמנים)' : 'Create the repeating event and read it back (no guests)', proof: SYSTEM }],
      lang: r.lang
    };
  }

  function eventPath(id) {
    return '/calendars/primary/events/' + encodeURIComponent(id);
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function contentHash(ev) {
    const start = ev && ev.start ? String(ev.start.dateTime || ev.start.date || '') : '';
    const rule = ev && Array.isArray(ev.recurrence) ? ev.recurrence.join('|') : '';
    const guests = ev && Array.isArray(ev.attendees) ? ev.attendees.length : 0;
    return hash([ev && ev.summary, ev && ev.description, start, rule, guests].map((x) => String(x || '')).join('\n'));
  }

  function sameInstant(a, b) {
    const x = Date.parse(a);
    const y = Date.parse(b);
    return Number.isFinite(x) && Number.isFinite(y) && x === y;
  }

  // Do It. The host passes the plan's title, rule and first start as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.calendar !== 'function') return miss('no-host');
    if (!calendarMod || typeof calendarMod.eventBody !== 'function') return miss('no-calendar-module');
    const rrule = String(input.rrule || '');
    if (!/^RRULE:FREQ=(?:DAILY|WEEKLY;BYDAY=(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR))*|MONTHLY;BYMONTHDAY=(?:[1-9]|1\d|2[0-8]))$/.test(rrule)) return miss('unclear');
    const w = input.when || {};
    const base = calendarMod.eventBody({ dateIso: w.dateIso, hour: w.hour, minute: w.minute, title: input.title, timeZone: input.timeZone });
    if (!base) return miss('unclear');
    const body = Object.assign({}, base, {
      attendees: [],
      recurrence: [rrule],
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }
    });
    const cal = io.calendar;
    const posted = await cal('POST', '/calendars/primary/events?sendUpdates=none', body);
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.id) return miss('write-failed');
    const id = posted.json.id;
    const ref = { eventId: id, externalId: id, createdByGlance: true };
    const withdraw = async (why) => {
      const gone = await cal('DELETE', eventPath(id) + '?sendUpdates=none');
      const removed = !!(gone.ok || gone.status === 204 || gone.status === 404 || gone.status === 410);
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, eventId: id });
    };
    const back = await cal('GET', eventPath(id));
    if (!back.ok || !back.json || back.json.id !== id || back.json.status === 'cancelled') return withdraw('get-' + back.status);
    const ev = back.json;
    if (String(ev.summary || '') !== String(body.summary)) return withdraw('title-differs');
    if (!ev.start || !sameInstant(ev.start.dateTime, body.start.dateTime)) return withdraw('time-differs');
    if (!Array.isArray(ev.recurrence) || ev.recurrence.length !== 1 || ev.recurrence[0] !== rrule) return withdraw('rule-differs');
    if (Array.isArray(ev.attendees) && ev.attendees.length) return withdraw('has-guests');
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = ev.htmlLink && String(ev.htmlLink).slice(0, 8) === 'https://' ? ev.htmlLink : null;
    const finalRef = Object.assign({}, ref, { contentHash: contentHash(ev) });
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: url || '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef });
    const start = String(ev.start.dateTime);
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Google Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + ev.summary + ' · ' + String(rrule).replace('RRULE:', '') + ' · ' + start.slice(0, 10) + ' ' + start.slice(11, 16),
      url: url,
      proof: proof,
      ref: finalRef,
      // A standing reminder is set; each occurrence is still the person's to do.
      loopClosed: false,
      stepClosed: 'series'
    };
  }

  // Undo: delete the whole series, only while it is still what Glance made.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.eventId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.calendar !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.calendar('GET', eventPath(ref.eventId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, undone: true, externalId: ref.eventId };
    if (!got.ok || !got.json) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (got.json.status === 'cancelled') return { ok: true, undone: true, externalId: ref.eventId };
    if (!ref.contentHash || contentHash(got.json) !== ref.contentHash) {
      return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    }
    const del = await io.calendar('DELETE', eventPath(ref.eventId) + '?sendUpdates=none');
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!(del.ok || del.status === 204 || del.status === 404 || del.status === 410)) return { ok: false, reason: 'undo-failed' };
    const after = await io.calendar('GET', eventPath(ref.eventId));
    const gone = after.status === 404 || after.status === 410 || (after.ok && after.json && after.json.status === 'cancelled');
    return gone ? { ok: true, undone: true, externalId: ref.eventId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, enabled, recognize, plan, create, undo, contentHash };
})();

if (typeof module !== 'undefined') module.exports = { FlowRecurringReminder };
else if (typeof globalThis !== 'undefined') globalThis.FlowRecurringReminder = FlowRecurringReminder;
