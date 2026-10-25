// A Zoom call proposed in mail or chat, with one day and one clock, becomes one Do It: create that meeting on the
// person's own Zoom account and read it back (core/zoom-close.js). Portable: no chrome.*, no DOM, no network.
// Behind the off switch ZOOM_MEETING (default off; the connector's own switches are separate, config/connectors.public.js).
// The Zoom counterpart of core/teams-meeting.js and core/meet-link.js.
//
// The loop: "Can we do a Zoom call tomorrow at 15:00?" / "נעשה שיחה בזום מחר ב-15:00". The close is a meeting that exists on
// the person's Zoom, at that clock, with a join link Zoom itself returned. Glance offers it as one Do It, creates it with no
// invitee (nobody is contacted), reads it back, and says Handled only on the read-back. The link is shown to the person to share;
// Glance sends nothing.
//
// Rules:
//   - one explicit proposal of a call that NAMES Zoom, with one day and one clock (Hebrew and English). A generic "video call"
//     stays silent here: the Teams and Meet recognizers own the mailbox's own tool, and Zoom is never guessed;
//   - another named tool (Teams, Meet, Webex, WhatsApp call, a phone number) is the other side's choice: silence;
//   - when the other side says they will make the Zoom link ("I'll send a Zoom link"), silence: it already has an owner;
//   - two clocks, an alternative, a past day, a hedge, a negation, FYI and "ask Dana to set up a Zoom" stay silent.
// No src/ file calls this yet (the steps-list wiring is open-tasks row 80).
const FlowZoomMeeting = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');

  const SWITCH = 'ZOOM_MEETING';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'zoom/meeting';

  // Any mention of Zoom: the guards below decide, and every one of them answers silence with a reason.
  const CALL = /\bzoom\b|זום/i;
  const PROPOSE_EN = /\b(?:let'?s|lets|can\s+we|could\s+we|shall\s+we|should\s+we|how\s+about|want\s+to|would\s+you\s+like\s+to|are\s+you\s+free\s+for|set\s+up|schedule|book|arrange|organi[sz]e|plan|hop\s+on|jump\s+on|do)\b/i;
  const PROPOSE_HE = /(?:בואו|בוא|נקבע|נתאם|נעשה|נדבר|נתפגש|אפשר|אפשרי|נוכל|תוכל|תוכלי|תוכלו|מוכן|מוכנה|נקים|תקבע|תקבעי|תקבעו|נארגן|נפגש|מתאים\s+לך|מתאים\s+לכם)/;
  // Teams, Meet and the rest: the other side picked another tool. (Zoom itself is the one we create, so it is not in this list.)
  const OTHER_TOOL = /\b(?:teams|google\s*meet|meet\s+link|webex|skype|whatsapp|slack\s+huddle|facetime|bluejeans|gotomeeting|jitsi|phone|telephone|dial[- ]in)\b|טימס|טימז|מיט\b|גוגל\s+מיט|וואטסאפ|וואצאפ|סקייפ|טלפון|בטלפון/i;
  // They will make the link themselves: do not create a second one.
  const THEY_HOST = /\b(?:i'?ll|i\s+will|we'?ll|we\s+will|i'?m\s+going\s+to|let\s+me)\s+(?:send|share|create|set\s+up|make|host|open|schedule|book)\b[^.!?\n]{0,40}\bzoom\b|\b(?:my|our)\s+zoom\b|\bzoom\s+(?:link|id)\s+(?:is|below|attached)\b|אני\s+(?:אשלח|אפתח|אקבע|אקים|אארגן)[^.!?\n]{0,40}זום|אנחנו\s+(?:נשלח|נפתח)[^.!?\n]{0,40}זום/i;
  const NEG = /\b(?:no need (?:for|to)|don'?t need (?:a|to)|do not need|not necessary|cancel|skip|without)\b[^.!?\n]{0,30}\b(?:call|meeting|meet|video|zoom)\b|אין\s+צורך\s+ב|לא\s+צריך\s+(?:שיחה|פגישה)|בלי\s+(?:שיחה|פגישה)|לבטל/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|no pressure|someday|sometime|at some point|whenever|one day)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|מתישהו/i;
  const FYI = /\b(?:fyi|for your information|no action needed|here is the recording|recording of|webinar|unsubscribe)\b|לידיעתך|לידיעה|הקלטה\s+של|וובינר/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:set\s+up|schedule|book|arrange|create)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const ALT = /\b(?:or|alternatively|either)\b|\bאו\b/i;
  const CLOCK = /\b\d{1,2}:\d{2}\b|\b\d{1,2}(?:\.\d{2})?\s?(?:am|pm)\b|(?:^|[\s,(])(?:ב-?|בשעה\s+)\d{1,2}(?::\d{2})?(?![\d/.])|\bat\s+\d{1,2}(?::\d{2})?\b/gi;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function isoOf(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function distinctClocks(text) {
    const found = String(text).match(CLOCK) || [];
    const set = {};
    found.forEach((raw) => { set[raw.toLowerCase().replace(/[^\d:apm.]/g, '')] = 1; });
    return Object.keys(set).length;
  }

  // The ask, or silence with a reason.
  function recognize(text, now) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim() || !CALL.test(s)) return { kind: 'ignore' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (OTHER_TOOL.test(s)) return { kind: 'block', reason: 'other-tool' };
    if (THEY_HOST.test(s)) return { kind: 'block', reason: 'they-host' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    if (!(PROPOSE_EN.test(s) || PROPOSE_HE.test(s))) return { kind: 'block', reason: 'no-proposal' };
    if (!extract) return { kind: 'block', reason: 'no-parser' };
    const at = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
    const date = extract.parseDate(s, at);
    const time = extract.parseTime(s);
    if (!date || !date.iso) return { kind: 'block', reason: 'no-day' };
    if (!time || time.hour == null) return { kind: 'block', reason: 'no-clock' };
    if (distinctClocks(s) > 1 || ALT.test(s)) return { kind: 'block', reason: 'several-times' };
    if (date.iso < isoOf(at)) return { kind: 'block', reason: 'past' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', dateIso: date.iso, hour: time.hour, minute: time.minute || 0 };
  }

  // The wall clock the person named, as an instant core/zoom-close.js accepts: the device's own UTC offset (minutes EAST of UTC,
  // i.e. -Date#getTimezoneOffset) is passed in by the host, never guessed here.
  function startIsoFor(r, offsetMinutes) {
    if (!r || typeof r.dateIso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.dateIso)) return null;
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < -720 || offsetMinutes > 840) return null;
    const sign = offsetMinutes < 0 ? '-' : '+';
    const a = Math.abs(offsetMinutes);
    return r.dateIso + 'T' + String(r.hour).padStart(2, '0') + ':' + String(r.minute || 0).padStart(2, '0') + ':00' + sign + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  }

  function topicFor(lang, name) {
    const who = String(name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
    if (lang === 'he') return who ? 'שיחת Zoom עם ' + who : 'שיחת Zoom';
    return who ? 'Zoom call with ' + who : 'Zoom call';
  }

  function whenLabel(r) {
    return r.dateIso + ' ' + String(r.hour).padStart(2, '0') + ':' + String(r.minute).padStart(2, '0');
  }

  // The plan: one Do It, nothing chosen for the person but the clock they named. Nobody is invited.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.now);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    return {
      action: 'offer',
      approval: 'DoIt',
      topic: topicFor(r.lang, input.senderName),
      when: { dateIso: r.dateIso, hour: r.hour, minute: r.minute },
      line: r.lang === 'he'
        ? 'ליצור שיחת Zoom ב-' + whenLabel(r) + ' ולבדוק שהיא קיימת?'
        : 'Create a Zoom meeting for ' + whenLabel(r) + ' and check it exists?',
      steps: [
        { id: 'create', kind: 'meeting', label: r.lang === 'he' ? 'יצירת הפגישה ב-Zoom ובדיקה חוזרת' : 'Create the meeting on Zoom and read it back', proof: SYSTEM },
        { id: 'share', kind: 'manual', label: r.lang === 'he' ? 'שליחת הקישור: על פי בחירתך, גלאנס לא שולח' : 'Share the link: your choice, Glance does not send' }
      ],
      lang: r.lang
    };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, enabled, recognize, plan, startIsoFor, topicFor };
})();

if (typeof module !== 'undefined') module.exports = { FlowZoomMeeting };
else if (typeof globalThis !== 'undefined') globalThis.FlowZoomMeeting = FlowZoomMeeting;
