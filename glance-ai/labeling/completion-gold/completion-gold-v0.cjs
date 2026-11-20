'use strict';
// Completion gold v0 (2026-11-15): hand-written, held out. Competence 4 of docs/glance-ai/model-essence-2026-11-15.md: does the product know that a loop is DONE? A loop is
// closed on understanding, never on the mere fact that someone wrote back, so the error that matters is closing a loop on a reply that did not finish the ask. Each row is an
// ask the person sent (the loop) and one reply, with the gold: 'close' (the reply finishes it), 'declined' (a refusal: closed, never chased again), 'open' (the loop stays open:
// a promise to do it later, an acknowledgement, a question back, a half answer, an unrelated note) or 'hold' (an automatic reply: the loop is held, not closed).
// RULES: never train on it, never tune a rule against a row of it; a row that exposes a fixable shape moves to scoreboard/capabilities/completion-dev-v0.cjs and a fresh row is
// written here. Every text is written for this file (no real mail). Row: [lang, ask key, reply, gold].
module.exports.ASKS = {
  en1: ['en', 'Hi Dana,\n\nCould you send me the signed NDA by Friday?\n\nThanks,\nSali'],
  en2: ['en', 'Hi Noa,\n\nCan we meet next week to go over the proposal? Let me know what works for you.\n\nSali'],
  en3: ['en', 'Hi Tom,\n\nWhat is the price for ten users? I would like to compare it with the other quote.\n\nThanks,\nSali'],
  he1: ['he', 'דנה שלום,\n\nתוכלי לשלוח לי את ההסכם החתום עד יום שישי?\n\nתודה,\nסאלי'],
  he2: ['he', 'נועה שלום,\n\nאפשר לקבוע פגישה בשבוע הבא כדי לעבור על ההצעה? תעדכני מה מתאים לך.\n\nסאלי'],
  en4: ['en', 'Hi Lee,\n\nWould you be free on Thursday afternoon to review the draft together? Let me know what suits you.\n\nSali'],
  he4: ['he', 'ליאור שלום,\n\nמתי נוח לך השבוע לעבור על הטיוטה יחד? תעדכן אותי.\n\nסאלי'],
  he3: ['he', 'תום שלום,\n\nמה המחיר לעשרה משתמשים? אני רוצה להשוות להצעה השנייה.\n\nתודה,\nסאלי']
};
module.exports.ROWS = [
  ['en', 'en1', 'Here is the signed copy, attached. Let me know if anything is missing.', 'close'],
  ['en', 'en1', 'Will do, I will send it over tomorrow morning.', 'open'],
  ['en', 'en1', 'Thanks for the reminder!', 'open'],
  ['en', 'en1', 'Which version do you need, the short one or the full one?', 'open'],
  ['en', 'en1', 'We have decided not to move forward, so there is nothing to sign. Please do not follow up.', 'declined'],
  ['en', 'en1', 'I am out of the office until Monday with limited access to email.', 'hold'],
  ['en', 'en1', 'I will look into it when I get a chance.', 'open'],
  ['en', 'en3', 'For ten users it is 1,200 per year, billed annually.', 'close'],
  ['en', 'en3', 'Let me get back to you with the exact number next week.', 'open'],
  ['en', 'en3', 'Thanks for your interest! Our team will be in touch.', 'open'],
  ['en', 'en3', 'Do you need the cloud plan or the on-prem plan?', 'open'],
  ['en', 'en3', 'This is an automated reply. Your message has been received and a ticket was opened.', 'hold'],
  ['he', 'he1', 'מצורף ההסכם החתום. תגידי לי אם משהו חסר.', 'close'],
  ['he', 'he1', 'בטח, אשלח לך אותו מחר בבוקר.', 'open'],
  ['he', 'he1', 'אנחנו לא במשרד עד יום חמישי, נחזור אליך בהקדם.', 'hold'],
  ['he', 'he1', 'תודה על התזכורת!', 'open'],
  ['he', 'he1', 'איזו גרסה אתה צריך, הקצרה או המלאה?', 'open'],
  ['he', 'he1', 'החלטנו לא להתקדם, אז אין מה לחתום. נא לא להמשיך לפנות אלינו.', 'declined'],
  ['he', 'he3', 'לעשרה משתמשים זה 1,200 ש"ח לשנה, בחיוב שנתי.', 'close'],
  ['he', 'he3', 'אחזור אליך עם המספר המדויק בשבוע הבא.', 'open'],
  ['he', 'he3', 'תודה על העניין! הצוות שלנו ייצור קשר.', 'open'],
  ['he', 'he3', 'אתה צריך את תוכנית הענן או את המקומית?', 'open'],
  ['he', 'he3', 'זוהי תגובה אוטומטית. פנייתך התקבלה ונפתחה קריאה.', 'hold'],
  ['en', 'en4', 'Friday at 10:00 would be perfect, talk then.', 'close'],
  ['en', 'en4', 'Let me check my calendar and get back to you.', 'open'],
  ['en', 'en4', 'Thanks for reaching out!', 'open'],
  ['en', 'en4', 'Please take me off your list, I am not interested.', 'declined'],
  ['he', 'he4', 'ביום רביעי ב-16:00 מסתדר לי, נתראה אז.', 'close'],
  ['he', 'he4', 'אבדוק ואחזור אליך.', 'open'],
  ['he', 'he4', 'נא להסיר אותי מהרשימה, אני לא מעוניין.', 'declined']
];
