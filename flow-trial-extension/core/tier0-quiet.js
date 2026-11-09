'use strict';
// Quiet on the engine's own card when the mail itself says there is nothing to do yet (docs/glance-ai/ai-product.md §3):
//   hedge       a vague "some time" with no real day or clock: "let's catch up when things calm down", "no rush", «כשיירגע», «אין לחץ»
//   undecided   the sender says it is not decided: "we haven't decided", «עדיין לא החלטנו»
//   retro       a past deadline that was already met: "it was due last Friday and we signed on time", «…שעבר וחתמנו בזמן»
// Each rule is silence-only and narrow: a hedge with a real deadline ("no rush, but by Friday") still offers. Measured with 0 right
// cards lost on the 786 lab cases and 0 of 1,731 positives silenced on two held-out sets (v2-heldout-test, sft-v2-val).
// Model cards already pass the floor's gate (core/ai-floor.js: undated -> silence); this covers the engine's own card (tier 0).
// Off switch: SWITCH ('aiTier0QuietV1'), default off: core/ai-engine.js does not call it. Portable: no chrome.*, no DOM, no network.
const FlowTier0Quiet = (() => {
  const SWITCH = 'aiTier0QuietV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const DEADLINE = /\b(?:by|before|until|till|on|at|due)\s+(?:the\s+)?(?:mon|tue|wed|thu|fri|sat|sun)\w*|\b(?:today|tomorrow|tonight|eod|eow|this week|next week|end of (?:the )?(?:day|week|month))\b|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b|\b\d{1,2}[\/.]\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|(?:^|[\s,.])(?:עד|ב|ביום)\s*(?:יום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|(?:מחר|היום|השבוע|בשבוע הבא|סוף השבוע)|\d{1,2}:\d{2}/i;
  const HEDGE = /\b(?:when things (?:calm|quiet|settle) down|whenever (?:you|we) (?:can|get a chance)|no rush|no hurry|sometime(?:\s+(?:next|this)\s+(?:week|month))?|at some point|one of these days)\b|כשיירגע|כשירגע|כשיהיה\s+(?:לך\s+|לנו\s+)?זמן|אין\s+לחץ|אין\s+דחיפות|מתישהו/i;
  const UNDECIDED = /\b(?:we|i)\s+(?:haven't|have not)\s+decided|\bnot\s+(?:yet\s+)?decided\b|\bstill\s+deciding\b|עדיין\s+לא\s+החלטנו|לא\s+החלטנו\s+עדיין|עוד\s+לא\s+החלטנו|טרם\s+החלטנו/i;
  const PAST = /\blast\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\byesterday\b|שעבר(?:ה)?(?=$|[\s,.!?])|אתמול/i;
  const DONE = /\b(?:we|i)\s+(?:already\s+)?(?:signed|paid|sent|submitted|delivered|did it|took care of it)\b|\balready\s+(?:signed|paid|sent|done)\b|(?:^|[\s,.ו])(?:חתמנו|שילמנו|שלחנו|הגשנו|סיימנו|טיפלנו)(?=$|[\s,.!?])/i;
  const FORWARD = /\b(?:let'?s|can we|could we|next time|again|reschedul\w*)\b|בוא\s+נ|בואו\s+נ|נקבע|שוב/i;

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }

  // check(mail, step) -> null | 'quiet:hedge' | 'quiet:undecided' | 'quiet:retro'. mail: { text, subject }. step: the card's step.
  function check(mail, step) {
    mail = mail || {};
    const t = String(mail.text || '') + '\n' + String(mail.subject || '');
    if (!step || step === 'SILENT') return null;
    if (UNDECIDED.test(t)) return 'quiet:undecided';
    if ((step === 'draft' || step === 'calendar' || step === 'task') && HEDGE.test(t) && !DEADLINE.test(t)) return 'quiet:hedge';
    if ((step === 'task' || step === 'calendar') && PAST.test(t) && DONE.test(t) && !FORWARD.test(t)) return 'quiet:retro';
    return null;
  }

  return { SWITCH, DEFAULTS, enabled, check };
})();

if (typeof module !== 'undefined') module.exports = { FlowTier0Quiet };
