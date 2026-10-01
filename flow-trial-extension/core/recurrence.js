// Things that come around again — portable, no chrome.*, no DOM, no network,
// no model. If you ask the same person for the same kind of thing every month
// (the report, the invoice, the sign-off), Glance learns the rhythm from the
// loops you already opened and says when the next one is probably due.
//
// Conservative on purpose: at least three occurrences, every gap within a
// quarter of the median gap, a median between a week and about three months.
// Anything less regular stays silent. A prediction is a suggestion, shown once.
const FlowRecurrence = (() => {
  const MIN_OCCURRENCES = 3;
  const MAX_DATES = 8;
  const MAX_KEYS = 40;
  const MIN_PERIOD = 5;
  const MAX_PERIOD = 100;
  const TOLERANCE = 0.25;
  const SHOW_BEFORE_DAYS = 10;
  const SHOW_AFTER_DAYS = 3;
  const DAY_MS = 86400000;

  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayStart(now) { const d = new Date(typeof now === 'number' ? now : Date.now()); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayNum(iso) { return Math.round(new Date(iso + 'T00:00:00').getTime() / DAY_MS); }

  // Same person, same kind of loop, same direction.
  function keyOf(w) {
    const who = (w.counterpart && (w.counterpart.email || w.counterpart.name)) || '';
    if (!who) return null;
    return String(who).toLowerCase() + '|' + (w.subtype || w.kind || 'reply') + '|' + (w.direction === 'mine' ? 'mine' : 'theirs');
  }

  function labelOf(w) {
    const who = (w.counterpart && (w.counterpart.name || w.counterpart.email)) || '';
    const first = String(who).split(/[\s@]/)[0];
    if (w.direction === 'mine') return 'Your update for ' + first;
    return (w.kind === 'payment' ? 'Payment from ' : 'Reply from ') + first;
  }

  // history: { [key]: { label, dates:['YYYY-MM-DD'...] } }. Returns a new object.
  // A loop is recorded by the day it was OPENED (when you asked).
  function record(history, w, now) {
    const h = Object.assign({}, history || {});
    const key = keyOf(w || {});
    if (!key || !w.createdAt) return h;
    const day = isoDay(new Date(w.createdAt));
    const cur = h[key] || { label: labelOf(w), dates: [] };
    if (cur.dates.indexOf(day) !== -1) return h;
    const dates = cur.dates.concat(day).sort().slice(-MAX_DATES);
    h[key] = { label: labelOf(w), dates };
    const keys = Object.keys(h);
    if (keys.length > MAX_KEYS) {
      keys.sort((a, b) => (h[a].dates[h[a].dates.length - 1] || '').localeCompare(h[b].dates[h[b].dates.length - 1] || ''));
      keys.slice(0, keys.length - MAX_KEYS).forEach((k) => { delete h[k]; });
    }
    return h;
  }

  function median(nums) {
    const s = nums.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // acked: { [key]: 'YYYY-MM-DD' } the predictions already shown or accepted.
  // Returns [{ key, label, nextIso, periodDays, count }] soonest first.
  function predict(history, now, acked) {
    const t0 = dayStart(now).getTime();
    const out = [];
    for (const key of Object.keys(history || {})) {
      const e = history[key];
      const dates = (e && e.dates) || [];
      if (dates.length < MIN_OCCURRENCES) continue;
      const nums = dates.map(dayNum);
      const gaps = [];
      for (let i = 1; i < nums.length; i++) gaps.push(nums[i] - nums[i - 1]);
      const med = median(gaps);
      if (med < MIN_PERIOD || med > MAX_PERIOD) continue;
      const tol = Math.max(2, med * TOLERANCE);
      if (gaps.some((g) => Math.abs(g - med) > tol)) continue;
      const next = new Date(Math.round((nums[nums.length - 1] + med) * DAY_MS));
      const nextDay = new Date(next.getFullYear(), next.getMonth(), next.getDate());
      const nextIso = isoDay(nextDay);
      const delta = Math.round((nextDay.getTime() - t0) / DAY_MS);
      if (delta > SHOW_BEFORE_DAYS || delta < -SHOW_AFTER_DAYS) continue;
      if (acked && acked[key] === nextIso) continue;
      out.push({ key, label: e.label, nextIso, periodDays: Math.round(med), count: dates.length });
    }
    return out.sort((a, b) => a.nextIso.localeCompare(b.nextIso));
  }

  // "about every month" for the card.
  function periodWords(days) {
    if (days <= 9) return 'about every week';
    if (days <= 16) return 'about every two weeks';
    if (days <= 38) return 'about every month';
    if (days <= 70) return 'about every two months';
    return 'about every quarter';
  }

  return { record, predict, keyOf, periodWords, MIN_OCCURRENCES };
})();

if (typeof module !== 'undefined') module.exports = { FlowRecurrence };
