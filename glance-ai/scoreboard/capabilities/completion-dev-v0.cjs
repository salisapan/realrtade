'use strict';
// Completion development rows (2026-11-15): the shapes the held-out completion gold exposed, moved here when fixed (see the header of labeling/completion-gold/completion-gold-v0.cjs).
module.exports.ASKS = {
  en2: ['en', 'Hi Noa,\n\nCan we meet next week to go over the proposal? Let me know what works for you.\n\nSali'],
  he2: ['he', 'נועה שלום,\n\nאפשר לקבוע פגישה בשבוע הבא כדי לעבור על ההצעה? תעדכני מה מתאים לך.\n\nסאלי']
};
module.exports.ASKS.en4 = ['en', 'Hi Lee,\n\nWould you be free on Thursday afternoon to review the draft together? Let me know what suits you.\n\nSali'];
module.exports.ASKS.he4 = ['he', 'ליאור שלום,\n\nמתי נוח לך השבוע לעבור על הטיוטה יחד? תעדכן אותי.\n\nסאלי'];
module.exports.ASKS.he1 = ['he', 'דנה שלום,\n\nתוכלי לשלוח לי את ההסכם החתום עד יום שישי?\n\nתודה,\nסאלי'];
module.exports.ROWS = [
  ['en', 'en4', 'Thursday at 15:00 works for me, see you then.', 'close'],
  ['he', 'he4', 'מחר ב-15:00 מתאים לי, נתראה.', 'close'],
  ['he', 'he1', 'אני לא במשרד עד יום שני, עם גישה מוגבלת למייל.', 'hold'],
  ['en', 'en2', 'Tuesday at 11:00 works for me. Sending an invite now.', 'close'],
  ['en', 'en2', 'Sounds good, let me check my calendar and come back to you.', 'open'],
  ['en', 'en2', 'Got it, thanks.', 'open'],
  ['en', 'en2', 'Can you tell me who else will join?', 'open'],
  ['en', 'en2', 'Please remove me from this list, we are not interested.', 'declined'],
  ['he', 'he2', 'יום שלישי ב-11:00 מתאים לי. שולחת עכשיו זימון.', 'close'],
  ['he', 'he2', 'נשמע טוב, אבדוק ביומן ואחזור אליך.', 'open'],
  ['he', 'he2', 'קיבלתי, תודה.', 'open'],
  ['he', 'he2', 'מי עוד יצטרף?', 'open'],
  ['he', 'he2', 'נא להסיר אותי מהרשימה, אנחנו לא מעוניינים.', 'declined']
];
