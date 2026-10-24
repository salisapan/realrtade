// "Can you add a Meet link to the Thursday sync?" puts a Google Meet link on an
// event that is already on the person's calendar (ecosystem gap: a link on an
// existing event). Portable: no chrome.*, no DOM, no network. Behind the off
// switch EVENT_CALL_LINK (default off).
//
// The close is an event the person organizes, with no call link yet, that now
// carries a Meet link Google created. Glance finds the one event that fits (the
// day the mail names, or the words it names) among events the person organizes,
// and offers one Do It. After the click it PATCHes only the conference request
// (sendUpdates=none: no email goes out from Glance; guests' own calendars show
// the link the way they show any edit), reads the event back by id and says
// Handled only when it carries a created meet.google.com link and the title,
// start and guest list are exactly as before. Undo removes only the conference,
// and refuses when the person changed anything else, or the link, since.
//
// Rules:
//   - one explicit request to add a call link (Hebrew and English); a hedge, a
//     negation, FYI, a third party and another named tool (Zoom, Teams) stay
//     silent;
//   - zero or several events that fit, an event the person does not organize,
//     one that already has a call link, a cancelled or past one: silence.
//
// The host injects calendar(method, path, body?) -> Promise<{ status, ok, json }>
// against https://www.googleapis.com/calendar/v3. `calendar.events` is already
// granted; no new scope. No src/ file calls this yet.
const FlowEventCallLink = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'EVENT_CALL_LINK';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/calendar';
  const CONNECTOR = 'eventCallLink';
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';
  const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
  const DELAYS = [300, 600, 900, 1200, 1500];

  const LINK = '(?:google\\s+)?(?:meet|video|call|conference|zoom|online)(?:\\s+(?:call|meeting|link|conference))?\\s+(?:link|invite)|(?:a|the)\\s+(?:google\\s+)?meet\\b|(?:video|online)\\s+(?:call|meeting)\\s+link|meet\\s+link';
  const ASK_EN = new RegExp('\\b(?:add|attach|include|put|create|generate|set\\s+up|make)\\s+(?:in\\s+)?(?:a|an|the|one)?\\s*(?:new\\s+)?(?:' + LINK + ')\\b|\\b(?:add|attach|include|put)\\s+(?:a\\s+)?(?:google\\s+)?meet\\s+(?:to|on|in)\\b|\\bmake\\s+(?:it|this|the\\s+[\\w\\s]{1,30}?)\\s+(?:a\\s+)?(?:video\\s+call|google\\s+meet)\\b', 'i');
  const ASK_HE = /(?:תוסיף(?:י|ו)?|הוסף(?:י|ו)?|להוסיף|לצרף|תצרף(?:י|ו)?|צרף|תיצור|תיצרי|תכניס(?:י|ו)?)\s+(?:לו\s+|לה\s+)?(?:בבקשה\s+)?(?:קישור|לינק)\s+(?:ל)?(?:מיט|גוגל\s+מיט|שיחת\s+וידאו|וידאו|שיחה)|(?:תוסיף(?:י|ו)?|הוסף(?:י|ו)?)\s+(?:בבקשה\s+)?(?:גוגל\s+)?מיט\s+ל/;
  const OTHER_TOOL = /\b(?:zoom|teams|webex|skype|whatsapp|facetime|bluejeans|gotomeeting|jitsi|phone|dial[- ]in)\b|זום|טימס|וואטסאפ|סקייפ|טלפון/i;
  const NEG = /\b(?:no need (?:for|to)|don'?t (?:need|add)|do not add|without)\b|אין\s+צורך|אל\s+תוסיף|לא\s+צריך|בלי\s+(?:קישור|לינק)/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|if you'?d like|if possible|might|sometime)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך|אם\s+אפשר/i;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעתך|לידיעה/i;
  const THIRD = /\b(?:ask|have|get|tell|let)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+(?:to\s+)?(?:add|attach|include|put|create)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;
  const ASKS = /\b(?:please|can you|could you|would you|will you|kindly|i need you to|we need you to|let'?s|need)\b|^\s*(?:add|attach|include|put|create)\b|בבקשה|אפשר|תוכל|תוכלי|תוכלו|^\s*(?:תוסיף|הוסף|תצרף|צרף)/i;
  const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const STOP = { please: 1, add: 1, attach: 1, include: 1, put: 1, create: 1, make: 1, generate: 1, meet: 1, google: 1, video: 1, call: 1, link: 1, invite: 1, meeting: 1, online: 1, conference: 1, the: 1, for: 1, and: 1, this: 1, that: 1, with: 1, can: 1, you: 1, could: 1, would: 1, will: 1, event: 1, next: 1, week: 1, teams: 1, microsoft: 1, טימס: 1, tomorrow: 1, today: 1, tonight: 1, jan: 1, feb: 1, mar: 1, apr: 1, may: 1, jun: 1, jul: 1, aug: 1, sep: 1, oct: 1, nov: 1, dec: 1, בקשה: 1, אפשר: 1, הוסיף: 1, צרף: 1, ידאו: 1, מחר: 1, היום: 1, תוסיף: 1, הוסף: 1, תצרף: 1, בבקשה: 1, קישור: 1, לינק: 1, מיט: 1, גוגל: 1, שיחת: 1, וידאו: 1, את: 1, של: 1, עם: 1, ביום: 1, יום: 1, ראשון: 1, שני: 1, שלישי: 1, רביעי: 1, חמישי: 1, שישי: 1, monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1 };

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function isoOf(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function dayOf(text, now) {
    const at = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
    const parsed = extract ? extract.parseDate(text, at) : null;
    if (parsed && parsed.iso) return parsed.iso;
    const m = String(text).match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (!m) return null;
    const want = WEEKDAYS[m[1].toLowerCase()];
    const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    let add = (want - d.getUTCDay() + 7) % 7;
    if (add === 0) add = 7;
    d.setUTCDate(d.getUTCDate() + add);
    return isoOf(d);
  }

  function words(text) {
    return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ')
      .map((w) => w.replace(/^(?:ל|ב|ה|ו)(?=[֐-׿]{3})/, ''))
      .filter((w) => w.length >= 3 && !STOP[w] && !/^\d+$/.test(w));
  }

  // The ask, or silence with a reason.
  function recognize(text, now) {
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim() || !(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'ignore' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (OTHER_TOOL.test(s)) return { kind: 'block', reason: 'other-tool' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    if (!ASKS.test(s)) return { kind: 'block', reason: 'no-request' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', dayIso: dayOf(s, now), words: words(s) };
  }

  function startIso(ev) {
    const s = ev && ev.start ? (ev.start.dateTime || ev.start.date || '') : '';
    return String(s).slice(0, 10);
  }

  function hasCall(ev) {
    return !!(ev && (ev.hangoutLink || (ev.conferenceData && ((ev.conferenceData.entryPoints || []).length || ev.conferenceData.conferenceId))));
  }

  function meetUrlOf(ev) {
    if (!ev) return '';
    if (MEET_URL.test(String(ev.hangoutLink || ''))) return String(ev.hangoutLink);
    const entries = ev.conferenceData && Array.isArray(ev.conferenceData.entryPoints) ? ev.conferenceData.entryPoints : [];
    const video = entries.find((e) => e && e.entryPointType === 'video' && MEET_URL.test(String(e.uri || '')));
    return video ? String(video.uri) : '';
  }

  // Events the host listed for the coming weeks → the one event that fits.
  function pickEvent(events, ask, now) {
    if (!Array.isArray(events)) return { reason: 'not-searched' };
    const todayIso = isoOf(now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now()));
    const mine = events.filter((ev) => ev && typeof ev.id === 'string' && ev.status !== 'cancelled' && ev.organizer && ev.organizer.self === true && startIso(ev) >= todayIso);
    const stem = (w) => (/[֐-׿]/.test(w) && w.length >= 4 ? w.replace(/[הת]$/, '') : w);
    const titled = (ev) => {
      const t = words(ev.summary).map(stem);
      return ask.words.map(stem).some((w) => t.some((x) => x === w || (w.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0))));
    };
    let fits;
    if (ask.dayIso) {
      fits = mine.filter((ev) => startIso(ev) === ask.dayIso);
      if (fits.length > 1) {
        const named = fits.filter(titled);
        if (named.length === 0) return { reason: 'conflict' };
        fits = named;
      }
    } else {
      fits = mine.filter(titled);
    }
    if (fits.length === 0) return { reason: 'none' };
    if (fits.length > 1) return { reason: 'conflict' };
    if (hasCall(fits[0])) return { reason: 'already-has-link' };
    return { event: { id: fits[0].id, summary: fits[0].summary || '', day: startIso(fits[0]) } };
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
      line: he ? 'להוסיף קישור Meet לאירוע: ' + ev.summary + ' (' + ev.day + ')?' : 'Add a Meet link to the event: ' + ev.summary + ' (' + ev.day + ')?',
      steps: [{ id: 'link', kind: 'calendar', label: he ? 'יצירת קישור Meet על האירוע ובדיקה חוזרת' : 'Create a Meet link on the event and read it back', proof: SYSTEM }],
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

  // What the person edits, with the call link left out on purpose.
  function contentHash(ev) {
    const start = ev && ev.start ? String(ev.start.dateTime || ev.start.date || '') : '';
    const end = ev && ev.end ? String(ev.end.dateTime || ev.end.date || '') : '';
    const guests = ev && Array.isArray(ev.attendees) ? ev.attendees.map((a) => String(a && a.email || '').toLowerCase()).sort().join(',') : '';
    const rule = ev && Array.isArray(ev.recurrence) ? ev.recurrence.join('|') : '';
    return hash([ev && ev.summary, ev && ev.description, ev && ev.location, start, end, guests, rule].map((x) => String(x || '')).join('\n'));
  }

  function ready(ev) {
    const status = ev && ev.conferenceData && ev.conferenceData.createRequest && ev.conferenceData.createRequest.status;
    if (status && status.statusCode && status.statusCode !== 'success') return false;
    return !!meetUrlOf(ev);
  }

  // The Google lane hands its writers an http function (req -> { status, ok, json }); the module
  // itself speaks calendar(method, path, body). Either is accepted.
  const CAL_API = 'https://www.googleapis.com/calendar/v3';
  function ioOf(arg) {
    if (typeof arg !== 'function') return arg || {};
    return {
      calendar: (method, path, body) => arg({
        method: method,
        url: CAL_API + path,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }
      })
    };
  }

  // The lane's writer signature: (input, http, clock).
  function write(input, http) {
    return addLink(input, http);
  }

  // Do It. The host passes the plan's event as the person saw it.
  async function addLink(input, io) {
    input = input || {};
    io = ioOf(io);
    if (!enabled(input.flags)) return miss('switch-off');
    const id = input.event && input.event.id;
    if (!id) return miss('invalid');
    if (typeof io.calendar !== 'function') return miss('no-host');
    const cal = io.calendar;
    const got = await cal('GET', eventPath(id));
    if (got.status === 401 || got.status === 403) return miss('not-connected');
    if (!got.ok || !got.json || got.json.status === 'cancelled') return miss('event-gone');
    const before = got.json;
    if (!(before.organizer && before.organizer.self === true)) return miss('not-yours');
    // The person added a call link themselves since the card was drawn: never replace it.
    if (hasCall(before)) return miss('already-has-link');
    const beforeHash = contentHash(before);
    const requestId = 'glance-' + hash(id + String(input.now || ''));
    const patch = await cal('PATCH', eventPath(id) + '?conferenceDataVersion=1&sendUpdates=none', {
      conferenceData: { createRequest: { requestId: requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    });
    if (patch.status === 401 || patch.status === 403) return miss('not-connected');
    if (!patch.ok) return miss('write-failed');
    const ref = { eventId: id, externalId: id, createdByGlance: true, before: beforeHash };
    const sleep = typeof io.sleep === 'function' ? io.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
    const delays = Array.isArray(input.readBackDelays) ? input.readBackDelays : DELAYS;
    let back = await cal('GET', eventPath(id) + '?conferenceDataVersion=1');
    for (let n = 0; n < delays.length && !(back.ok && back.json && ready(back.json)); n++) {
      const st = back.ok && back.json && back.json.conferenceData && back.json.conferenceData.createRequest && back.json.conferenceData.createRequest.status;
      if (st && st.statusCode === 'failure') break;
      await sleep(delays[n]);
      back = await cal('GET', eventPath(id) + '?conferenceDataVersion=1');
    }
    // Without a created link, nothing is claimed. The event is the person's own, so
    // it stays; only the conference request is taken off if one is half there.
    if (!back.ok || !back.json || back.json.id !== id || !ready(back.json)) {
      await cal('PATCH', eventPath(id) + '?conferenceDataVersion=1&sendUpdates=none', { conferenceData: null });
      return miss(FAILED, { ref: null, why: 'no-meet-link', eventId: id });
    }
    const ev = back.json;
    if (contentHash(ev) !== beforeHash) return miss(FAILED, { ref: ref, why: 'event-changed' });
    const meetUrl = meetUrlOf(ev);
    const finalRef = Object.assign({}, ref, { meetUrl: meetUrl, after: contentHash(ev) });
    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const url = ev.htmlLink && String(ev.htmlLink).slice(0, 8) === 'https://' ? ev.htmlLink : '';
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: url, fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: finalRef, meetUrl: meetUrl });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Google Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + (ev.summary || 'event') + ' · Meet',
      meetUrl: meetUrl,
      joinUrl: meetUrl,
      url: url || null,
      proof: proof,
      ref: finalRef,
      // The link exists on the event. Sending it to anyone is the person's step.
      loopClosed: true
    };
  }

  // Undo: take the conference off again, only while the event is still as Glance left it.
  async function undo(ref, io) {
    io = ioOf(io);
    if (!ref || !ref.eventId || ref.createdByGlance !== true) return { ok: false, reason: 'not-ours' };
    if (typeof io.calendar !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.calendar('GET', eventPath(ref.eventId) + '?conferenceDataVersion=1');
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (got.status === 404 || got.status === 410) return { ok: true, undone: true, externalId: ref.eventId };
    if (!got.ok || !got.json) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    if (!ref.before || !ref.meetUrl) return { ok: false, reason: 'unconfirmed', error: "Couldn't confirm it's unchanged. Undo left it alone." };
    // The link must still be the one Glance made, and nothing else may have changed.
    if (meetUrlOf(got.json) !== ref.meetUrl) return { ok: false, reason: 'link-changed', undoUnavailable: true, error: 'You changed this. Undo left it alone.' };
    if (contentHash(got.json) !== ref.before) return { ok: false, reason: 'user-edited', undoUnavailable: true, error: 'You edited this. Undo left it alone.' };
    const patch = await io.calendar('PATCH', eventPath(ref.eventId) + '?conferenceDataVersion=1&sendUpdates=none', { conferenceData: null });
    if (patch.status === 401 || patch.status === 403) return { ok: false, reason: 'not-connected' };
    if (!patch.ok) return { ok: false, reason: 'undo-failed' };
    const after = await io.calendar('GET', eventPath(ref.eventId) + '?conferenceDataVersion=1');
    if (after.ok && after.json && !hasCall(after.json)) return { ok: true, undone: true, externalId: ref.eventId };
    return { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, enabled, recognize, dayOf, words, pickEvent, plan, addLink, write, undo, contentHash, meetUrlOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowEventCallLink };
else if (typeof globalThis !== 'undefined') globalThis.FlowEventCallLink = FlowEventCallLink;
