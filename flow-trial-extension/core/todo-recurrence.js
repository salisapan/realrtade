// A commitment that repeats ("send the sales report every Monday at 9:00",
// "תעביר את דוח המכירות כל יום שני ב-9:00") becomes ONE recurring Microsoft To Do
// task instead of a one-off, through the To Do card that already exists. Portable:
// no chrome.*, no DOM, no network. Behind the off switch RECURRING_TODO (default
// off, stored in glanceSwitches like TEAMS_MEETING).
//
// Recognition is core/recurring-reminder.js (one explicit request or commitment,
// one repeat rule, one clock; several rules, "every other", a hedge, a negation,
// FYI, a past commitment and a third party stay silent). This file only maps the
// rule it found to the shape Microsoft Graph wants for todoTask.recurrence and
// says whether a task read back carries the same rule. To Do needs a due date
// for a repeat, so the first occurrence is the due date. No guest, nothing sent:
// a To Do task is private to the person.
const FlowTodoRecurrence = (() => {
  function sibling(globalValue, file, name) {
    if (globalValue) return globalValue;
    try { return typeof require !== 'undefined' ? require(file)[name] : null; } catch (e) { return null; }
  }
  const reminder = sibling(typeof FlowRecurringReminder !== 'undefined' ? FlowRecurringReminder : null, './recurring-reminder.js', 'FlowRecurringReminder');

  const SWITCH = 'RECURRING_TODO';
  const SWITCH_DEFAULT = false;
  const DAY = { MO: 'monday', TU: 'tuesday', WE: 'wednesday', TH: 'thursday', FR: 'friday', SA: 'saturday', SU: 'sunday' };

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // The Graph pattern for the rules recurring-reminder can find, and nothing else.
  function fromRrule(rrule, startIso) {
    const s = String(rrule || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startIso || ''))) return null;
    let pattern = null;
    let m;
    if (s === 'RRULE:FREQ=DAILY') pattern = { type: 'daily', interval: 1 };
    else if ((m = /^RRULE:FREQ=WEEKLY;BYDAY=((?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR))*)$/.exec(s))) {
      pattern = { type: 'weekly', interval: 1, daysOfWeek: m[1].split(',').map((d) => DAY[d]), firstDayOfWeek: 'sunday' };
    } else if ((m = /^RRULE:FREQ=MONTHLY;BYMONTHDAY=(\d{1,2})$/.exec(s)) && Number(m[1]) >= 1 && Number(m[1]) <= 28) {
      pattern = { type: 'absoluteMonthly', interval: 1, dayOfMonth: Number(m[1]) };
    }
    if (!pattern) return null;
    return { pattern: pattern, range: { type: 'noEnd', startDate: startIso } };
  }

  // One comparable string for a recurrence, whichever spelling Graph returns.
  function keyOf(rec) {
    if (!rec || typeof rec !== 'object' || !rec.pattern) return '';
    const p = rec.pattern;
    const days = Array.isArray(p.daysOfWeek) ? p.daysOfWeek.map((d) => String(d).toLowerCase()).sort().join(',') : '';
    const parts = [String(p.type || '').toLowerCase(), String(p.interval == null ? 1 : p.interval), days, Number(p.dayOfMonth) > 0 ? String(p.dayOfMonth) : ''];
    const start = rec.range && rec.range.startDate ? String(rec.range.startDate).slice(0, 10) : '';
    const kind = rec.range && rec.range.type ? String(rec.range.type).toLowerCase() : '';
    return parts.join('|') + '|' + kind + '|' + start;
  }

  // The rule and the first date must both be the ones asked for.
  function agrees(wanted, live) {
    const a = keyOf(wanted);
    return !!a && a === keyOf(live);
  }

  // What the To Do card adds to its task, or null: the mail text, the switch,
  // today's date (so a first occurrence is never in the past).
  function plan(input) {
    input = input || {};
    if (!enabled(input.flags)) return null;
    if (!reminder || typeof reminder.recognize !== 'function') return null;
    const r = reminder.recognize(input.text, input.todayIso);
    if (!r || r.kind !== 'clear') return null;
    const recurrence = fromRrule(r.rrule, r.dateIso);
    if (!recurrence) return null;
    return { recurrence: recurrence, dueIso: r.dateIso, hour: r.hour, minute: r.minute, title: r.title, lang: r.lang };
  }

  return { SWITCH, SWITCH_DEFAULT, enabled, fromRrule, keyOf, agrees, plan };
})();

if (typeof module !== 'undefined') module.exports = { FlowTodoRecurrence };
else if (typeof globalThis !== 'undefined') globalThis.FlowTodoRecurrence = FlowTodoRecurrence;
