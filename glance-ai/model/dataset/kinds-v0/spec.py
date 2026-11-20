"""kinds-v0 spec: the KIND label space of the lab kind head, what each kind means (for the generator and the teacher), and the hard-negative shapes.
Kinds are the product's own closes (docs/glance-ai/holistic-close-map.md, scoreboard/capabilities/kinds.cjs probe kinds) plus calendar move/cancel and doc append.
`want` = the label the held-out kind-frozen set / union.cjs uses for the same close (scoreboard/capabilities/kind-frozen-run.cjs)."""
KINDS = {
 'cal_hold':      ('calendar', "someone proposes or fixes a specific meeting/call time with the reader (date AND time given): the reader should get a calendar hold"),
 'cal_booking':   ('calendar', "a booking/appointment notice: the reader's own appointment, table, flight, delivery slot or service visit is confirmed for a date and time"),
 'cal_recurring': ('calendar', "something that repeats on a schedule for the reader (a lesson every Monday, a weekly review each Thursday, a monthly payment on the 1st) and the reader should keep a recurring reminder"),
 'cal_move':      ('calendar', "an existing meeting is moved/postponed/rescheduled to a new date or time: the reader's calendar hold must be MOVED"),
 'cal_cancel':    ('calendar', "an existing meeting/appointment is cancelled: the reader's calendar hold must be REMOVED"),
 'video_link':    ('video_link', "someone asks for or agrees to an online video call (Google Meet / Teams / Zoom) at a time: the reader should get a calendar event with a video link"),
 'draft_reply':   ('draft', "someone asks the reader a direct question or for a decision/confirmation/information that needs a written reply (no document is to be created and no task is a deliverable)"),
 'task':          ('task', "the reader is asked (or reminded) to DO a piece of work by a date: send, prepare, review, call back, renew, submit; the reader should get a to-do with the deadline"),
 'commit_sender': ('task', "the SENDER promises to do something for the reader or others by a date ('I'll send the draft on Thursday'): the reader may want to track it"),
 'commit_reader': ('task', "an agreement the READER already made is restated: 'as agreed, you will send/deliver X by <date>' (the reader owes it)"),
 'notice_system': ('task', "an automated system/service notice with a deadline the reader must act on (trial ends, password expires, renewal due, document needs signature by a date)"),
 'pay':           ('pay', "a request to PAY a specific amount (invoice, bill, fee) by a date, from a person or a business: the reader owes money"),
 'file_save':     ('file_save', "an email/chat with an attached document the reader is asked to keep/save/file (to Drive/OneDrive/a folder)"),
 'doc_create':    ('doc_create', "the reader is asked to CREATE a new document (a Google Doc / a doc / a page of notes / minutes) with a stated name or topic"),
 'sheet_create':  ('sheet_create', "the reader is asked to CREATE a new spreadsheet / Google Sheet with a stated name or purpose"),
 'slides_create': ('slides_create', "the reader is asked to CREATE a new slide deck / presentation with a stated name or purpose"),
 'form_create':   ('form_create', "the reader is asked to CREATE a new form / survey / sign-up form with a stated name or purpose"),
 'word_create':   ('word_create', "the reader is asked to CREATE a new Word document (.docx, 'a Word file') with a stated name"),
 'excel_create':  ('excel_create', "the reader is asked to CREATE a new Excel workbook (.xlsx, 'an Excel file') with a stated name"),
 'sheet_row':     ('sheet_row', "the reader is asked to ADD ONE ROW to an existing spreadsheet/ledger: a record with an amount, a date and a label (expense, invoice, hours, mileage cost)"),
 'doc_append':    ('doc_append', "the reader is asked to ADD/APPEND a paragraph, section, bullet or note to an EXISTING named document"),
}
NEG_HINTS = {
 'cal_hold': "a hedge (maybe sometime, no rush), a meeting with no concrete time, a past meeting recap, someone else is meeting someone else, a negation",
 'cal_booking': "an offer/ad for booking, a cancelled booking, a booking for someone else, a past visit, a promo about availability",
 'cal_recurring': "a one-off event, a past habit, a newsletter schedule, a store opening-hours notice, a hedge ('we might do it weekly')",
 'cal_move': "a request to 'maybe move' with no decision, a move of someone else's meeting, a past change already handled, a meeting merely mentioned",
 'cal_cancel': "a cancellation of a subscription (not a meeting), a hedge ('may have to cancel'), someone else's meeting, a past cancellation recap",
 'video_link': "a call mentioned in the past, a phone call (not video), a hedge, a link to a recording, someone else's call",
 'draft_reply': "FYI/thanks/acknowledgement only, a rhetorical question, a question addressed to someone else, a mass-mail footer, an automated no-reply notice",
 'task': "FYI, a negation ('no need to do anything'), someone else acts, the past ('I already sent it'), a hedge, a newsletter, a Cc-only mention",
 'commit_sender': "a hedge ('I might'), a promise by someone else about someone else, the past, a question, no date and no action",
 'commit_reader': "a question ('did we agree?'), a hedge, the past, someone else owes it, a disagreement",
 'notice_system': "a marketing promo, a receipt/confirmation with no action, a notice already completed, a security notice with no deadline, a phishing-style demand",
 'pay': "a changed-bank-details payment demand (phishing-style: must stay silent), a receipt (already paid), a hedge, a quote only, someone else pays, a mass-mail promo",
 'file_save': "an attachment with no ask to save, a link only, FYI, a mass-mail footer with an attachment, an attachment already saved, a request to open it only",
 'doc_create': "a hedge ('maybe we should write a doc'), an existing doc to open, someone else creates it, the past ('I created the doc'), a request to edit an existing doc",
 'sheet_create': "a hedge, an existing sheet to open or edit, someone else creates it, the past, a request to add a row to an existing sheet",
 'slides_create': "a hedge, an existing deck to review, someone else builds it, the past, feedback on a deck",
 'form_create': "a hedge, an existing form to fill in, someone else makes it, the past, a form submission receipt",
 'word_create': "a hedge, an existing Word file to open/review, someone else creates it, the past, a request to edit an existing file",
 'excel_create': "a hedge, an existing Excel file to open/review, someone else creates it, the past, a request to edit an existing file",
 'sheet_row': "a row with no amount, an FYI about a number, someone else logs it, the past ('already logged'), a hedge, a request to create a new sheet",
 'doc_append': "a hedge, a request to create a NEW doc, someone else edits, the past ('I already added it'), a request only to read the doc",
}
GEN_SYSTEM = """You write SYNTHETIC test messages for a lab that trains a classifier on what a personal assistant could do for a person called Sali (the READER). Rules:
- Everything is invented. Never use real people, real companies, real phone numbers, real addresses or anything that looks like real mail. Use plain invented first names (Dana, Noam, Yael, Omer, Rina, Tal, Avi, Maya...) and invented small companies.
- Each message is ONE incoming message to Sali, either mail-shaped (optional subject line, greeting, body, signature, sometimes a short disclaimer or footer) or chat-shaped (short WhatsApp-style line or two, no greeting block).
- Vary wording freely (free paraphrase; do NOT reuse a template skeleton), politeness, length, register, typos, greeting (Hi Sali / Hi all / no greeting / Dear Sali / היי סאלי / שלום / no greeting), signatures, noise lines, and dates (use concrete dates and clock times, EN formats like Thursday Nov 19 at 15:00, HE formats like יום חמישי 19.11 בשעה 15:00).
- Output ONLY a JSON array, no prose, no code fences. Each element: {"lang":"en"|"he","shape":"mail"|"chat","subject":"" or a subject line,"text":"the message body"}.
- Hebrew messages must be natural modern Hebrew (not translated word for word)."""
