'use strict';
// Kind-level frozen set v0 (2026-11-14): hand-written, held out. One row per shape of each KIND of close, EN and HE, with the contrast beside it (a hedge, a negation,
// FYI, someone else acts, the past, a changed bank, a mass-mail footer). Written AFTER the probe set (glance-ai/scoreboard/capabilities/probe-set.cjs) and with different
// wording, so the probe can be tuned against and this cannot. RULES: never train on it, never tune an engine rule against a row of it; when a row exposes a gap, fix the
// engine from the probe set's shape, move the row to the probe set and write a fresh row here. v0 first reading (before any fix): 61 of 89 rows with a close, 49 of 50 contrast rows silent;
// the four rows it exposed a fixable shape with were then moved to the probe set and replaced here (own-name vocative before a request, a past meeting named «last <day>», «אנא + imperative» for a payment). Every text is written for this file (no real mail).
// Row: [kind, lang, text, want, attachmentCount]. want: calendar | draft | task | file_save | pay | video_link | doc_create | sheet_create | sheet_row | word_create | excel_create | none
module.exports = [
  // --- hold a meeting
  ['cal.hold', 'en', 'Hi Sali, are you free to catch up on Tuesday, October 13 at 16:00? It would be good to align on pricing.', 'calendar'],
  ['cal.hold', 'en', 'Sali, I booked us a review for Wednesday at 11:30 in the big room. Please confirm you can join.', 'calendar'],
  ['cal.hold', 'en', 'Let us do the kickoff on Thursday the 8th at 09:00.', 'calendar'],
  ['cal.hold', 'he', 'סאלי שלום, מתאים לך להיפגש ביום שלישי ב-16:00 לדבר על התמחור?', 'calendar'],
  ['cal.hold', 'he', 'קבעתי לנו סקירה ליום רביעי בשעה 11:30. תאשר שאתה מגיע.', 'calendar'],
  ['cal.hold', 'he', 'נעשה את הקיק-אוף ביום חמישי ב-9:00.', 'calendar'],
  ['cal.hold.neg', 'en', 'We should really sync at some point. Let me know when works, no rush at all.', 'none'],
  ['cal.hold.neg', 'he', 'כדאי שניפגש מתישהו, תגיד לי מתי נוח לך, אין לחץ.', 'none'],
  ['cal.hold.neg', 'en', 'Our sync last Wednesday at 15:00 was productive, thank you for joining.', 'none'],
  // --- booking notices
  ['cal.booking', 'en', 'Reminder: your dental check-up is on Monday at 08:45. Please arrive ten minutes early.', 'calendar'],
  ['cal.booking', 'en', 'Booking confirmed. Table for 4, Saturday 20:00.', 'calendar'],
  ['cal.booking', 'he', 'תזכורת: הבדיקה שלך ביום שני בשעה 08:45. נא להגיע 10 דקות לפני.', 'calendar'],
  ['cal.booking', 'he', 'השולחן שלכם נשמר ליום שבת בשעה 20:00.', 'calendar'],
  ['cal.booking.neg', 'en', 'Our clinic will be closed for renovation next month. We apologise for any inconvenience.', 'none'],
  // --- recurring
  ['cal.recurring', 'en', 'Our team stand-up is every weekday at 09:30, starting tomorrow.', 'calendar'],
  ['cal.recurring', 'he', 'הסטנד-אפ של הצוות כל יום ראשון ב-10:00.', 'calendar'],
  // --- video
  ['cal.video', 'en', 'Hi Sali, could we jump on a Meet on Friday at 14:00 to go over the proposal?', 'video_link'],
  ['cal.video', 'he', 'סאלי, נוכל לדבר בשיחת וידאו ביום חמישי ב-13:00 על ההצעה?', 'video_link'],
  // --- replies
  ['reply.ask', 'en', 'Hi Sali, would you mind confirming the delivery address before Thursday? Thanks, Noa', 'draft'],
  ['reply.ask', 'en', 'Sali, please let me know which plan you prefer by Friday.', 'draft'],
  ['reply.ask', 'he', 'שלום סאלי, תוכל לאשר לי את כתובת המשלוח עד יום חמישי? תודה, נועה', 'draft'],
  ['reply.ask', 'he', 'סאלי, תגיד לי בבקשה איזו חבילה אתה מעדיף עד יום שישי.', 'draft'],
  ['reply.questions', 'en', 'Hi Sali,\n\nA few questions before we sign:\n1. Does the price include VAT?\n2. What is the notice period?\n\nBest,\nNoa', 'draft'],
  ['reply.questions', 'he', 'שלום סאלי,\n\nכמה שאלות לפני שחותמים:\n1. האם המחיר כולל מע"מ?\n2. מה תקופת ההודעה המוקדמת?\n\nבברכה,\nנועה', 'draft'],
  ['reply.neg', 'en', 'FYI: the shared drive will be read-only on Sunday. No action required.', 'none'],
  ['reply.neg', 'he', 'לידיעתך, הכונן המשותף יהיה לקריאה בלבד ביום ראשון. אין צורך בפעולה.', 'none'],
  ['reply.neg', 'en', 'Thanks, that works for me.', 'none'],
  ['reply.neg', 'he', 'תודה רבה, מעולה.', 'none'],
  ['reply.neg', 'en', 'Maybe we could talk about the pricing at some point, only if you have time.', 'none'],
  ['reply.neg', 'en', 'Hi Sali, please ask Noa to send the figures by Friday.', 'none'],
  // --- tasks
  ['task.deadline', 'en', 'Sali, I need the final deck by Wednesday morning.', 'task'],
  ['task.deadline', 'en', 'Please submit the expense report by end of day Friday.', 'task'],
  ['task.deadline', 'he', 'סאלי, אני צריכה את המצגת הסופית עד יום רביעי.', 'task'],
  ['task.deadline', 'he', 'נא להגיש את דוח ההוצאות עד סוף יום שישי.', 'task'],
  ['task.reminder', 'en', 'Reminder: bring your ID to the appointment on Wednesday.', 'task'],
  ['task.reminder', 'he', 'תזכורת: להביא תעודת זהות לפגישה ביום רביעי.', 'task'],
  ['task.callback', 'en', 'Sali, can you ring me back tomorrow about the contract?', 'task'],
  ['task.callback', 'he', 'סאלי, תחזור אליי מחר בנוגע לחוזה, בסדר?', 'task'],
  ['task.neg', 'en', 'I submitted the expense report yesterday.', 'none'],
  ['task.neg', 'he', 'הגשתי את דוח ההוצאות אתמול.', 'none'],
  ['task.neg', 'en', 'There is no need to submit anything by Friday.', 'none'],
  // --- own commitments
  ['commit.sender', 'en', 'Hi Sali, I will email you the revised quote on Wednesday. Noa', 'task'],
  ['commit.sender', 'he', 'שלום סאלי, אשלח לך את ההצעה המעודכנת ביום רביעי. נועה', 'task'],
  ['commit.reader', 'en', 'Per our call, you will forward the signed NDA by Thursday.', 'task'],
  ['commit.reader', 'he', 'לפי מה שסיכמנו, אתה מעביר את ה-NDA החתום עד יום חמישי.', 'task'],
  ['commit.neg', 'en', 'I might send the quote at some point, no promises.', 'none'],
  ['commit.neg', 'he', 'אולי אשלח את ההצעה מתישהו, בלי התחייבות.', 'none'],
  // --- money
  ['pay.ask', 'en', 'Hi Sali, kindly wire 2,300 NIS to my account by Monday.', 'pay'],
  ['pay.ask', 'he', 'שלום סאלי, אנא שלם לי 1,450 ש"ח עד יום שלישי.', 'pay'],
  ['pay.ask', 'en', 'Please settle the ₪780 balance by Thursday.', 'pay'],
  ['pay.neg', 'en', 'Update: our bank account has changed. Please wire the 5,000 invoice to the new account by Friday.', 'none'],
  ['pay.neg', 'he', 'פרטי הבנק שלנו עודכנו. אנא העבר 5,000 ש"ח לחשבון החדש עד יום שישי.', 'none'],
  ['pay.neg', 'en', 'Your account will be suspended within 24 hours. Enter your card details to avoid suspension.', 'none'],
  ['pay.neg', 'en', 'Thanks for your payment of $120, received on Sunday.', 'none'],
  // --- notices
  ['notice.system', 'en', 'Your trial ends on Nov 3. Add a payment method to keep your workspace.', 'task', 0, { sender: { name: 'Acme', email: 'billing@acme-cloud.com' } }],
  ['notice.neg', 'en', 'Weekly digest: 12 new posts you may like. Unsubscribe anytime. You are receiving this because you subscribed.', 'none'],
  ['notice.neg', 'he', 'הנך רשום לרשימת התפוצה שלנו. להסרה מהרשימה לחץ כאן.', 'none'],
  // --- files
  ['file.save', 'en', 'Hi Sali, please store the attached agreement in our shared Drive folder.', 'file_save', 1],
  ['file.save', 'he', 'סאלי, תשמור בבקשה את ההסכם המצורף בתיקייה המשותפת.', 'file_save', 1],
  ['file.neg', 'en', 'Attached is the agreement for your records. Nothing to do.', 'none', 1],
  // --- creating files
  ['doc.create', 'en', 'Sali, could you start a shared doc called Hiring plan 2027?', 'doc_create'],
  ['doc.create', 'he', 'סאלי, תוכל לפתוח מסמך משותף בשם תוכנית גיוס 2027?', 'doc_create'],
  ['sheet.create', 'en', 'Please set up a spreadsheet called Vendor comparison.', 'sheet_create'],
  ['sheet.create', 'he', 'בבקשה תפתח גיליון בשם השוואת ספקים.', 'sheet_create'],
  ['slides.create', 'en', 'Can you create a slide deck called Investor update?', 'slides_create'],
  ['word.create', 'en', 'Sali, please create a Word document called Employment terms.', 'word_create'],
  ['excel.create', 'en', 'Could you make an Excel workbook called Payroll check?', 'excel_create'],
  ['file.neg', 'en', 'Please update the vendor sheet we already have with the new quotes.', 'none'],
  ['file.neg', 'en', 'Hi Sali, ask Noa to open a doc called Hiring plan.', 'none'],
  ['file.neg', 'he', 'אין צורך לפתוח מסמך חדש, אנחנו משתמשים בקיים.', 'none'],
  // --- rows
  ['sheet.row', 'en', 'Please add a row to the mileage sheet: Nov 2, client visit, 48 km.', 'sheet_row'],
  ['sheet.row', 'he', 'בבקשה תוסיף שורה לגיליון הקילומטראז: 2/11, ביקור לקוח, 48 ק"מ.', 'sheet_row']
];
