// Answer an invite that is already on the person's calendar (close map row C5).
// Portable: no chrome.*, no DOM, no network. Behind the off switch RSVP_REPLY
// (default off).
//
// The loop: "Please confirm you'll attend the Thursday demo." / "נא לאשר הגעה
// לישיבה ביום חמישי." The close is the person's answer recorded on that event.
// Glance finds the one invite on their Google Calendar that fits (an event they
// are invited to, not one they organize, still waiting for their answer, on the
// day the mail names or with the words it names), and offers the answer as a
// choice: Accept, Maybe, Decline. Nothing is chosen for them. After the click
// Glance sets only their own attendee answer, with sendUpdates=none (no email
// goes out from Glance; the organizer's calendar shows the answer, as it would
// from the invite's own buttons), and reads the event back by id. Handled only
// when the read-back shows that answer. Undo puts the previous answer back, and
// refuses when the person changed the answer themselves since.
//
// Rules:
//   - one explicit ask to confirm attendance (Hebrew and English); negation
//     ("no need to confirm"), a hedge, FYI, and "ask Dana to confirm" stay silent;
//   - zero or several invites that fit: silence. An event the person organizes,
//     a cancelled one, one already answered, or one in the past is never a candidate;
//   - nothing is read or written until the switch is on.
//
// The host injects calendar(method, path, body?) -> Promise<{ status, ok, json }>
// against https://www.googleapis.com/calendar/v3. The `calendar.events` scope is
// already granted; no new scope. No src/ file calls this yet.
const FlowRsvp = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const extract = sibling(typeof FlowExtract !== 'undefined' ? FlowExtract : null, './extract.js', 'FlowExtract');
  const attach = sibling(typeof FlowFileAttach !== 'undefined' ? FlowFileAttach : null, './file-attach.js', 'FlowFileAttach');
  const proofs = sibling(typeof FlowProofOfClose !== 'undefined' ? FlowProofOfClose : null, './proof-of-close.js', 'FlowProofOfClose');

  const SWITCH = 'RSVP_REPLY';
  const SWITCH_DEFAULT = false;
  const SYSTEM = 'google/calendar';
  const CONNECTOR = 'calendarRsvp';
  const ANSWERS = ['accepted', 'tentative', 'declined'];
  const PENDING = 'proof_pending';
  const FAILED = 'verify_failed';

  const ASK_EN = /\b(?:please\s+)?(?:confirm|let\s+(?:me|us)\s+know)\s+(?:if\s+|whether\s+|that\s+)?(?:you(?:'ll|\s+will|\s+can|\s+are|'re)?\s+)?(?:be\s+)?(?:attend(?:ing|ance)?|join(?:ing)?|com(?:e|ing)|make\s+it|be\s+there|participat(?:e|ing|ion))\b|\brsvp\b|\b(?:confirm|accept)\s+(?:the\s+|my\s+|our\s+)?(?:invite|invitation)\b|\bwill\s+you\s+(?:be\s+)?(?:attend(?:ing)?|join(?:ing)?|com(?:e|ing)|there)\b|\bcan\s+you\s+make\s+it\b/i;
  const ASK_HE = /(?:נא|נבקש|אבקש|בבקשה)?\s*(?:לאשר|תאשר(?:י|ו)?|אשר(?:י|ו)?)\s+(?:בבקשה\s+)?(?:את\s+)?(?:ה)?(?:געה|הגעה|השתתפות|הגעתך|הגעתכם|השתתפותך|נוכחות)|האם\s+(?:ת|א)?(?:גיע|גיעי|גיעו|תגיע|תגיעי|תגיעו|תשתתף|תשתתפי|תשתתפו)|(?:תגיע|תגיעי|תגיעו|תשתתף|תשתתפי|תשתתפו)\s*\?/;
  const NEG = /\b(?:no need to|don't need to|do not need to|you don't have to|not necessary to)\s+(?:confirm|rsvp|reply|respond)\b|\bno\s+rsvp\b|אין\s+צורך\s+(?:לאשר|באישור)|לא\s+צריך\s+לאשר/i;
  const HEDGE = /\b(?:maybe|perhaps|if you want|no pressure|whenever)\b|(?:^|[\s,.])אולי(?:[\s,.]|$)|אם\s+בא\s+לך/i;
  const FYI = /\b(?:fyi|for your information|no action needed)\b|לידיעה|לידיעתך|אין\s+צורך\s+בפעולה/i;
  const THIRD = /\b(?:ask|have|get|tell)\s+(?!(?:me|us|you)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,3}\s+to\s+(?:confirm|rsvp|reply)\b|תבקש(?:י|ו)?\s*מ|תגיד(?:י|ו)?\s*ל(?!י(?:\s|$|[.,!?]))/i;

  const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const STOP = { please: 1, confirm: 1, attend: 1, attending: 1, will: 1, you: 1, the: 1, our: 1, for: 1, and: 1, this: 1, that: 1, with: 1, rsvp: 1, invite: 1, invitation: 1, meeting: 1, join: 1, joining: 1, coming: 1, make: 1, there: 1, let: 1, know: 1, can: 1, next: 1, week: 1, יום: 1, ביום: 1, לאשר: 1, הגעה: 1, נא: 1, את: 1, האם: 1, השתתפות: 1, בבקשה: 1, של: 1, עם: 1, אשר: 1, געה: 1, תאשר: 1, בקשה: 1, שתתפות: 1, תגיע: 1, תגיעי: 1, תגיעו: 1, ראשון: 1, שני: 1, שלישי: 1, רביעי: 1, חמישי: 1, שישי: 1, monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, oct: 1, nov: 1, dec: 1 };

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  function isoOf(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  // The day the mail names: the shared parser first, then a bare English weekday.
  function dayOf(text, now) {
    const at = now instanceof Date ? now : new Date(now || Date.now());
    // "RSVP by Friday", "עד יום רביעי": that is the deadline, not the day of the event.
    const body = String(text).replace(/\b(?:by|before|until|no later than)\s+(?:this\s+|next\s+)?(?:\w+day|\w{3,9}\s+\d{1,2}|\d{1,2}[./]\d{1,2})\b/gi, ' ').replace(/(?:^|\s)עד\s+(?:ה|יום\s+)?[\u0590-\u05FF\d/.'׳-]+/g, ' ');
    const parsed = extract ? extract.parseDate(body, at) : null;
    if (parsed && parsed.iso) return parsed.iso;
    const m = body.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
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
    const s = String(text || '').replace(/[​-‏‪-‮ ]/g, ' ');
    if (!s.trim() || !(ASK_EN.test(s) || ASK_HE.test(s))) return { kind: 'ignore' };
    if (NEG.test(s)) return { kind: 'block', reason: 'negation' };
    if (FYI.test(s)) return { kind: 'block', reason: 'fyi' };
    if (HEDGE.test(s)) return { kind: 'block', reason: 'hedge' };
    if (THIRD.test(s) || (attach && attach.asksThirdParty && attach.asksThirdParty(s))) return { kind: 'block', reason: 'third-party' };
    return { kind: 'clear', lang: /[֐-׿]/.test(s) ? 'he' : 'en', dayIso: dayOf(s, now), words: words(s) };
  }

  function selfOf(ev) {
    return (ev && Array.isArray(ev.attendees) ? ev.attendees : []).find((a) => a && a.self === true) || null;
  }

  function startIso(ev) {
    const s = ev && ev.start ? (ev.start.dateTime || ev.start.date || '') : '';
    return String(s).slice(0, 10);
  }

  // Events the host listed for the coming weeks → the one invite that fits.
  function pickInvite(events, ask, now) {
    if (!Array.isArray(events)) return { reason: 'not-searched' };
    const todayIso = isoOf(now instanceof Date ? now : new Date(now || Date.now()));
    const open = events.filter((ev) => {
      if (!ev || typeof ev.id !== 'string' || ev.status === 'cancelled') return false;
      if (ev.organizer && ev.organizer.self === true) return false;
      const me = selfOf(ev);
      if (!me || me.organizer === true) return false;
      if (me.responseStatus && me.responseStatus !== 'needsAction') return false;
      return startIso(ev) >= todayIso;
    });
    // Hebrew construct state: "ישיבה" and "ישיבת" are one word.
    const stem = (w) => (/[\u0590-\u05FF]/.test(w) && w.length >= 4 ? w.replace(/[הת]$/, '') : w);
    const titled = (ev) => {
      const t = words(ev.summary).map(stem);
      return ask.words.map(stem).some((w) => t.some((x) => x === w || (w.length >= 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0))));
    };
    let fits;
    if (ask.dayIso) {
      fits = open.filter((ev) => startIso(ev) === ask.dayIso);
      if (fits.length > 1) {
        const named = fits.filter(titled);
        if (named.length === 0) return { reason: 'conflict' };
        fits = named;
      }
    } else {
      fits = open.filter(titled);
    }
    if (fits.length === 0) {
      const answered = events.some((ev) => ev && selfOf(ev) && selfOf(ev).responseStatus && selfOf(ev).responseStatus !== 'needsAction' && (!ask.dayIso || startIso(ev) === ask.dayIso) && (ask.dayIso || titled(ev)));
      return { reason: answered ? 'already-answered' : 'none' };
    }
    if (fits.length > 1) return { reason: 'conflict' };
    return { event: { id: fits[0].id, summary: fits[0].summary || '', day: startIso(fits[0]) } };
  }

  function silence(reason) {
    return { action: 'silence', reason: reason };
  }

  function choices(lang) {
    return lang === 'he'
      ? [{ answer: 'accepted', label: 'מגיע/ה' }, { answer: 'tentative', label: 'אולי' }, { answer: 'declined', label: 'לא מגיע/ה' }]
      : [{ answer: 'accepted', label: 'Accept' }, { answer: 'tentative', label: 'Maybe' }, { answer: 'declined', label: 'Decline' }];
  }

  // The plan, after the host listed upcoming events (singleEvents=true).
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return { action: 'off', reason: 'switch-off' };
    const r = recognize(input.text, input.now);
    if (r.kind !== 'clear') return silence(r.reason || 'no-ask');
    const picked = pickInvite(input.events, r, input.now);
    if (!picked.event) return silence(picked.reason);
    const ev = picked.event;
    return {
      action: 'offer',
      approval: 'Choice',
      // The answer is the person's. Glance never picks one.
      choices: choices(r.lang),
      event: ev,
      line: r.lang === 'he' ? 'לענות על ההזמנה: ' + ev.summary + ' (' + ev.day + ')' : 'Answer the invite: ' + ev.summary + ' (' + ev.day + ')',
      steps: [{ id: 'rsvp', kind: 'calendar', label: r.lang === 'he' ? 'התשובה נרשמת ביומן ונבדקת' : 'Record the answer on the event and read it back', proof: SYSTEM }]
    };
  }

  function eventPath(id) {
    return '/calendars/primary/events/' + encodeURIComponent(id);
  }

  function withAnswer(attendees, answer) {
    return attendees.map((a) => (a && a.self === true ? Object.assign({}, a, { responseStatus: answer }) : a));
  }

  function miss(reason, extra) {
    return Object.assign({ ok: false, reason: reason, proof: null }, extra || {});
  }

  // Do It, after the person chose. Only their own answer changes.
  async function respond(input, io) {
    input = input || {};
    io = io || {};
    if (!enabled(input.flags)) return miss('switch-off');
    const id = input.event && input.event.id;
    const answer = input.answer;
    if (!id || ANSWERS.indexOf(answer) === -1) return miss('invalid');
    if (typeof io.calendar !== 'function') return miss('no-host');
    const cal = io.calendar;

    const got = await cal('GET', eventPath(id));
    if (got.status === 401 || got.status === 403) return miss('not-connected');
    if (!got.ok || !got.json || got.json.status === 'cancelled') return miss('event-gone');
    const me = selfOf(got.json);
    if (!me || (got.json.organizer && got.json.organizer.self === true)) return miss('not-an-invite');
    const previous = me.responseStatus || 'needsAction';
    // The person answered on their own since the card was drawn: never overwrite.
    if (previous !== 'needsAction') return miss('already-answered', { current: previous });

    const patch = await cal('PATCH', eventPath(id) + '?sendUpdates=none', { attendees: withAnswer(got.json.attendees, answer) });
    if (patch.status === 401 || patch.status === 403) return miss('not-connected');
    if (!patch.ok) return miss('write-failed');
    const ref = { eventId: id, previous: previous, answer: answer, createdByGlance: true };

    const back = await cal('GET', eventPath(id));
    if (!back.ok || !back.json) return miss(FAILED, { ref: ref, why: 'get-' + back.status });
    const now = selfOf(back.json);
    if (!now || now.responseStatus !== answer || back.json.id !== id) return miss(FAILED, { ref: ref, why: 'answer-differs' });

    const verifiedAt = typeof input.now === 'string' ? input.now : new Date().toISOString();
    const proof = proofs ? proofs.buildProof({ system: SYSTEM, externalId: id, url: back.json.htmlLink || '', fetchedBack: true, verifiedAt: verifiedAt }) : null;
    if (!proof) return miss(PENDING, { ref: ref });
    return {
      ok: true,
      connector: CONNECTOR,
      where: 'Google Calendar',
      written: 'Calendar · ' + (back.json.summary || 'invite') + ' · ' + answer,
      proof: proof,
      ref: ref,
      // Their answer on the invite is what was asked: this is the close.
      loopClosed: true
    };
  }

  // Undo: back to the previous answer, only while the answer is still Glance's.
  async function undo(ref, io) {
    io = io || {};
    if (!ref || !ref.eventId || ref.createdByGlance !== true || ANSWERS.indexOf(ref.answer) === -1) return { ok: false, reason: 'not-ours' };
    if (typeof io.calendar !== 'function') return { ok: false, reason: 'no-host' };
    const got = await io.calendar('GET', eventPath(ref.eventId));
    if (got.status === 401 || got.status === 403) return { ok: false, reason: 'not-connected' };
    if (!got.ok || !got.json) return { ok: false, reason: 'event-gone' };
    const me = selfOf(got.json);
    if (!me || me.responseStatus !== ref.answer) return { ok: false, reason: 'answer-changed', undoUnavailable: true };
    const patch = await io.calendar('PATCH', eventPath(ref.eventId) + '?sendUpdates=none', { attendees: withAnswer(got.json.attendees, ref.previous) });
    if (!patch.ok) return { ok: false, reason: 'undo-failed' };
    const back = await io.calendar('GET', eventPath(ref.eventId));
    const after = back.ok && back.json ? selfOf(back.json) : null;
    if (after && after.responseStatus === ref.previous) return { ok: true, undone: true, externalId: ref.eventId };
    return { ok: false, reason: 'undo-unverified' };
  }

  return { SWITCH, SWITCH_DEFAULT, SYSTEM, CONNECTOR, ANSWERS, enabled, recognize, dayOf, pickInvite, plan, respond, undo };
})();

if (typeof module !== 'undefined') module.exports = { FlowRsvp };
else if (typeof globalThis !== 'undefined') globalThis.FlowRsvp = FlowRsvp;
