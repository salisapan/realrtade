'use strict';
// Is this mail worth a model read at all? (docs/glance-ai/ai-product.md §3, cost.) When the device engine is silent and the mail carries no
// sign of something to do (no question, no request, no promise, no meeting, no time or date, no attachment, no decision or confirmation, in
// English or Hebrew), no model is asked, neither the device model nor Glance cloud. It saves the owner's spend cap and the person's
// allowance on mail that cannot hold a close.
// Measured: 0 of 1,731 positives in two held-out sets (v2-heldout-test, sft-v2-val) lack a signal; 1,131 of 6,372 negatives do. On the
// 786 lab cases it skips 30 of 233 cloud calls and loses no model card and no labelled close.
// Silence-only: it never adds a card, and it never touches the engine's own card. Off switch: SWITCH ('aiCloudWorthV1'), default off:
// core/ai-engine.js does not call it. Portable: no chrome.*, no DOM, no network.
const FlowCloudWorth = (() => {
  const SWITCH = 'aiCloudWorthV1';
  const DEFAULTS = Object.freeze({ [SWITCH]: false });
  const SIGNAL = new RegExp([
    '\\?','\\b(?:please|pls|kindly|could you|can you|would you|will you|let me know|need|needs|needed|send|share|sign|confirm|approve|review|pay|transfer|call|meet|meeting|schedule|book|reschedul\\w*|deadline|due|by|until|before|asap|urgent|reminder|attached|attachment|enclosed|i\'ll|i will|we\'ll|we will|i\'m going to|promise\\w*|you said|you\'d|you mentioned|get back|decided|approved|approve|confirmed|agreed|follow(?:ing)? up|waiting|invoice|contract|form|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)\\b',
     '\\d{1,2}[:.]\\d{2}|\\d{1,2}[/.]\\d{1,2}|\\b\\d{1,2}\\s*(?:am|pm)\\b',
     'בבקשה|אפשר|תוכל|תוכלי|תוכלו|צריך|צריכה|נא\\s|לשלוח|תשלח|תשלחי|לחתום|לאשר|תאשר|לשלם|להעביר|תעביר|תעבירי|נפגש|פגישה|לקבוע|שיחה|עד\\s|לפני|דחוף|מצורף|מצורפת|אשלח|נשלח|אעביר|אחזור|אדאג|תזכורת|חשבונית|חוזה|טופס|היום|מחר|השבוע|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|ממתין|ממתינה|מחכה|אישרנו|מאשר|מאשרת|מאשרים|אושר|החלטנו|סיכמנו|אמרת|הבטחת'
  ].join('|'), 'i');

  function enabled(flags) { return !!(flags && flags[SWITCH] === true); }
  // worth(mail) -> true when the mail carries any sign of something to do. mail: { text, subject, attachmentCount }.
  function worth(mail) {
    mail = mail || {};
    if (Number(mail.attachmentCount || 0) > 0) return true;
    return SIGNAL.test(String(mail.text || '') + '\n' + String(mail.subject || ''));
  }

  return { SWITCH, DEFAULTS, enabled, worth };
})();

if (typeof module !== 'undefined') module.exports = { FlowCloudWorth };
