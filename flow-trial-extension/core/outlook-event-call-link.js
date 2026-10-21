// "Can you add a Teams link to the Thursday sync?" puts a Microsoft Teams join
// link on an event that is already on the person's Outlook calendar (the
// Microsoft twin of core/event-call-link.js). Portable: no chrome.*, no DOM, no
// network. Behind the off switch OUTLOOK_EVENT_CALL_LINK (default off).
//
// The close is an event the person organizes, with no online meeting yet, that
// now carries a Teams join link Microsoft created. Glance offers one Do It.
// After the click it PATCHes only isOnlineMeeting and the provider, reads the
// event back by id, and says Handled only when it carries a teams.microsoft.com
// (or teams.live.com) join link and the subject, start and guest list are exactly
// as before. Undo turns the online meeting off again, and refuses when the person
// changed anything else, or the link, since. Microsoft writes its own join block
// into the body; that block is not the person's text (see core/teams-meeting.js).
//
// Rules: one explicit request to add a call link (Hebrew and English); Zoom or
// Meet named, a hedge, a negation, FYI and a third party stay silent. Zero or
// several events that fit, an event the person does not organize, one that is
// already online, a cancelled or past one: silence. The event picking is the
// Google twin's, on a Graph event mapped to the same shape.
//
// The host injects graph(method, path, body?) -> Promise<{ status, ok, json }>
// against https://graph.microsoft.com/v1.0. `Calendars.ReadWrite` is the scope
// the Calendar box already asks; nothing new. Never Mail.Send. No src/ file
// calls this yet.
const FlowOutlookEventCallLink = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const google = sibling(typeof FlowEventCallLink !== 'undefined' ? FlowEventCallLink : null, './event-call-link.js', 'FlowEventCallLink');
  const teams = sibling(typeof FlowTeamsMeeting !== 'undefined' ? FlowTeamsMeeting : null, './teams-meeting.js', 'FlowTeamsMeeting');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'OUTLOOK_EVENT_CALL_LINK';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'microsoft/calendar';
  const CONNECTOR = 'outlookEventCallLink';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';
  const DELAYS = [300, 600, 900, 1200, 1500];
  const SELECT = '?$select=id,subject,body,start,end,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,webLink,location,isCancelled,isOrganizer';

  const LINK = '(?:microsoft\\s+)?(?:teams|video|call|conference|online)(?:\\s+(?:call|meeting|conference))?\\s+(?:link|invite)|(?:a|the)\\s+teams\\s+(?:call|meeting)\\b|teams\\s+link|(?:video|online)\\s+(?:call|meeting)\\s+link';
  const ASK_EN = new RegExp('\\b(?:add|attach|include|put|create|generate|set\\s+up|make)\\s+(?:in\\s+)?(?:a|an|the|one)?\\s*(?:new\\s+)?(?:' + LINK + ')\\b|\\b(?:add|attach|include|put)\\s+(?:a\\s+)?teams\\s+(?:to|on|in)\\b|\\bmake\\s+(?:it|this|the\\s+[\\w\\s]{1,30}?)\\s+(?:a\\s+)?(?:video\\s+call|teams\\s+(?:call|meeting))\\b', 'i');
  const ASK_HE = /(?:תוסיף(?:י|ו)?|הוסף(?:י|ו)?|להוסיף|לצרף|תצרף(?:י|ו)?|צרף|תיצור|תיצרי|תכניס(?:י|ו)?)\s+(?:לו\s+|לה\s+)?(?:בבקשה\s+)?(?:קישור|לינק)\s+(?:ל)?(?:טימס|טים?ס|שיחת\s+וידאו|וידאו|שיחה)/;
  const OTHER_TOOL = /\b(?:zoom|meet|webex|skype|whatsapp|facetime|bluejeans|gotomeeting|jitsi|phone|dial[- ]in)\b|זום|מיט|וואטסאפ|סקייפ|טלפון/i;
  const NEG = /\b(?:no need (?:for|to)|don'?t (?:need|add)|do not add|without)\b|אין\s+צורך|אל\s+תוסיף|לא\s+צריך|בלי\s+(?:קישור|לינק)/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if possible|might|sometime)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|אם\s+אפשר/i;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:add|attach|include|put|create)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const ASKS = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|we need you to|let'?s|need)\b|^\s*(?:add|attach|include|put|create)\b|בבקשה|אפשר|תוכל|תוכלי|תוכלו|^\s*(?:תוסיף|הוסף|תצרף|צרף)/i;

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The ask, or silence with a reason. Day and words come from the Google twin.
  function recognize(text, now) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim() || !(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'ignore' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (OTHER_TOOL.test(s)) return { kind: 'block', reason: 'other-tool' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    if (!ASKS.test(s)) return { kind: 'block', reason: 'no-request' };
    if (!google) return { kind: 'block', reason: 'no-parser' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', dayIso: google.dayOf(s, now), words: google.words(s) };
  }

  // A Graph event in the shape the Google twin picks from.
  function asGoogle(ev) {
    return {
      id: ev && ev.id,
      summary: ev && ev.subject,
      status: ev && ev.isCancelled === true ? 'cancelled' : 'confirmed',
      start: { dateTime: ev && ev.start && ev.start.dateTime },
      organizer: { self: !!(ev && ev.isOrganizer === true) },
      hangoutLink: ev && ev.isOnlineMeeting === true ? 'online' : ''
    };
  }

  function pickEvent(events, ask, now) {
    if (!Array.isArray(events)) return { reason: 'not-searched' };
    if (!google) return { reason: 'no-parser' };
    return google.pickEvent(events.map(asGoogle), ask, now);
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.now);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const picked = pickEvent(input.events, r, input.now);
    if (!picked.event) return silence(picked.reason);
    const ev = picked.event;
    const he = r.lang === 'he';
    return {
      action: 'offer',
      approval: 'DoIt',
      event: ev,
      line: he ? 'להוסיף קישור Teams לאירוע: ' + ev.summary + ' (' + ev.day + ')?' : 'Add a Teams link to the event: ' + ev.summary + ' (' + ev.day + ')?',
      steps: [{ id: 'link', kind: 'calendar', label: he ? 'יצירת קישור Teams על האירוע ובדיקה חוזרת' : 'Create a Teams link on the event and read it back', proof: SYSTEM }],
      lang: r.lang
    };
  }

  function eventPath(id) {
    return '/me/events/' + encodeURIComponent(id);
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  function joinUrlOf(ev) {
    return teams && teams.joinUrlOf ? teams.joinUrlOf(ev) : '';
  }

  function hashOf(ev) {
    return teams && teams.contentHash ? teams.contentHash(ev) : '';
  }

  // Do It. The host passes the plan's event as the person saw it.
  async function addLink(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const id = input.event && input.event.id;
    if (!id) return miss('invalid');
    if (typeof io.graph !== 'function') return miss('no-host');
    if (!teams) return miss('no-teams-module');
    const graph = io.graph;
    const got = await graph('GET', eventPath(id) + SELECT);
    if (got.status === 401 || got.status === 403) return miss('not-connected');
    if (!got.ok || !got.json || got.json.isCancelled === true) return miss('event-gone');
    const before = got.json;
    if (before.isOrganizer !== true) return miss('not-yours');
    // The person made it online themselves since the card was drawn: never replace it.
    if (before.isOnlineMeeting === true) return miss('already-has-link');
    const beforeHash = hashOf(before);
    const patch = await graph('PATCH', eventPath(id), { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' });
    if (patch.status === 401 || patch.status === 403) return miss('not-connected');
    if (!patch.ok) return miss('write-failed');
    const ref = { eventId: id, externalId: id, createdByGlance: true, before: beforeHash };
    const sleep = typeof io.sleep === 'function' ? io.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
    const delays = Array.isArray(input.readBackDelays) ? input.readBackDelays : DELAYS;
    let back = await graph('GET', eventPath(id) + SELECT);
    for (let n = 0; n < delays.length && !(back.ok && back.json && joinUrlOf(back.json)); n++) {
      await sleep(delays[n]);
      back = await graph('GET', eventPath(id) + SELECT);
    }
    // Without a created link nothing is claimed. The event is the person's own, so it
    // stays; only the online meeting is turned off again.
    if (!back.ok || !back.json || back.json.id !== id || !joinUrlOf(back.json)) {
      await graph('PATCH', eventPath(id), { isOnlineMeeting: false });
      return miss(FAILED, { ref: null, why: 'no-teams-link', eventId: id });
    }
    const ev = back.json;
    if (hashOf(ev) !== beforeHash) return miss(FAILED, { ref: ref, why: 'event-changed' });
    const joinUrl = joinUrlOf(ev);
    const finalRef = Object.assign({}, ref, { joinUrl: joinUrl });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = ev.webLink && String(ev.webLink).slice(0, 8) === 'https://' ? ev.webLink : '';
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: url, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef, joinUrl: joinUrl });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Outlook Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + (ev.subject || 'event') + ' · Teams',
      joinUrl: joinUrl,
      url: url || null,
      proof: proof,
      ref: finalRef,
      // The link exists on the event. Sending it to anyone is the person's step.
      loopClosed: true
    };
  }

  // Undo: turn the online meeting off again, only while the event is still as Glance left it.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.eventId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.graph !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.graph('GET', eventPath(ref.eventId) + SELECT);
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, undone: true, externalId: ref.eventId };
    if (!got.ok || !got.json) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (!ref.before || !ref.joinUrl) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (joinUrlOf(got.json) !== ref.joinUrl) return { ok: false, reason: 'link-changed', undoUnavailable: true, error: 'You changed this. Undo left it alone.' };
    if (hashOf(got.json) !== ref.before) return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    const patch = await io.graph('PATCH', eventPath(ref.eventId), { isOnlineMeeting: false });
    if (patch.status === 401 || patch.status === 403) return { ok: false, reason: 'not-connected' };
    if (!patch.ok) return { ok: false, reason: 'undo-failed' };
    const after = await io.graph('GET', eventPath(ref.eventId) + SELECT);
    if (after.ok && after.json && after.json.isOnlineMeeting !== true) return { ok: true, undone: true, externalId: ref.eventId };
    return { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, enabled, recognize, pickEvent, plan, addLink, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookEventCallLink };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookEventCallLink = FlowOutlookEventCallLink;
