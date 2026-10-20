// A video call with one day and one time becomes a calendar hold with a real
// Google Meet link (ecosystem gap "Meet link on a hold"). Portable: no chrome.*,
// no DOM, no network. Behind the off switch MEET_LINK (default off).
//
// The loop: "Can we do a video call tomorrow at 15:00?" / "נעשה שיחת וידאו מחר
// ב-15:00". The close is a calendar event that exists, at that clock, with a
// Meet link Google actually created. Glance offers it as one Do It. After the
// click it creates the event with conferenceData (hangoutsMeet) and
// sendUpdates=none, adds no attendee (so no invitation goes out from Glance),
// reads the event back by id, and says Handled only when the read-back shows
// the same title, the same instants and a meet.google.com link with a created
// conference. The link is shown to the person to share; Glance sends nothing.
// Undo deletes the event, and refuses when the person edited it since.
//
// Rules:
//   - one explicit proposal of a call with one day and one clock (Hebrew and
//     English); two clocks, an alternative ("or"), a past day, a hedge, a
//     negation, FYI and "ask Dana to set up a call" stay silent;
//   - another named tool (Zoom, Teams, Webex, WhatsApp call, a phone number)
//     is the other side's choice: silence, not a Meet link they did not ask for;
//   - no new scope: `calendar.events` already allows conferenceData.
//
// The host injects calendar(method, path, body?) -> Promise<{ status, ok, json }>
// against https://www.googleapis.com/calendar/v3 and an optional sleep(ms).
// No src/ file calls this yet.
const FlowMeetLink = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');
  const calendar = sibling(typeof FlowGoogleCalendar !== 'undefined' ? FlowGoogleCalendar : null, './google-calendar.js', 'FlowGoogleCalendar');

  const SWITCH = 'MEET_LINK';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/calendar';
  const CONNECTOR = 'googleMeet';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';
  const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
  const READ_BACK_DELAYS = [300, 600, 900, 1200, 1500];

  // The call: a video call, a Meet, a Hebrew "שיחת וידאו" / "פגישה במיט".
  const CALL = /\b(?:video\s*(?:call|chat|meeting|conference)|google\s*meet|meet\s+link|on\s+meet|via\s+meet|a\s+meet\b|online\s+meeting|virtual\s+meeting|remote\s+meeting|call\s+online)\b|שיחת\s+וידאו|שיחת\s+וידיאו|פגישת\s+וידאו|וידאו\s*קול|פגישה\s+(?:ב|דרך\s+|ב-)?(?:גוגל\s+)?מיט|גוגל\s+מיט|פגישה\s+אונליין|שיחה\s+אונליין|פגישה\s+מקוונת/i;
  // A proposal or request to set it up, not a mention of one.
  const PROPOSE_EN = /\b(?:let'?s|lets|can\s+we|could\s+we|shall\s+we|should\s+we|how\s+about|want\s+to|would\s+you\s+like\s+to|are\s+you\s+free\s+for|set\s+up|schedule|book|arrange|organi[sz]e|plan|hop\s+on|jump\s+on|do)\b/i;
  const PROPOSE_HE = /(?:בואו|בוא|נקבע|נתאם|נעשה|נדבר|נתפגש|אפשר|אפשרי|נוכל|תוכל|תוכלי|תוכלו|מוכן|מוכנה|נקים|תקבע|תקבעי|תקבעו|נארגן|נפגש|מתאים\s+לך|מתאים\s+לכם)/;
  const OTHER_TOOL = /\b(?:zoom|teams|webex|skype|whatsapp|slack\s+huddle|facetime|bluejeans|gotomeeting|jitsi|phone|telephone|dial[- ]in)\b|זום|טימס|וואטסאפ|וואצאפ|סקייפ|טלפון|בטלפון/i;
  const NEG = /\b(?:no need (?:for|to)|don'?t need (?:a|to)|do not need|not necessary|cancel|skip|without)\b[^.!?\n]{0,30}\b(?:call|meeting|meet|video)\b|אין\s+צורך\s+ב|לא\s+צריך\s+(?:שיחה|פגישה)|בלי\s+(?:שיחה|פגישה)|לבטל/i;
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
    if (lang === 'he') return who ? 'שיחת וידאו עם ' + who : 'שיחת וידאו';
    return who ? 'Video call with ' + who : 'Video call';
  }

  function whenLabel(r) {
    return r.dateIso + ' ' + String(r.hour).padStart(2, '0') + ':' + String(r.minute).padStart(2, '0');
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  // The plan: one Do It, nothing chosen for the person but the clock they named.
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.now);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const title = titleFor(r.lang, input.senderName);
    return {
      action: 'offer',
      approval: 'DoIt',
      title: title,
      when: { dateIso: r.dateIso, hour: r.hour, minute: r.minute },
      line: r.lang === 'he'
        ? 'לקבוע ביומן שיחת וידאו ב-' + whenLabel(r) + ' עם קישור Meet?'
        : 'Hold ' + whenLabel(r) + ' on your calendar with a Meet link?',
      steps: [
        { id: 'hold', kind: 'calendar', label: r.lang === 'he' ? 'יצירת האירוע עם קישור Meet ובדיקה חוזרת' : 'Create the event with a Meet link and read it back', proof: SYSTEM },
        { id: 'share', kind: 'manual', label: r.lang === 'he' ? 'שליחת הקישור: על פי בחירתך, גלאנס לא שולח' : 'Share the link: your choice, Glance does not send' }
      ],
      lang: r.lang
    };
  }

  function eventPath(id) {
    return '/calendars/primary/events/' + encodeURIComponent(id);
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function sleepOf(io) {
    return typeof io.sleep === 'function' ? io.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  }

  function hash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // What Undo compares: the parts of the event a person edits.
  function contentHash(ev) {
    const start = ev && ev.start ? String(ev.start.dateTime || ev.start.date || '') : '';
    const end = ev && ev.end ? String(ev.end.dateTime || ev.end.date || '') : '';
    const guests = ev && Array.isArray(ev.attendees) ? ev.attendees.length : 0;
    return hash([ev && ev.summary, ev && ev.description, ev && ev.location, start, end, guests].map((x) => String(x || '')).join('\n'));
  }

  // The Meet link the event really carries, or ''.
  function meetUrlOf(ev) {
    if (!ev) return '';
    const direct = ev.hangoutLink ? String(ev.hangoutLink) : '';
    if (MEET_URL.test(direct)) return direct;
    const entries = ev.conferenceData && Array.isArray(ev.conferenceData.entryPoints) ? ev.conferenceData.entryPoints : [];
    const video = entries.find((e) => e && e.entryPointType === 'video' && MEET_URL.test(String(e.uri || '')));
    return video ? String(video.uri) : '';
  }

  function conferenceReady(ev) {
    const status = ev && ev.conferenceData && ev.conferenceData.createRequest && ev.conferenceData.createRequest.status;
    if (status && status.statusCode && status.statusCode !== 'success') return false;
    return !!meetUrlOf(ev);
  }

  function sameInstant(a, b) {
    const x = Date.parse(a);
    const y = Date.parse(b);
    return Number.isFinite(x) && Number.isFinite(y) && x === y;
  }

  // Do It. The host passes the plan's title and clock as the person saw them.
  async function create(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    if (typeof io.calendar !== 'function') return miss('no-host');
    if (!calendar || typeof calendar.eventBody !== 'function') return miss('no-calendar-module');
    const w = input.when || {};
    const body = calendar.eventBody({ dateIso: w.dateIso, hour: w.hour, minute: w.minute, title: input.title, timeZone: input.timeZone });
    if (!body) return miss('unclear');
    if (Array.isArray(body.attendees) && body.attendees.length) return miss('would-invite');
    const requestId = 'glance-' + String(input.requestId || hash(body.summary + body.start.dateTime + (input.now || '')));
    const payload = Object.assign({}, body, {
      attendees: [],
      conferenceData: { createRequest: { requestId: requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    });
    const cal = io.calendar;
    const posted = await cal('POST', '/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none', payload);
    if (posted.status === 401 || posted.status === 403) return miss('not-connected');
    if (!posted.ok || !posted.json || !posted.json.id) return miss('write-failed');
    const id = posted.json.id;
    const ref = { eventId: id, externalId: id, createdByGlance: true };

    // The conference is made after the event: the read repeats while Google says pending.
    const sleep = sleepOf(io);
    const delays = Array.isArray(input.readBackDelays) ? input.readBackDelays : READ_BACK_DELAYS;
    let back = await cal('GET', eventPath(id) + '?conferenceDataVersion=1');
    for (let n = 0; n < delays.length && (!back.ok || !back.json || !conferenceReady(back.json)); n++) {
      if (back.ok && back.json && back.json.conferenceData && back.json.conferenceData.createRequest && back.json.conferenceData.createRequest.status && back.json.conferenceData.createRequest.status.statusCode === 'failure') break;
      await sleep(delays[n]);
      back = await cal('GET', eventPath(id) + '?conferenceDataVersion=1');
    }
    // Nothing is left in the calendar that the card does not own: an event
    // without a confirmed link is removed again, and if that fails the ref is kept for Undo.
    const withdraw = async (why) => {
      const gone = await cal('DELETE', eventPath(id) + '?sendUpdates=none');
      const removed = !!(gone.ok || gone.status === 204 || gone.status === 404 || gone.status === 410);
      return miss(FAILED, { ref: removed ? null : ref, removed: removed, why: why, eventId: id });
    };
    if (!back.ok || !back.json || back.json.id !== id || back.json.status === 'cancelled') return withdraw('get-' + back.status);
    const ev = back.json;
    if (String(ev.summary || '') !== String(body.summary)) return withdraw('title-differs');
    if (!ev.start || !sameInstant(ev.start.dateTime, body.start.dateTime) || !ev.end || !sameInstant(ev.end.dateTime, body.end.dateTime)) return withdraw('time-differs');
    if (!conferenceReady(ev)) return withdraw('no-meet-link');
    if (Array.isArray(ev.attendees) && ev.attendees.length) return withdraw('has-guests');
    const expected = String(input.expectAccount || '').trim().toLowerCase();
    const actual = String((ev.organizer && ev.organizer.email) || (ev.creator && ev.creator.email) || '').trim().toLowerCase();
    if (expected && actual && expected !== actual) return withdraw('wrong-account');

    const meetUrl = meetUrlOf(ev);
    const finalRef = Object.assign({}, ref, { contentHash: contentHash(ev), meetUrl: meetUrl });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: ev.htmlLink || '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef, meetUrl: meetUrl });
    const startIso = String(ev.start.dateTime);
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Google Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + ev.summary + ' · ' + startIso.slice(0, 10) + ' ' + startIso.slice(11, 16) + ' · Meet',
      meetUrl: meetUrl,
      url: ev.htmlLink && String(ev.htmlLink).slice(0, 8) === 'https://' ? ev.htmlLink : null,
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
    if (typeof io.calendar !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.calendar('GET', eventPath(ref.eventId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, undone: true, externalId: ref.eventId };
    if (!got.ok || !got.json) return { ok: false, reason: 'http-' + got.status };
    if (!ref.contentHash || contentHash(got.json) !== ref.contentHash) {
      return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'Undo stopped. You changed the event, so it was left as you left it.' };
    }
    const del = await io.calendar('DELETE', eventPath(ref.eventId) + '?sendUpdates=none');
    if (del.status === 401 || del.status === 403) return { ok: false, reason: 'not-connected' };
    if (!(del.ok || del.status === 204 || del.status === 404 || del.status === 410)) return { ok: false, reason: 'undo-failed' };
    const back = await io.calendar('GET', eventPath(ref.eventId));
    const gone = back.status === 404 || back.status === 410 || (back.ok && back.json && back.json.status === 'cancelled');
    return gone ? { ok: true, undone: true, externalId: ref.eventId } : { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, enabled, recognize, plan, create, undo, meetUrlOf, contentHash };
})();

if (typeof module !== 'undefined') module.exports = { FlowMeetLink };
else if (typeof globalThis !== 'undefined') globalThis.FlowMeetLink = FlowMeetLink;
