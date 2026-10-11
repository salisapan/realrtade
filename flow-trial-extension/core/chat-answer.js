// A place question in an open chat. Calendar first, then mail the person has
// already opened. One hit is a draft. Zero hits, or two or more, stay silent.
// This file does not fetch, type, or send. The host injects the events and
// the opened mail. A model is not used.
//
// Portable: no chrome.*, no DOM, no network.
const FlowChatAnswer = (() => {
  const HOST = 'web.whatsapp.com';
  const PLACE_MAX = 60;
  const NOT_A_PLACE = /\b(?:meeting|meetings|call|calls|sync|standup|stand-up|zoom|interview|flight|dentist|doctor|gym|birthday|review|planning|workshop|all-hands|status|1:1|1-1)\b|פגישה|שיחה|זום|טיסה|רופא|יום הולדת|ישיבה|סטטוס|חדר כושר/i;
  const MEAL_ONLY = /^(?:dinner|lunch|breakfast|brunch|meal|drinks|coffee|ארוחה|צהריים|ערב|בוקר|קפה)$/i;
  const MEAL_LEAD = /^(?:dinner|lunch|breakfast|brunch|drinks|coffee|reservation|table)\s+(?:at\s+)?/i;
  const MEAL_TAIL = /\s+(?:dinner|lunch|breakfast|brunch)$/i;
  const HE_MEAL_LEAD = /^(?:ארוחת ערב|ארוחת צהריים|ארוחת בוקר|ארוחה|צהריים|ערב|בוקר|קפה)\s+ב/;
  const URLISH = /^https?:\/\//i;
  const RESERVATION = /reservation|restaurant|table for|dinner at|lunch at|booked|הזמנה|מסעדה|שולחן/i;
  const EN_PLACE = /(?:reservation at|table at|booked(?: a table at)?|dinner at|lunch at|breakfast at)\s+([^,.\n]{2,60}?)(?=\s+(?:for|on)\b|,|\.|$)/i;
  const HE_PLACE = /(?:הזמנה ל|שולחן ב|מסעדת|אכלנו ב)\s*([^\n,.]{2,60}?)(?=\s+ליום|,|\.|$)/;
  const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function clean(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  }

  function hebrew(text) {
    return /[\u0590-\u05FF]/.test(String(text || ''));
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function ymd(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseNow(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(raw);
    if (m && raw.indexOf('Z') < 0 && raw.indexOf('+') < 0) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), 0, 0);
    }
    const d = new Date(value || Date.now());
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  function atMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function addDays(date, days) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return atMidnight(next);
  }

  function startOfWeek(date) {
    const day = atMidnight(date);
    return addDays(day, -day.getDay());
  }

  function windowBetween(start, end) {
    return {
      start: start,
      end: end,
      startYmd: ymd(start),
      endYmd: ymd(end),
      startIso: start.toISOString(),
      endIso: end.toISOString()
    };
  }

  function lastWeek(now) {
    const start = addDays(startOfWeek(now), -7);
    return windowBetween(start, addDays(start, 7));
  }

  function thisWeek(now) {
    const start = startOfWeek(now);
    return windowBetween(start, addDays(atMidnight(now), 1));
  }

  function oneDay(now, offset) {
    const start = addDays(atMidnight(now), offset);
    return windowBetween(start, addDays(start, 1));
  }

  function weekdayIndex(text) {
    const raw = clean(text).toLowerCase();
    for (let i = 0; i < DAYS_EN.length; i++) {
      if (new RegExp('\\b' + DAYS_EN[i] + '\\b', 'i').test(raw)) return i;
    }
    for (let j = 0; j < DAYS_HE.length; j++) {
      if (raw.indexOf('יום ' + DAYS_HE[j]) >= 0 || raw.indexOf(DAYS_HE[j]) >= 0) return j;
    }
    return -1;
  }

  function previousWeekday(now, index) {
    const day = atMidnight(now);
    let delta = (day.getDay() - index + 7) % 7;
    if (delta === 0) delta = 7;
    return oneDay(day, -delta);
  }

  function placeQuestion(text) {
    const raw = clean(text);
    if (!raw || raw.length > 400) return false;
    if (/[?]/.test(raw) && (raw.match(/[?]/g) || []).length > 1) return false;
    const he = /איפה\s+אכלנו|איפה\s+היינו|באיזו\s+מסעדה|איפה\s+המסעדה|איפה\s+הארוחה|איפה\s+אכלת/.test(raw);
    const en = /\bwhere\s+(?:did|have)\s+we\s+(?:eat|ate|go\s+for\s+(?:dinner|lunch|breakfast))\b/i.test(raw)
      || /\bwhere(?:'d| d)\s+we\s+(?:eat|ate)\b/i.test(raw)
      || /\bwhich\s+restaurant\b/i.test(raw)
      || /\bwhat\s+restaurant\b/i.test(raw)
      || /\bwhere\s+was\s+(?:dinner|lunch|breakfast)\b/i.test(raw)
      || /\bwhere(?:'s| is) the (?:place|restaurant) we (?:ate|went)\b/i.test(raw);
    return he || en;
  }

  // A week starts on Sunday. That is the week "שבוע שעבר" means, and the
  // English question uses the same window so one calendar answers both.
  function periodOf(text, now) {
    const raw = clean(text);
    if (/\bnext week\b|שבוע הבא|בשבוע הבא/i.test(raw)) return null;
    if (/שבוע שעבר|השבוע שעבר|\blast week\b|\bpast week\b|\bthis past week\b/i.test(raw)) return lastWeek(now);
    if (/\byesterday\b|אתמול/.test(raw)) return oneDay(now, -1);
    if (/\btoday\b|היום/.test(raw)) return oneDay(now, 0);
    if (/\bthis week\b|השבוע/.test(raw) && !/שבוע שעבר|השבוע שעבר/.test(raw)) return thisWeek(now);
    const day = weekdayIndex(raw);
    if (day >= 0 && (/\blast\b|שעבר|איפה\s+אכלנו|where\s+did\s+we/i.test(raw))) return previousWeekday(now, day);
    return null;
  }

  function detect(text, now) {
    const raw = clean(text);
    if (!placeQuestion(raw)) return null;
    const when = parseNow(now);
    const span = periodOf(raw, when);
    if (!span) return null;
    return { text: raw, lang: hebrew(raw) ? 'he' : 'en', window: span };
  }

  function hostAllowed(host) {
    return clean(host).toLowerCase() === HOST;
  }

  function normPlace(value) {
    return clean(value).toLowerCase();
  }

  function clipPlace(value) {
    const s = clean(value).replace(/^["'«]|["'»]$/g, '');
    if (!s || s.length > PLACE_MAX) return '';
    if (URLISH.test(s) || NOT_A_PLACE.test(s) || MEAL_ONLY.test(s)) return '';
    return s;
  }

  function fromTitle(title) {
    const raw = clean(title);
    if (!raw || URLISH.test(raw)) return '';
    let body = raw.replace(HE_MEAL_LEAD, '').replace(MEAL_LEAD, '').replace(MEAL_TAIL, '').trim();
    body = body.replace(/^ב(?=[\u0590-\u05FF])/, '');
    return clipPlace(body);
  }

  function eventDate(ev) {
    if (!ev) return '';
    const start = ev.start && typeof ev.start === 'object' ? ev.start : {};
    if (typeof start.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start.date)) return start.date;
    const raw = start.dateTime || ev.dateTime || ev.dateIso || ev.date || '';
    if (typeof raw !== 'string' || !raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return ymd(d);
  }

  function inWindow(dateIso, span) {
    if (!dateIso || !span) return false;
    return dateIso >= span.startYmd && dateIso < span.endYmd;
  }

  function placeFromEvent(ev, span) {
    if (!ev || ev.status === 'cancelled') return null;
    const dateIso = eventDate(ev);
    if (!inWindow(dateIso, span)) return null;
    const summary = fromTitle(ev.summary || ev.title || '');
    const location = fromTitle(ev.location || '');
    const place = summary || location;
    if (!place) return null;
    const id = clean(ev.id) || place + '@' + dateIso;
    return { source: 'calendar', id: id, place: place, dateIso: dateIso, title: clean(ev.summary || ev.title || place) };
  }

  function pushPlace(list, seen, hit) {
    if (!hit) return;
    const key = normPlace(hit.place);
    if (!key || seen[key]) return;
    seen[key] = true;
    list.push(hit);
  }

  function placesFromEvents(events, span) {
    const list = [];
    const seen = {};
    const rows = Array.isArray(events) ? events : [];
    for (let i = 0; i < rows.length; i++) pushPlace(list, seen, placeFromEvent(rows[i], span));
    return list;
  }

  function mailDate(mail) {
    if (!mail) return '';
    const raw = mail.dateIso || mail.date || mail.receivedAt || '';
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return ymd(d);
    }
    return '';
  }

  function placesFromMail(mail, span) {
    const list = [];
    const seen = {};
    const rows = Array.isArray(mail) ? mail : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const dateIso = mailDate(row);
      if (!inWindow(dateIso, span)) continue;
      const text = clean((row.subject || '') + '\n' + (row.body || row.text || ''));
      if (!text || !RESERVATION.test(text)) continue;
      const found = [];
      const localSeen = {};
      function take(value) {
        const place = clipPlace(String(value || '').replace(/^ב(?=[\u0590-\u05FF])/, ''));
        const key = normPlace(place);
        if (!place || localSeen[key]) return;
        localSeen[key] = true;
        found.push(place);
      }
      const en = text.match(new RegExp(EN_PLACE.source, 'ig'));
      if (en) {
        for (let j = 0; j < en.length; j++) {
          const m = EN_PLACE.exec(en[j]);
          EN_PLACE.lastIndex = 0;
          if (m) take(m[1]);
        }
      }
      const he = text.match(new RegExp(HE_PLACE.source, 'g'));
      if (he) {
        for (let k = 0; k < he.length; k++) {
          const m = HE_PLACE.exec(he[k]);
          HE_PLACE.lastIndex = 0;
          if (m) take(m[1]);
        }
      }
      if (found.length !== 1) {
        found.forEach((place) => pushPlace(list, seen, { source: 'mail', id: clean(row.id) || place, place: place, dateIso: dateIso, title: clean(row.subject || place) }));
        continue;
      }
      pushPlace(list, seen, {
        source: 'mail',
        id: clean(row.id) || found[0] + '@' + dateIso,
        place: found[0],
        dateIso: dateIso,
        title: clean(row.subject || found[0])
      });
    }
    return list;
  }

  function dayName(dateIso, lang) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso || '');
    if (!m) return '';
    const index = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
    if (lang === 'he') return 'יום ' + DAYS_HE[index];
    return DAYS_EN[index].charAt(0).toUpperCase() + DAYS_EN[index].slice(1);
  }

  function draftFor(place, lang) {
    const name = clean(place);
    if (!name) return '';
    if (lang === 'he') {
      const body = /^ב[\u0590-\u05FF]/.test(name) ? name : 'ב' + name;
      return 'אכלנו ' + body + '.';
    }
    return 'We ate at ' + name + '.';
  }

  function silent(reason, ask) {
    return {
      show: false,
      reason: reason,
      hit: null,
      draft: '',
      lang: ask && ask.lang ? ask.lang : '',
      window: ask ? ask.window : null,
      sends: false
    };
  }

  const MAX_EVENTS = 250;

  function calendarPath(span) {
    const q = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(MAX_EVENTS),
      timeMin: span && span.startIso ? span.startIso : '',
      timeMax: span && span.endIso ? span.endIso : '',
      fields: 'items(id,status,summary,location,start,end,htmlLink)'
    });
    return '/calendars/primary/events?' + q.toString();
  }

  function normalizeEvents(payload) {
    const items = payload && Array.isArray(payload.items) ? payload.items
      : (Array.isArray(payload) ? payload : []);
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const ev = items[i];
      if (!ev || typeof ev !== 'object') continue;
      const start = ev.start && typeof ev.start === 'object' ? ev.start : {};
      out.push({
        id: clean(ev.id),
        status: clean(ev.status) || 'confirmed',
        summary: clean(ev.summary).slice(0, 200),
        location: clean(ev.location).slice(0, 200),
        start: {
          date: clean(start.date).slice(0, 10),
          dateTime: clean(start.dateTime).slice(0, 40)
        },
        htmlLink: clean(ev.htmlLink).slice(0, 300)
      });
    }
    return { events: out, truncated: items.length >= MAX_EVENTS };
  }

  function normalizeMail(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const out = [];
    for (let i = 0; i < list.length && out.length < 40; i++) {
      const row = list[i];
      if (!row || typeof row !== 'object') continue;
      out.push({
        id: clean(row.id).slice(0, 200),
        subject: clean(row.subject).slice(0, 200),
        body: clean(row.body || row.text).slice(0, 2000),
        dateIso: clean(row.dateIso || row.date).slice(0, 10)
      });
    }
    return out;
  }

  // fetchCalendar(span) -> { ok, items } or throws.
  // readOpenedMail(span) -> array. Omitted means mail was not checked.
  // An unread calendar stays silent: an empty list is not "zero hits".
  function search(input) {
    input = input || {};
    const now = input.now == null ? new Date() : input.now;
    const ask = input.ask || detect(input.text, now);
    if (!ask) return Promise.resolve(decide({ text: input.text || '', now: now }));
    const fetchCalendar = input.fetchCalendar;
    if (typeof fetchCalendar !== 'function') {
      return Promise.resolve(decide({ ask: ask, calendarChecked: false, oneToOne: input.oneToOne, host: input.host, alreadyAnswered: input.alreadyAnswered }));
    }
    return Promise.resolve()
      .then(() => fetchCalendar(ask.window))
      .then((payload) => {
        if (!payload || payload.ok === false) {
          return decide({ ask: ask, calendarChecked: false, oneToOne: input.oneToOne, host: input.host });
        }
        const listed = normalizeEvents(payload.items ? payload : payload);
        if (listed.truncated) {
          return decide({ ask: ask, truncated: true, oneToOne: input.oneToOne, host: input.host });
        }
        const preview = decide({
          ask: ask,
          events: listed.events,
          calendarChecked: true,
          mailChecked: false,
          oneToOne: input.oneToOne,
          host: input.host,
          alreadyAnswered: input.alreadyAnswered
        });
        if (preview.reason !== 'sources-unread') return preview;
        if (typeof input.readOpenedMail !== 'function') {
          return decide({ ask: ask, events: listed.events, calendarChecked: true, mailChecked: false, oneToOne: input.oneToOne, host: input.host });
        }
        return Promise.resolve()
          .then(() => input.readOpenedMail(ask.window))
          .then((rows) => decide({
            ask: ask,
            events: listed.events,
            mail: normalizeMail(rows),
            calendarChecked: true,
            mailChecked: true,
            oneToOne: input.oneToOne,
            host: input.host,
            alreadyAnswered: input.alreadyAnswered
          }));
      })
      .catch(() => decide({ ask: ask, calendarChecked: false, oneToOne: input.oneToOne, host: input.host }));
  }

  function shown(ask, hit) {
    const draft = draftFor(hit.place, ask.lang);
    return {
      show: true,
      reason: 'one-hit',
      hit: {
        source: hit.source,
        id: hit.id,
        place: hit.place,
        dateIso: hit.dateIso,
        title: hit.title,
        whenLabel: dayName(hit.dateIso, ask.lang)
      },
      draft: draft,
      lang: ask.lang,
      window: ask.window,
      sends: false
    };
  }

  // events and mail are already fetched. calendarChecked false means the
  // calendar was not read, so an empty list is not "zero hits".
  function decide(input) {
    input = input || {};
    const ask = input.ask || detect(input.text, input.now == null ? new Date() : input.now);
    if (!ask) return silent('not-a-question', null);
    if (input.oneToOne === false) return silent('not-one-to-one', ask);
    if (input.alreadyAnswered === true) return silent('already-answered', ask);
    if (input.host && !hostAllowed(input.host)) return silent('wrong-host', ask);
    if (input.truncated === true || input.calendarChecked === false) return silent('sources-unread', ask);
    const events = placesFromEvents(input.events, ask.window);
    if (events.length > 1) return silent('silent-many', ask);
    if (events.length === 1) return shown(ask, events[0]);
    if (input.mailChecked === false) return silent('sources-unread', ask);
    const mail = placesFromMail(input.mail, ask.window);
    if (mail.length > 1) return silent('silent-many', ask);
    if (mail.length === 1) return shown(ask, mail[0]);
    return silent('silent-zero', ask);
  }

  return {
    HOST: HOST,
    MAX_EVENTS: MAX_EVENTS,
    detect: detect,
    decide: decide,
    hostAllowed: hostAllowed,
    draftFor: draftFor,
    dayName: dayName,
    lastWeek: lastWeek,
    parseNow: parseNow,
    calendarPath: calendarPath,
    normalizeEvents: normalizeEvents,
    normalizeMail: normalizeMail,
    search: search
  };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatAnswer };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatAnswer = FlowChatAnswer;
