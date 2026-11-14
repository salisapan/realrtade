'use strict';
// Capability probe set (2026-11-14): one row per KIND of close the product can execute, not per step. Written by hand, EN and HE, from the product's own
// capability list (docs/glance-ai/ecosystem-coverage.md, holistic-close-map.md, core/*.js readers). Every text is written for this file (no real mail).
// `want` is the family a careful reader expects to be offered: calendar | draft | task | file_save | file_find | doc_create | sheet_create | slides_create | form_create |
// `chain` = the worker's Drive/OneDrive search runs first (judge reason file-chain-not-run, by design), so the judge alone is silent and the row is not scored here;
// word_create | excel_create | sheet_row | doc_append | video_link | pay | none (silence is right). `surface` is where the product offers it.
// Negatives are the contrast: the same shape with the thing that makes it NOT a close (an existing file, a hedge, a negation, FYI, someone else acting).
module.exports = [
  // --- calendar family
  ['cal.hold', 'en', "Hi Sali, let's meet on Monday, October 12 at 10:00 to go over the budget.", 'calendar'],
  ['cal.hold', 'he', 'היי סאלי, בוא ניפגש ביום ראשון ה-11.10 בשעה 14:00 לעבור על התקציב.', 'calendar'],
  ['cal.hold.neg', 'en', "Hi Sali, maybe we could meet sometime next week, no rush.", 'none'],
  ['cal.move', 'en', 'Hi Sali, the Thursday sync at 10:00 is moved to Friday at 11:00.', 'calendar'],
  ['cal.move', 'he', 'היי סאלי, הפגישה של יום חמישי ב-10:00 נדחתה ליום שישי ב-11:00.', 'calendar'],
  ['cal.cancel', 'en', 'Hi Sali, the meeting on Thursday at 10:00 is cancelled.', 'calendar'],
  ['cal.cancel', 'he', 'היי סאלי, הפגישה ביום חמישי ב-10:00 בוטלה.', 'calendar'],
  ['cal.booking', 'en', 'Your appointment is confirmed for Sunday at 10:00 at the clinic.', 'calendar'],
  ['cal.booking', 'he', 'התור שלך נקבע ליום ראשון בשעה 10:00 במרפאה.', 'calendar'],
  ['cal.recurring', 'en', 'Your piano lesson is every Monday at 17:00.', 'calendar'],
  ['cal.recurring', 'he', 'השיעור שלך כל יום שני ב-17:00.', 'calendar'],
  ['cal.video', 'en', "Hi Sali, can we do a Google Meet call on Tuesday at 15:00 about the pilot?", 'video_link'],
  ['cal.video', 'he', 'היי סאלי, נוכל לעשות שיחת וידאו ביום שלישי ב-15:00 על הפיילוט?', 'video_link'],
  // --- reply / answer / info
  ['reply.ask', 'en', 'Hi Sali, could you send me the Q3 numbers by Wednesday? Thanks, Dana', 'draft'],
  ['reply.ask', 'he', 'היי סאלי, תוכל לאשר לי עד יום חמישי אם אתה מגיע לישיבה? תודה, דנה', 'draft'],
  ['reply.questions', 'he', 'סאלי היי,\n\n1. מה ההבדלים בין ענן מאובטח למחשב העובד ?\n2. האם תהיה התקנה בכל מחשב ?\n\nתודה,\nדנה', 'draft'],
  ['reply.questions', 'en', 'Hi Sali,\n\n1. What is the difference between the cloud plan and the on-prem plan?\n2. How many seats does the base price include?\n\nThanks,\nDana', 'draft'],
  ['reply.fyi', 'en', 'Hi Sali, FYI the office is closed on Friday. No action needed.', 'none'],
  ['reply.resolved', 'en', 'Hi Sali, no need to send anything, we are all set. Thanks!', 'none'],
  // --- tasks, reminders, commitments
  ['task.reminder', 'en', "Hi Sali, don't forget to bring the signed form on Monday.", 'task'],
  ['task.reminder', 'he', 'היי סאלי, אל תשכח להביא את הטופס החתום ביום שני.', 'task'],
  ['task.deadline', 'en', 'Hi Sali, I need the signed contract by Wednesday.', 'task'],
  ['task.work', 'en', 'Hi Sali, please create a task: call the bank next Tuesday.', 'task'],
  ['task.work', 'he', 'שלום, מלא את הטופס, חתום והחזר עד מחר. תודה, דנה', 'task'],
  ['task.callback', 'en', 'Hi Sali, please call me back on Thursday about the offer.', 'task'],
  ['commit.reader', 'en', 'Hi Sali, as agreed on the call, you will send the invoice by Friday.', 'task'],
  ['commit.reader', 'he', 'היי סאלי, לפי מה שסיכמנו בשיחה, אתה שולח את החשבונית עד יום שישי.', 'task'],
  ['commit.sender', 'en', "Hi Sali, I'll send you the signed contract by Friday. Dana", 'task'],
  ['commit.sender', 'he', 'היי סאלי, אשלח לך את החוזה החתום עד יום שישי. דנה', 'task'],
  ['commit.sender.neg', 'en', "Hi Sali, I'll try to send it at some point, no promises.", 'none'],
  // --- money
  ['pay.ask', 'en', 'Hi Sali, please transfer 500 NIS to my account by Sunday.', 'pay'],
  ['pay.ask', 'he', 'היי סאלי, תעביר לי 500 שקל עד יום ראשון.', 'pay'],
  ['pay.invoice', 'en', 'Hi Sali, please pay the ₪1,200 invoice by Friday.', 'pay'],
  ['pay.bankchange', 'en', 'Hi Sali, our bank details have changed. Please pay the ₪4,000 invoice to the new account by Friday.', 'none'],
  ['pay.confirmed', 'en', 'Hi Sali, we approved $1,200 for the Q4 plan this morning.', 'task'],
  ['notice.system', 'en', 'Your project will be paused on Oct 28 unless you update billing.', 'task'],
  // --- files
  ['file.save', 'en', 'Hi Sali, please save the attached pdf to Drive.', 'file_save', 1],
  ['file.save', 'he', 'היי סאלי, תשמור את הקובץ המצורף בדרייב.', 'file_save', 1],
  ['file.save.neg', 'en', "Hi Sali, please don't save the attachment, it's for reference only.", 'none', 1],
  ['file.find', 'en', 'Hi Sali, could you send me the signed vendor contract by Thursday?', 'chain'],
  ['file.find', 'he', 'היי סאלי, תוכל לשלוח לי את החוזה החתום עד יום חמישי?', 'chain'],
  ['file.receipt', 'en', 'Hi Sali, can you send me the receipt for the payment?', 'chain'],
  // --- create from a request
  ['doc.create', 'en', 'Hi Sali, please set up a shared doc called Q4 launch plan.', 'doc_create'],
  ['doc.create', 'he', 'היי סאלי, תפתח מסמך בשם תוכנית רבעון 4.', 'doc_create'],
  ['sheet.create', 'en', 'Hi Sali, please create a tracker spreadsheet called Pilot tracker.', 'sheet_create'],
  ['sheet.create', 'he', 'היי סאלי, תפתח גיליון בשם מעקב פיילוט.', 'sheet_create'],
  ['slides.create', 'en', 'Hi Sali, please create a slide deck called Board update.', 'slides_create'],
  ['form.create', 'en', 'Hi Sali, create a feedback form for the Q4 launch.', 'form_create'],
  ['word.create', 'en', 'Hi Sali, can you create a Word document called Lease summary?', 'word_create'],
  ['excel.create', 'he', 'היי סאלי, תפתח קובץ אקסל בשם הוצאות אוקטובר.', 'excel_create'],
  ['doc.create.neg', 'en', 'Hi Sali, please update the doc we already have with the new numbers.', 'none'],
  ['doc.create.neg', 'en', 'Hi Sali, please ask Dana to create a shared doc called Q4 plan.', 'none'],
  // --- write into an existing thing
  ['sheet.row', 'he', 'בבקשה תוסיף שורה לגיליון ההוצאות: 22/10, מונית, ₪85', 'sheet_row'],
  ['sheet.row', 'en', 'Please add a row to the expenses sheet: Oct 22, taxi, $85.', 'sheet_row'],
  ['doc.append', 'he', "בבקשה תוסיף את הפסקה הזו למסמך Q4: 'ברבעון הרביעי נתמקד בהשקת Glance.'", 'doc_append'],
  ['doc.append', 'en', 'Please add this paragraph to the Q4 doc: "In Q4 we focus on launching Glance."', 'doc_append']
];
