// A call proposed in Outlook mail, with one day and one time, becomes a calendar
// hold with a real Microsoft Teams join link (ecosystem gap "Teams meeting link").
// Portable: no chrome.*, no DOM, no network. Behind the off switch TEAMS_MEETING
// (default off). The Outlook counterpart of core/meet-link.js.
//
// The loop: "Can we do a Teams call tomorrow at 15:00?" / "נעשה שיחה בטימס מחר
// ב-15:00". The close is a calendar event that exists, at that clock, with a
// Teams join link Microsoft actually created. Glance offers it as one Do It.
// After the click it posts the event with isOnlineMeeting and no attendee (so no
// invitation goes out from Glance), reads it back by id, and says Handled only
// when the read-back shows the same subject, the same wall clock and a
// teams.microsoft.com (or teams.live.com) join link. Otherwise the event is
// withdrawn. The link is shown to the person to share; Glance sends nothing.
// Undo deletes the event, and refuses when the person edited it since.
//
// Rules:
//   - one explicit proposal of a call with one day and one clock (Hebrew and
//     English); a generic "video call" and a named Teams call both count (the
//     mailbox is Outlook); two clocks, an alternative, a past day, a hedge, a
//     negation, FYI and "ask Dana to set up a call" stay silent;
//   - another named tool (Zoom, Meet, Webex, WhatsApp call, a phone number) is
//     the other side's choice: silence, not a Teams link they did not ask for;
//   - no new scope: the Calendar box already asks `Calendars.ReadWrite`, and
//     an online meeting event needs nothing more.
//
// The host injects graph(method, path, body?) -> Promise<{ status, ok, json }>
// against https://graph.microsoft.com/v1.0 and an optional sleep(ms).
// No src/ file calls this yet.
const FlowTeamsMeeting = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const outlookCal = sibling(typeof FlowOutlookCalendar !== 'undefined' ? FlowOutlookCalendar : null, './outlook-calendar.js', 'FlowOutlookCalendar');

  const SWITCH = 'TEAMS_MEETING';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'microsoft/calendar';
  const CONNECTOR = 'teamsMeeting';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';
  const JOIN_URL = /^https:\/\/(?:teams\.microsoft\.com\/l\/meetup-join\/[^\s]+|teams\.live\.com\/meet\/[^\s]+)$/;
  const READ_BACK_DELAYS = [300, 600, 900, 1200, 1500];

  // The call: a video call, a Teams call, a Hebrew "שיחת וידאו" / "פגישה בטימס".
  const CALL = /\b(?:video\s*(?:call|chat|meeting|conference)|teams\s+(?:call|meeting|link|session)|call\s+on\s+teams|meet(?:ing)?\s+(?:on|in|via|over)\s+teams|online\s+meeting|virtual\s+meeting|remote\s+meeting|call\s+online)\b|שיחת\s+וידאו|שיחת\s+וידיאו|פגישת\s+וידאו|(?:שיחה|פגישה)\s+(?:ב|דרך\s+|ב-)?(?:מיקרוסופט\s+)?(?:טימס|טימז)|פגישה\s+אונליין|שיחה\s+אונליין|פגישה\s+מקוונת/i;
  const PROPOSE_EN = /\b(?:let'?s|lets|can\s+we|could\s+we|shall\s+we|should\s+we|how\s+about|want\s+to|would\s+you\s+like\s+to|are\s+you\s+free\s+for|set\s+up|schedule|book|arrange|organi[sz]e|plan|hop\s+on|jump\s+on|do)\b/i;
  const PROPOSE_HE = /(?:בואו|בוא|נקבע|נתאם|נעשה|נדבר|נתפגש|אפשר|אפשרי|נוכל|תוכל|תוכלי|תוכלו|מוכן|מוכנה|נקים|תקבע|תקבעי|תקבעו|נארגן|נפגש|מתאים\s+לך|מתאים\s+לכם)/;
  const OTHER_TOOL = /\b(?:zoom|google\s*meet|meet\s+link|webex|skype|whatsapp|slack\s+huddle|facetime|bluejeans|gotomeeting|jitsi|phone|telephone|dial[- ]in)\b|זום|מיט\b|גוגל\s+מיט|וואטסאפ|וואצאפ|סקייפ|טלפון|בטלפון/i;
  const NEG = /\b(?:no need (?:for|to)|don'?t need (?:a|to)|do not need|not necessary|cancel|skip|without)\b[^.!?\n]{0,30}\b(?:call|meeting|meet|video|teams)\b|אין\s+צורך\s+ב|לא\s+צריך\s+(?:שיחה|פגישה)|בלי\s+(?:שיחה|פגישה)|לבטל/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|no pressure|someday|sometime|at some point|whenever|one day)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|מתישהו/i;
  const FYI = /\b(?:fyi|for your information|no action needed|here is the recording|recording of)\b|לידיעתך|לידיעה|הקלטה\s+של/i;
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
    return {
      kind: 'clear',
      lang: /[֐-׿]/.test(s) ? 'he' : 'en',
      dateIso: date.iso,
      hour: time.hour,
      minute: time.minute || 0
    };
  }

  function titleFor(lang, name) {
    const who = String(name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
    if (lang === 'he') return who ? 'שיחת Teams עם ' + who : 'שיחת Teams';
    return who ? 'Teams call with ' + who : 'Teams call';
  }

  function whenLabel(r) {
    return r.dateIso + ' ' + String(r.hour).padStart(2, '0') + ':' + String(r.minute).padStart(2, '0');
  }

  // The plan: one Do It, nothing chosen for the person but the clock they named.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.now);
    if (r.kind !== 'clear') return { action: 'silence', reason: r.reason || 'no-ask' };
    const title = titleFor(r.lang, input.senderName);
    return {
      action: 'offer',
      approval: 'DoIt',
      title: title,
      when: { dateIso: r.dateIso, hour: r.hour, minute: r.minute },
      line: r.lang === 'he'
        ? 'לקבוע ביומן שיחה ב-' + whenLabel(r) + ' עם קישור Teams?'
        : 'Hold ' + whenLabel(r) + ' on your calendar with a Teams link?',
      steps: [
        { id: 'hold', kind: 'calendar', label: r.lang === 'he' ? 'יצירת האירוע עם קישור Teams ובדיקה חוזרת' : 'Create the event with a Teams link and read it back', proof: SYSTEM },
        { id: 'share', kind: 'manual', label: r.lang === 'he' ? 'שליחת הקישור: על פי בחירתך, גלאנס לא שולח' : 'Share the link: your choice, Glance does not send' }
      ],
      lang: r.lang
    };
  }

  function eventPath(id) {
    return '/me/events/' + encodeURIComponent(id);
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function sleepOf(io) {
    return typeof io.sleep === 'function' ? io.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  }

  // The Teams join link the event really carries, or ''.
  function joinUrlOf(ev) {
    if (!ev || ev.isOnlineMeeting !== true) return '';
    const url = ev.onlineMeeting && ev.onlineMeeting.joinUrl ? String(ev.onlineMeeting.joinUrl) : '';
    return JOIN_URL.test(url) ? url : '';
  }

  // What Undo compares: the parts of the event a person edits.
  function hashText(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function contentHash(ev) {
    const start = ev && ev.start ? String(ev.start.dateTime || '').slice(0, 19) : '';
    const end = ev && ev.end ? String(ev.end.dateTime || '').slice(0, 19) : '';
    const guests = ev && Array.isArray(ev.attendees) ? ev.attendees.length : 0;
    const bodyText = ev && ev.body ? String(ev.body.content || '') : '';
    // Microsoft adds the join block to the body itself; the agenda a person
    // types is what changes the hash, so the join block is not compared.
    const plain = bodyText.replace(/<[^>]*>/g, ' ').replace(/_{5,}[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
    return hashText([ev && ev.subject, plain, ev && ev.location && ev.location.displayName, start, end, guests].map((x) => String(x || '')).join('\n'));
  }

  // Graph returns the wall clock of the zone asked for, with seven fraction digits.
  function sameWall(a, b) {
    return String(a || '').slice(0, 16) === String(b || '').slice(0, 16);
  }

  // Do It. The host passes the plan's title and clock as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.graph !== 'function') return miss('no-host');
    if (!outlookCal || typeof outlookCal.meetingBody !== 'function') return miss('no-calendar-module');
    if (outlookCal.hasWriteScope && input.grantedScopes != null && !outlookCal.hasWriteScope(input.grantedScopes)) return miss('no-calendar-scope');
    const w = input.when || {};
    const base = outlookCal.meetingBody({ dateIso: w.dateIso, hour: w.hour, minute: w.minute, title: input.title, timeZone: input.timeZone });
    if (!base) return miss('unclear');
    if (Array.isArray(base.attendees) && base.attendees.length) return miss('would-invite');
    // Plain text body: the person's own agenda is theirs to add later.
    const payload = Object.assign({}, base, {
      attendees: [],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness'
    });
    const graph = io.graph;
    const posted = await graph('POST', '/me/events', payload);
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.id) return miss('write-failed');
    const id = posted.json.id;
    const ref = { eventId: id, externalId: id, createdByGlance: true };

    // The online meeting is attached after the event: the read repeats until the link shows.
    const sleep = sleepOf(io);
    const delays = Array.isArray(input.readBackDelays) ? input.readBackDelays : READ_BACK_DELAYS;
    const readPath = eventPath(id) + '?$select=id,subject,body,start,end,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,webLink,location,organizer,isCancelled';
    let back = await graph('GET', readPath);
    for (let n = 0; n < delays.length && (!back.ok || !back.json || !joinUrlOf(back.json)); n++) {
      await sleep(delays[n]);
      back = await graph('GET', readPath);
    }
    // Nothing is left in the calendar that the card does not own: an event
    // without a confirmed link is removed again, and if that fails the ref is kept for Undo.
    const withdraw = async (why) => {
      const gone = await graph('DELETE', eventPath(id));
      const removed = !!(gone.ok || gone.status === 204 || gone.status === 404 || gone.status === 410);
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, eventId: id });
    };
    if (!back.ok || !back.json || back.json.id !== id || back.json.isCancelled === true) return withdraw('get-' + back.status);
    const ev = back.json;
    if (String(ev.subject || '') !== String(base.subject)) return withdraw('title-differs');
    if (!ev.start || !sameWall(ev.start.dateTime, base.start.dateTime) || !ev.end || !sameWall(ev.end.dateTime, base.end.dateTime)) return withdraw('time-differs');
    const joinUrl = joinUrlOf(ev);
    if (!joinUrl) return withdraw('no-teams-link');
    if (Array.isArray(ev.attendees) && ev.attendees.length) return withdraw('has-guests');
    const expected = String(input.expectAccount || '').trim().toLowerCase();
    const actual = String((ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.address) || '').trim().toLowerCase();
    if (expected && actual && expected !== actual) return withdraw('wrong-account');

    const finalRef = Object.assign({}, ref, { contentHash: contentHash(ev), joinUrl: joinUrl });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: ev.webLink && String(ev.webLink).slice(0, 8) === 'https://' ? ev.webLink : '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef, joinUrl: joinUrl });
    const startIso = String(ev.start.dateTime);
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Outlook Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + ev.subject + ' · ' + startIso.slice(0, 10) + ' ' + startIso.slice(11, 16) + ' · Teams',
      joinUrl: joinUrl,
      url: ev.webLink && String(ev.webLink).slice(0, 8) === 'https://' ? ev.webLink : null,
      proof: proof,
      ref: finalRef,
      // The event with its link exists: the hold is done. Whether the call
      // happens is the other person's answer, so the ask is not closed here.
      loopClosed: false,
      stepClosed: 'hold'
    };
  }

  // Undo: delete the event, only while it is still the one Glance made.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.eventId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.graph !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.graph('GET', eventPath(ref.eventId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, undone: true, externalId: ref.eventId };
    if (!got.ok || !got.json) return { ok: false, reason: 'http-' + got.status };
    if (!ref.contentHash || contentHash(got.json) !== ref.contentHash) {
      return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'Undo stopped. You changed the event, so it was left as you left it.' };
    }
    const del = await io.graph('DELETE', eventPath(ref.eventId));
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!(del.ok || del.status === 204 || del.status === 404 || del.status === 410)) return { ok: false, reason: 'undo-failed' };
    const back = await io.graph('GET', eventPath(ref.eventId));
    const gone = back.status === 404 || back.status === 410 || (back.ok && back.json && back.json.isCancelled === true);
    return gone ? { ok: true, undone: true, externalId: ref.eventId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, enabled, recognize, plan, create, undo, joinUrlOf, contentHash };
})();

if (typeof module !== 'undefined') module.exports = { FlowTeamsMeeting };
else if (typeof globalThis !== 'undefined') globalThis.FlowTeamsMeeting = FlowTeamsMeeting;
