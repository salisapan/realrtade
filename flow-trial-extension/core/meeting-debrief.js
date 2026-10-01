// After a meeting: what came out of it — portable, no chrome.*, no DOM, no
// network, no model.
//
// Glance already puts a meeting on your Calendar. Once it has passed, the real
// value is the things agreed in it, which usually live only in your head. The
// person types or pastes a few lines ("Dana to send the contract by Friday",
// "I'll share the deck"); this reads each line locally and turns it into a
// loop: something you owe (direction 'mine') or something someone owes you
// ('theirs'). A line with no action is skipped, never guessed.
const FlowMeetingDebrief = (() => {
  const DAY_MS = 86400000;
  const DUE_WINDOW_DAYS = 10;

  const EN_OWNER = /^(?:(I|We|Me)|([A-Z][a-z]{1,20}(?: [A-Z][a-z]{1,20})?))\s*(?:(?:will|to|should|needs? to|must|is going to|are going to|'ll)\b|:)\s*(.+)$/;
  const HE_FUTURE_3 = '(?:ישלח|תשלח|יעדכן|תעדכן|יכין|תכין|יחזור|תחזור|יבדוק|תבדוק|יאשר|תאשר|יתאם|תתאם|יסגור|תסגור|יסיים|תסיים|יחתום|תחתום|ישלם|תשלם|יעביר|תעביר|יספק|תספק|יכתוב|תכתוב|ישיב|תשיב)';
  const HE_OWNER = new RegExp('^(אני|אנחנו|[א-ת]{2,}(?: [א-ת]{2,})?)\\s+(?:(' + HE_FUTURE_3 + ')|(אשלח|נשלח|אעדכן|נעדכן|אכין|נכין|אחזור|נחזור|אבדוק|נבדוק|אתאם|נתאם|אעביר|נעביר|אסגור|נסגור|אסיים|נסיים|אכתוב|נכתוב))(.*)$');
  const BULLET = /^\s*(?:[-*•–—]|\d+[.)]|(?:action(?: item)?s?|todo|ai|next steps?|משימה|משימות)\s*[:\-]\s*)\s*/i;

  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }
  function clip(t, n) { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x; }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayStart(now) { const d = new Date(typeof now === 'number' ? now : Date.now()); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  // notes: free text, one item per line (or ';' separated).
  // ctx:   { now?, extract, types } — FlowExtract and FlowRequestTypes.
  // Returns [{ direction, owner, what, deadlineIso, lang }].
  function parse(notes, ctx) {
    const c = ctx || {};
    const types = c.types || (typeof FlowRequestTypes !== 'undefined' ? FlowRequestTypes : null);
    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    if (!types) return [];
    const now = new Date(typeof c.now === 'number' ? c.now : Date.now());
    const todayIso = isoDay(dayStart(now.getTime()));
    const out = [];
    for (const raw of String(notes || '').split(/\n|;/)) {
      const line = raw.replace(BULLET, '').trim();
      if (words(line) < 3) continue;
      let direction = null, owner = null, what = null, lang = 'en';

      const he = /[֐-׿]/.test(line);
      if (he) {
        const m = line.match(HE_OWNER);
        if (!m) continue;
        const subject = m[1];
        // "אני אשלח" / "דנה תשלח": the verb carries the action; no lexicon needed.
        direction = (subject === 'אני' || subject === 'אנחנו' || m[3]) ? 'mine' : 'theirs';
        owner = direction === 'mine' ? null : subject;
        what = line; lang = 'he';
      } else {
        const m = line.match(EN_OWNER);
        if (m) {
          direction = m[1] ? 'mine' : 'theirs';
          owner = m[2] || null;
          if (!types.findAction(m[3])) continue;
          what = line;
        } else {
          const t = types.detectCommitmentSentence(line);
          if (!t) continue;
          direction = 'mine'; what = line;
        }
      }
      const d = ex && ex.parseDate ? ex.parseDate(line, now) : null;
      const deadlineIso = d && d.iso && d.iso >= todayIso ? d.iso : null;
      out.push({ direction, owner, what: clip(what, 140), deadlineIso, lang });
      if (out.length >= 12) break;
    }
    return out;
  }

  // A meeting Glance put on the Calendar is ready to debrief the day after it
  // happened, for ten days, until it is done or dismissed.
  function isDue(meeting, now) {
    if (!meeting || meeting.done || !meeting.dateIso) return false;
    const days = Math.round((dayStart(now).getTime() - new Date(meeting.dateIso + 'T00:00:00').getTime()) / DAY_MS);
    return days >= 1 && days <= DUE_WINDOW_DAYS;
  }

  return { parse, isDue, DUE_WINDOW_DAYS };
})();

if (typeof module !== 'undefined') module.exports = { FlowMeetingDebrief };
