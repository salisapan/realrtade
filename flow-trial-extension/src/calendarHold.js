// A prefilled Google Calendar hold, opened from facts the chip already has.
//
// This is not a Calendar connection. Google publishes a form that turns a
// URL into an unsaved event: https://calendar.google.com/calendar/render
// ?action=TEMPLATE. The user presses Save there, or closes the tab. Glance
// never calls the Calendar API, never asks for a Calendar scope, and Undo
// cannot delete an event it did not create.
//
// The clock is always 10:00-10:45 in the viewer's calendar timezone
// (45 minutes, inside the 30-60 minute hold this product asked for). The
// extractor names a day, not a time, so inventing a searched-for slot would
// be a second product. When the email's day became an ISO date, that day is
// used even if it is a weekend or already past — moving it would be a guess.
// When it did not (no date, an ambiguous 3/4, a year we refused to invent),
// the day is the next weekday strictly after today: Friday, Saturday, and
// Sunday all land on Monday. The times are floating (no Z, no ctz) so Google
// reads 10:00 in the calendar of the person who opens the tab.

const FlowCalendarHold = (() => {
  const TEMPLATE_ORIGIN = 'https://calendar.google.com';
  const TEMPLATE_PATH = '/calendar/render';
  const HOLD_START_HOUR = 10;
  const HOLD_DURATION_MINUTES = 45;
  const MAX_URL = 7000;

  const RECEIPT_OPENED = 'Opened a prefilled Calendar hold. You still save it in Google Calendar.';
  const RECEIPT_READY = 'Prefilled Calendar hold is ready. Open it and save it in Google Calendar.';
  const LEAD_SUFFIX = ' ולפתוח טיוטת אירוע ביומן';

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function stamp(date) {
    return date.getFullYear()
      + pad(date.getMonth() + 1)
      + pad(date.getDate())
      + 'T'
      + pad(date.getHours())
      + pad(date.getMinutes())
      + pad(date.getSeconds());
  }

  function oneLine(value, max) {
    return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function dayFromIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    const y = +m[1];
    const mo = +m[2];
    const da = +m[3];
    const d = new Date(y, mo - 1, da);
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
    return d;
  }

  // Strictly after today's local calendar day, then skip Saturday and Sunday.
  function nextWeekday(now) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  }

  function atHoldStart(day) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), HOLD_START_HOUR, 0, 0, 0);
  }

  function holdWindow(facts, now) {
    const iso = facts && facts.date && typeof facts.date === 'object' ? facts.date.iso : null;
    const named = dayFromIso(iso);
    if (named) return { start: atHoldStart(named), usedDefaultDay: false };
    return { start: atHoldStart(nextWeekday(now)), usedDefaultDay: true };
  }

  function titleFor(facts, subject) {
    const bits = [];
    if (facts.moneyText) bits.push(oneLine(facts.moneyText, 40));
    if (facts.dateText) bits.push(oneLine(facts.dateText, 40));
    if (bits.length) return oneLine('Hold: ' + bits.join(', '), 140);
    const sub = oneLine(subject, 80).replace(/^re:\s*/i, '');
    if (sub) return oneLine('Hold: ' + sub, 140);
    return 'Hold';
  }

  function httpUrl(value) {
    try {
      const u = new URL(String(value));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  function fromLine(name, email) {
    const n = oneLine(name, 120);
    const e = oneLine(email, 200);
    if (n && e) return n + ' <' + e + '>';
    return n || e;
  }

  function detailsFor(input, facts, usedDefaultDay) {
    const lines = [
      'Prefilled by Glance. Nothing is on your calendar until you press Save in Google Calendar. Glance did not write this event.'
    ];
    if (usedDefaultDay) {
      lines.push('No date was extracted from the email, so this hold is the next weekday, 10:00-10:45.');
    } else {
      lines.push('The email named a day but no clock time, so this hold is 10:00-10:45 on that day.');
    }
    if (facts.moneyText) lines.push('Amount: ' + oneLine(facts.moneyText, 80));
    if (facts.dateText) lines.push('Date in the email: ' + oneLine(facts.dateText, 80));
    const from = fromLine(input.senderName, input.senderEmail);
    if (from) lines.push('From: ' + from);
    if (input.subject) lines.push('Subject: ' + oneLine(input.subject, 200));
    if (facts.quote) lines.push('Quote: ' + oneLine(facts.quote, 2000));
    const gmail = httpUrl(input.threadUrl);
    if (gmail) lines.push('Gmail: ' + gmail);
    return lines.join('\n');
  }

  // The slash in dates=START/END must stay literal. Google's form has been
  // observed to drop the end time when that slash is percent-encoded, and
  // the stamp is digits and a T only, so leaving it raw is not an injection.
  function pack(titleText, dates, details) {
    return TEMPLATE_ORIGIN + TEMPLATE_PATH
      + '?action=TEMPLATE'
      + '&text=' + encodeURIComponent(titleText)
      + '&dates=' + dates
      + '&details=' + encodeURIComponent(details);
  }

  // Duck-typed on purpose. `instanceof Date` is false for a Date that crossed
  // a realm boundary (the corpus runs this file inside vm), and a rejected
  // clock would silently schedule the hold on "today" instead of the clock
  // the caller passed.
  function asDate(value) {
    if (!value || typeof value.getTime !== 'function') return null;
    const t = value.getTime();
    if (typeof t !== 'number' || isNaN(t)) return null;
    return new Date(t);
  }

  function build(input) {
    input = input || {};
    const now = asDate(input.now) || new Date();
    const facts = input.facts || {};
    const windowMeta = holdWindow(facts, now);
    const start = windowMeta.start;
    const end = new Date(start.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
    const dates = stamp(start) + '/' + stamp(end);
    const titleText = titleFor(facts, input.subject);
    let details = detailsFor(input, facts, windowMeta.usedDefaultDay);
    let url = pack(titleText, dates, details);
    while (url.length > MAX_URL && details.length > 80) {
      details = details.slice(0, Math.floor(details.length * 0.7));
      url = pack(titleText, dates, details);
    }
    return {
      url,
      usedDefaultDay: windowMeta.usedDefaultDay,
      durationMinutes: HOLD_DURATION_MINUTES,
      start,
      end
    };
  }

  function isTemplateUrl(url) {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (u.hostname !== 'calendar.google.com') return false;
    if (u.pathname !== '/calendar/render') return false;
    return u.searchParams.get('action') === 'TEMPLATE';
  }

  function receiptNote(opened) {
    return opened ? RECEIPT_OPENED : RECEIPT_READY;
  }

  function undoNote(where) {
    return 'Undone in ' + (where || 'the destination') + ' — Glance never saved the Calendar hold';
  }

  function activityNote(opened) {
    return opened ? 'Calendar draft opened — you still save it in Google Calendar' : null;
  }

  return {
    build,
    isTemplateUrl,
    receiptNote,
    undoNote,
    activityNote,
    LEAD_SUFFIX,
    HOLD_DURATION_MINUTES,
    HOLD_START_HOUR
  };
})();

if (typeof globalThis !== 'undefined') globalThis.FlowCalendarHold = FlowCalendarHold;
if (typeof module !== 'undefined') module.exports = { FlowCalendarHold };
