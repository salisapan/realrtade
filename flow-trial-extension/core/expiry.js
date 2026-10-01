// Things that run out — portable, no chrome.*, no DOM, no network, no model.
//
// An offer valid until the 31st, a quote that expires, a trial that ends, a
// renewal that comes due. Nobody asks you to do anything; the date simply
// passes. Gmail never warns you. This recognises such a sentence in a message
// and says when to look again (three days before, never today).
//
// Local-first, silent when unsure (docs/local-first-principle.md):
//   - only VALIDITY wording counts ("valid until", "expires", "trial ends",
//     "renews on", "תקף עד"). "Due by" and "no later than" are asks, and asks
//     belong to Still Open and Waiting on, so they are deliberately not here.
//   - the date must be stated outright (extract.js refuses guesses).
//   - marketing noise is ignored: sales, discounts, coupons, newsletters.
const FlowExpiry = (() => {
  const CUE_EN = /\b(?:valid (?:until|through|till|thru)|good (?:until|through)|expires?(?: on)?|expiring|expiry(?: date)?|(?:offer|quote|proposal|trial|subscription|membership|license|warranty|certificate|visa|passport|contract|price|pricing|rate|reservation|hold) (?:ends|expires|is valid|remains valid|holds)|renews? on|renewal (?:date|is)|open until|(?:last|final) day to)\b/i;
  const CUE_HE = /(?:תקף עד|בתוקף עד|פג תוקף|פוקע|יפוג|תוקף ההצעה|מתחדש ב|חידוש ב|היום האחרון ל)/;
  const NOISE = /\b(?:unsubscribe|% off|\d+% |sale|discount|coupon|promo(?:tion)?|limited[- ]time|shop now|flash|newsletter|webinar|black friday|free shipping|view in browser|no longer wish)\b|(?:הנחה|מבצע|הסרה מרשימת|ניוזלטר)/i;
  const MIN_WORDS = 4;

  function words(t) { return (String(t || '').match(/\S+/g) || []).length; }
  function sentences(text) {
    return String(text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  }
  function hasHebrew(t) { return /[֐-׿]/.test(t); }
  function clip(t, n) { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x; }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayStart(now) { const d = new Date(typeof now === 'number' ? now : Date.now()); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  // What kind of thing runs out, for the card title.
  function noun(text) {
    const t = String(text);
    if (/\btrial\b|ניסיון/i.test(t)) return 'trial';
    if (/\b(?:passport|visa|license|certificate|warranty)\b|דרכון|רישיון|תעודה|אחריות/i.test(t)) return 'document';
    if (/\brenew|חידוש|מתחדש/i.test(t)) return 'renewal';
    if (/\b(?:reservation|hold|booking)\b|הזמנה|שריון/i.test(t)) return 'reservation';
    if (/\b(?:quote|quotation|proposal|estimate|offer|price|pricing|rate)\b|הצעה|הצעת/i.test(t)) return 'offer';
    return 'date';
  }

  // The day to look again: three days before, but never today and never after.
  function warnDate(expiresIso, now) {
    const t0 = dayStart(now);
    const tomorrow = new Date(t0.getTime()); tomorrow.setDate(tomorrow.getDate() + 1);
    const exp = new Date(expiresIso + 'T00:00:00');
    const three = new Date(exp.getTime()); three.setDate(three.getDate() - 3);
    const w = three.getTime() < tomorrow.getTime() ? tomorrow : three;
    return isoDay(w.getTime() > exp.getTime() ? exp : w);
  }

  // text: one message body, quoted history removed.
  // ctx:  { now?, extract } — extract is core/extract.js's FlowExtract.
  // Returns null (silence) or { noun, what, expiresIso, warnIso, lang }.
  function detect(text, ctx) {
    const c = ctx || {};
    const body = String(text || '');
    if (words(body) < MIN_WORDS || NOISE.test(body)) return null;
    const ex = c.extract || (typeof FlowExtract !== 'undefined' ? FlowExtract : null);
    if (!ex || !ex.parseDate) return null;
    const now = new Date(typeof c.now === 'number' ? c.now : Date.now());
    const todayIso = isoDay(dayStart(now.getTime()));
    for (const s of sentences(body)) {
      if (words(s) < MIN_WORDS) continue;
      if (!(CUE_EN.test(s) || (hasHebrew(s) && CUE_HE.test(s)))) continue;
      const d = ex.parseDate(s, now);
      if (!d || !d.iso || d.iso <= todayIso) continue;
      const kind = noun(s) !== 'date' ? noun(s) : noun(body.slice(0, 400));
      return { noun: kind, what: clip(s, 140), expiresIso: d.iso, warnIso: warnDate(d.iso, now.getTime()), lang: hasHebrew(s) ? 'he' : 'en' };
    }
    return null;
  }

  // Days from today to the expiry (negative once it has passed).
  function daysLeft(expiresIso, now) {
    return Math.round((new Date(expiresIso + 'T00:00:00').getTime() - dayStart(now).getTime()) / 86400000);
  }

  const TITLES = { offer: 'This offer', trial: 'This trial', renewal: 'This renewal', document: 'This document', reservation: 'This hold', date: 'This' };
  function title(noun_) { return TITLES[noun_] || TITLES.date; }

  return { detect, daysLeft, warnDate, title };
})();

if (typeof module !== 'undefined') module.exports = { FlowExpiry };
