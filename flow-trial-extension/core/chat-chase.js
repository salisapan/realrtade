// A "Waiting on Dana: ..." follow-up that Glance wrote from a chat (CHAT_PROMISE_CARD) and whose day has passed is a loop to chase.
// This module reads such a task's title and writes the short, polite reminder the person may put in the open chat's box: it never
// sends, and it never counts as the close (the close is the other side's payment or answer, see core/chat-payment-claim.js). Portable:
// no chrome.*, no DOM, no network. Behind the off switch CHAT_CHASE_DRAFT (default off), read by src/chat-task-card.js.
//
// Rules:
//   - only a task Glance wrote ("Waiting on <name>: <what>" / «מחכים ל<name>: <what>») in this chat, not undone, not closed;
//   - overdue means the due day is before today (a task due today is not chased yet), and at most 21 days back (older is not a nudge);
//   - one reminder per task per 3 days (the host keeps the last time);
//   - the words are short and neutral in both languages; the name, the amount and the day are the ones the task already holds.
const FlowChatChase = (() => {
  const SWITCH = 'CHAT_CHASE_DRAFT';
  const SWITCH_DEFAULT = false;
  const MIN_GAP_DAYS = 3;
  const MAX_OVERDUE_DAYS = 21;
  const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function enabled(flags) {
    if (!flags || typeof flags !== 'object') return SWITCH_DEFAULT;
    return flags[SWITCH] === true;
  }

  // { name, what, he, payment: { amount, currency } | null } from the task title, or null when it is not a waiting task.
  function parseWaiting(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    let m = t.match(/^Waiting on (.{1,40}?): (.{3,100})$/);
    let he = false;
    if (!m) { m = t.match(/^מחכים ל-?(.{1,40}?): (.{3,100})$/); he = !!m; }
    if (!m) return null;
    const name = m[1].trim();
    const what = m[2].trim();
    if (!name || !what) return null;
    const pay = what.match(/^(?:Payment|תשלום) (\d+(?:\.\d+)?) ([A-Za-z]{3})$/);
    return { name: name, what: what, he: he, payment: pay ? { amount: pay[1], currency: pay[2].toUpperCase() } : null };
  }

  function civil(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  // Whole days between the due day and today (positive = overdue), or null.
  function daysOverdue(dueIso, now) {
    const due = civil(dueIso);
    if (!due) return null;
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    return Math.round((today - due) / 86400000);
  }

  // The reminder text for one waiting task, in the task's own language.
  function draft(task, now) {
    const t = task || {};
    const w = parseWaiting(t.title);
    const od = daysOverdue(t.dueIso, now);
    if (!w || od == null) return '';
    const due = civil(t.dueIso);
    if (w.he) {
      const day = 'יום ' + DAYS_HE[due.getDay()];
      const what = w.payment ? 'לתשלום של ' + w.payment.amount + ' ' + w.payment.currency : w.what;
      return 'היי ' + w.name + ', תזכורת קטנה: עדיין מחכה ' + (w.payment ? what : 'ל: ' + what) + ' (היה אמור להגיע עד ' + day + '). אשמח לעדכון. תודה!';
    }
    const day = DAYS_EN[due.getDay()];
    const what = w.payment ? 'the ' + w.payment.amount + ' ' + w.payment.currency + ' payment' : w.what.charAt(0).toLowerCase() + w.what.slice(1);
    return 'Hi ' + w.name + ', a quick reminder: I\'m still waiting on ' + what + ' (it was due ' + day + '). Could you let me know where it stands? Thanks!';
  }

  // Which of the open waiting tasks (newest first, each { title, dueIso, lastNudgeAt }) to chase now, or null.
  function pick(tasks, now) {
    const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    for (const t of Array.isArray(tasks) ? tasks : []) {
      if (!t || !parseWaiting(t.title)) continue;
      const od = daysOverdue(t.dueIso, at);
      if (od == null || od < 1 || od > MAX_OVERDUE_DAYS) continue;
      if (t.lastNudgeAt && (at.getTime() - Number(t.lastNudgeAt)) < MIN_GAP_DAYS * 86400000) continue;
      return t;
    }
    return null;
  }

  return { SWITCH, SWITCH_DEFAULT, MIN_GAP_DAYS, MAX_OVERDUE_DAYS, enabled, parseWaiting, daysOverdue, draft, pick };
})();

if (typeof module !== 'undefined') module.exports = { FlowChatChase };
else if (typeof globalThis !== 'undefined') globalThis.FlowChatChase = FlowChatChase;
