// A draft for an open one-to-one chat. Portable: no chrome.*, no DOM, no network.
// Lives in src/ so it can ship without editing core/README.md, which other open pull requests own.
//
// The host reads the newest message and the connected sources it already fetched
// (this file does not fetch). FlowIncomingJudge and FlowCloseChains run on that
// text. A place ask ("the restaurant from last week") is answered only from one
// calendar event whose location is a real place. A fact ask is answered only
// when the close chain found one value. Anything else is silence.
//
// Every result has sends: false. This file cannot press Enter, click Send, or
// ask a host to send. A draft is not a close.
const FlowChatDraft = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }

  const LIVE = /\b(?:where are you|right now|live location|current location|home address|your address|my location)\b|איפה אתה עכשיו|איפה את עכשיו|כתובת הבית|הכתובת שלך|המיקום שלך/i;
  const FUTURE = /\b(?:where should we|good restaurant|for tonight|tonight|let's go|lets go)\b|לאן נלך|מסעדה טובה|להערב/i;
  const NEGATION = /\b(?:don'?t send|do not send|never mind)\b|אל תשלח|לא לשלוח|אין צורך/i;
  const THIRD = /\b(?:send|tell|give) (?:him|her|them)\b|\bthe (?:place|restaurant) (?:that )?[A-Z][a-z]+ (?:went|was)\b|תשלח לו|תשלחי לו|המקום שדנה/i;
  const INJECTION = /ignore (?:all |previous |your )?instructions|system prompt/i;
  const PLACE_NOUN = /\b(?:restaurant|bar|cafe|café|coffee shop)\b|מסעדה|בית[\s-]?ה?קפה|(?:^|\s)בר(?:$|[\s.?!,])/i;
  const PLACE_ASK = /\b(?:location|address|link|where(?:'s| is| was| did)|what(?:'s| is) the name|name of)\b|מיקום|כתובת|קישור|איך קוראים|איפה/i;
  const ATE = /\b(?:where did we eat|where we ate)\b|איפה אכלנו|איפה היינו/i;
  const MEETING = /zoom\.us|meet\.google|teams\.microsoft|teams\.live|webex|skype|\b(?:zoom|google meet)\b/i;
  const HOME = /^(?:home|my home|house|בית|הבית)$/i;
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function fresh(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function atMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function dayWindow(day) {
    const start = atMidnight(day);
    const end = addDays(start, 1);
    return { startMs: start.getTime(), endMs: end.getTime(), startIso: start.toISOString(), endIso: end.toISOString() };
  }

  function lastWeek(now) {
    const day = atMidnight(now);
    const mondayOffset = day.getDay() === 0 ? 6 : day.getDay() - 1;
    const thisMonday = addDays(day, -mondayOffset);
    const start = addDays(thisMonday, -7);
    const end = thisMonday;
    return { startMs: start.getTime(), endMs: end.getTime(), startIso: start.toISOString(), endIso: end.toISOString() };
  }

  function pastWeekday(now, target) {
    const day = atMidnight(now);
    const delta = (day.getDay() - target + 7) % 7;
    return addDays(day, -delta);
  }

  // clock is the message time when the host could read one. "Last week" is that week.
  function windowFor(body, now) {
    const clock = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
    // שבוע שעבר only at a word edge. מהשבוע שעבר is one word and stays quiet.
    if (/last week|(?:^|[^\p{L}\p{N}])ב?שבוע שעבר/iu.test(body)) return { window: lastWeek(clock), weak: false };
    if (/\byesterday\b|אתמול/i.test(body)) return { window: dayWindow(addDays(atMidnight(clock), -1)), weak: false };
    const en = body.match(/\bon (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (en) return { window: dayWindow(pastWeekday(clock, DAYS.indexOf(en[1].toLowerCase()))), weak: false };
    const he = body.match(/ביום (ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
    if (he) return { window: dayWindow(pastWeekday(clock, DAYS_HE.indexOf(he[1]))), weak: false };
    if (/\b(?:you were at|you went)\b|שהיית|שהייתם|שישבת/i.test(body)) {
      const end = addDays(atMidnight(clock), 1);
      const start = addDays(end, -30);
      return { window: { startMs: start.getTime(), endMs: end.getTime(), startIso: start.toISOString(), endIso: end.toISOString() }, weak: true };
    }
    return null;
  }

  function hardVeto(body) {
    if (!body) return 'empty';
    if (INJECTION.test(body) || LIVE.test(body)) return 'live-or-home';
    if (FUTURE.test(body)) return 'future';
    if (NEGATION.test(body)) return 'negation';
    if (THIRD.test(body)) return 'third-party';
    return null;
  }

  function factAsk(body) {
    const factReply = sibling(typeof FlowFactReply !== 'undefined' ? FlowFactReply : null, '../core/fact-reply.js', 'FlowFactReply');
    if (!factReply || typeof factReply.detect !== 'function') return null;
    const fact = factReply.detect(body);
    if (!fact) return null;
    return { kind: 'fact', fact, fetch: { kind: 'fact', fact } };
  }

  // null when this message is not a chat draft. A veto is silence, not a draft.
  function detect(text, ctx) {
    const c = ctx || {};
    if (c.fromMe) return { veto: 'from-me' };
    if (c.group || c.oneToOne === false) return { veto: 'group' };
    if (c.quoted) return { veto: 'quoted' };
    const body = fresh(text);
    const veto = hardVeto(body);
    if (veto) return { veto };
    const noun = PLACE_NOUN.test(body) || ATE.test(body);
    const ask = PLACE_ASK.test(body) || ATE.test(body);
    const when = windowFor(body, c.now);
    if (noun && ask && when) {
      return {
        kind: 'place',
        weak: when.weak,
        window: when.window,
        fetch: when.weak ? null : { kind: 'place', window: { startIso: when.window.startIso, endIso: when.window.endIso } }
      };
    }
    const fact = factAsk(body);
    if (fact) return fact;
    return null;
  }

  function silence(reason, chain, incoming) {
    return {
      show: false,
      draft: null,
      sends: false,
      reason: reason || 'silence',
      source: null,
      chain: chain && chain.reason ? chain.reason : null,
      incoming: incomingReason(incoming)
    };
  }

  function incomingReason(incoming) {
    if (!incoming) return null;
    if (incoming.reason) return incoming.reason;
    return incoming.show ? 'show' : 'silent';
  }

  function runChain(input) {
    const chains = sibling(typeof FlowCloseChains !== 'undefined' ? FlowCloseChains : null, '../core/close-chains.js', 'FlowCloseChains');
    if (!chains || typeof chains.resolve !== 'function') return null;
    try {
      return chains.resolve({
        text: input.text,
        evidence: input.evidence || {},
        now: input.now,
        origin: input.channel || 'chat'
      });
    } catch (e) { return null; }
  }

  function runIncoming(input) {
    const judge = sibling(typeof FlowIncomingJudge !== 'undefined' ? FlowIncomingJudge : null, '../core/incoming-judge.js', 'FlowIncomingJudge');
    if (!judge || typeof judge.judge !== 'function') return null;
    try {
      return judge.judge({
        text: input.text,
        subject: input.subject || '',
        sender: input.sender || {},
        surface: 'chat',
        now: input.now,
        attachmentCount: 0
      });
    } catch (e) { return null; }
  }

  function eventTime(ev) {
    const s = String(ev && ev.startIso || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + 'T12:00:00');
    return Date.parse(s);
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function venueName(location) {
    const loc = String(location || '').trim();
    const comma = loc.indexOf(',');
    const head = comma > 1 ? loc.slice(0, comma).trim() : loc;
    return head.slice(0, 80);
  }

  function mapsUrl(query) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  function pickVenue(evidence, window) {
    if (!evidence || evidence.events == null) return { reason: 'not-checked' };
    if (!window) return { reason: 'no-window' };
    const hits = [];
    for (const ev of evidence.events) {
      if (!ev || ev.status === 'cancelled') continue;
      const t = eventTime(ev);
      if (!(t >= window.startMs && t < window.endMs)) continue;
      const loc = String(ev.location || '').replace(/[\r\n]+/g, ' ').trim();
      // A name alone is not a place we can hand someone. A street, a number, or a comma is.
      if (!loc || MEETING.test(loc) || HOME.test(loc) || !(/,/.test(loc) || /\d/.test(loc))) continue;
      hits.push({ name: venueName(loc), query: loc, key: norm(loc) });
    }
    const unique = [];
    for (const hit of hits) {
      if (!unique.some((u) => u.key === hit.key)) unique.push(hit);
    }
    if (unique.length === 1) return { hit: unique[0] };
    if (unique.length > 1) return { reason: 'conflict' };
    return { reason: 'no-venue' };
  }

  function found(draft, source, chain, incoming) {
    return {
      show: true,
      draft,
      sends: false,
      reason: 'found',
      source,
      chain: chain && chain.reason ? chain.reason : null,
      incoming: incomingReason(incoming)
    };
  }

  // input: { text, fromMe, oneToOne, group, quoted, evidence, now, sender, channel, detected }
  // evidence.events null means Calendar was not checked. An empty array was checked.
  // A holding reply from the close chain is not a chat draft.
  function judge(input) {
    const i = input || {};
    const chain = runChain(i);
    const incoming = runIncoming(i);
    const detected = i.detected || detect(i.text, i);
    if (!detected || detected.veto) return silence(detected && detected.veto ? detected.veto : 'no-ask', chain, incoming);
    if (detected.kind === 'place') {
      if (detected.weak) return silence('weak-window', chain, incoming);
      const picked = pickVenue(i.evidence, detected.window);
      if (!picked.hit) return silence(picked.reason || 'no-venue', chain, incoming);
      const line = picked.hit.name + ' - ' + mapsUrl(picked.hit.query);
      if (!line || /[\r\n]/.test(line)) return silence('no-venue', chain, incoming);
      return found(line, 'calendar', chain, incoming);
    }
    if (detected.kind === 'fact') {
      if (!chain || chain.sends !== false || chain.move !== 'prepare' || !chain.hit || chain.hit.value == null) {
        return silence('no-fact', chain, incoming);
      }
      const line = String(chain.hit.value).replace(/[\r\n]+/g, ' ').trim();
      if (!line || line.length > 180) return silence('no-fact', chain, incoming);
      return found(line, 'fact', chain, incoming);
    }
    return silence('no-ask', chain, incoming);
  }

  return { detect, judge, mapsUrl };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatDraft };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatDraft = FlowChatDraft;
