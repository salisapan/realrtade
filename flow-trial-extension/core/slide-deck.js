// A Slides deck from a meeting summary: a title and bullet slides.
// The mail names a summary or a deck, and it has at least two points.
// FYI, a newsletter, and a negation stay silent. Portable: no chrome.*,
// no DOM, no network.
const FlowSlideDeck = (() => {
  const QUIET = /\b(?:fyi|for your information|no action needed|no need to (?:reply|do anything)|unsubscribe|you(?:'| a)?re receiving this|you are receiving this|you received this email|maybe|perhaps)\b|לידיעתך|אין צורך|להסרה|קיבלת מייל זה|הנך רשום|אולי/i;
  const NEG = /\b(?:don't|do not|never)\b|אל\s*ת|לא\s+צריך/i;
  const CUE = /סיכום\s+פגישה|סיכום\s+הישיבה|סיכום\s+ישיבה|meeting summary|meeting notes|\bminutes\b/i;
  const DECK = /מצגת|\b(?:slide\s*deck|slides?|presentation)\b/i;

  function clean(s) {
    return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function bulletsOf(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    let under = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = String(lines[i] || '');
      if (/^\s*(?:החלטות|משימות|לביצוע|decisions|action items|next steps)\s*:?\s*$/i.test(raw)) {
        under = true;
        continue;
      }
      const marked = raw.match(/^\s*(?:[-*•–—]|\d+[.)])\s+(.+)$/);
      if (marked) {
        const cell = clean(marked[1]);
        if (cell.length >= 2 && cell.length <= 400) out.push(cell);
        under = false;
        continue;
      }
      if (under) {
        const cell = clean(raw);
        if (cell.length >= 2 && cell.length <= 400) out.push(cell);
        else if (!cell) under = false;
      }
      if (out.length >= 24) break;
    }
    return out;
  }

  function titleOf(text, subject, he) {
    const sub = clean(subject);
    if (sub && sub.length <= 120 && !/^(?:re|fw|fwd)\s*:/i.test(sub)) return sub;
    const line = String(text || '').split(/\r?\n/).map(clean).filter(Boolean)[0] || '';
    if (line && line.length <= 120) return line;
    return he ? 'סיכום פגישה' : 'Meeting summary';
  }

  function slidesOf(title, bullets) {
    const slides = [{ title: title, bullets: [] }];
    for (let i = 0; i < bullets.length; i += 6) {
      slides.push({ title: title, bullets: bullets.slice(i, i + 6) });
    }
    return slides.slice(0, 8);
  }

  function plan(input) {
    const i = input || {};
    const text = String(i.text || '');
    const subject = String(i.subject || '');
    const whole = subject ? subject + '\n' + text : text;
    if (!whole.trim() || QUIET.test(whole) || NEG.test(whole)) return null;
    if (!CUE.test(whole) && !DECK.test(whole)) return null;
    const bullets = bulletsOf(text);
    if (bullets.length < 2) return null;
    const he = /[\u0590-\u05FF]/.test(whole);
    const title = titleOf(text, subject, he);
    return {
      action: 'offer',
      title: title,
      bullets: bullets,
      slides: slidesOf(title, bullets),
      lang: he ? 'he' : 'en'
    };
  }

  return { plan: plan, bulletsOf: bulletsOf };
})();

if (typeof module !== 'undefined') module.exports = { FlowSlideDeck };
else if (typeof globalThis !== 'undefined') globalThis.FlowSlideDeck = FlowSlideDeck;
