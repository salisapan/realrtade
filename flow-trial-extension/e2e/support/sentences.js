// Sentences already classified by the on-device judge (mail-format corpus / 0.9.38).
// The suite does not re-tune them. Dates are not asserted: CI runs in two time zones.

const SHOW = 'Could you confirm the transfer by Friday?';
const SILENT = 'Thanks so much for the call. Let me know if you have any questions.';
const SAME_LINE_PHONE = 'Sent from my iPhone. Could you confirm the transfer by Friday?';
const OWN_LINE_PHONE = 'Could you confirm the transfer by Friday?\nSent from my iPhone';
const HEBREW_TASK = 'נשלח מהאייפון שלי: תוכל לשלוח לי את החוזה עד יום חמישי?';
const SUGGEST_BODY = 'Thanks, attaching the board pack for your records today.';
const BULK_BODY = 'Unsubscribe from this newsletter and join our webinar tomorrow.';
const RLM_SHOW = '\u200FCould you confirm the transfer by Friday?';

const ME = 'glance.salisapan@outlook.com';
const SENDER = 'ai.local.flow@gmail.com';
const OTHER = 'other@elsewhere.com';
const GMAIL_ME = 'me@x.com';

const MSG_SHOW = 'AQMkGlanceE2EMessageShow';
const MSG_SILENT = 'AQMkGlanceE2EMessageSilent';
const MSG_A = 'AQMkGlanceE2EMessageA';
const MSG_B = 'AQMkGlanceE2EMessageB';
const MSG_TODO = 'AQMkGlanceE2EMessageTodo';
const MSG_PHONE = 'AQMkGlanceE2EMessagePhone';
const MSG_PREVIEW_PANE = 'AQMkGlanceE2EMessagePane';
const CONV_MISMATCH = 'AQQkGlanceE2EConversationA';

module.exports = {
  SHOW, SILENT, SAME_LINE_PHONE, OWN_LINE_PHONE, HEBREW_TASK, SUGGEST_BODY, BULK_BODY, RLM_SHOW,
  ME, SENDER, OTHER, GMAIL_ME,
  MSG_SHOW, MSG_SILENT, MSG_A, MSG_B, MSG_TODO, MSG_PHONE, MSG_PREVIEW_PANE, CONV_MISMATCH
};
