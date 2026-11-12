# What changed in the code (generated from git, do not edit by hand)

Glance closes open loops. Gmail is where it starts today.

Source: `git log origin/claude/install-uiux-pro-max-skill-a4agox --since=2026-10-20` limited to `flow-trial-extension/core`, `flow-trial-extension/src`, `flow-trial-extension/manifest.json` and `glance-gmail-addon/`. Regenerate: `scripts/what-changed.sh 2026-10-20 > docs/glance-ai/shipped-in-code.md`.

- Extension version in `manifest.json` on the branch: 0.9.56
- Commits on the working branch that are not on `main`: 184. `main` and the store package do not carry them yet (merging to main and publishing need the owner's «מאשר»).
- Lines changed in core, src and the add-on since `main`: 75 files changed, 8973 insertions(+), 569 deletions(-)

| Commit | When | What it changed in code | Files in core, src or the add-on |
|---|---|---|---|
| d166efd5 | 2026-11-12 | Decompose v1 (off): every intention of a mail, with its parts and steps | core/README.md core/intent-decompose.js  |
| d79bb595 | 2026-11-11 | Whitespace robustness in the shared judge (found by the metamorphic check) with its corpus; contrast pairs 18 to 34 | core/incoming-judge.js glance-gmail-addon/CoreBundle.js  |
| 48842602 | 2026-11-11 | Plan 2 for the model; Hebrew reader-commitment parity fix in the engine with its corpus; ratchet grown; v2.9 measured | core/intent.js glance-gmail-addon/CoreBundle.js  |
| 6b12ac69 | 2026-11-11 | C-1 alignment as an engine option (confirmedAmountSilent, off by default) with its corpus; hard-quiet reasons as one lab list; batch-008 blind batch | core/incoming-judge.js core/intent.js glance-gmail-addon/CoreBundle.js  |
| b4b24e81 | 2026-11-11 | Lab: refund-loop experiment built (#285) | core/README.md core/pmf-metrics.js core/refund-loop.js  |
| d8c45058 | 2026-11-11 | Owner decision C-4 (undated ask gets a Do It): overlay labels, v2.8 tried, model-path validator aligned, conventions C-18 open | core/understanding.js  |
| 824f5fe5 | 2026-11-11 | AI engine: a close the model finds in WhatsApp, Messenger, Instagram or Teams becomes your task there, not an email draft (#281) | core/README.md core/ai-engine.js core/model-plan.js  |
| 7246b617 | 2026-11-09 | CWS store build: six scopes, Labs locked in store, Gmail folded-ask fix (#268) | core/labs-switches.js src/background.js src/chat-task-card.js src/content-gmail.js  |
| ab6b2f32 | 2026-11-09 | AI engine: no model is asked about a mail with nothing to do, which saves the spend cap (#269) | core/README.md core/ai-engine.js core/cloud-worth.js  |
| d9743f93 | 2026-11-08 | Gate RC 30/10: #241 + #227 + #245 + forms.body revert (#246) | core/README.md core/actions.js core/build-stamp.js core/close-chains.js  |
| 38f616b6 | 2026-11-08 | Lab: refund-loop (#266) | core/README.md core/refund-loop.js  |
| ce1da1bd | 2026-11-08 | Lab: receipt-owed experiment built (#261) | core/README.md core/pmf-metrics.js core/receipt-owed.js  |
| 7a2987e6 | 2026-11-05 | Breadth C2: move your meeting, proven on the calendar (#258) | core/README.md core/calendar-move.js  |
| 7b825345 | 2026-11-05 | Breadth E3: the reply you sent closes the ask (#254) | core/README.md core/reply-sent.js  |
| 209fa28a | 2026-11-05 | AI engine: the host side runs end to end against the real server, the card shows the person's own words, and an Israeli phone number never leaves the  | core/README.md core/ai-host.js core/understanding-router.js  |
| 13acee3c | 2026-11-04 | AI engine: no Do It on a hedge, an undecided sender or a deadline already met (#260) | core/README.md core/ai-engine.js core/tier0-quiet.js  |
| d231faa6 | 2026-11-03 | AI engine: a loop the model found closes when you really answer, not only when you attach something (#257) | core/README.md core/model-plan.js  |
| 97519515 | 2026-11-02 | AI engine: an injection or a fraud-shaped payment gets no Do It, not even the engine's own card (#253) | core/README.md core/ai-engine.js core/tier0-guard.js  |
| 39c16982 | 2026-11-01 | Lab: receipt-owed (#252) | core/README.md core/receipt-owed.js  |
| 0895118a | 2026-11-01 | AI engine: a reminder of your own promise becomes your Follow-through, and an ask of you becomes your reply (who owes what) (#251) | core/README.md core/ai-engine.js core/kind-check.js core/model-plan.js  |
| db6f2c47 | 2026-10-30 | Three casual Hebrew asks offer the reply card; phone-card bundle rebuilt (run 128) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| 1c9ef194 | 2026-10-30 | Six client-to-freelancer Hebrew asks offer the reply card; phone-card bundle rebuilt (run 127) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| ad05812e | 2026-10-30 | Casual and work-register English asks offer the reply card; phone-card bundle rebuilt (run 126) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| cb4d9dc5 | 2026-10-30 | Five more everyday Hebrew asks offer the reply card; phone-card bundle rebuilt (run 125) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| 999fc7bb | 2026-10-30 | A request for card, bank or login details under a threat stays quiet (phishing shape); phone-card bundle rebuilt (run 124) | core/intent.js glance-gmail-addon/CoreBundle.js  |
| 551da01b | 2026-10-27 | Asks to return a signed copy, make a payment, add availability or refund a charge offer the reply card; phone-card bundle rebuilt (run 123) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| b1632d34 | 2026-10-27 | Asks for an account action (access, password reset, transfer, copy me) offer the reply card, English and Hebrew; phone-card bundle rebuilt (run 122) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| a184d242 | 2026-10-27 | Asks for a status update, a progress report or a countersignature offer the reply card, English and Hebrew; phone-card bundle rebuilt (run 121) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| 9040a311 | 2026-10-27 | Google Forms: forms.body scope and Forms host in the manifest, second off switch GOOGLE_FORMS, wording and owner steps (owner approval 2026-10-24) | core/consent-catalog.js core/google-config.js core/labs-switches.js core/workspace-file.js  |
| 81f95f35 | 2026-10-27 | System notices from Israeli services and Hebrew numeric dates give the Log It card (SYSTEM_NOTICE, off); lookalike domains never match (run 119) | core/system-notice.js glance-gmail-addon/CoreBundle.js  |
| 1f020f57 | 2026-10-26 | Hebrew 'אפשר לעדכן ... עד <יום>?' offers the reply card; reminder tasks proved on Messenger and Instagram (run 118) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| 601ffc00 | 2026-10-26 | Friendly reminders that carry a task (Friendly reminder to submit X by Thursday, תזכורת: להגיש X) become the reminder task (run 117) | core/chat-reminder.js  |
| 8a1050bb | 2026-10-26 | Asks to confirm or acknowledge offer the reply card; soft Hebrew asks (אין לחץ, כשיתאפשר) stay quiet (run 116) | core/intent.js core/judgment.js glance-gmail-addon/CoreBundle.js  |
| c907daef | 2026-10-26 | A plain 'call the bank on Monday' to a named third party becomes the reminder task, English and Hebrew (run 115) | core/chat-reminder.js  |
| 4fd2ca31 | 2026-10-26 | Casual payment claims (Paid via Bit just now, שולם!) close the waiting payment task; invoice, own-paid and visit features proved on Messenger and  | core/chat-payment-claim.js  |
| 0f78bb78 | 2026-10-26 | Common work asks (make sure X is signed, proofread and send back, order X, fill out the form, Hebrew forms) offer the reply card (run 113) | core/judgment.js glance-gmail-addon/CoreBundle.js  |
| eddcb6fd | 2026-10-26 | An appointment told as 'is <weekday> at <clock>' and a Hebrew dotted date give the Appointment hold (run 112) | core/chat-appointment-notice.js  |
| 5547f386 | 2026-10-26 | A flight or train told as 'is on <day> at <clock>', English and Hebrew, is the Trip hold (run 111) | core/chat-travel-notice.js  |
| f0add5f0 | 2026-10-26 | Hebrew table and service bookings, English service nouns and Hebrew pickups give the existing hold and task (run 110) | core/chat-appointment-notice.js core/chat-pickup-notice.js glance-gmail-addon/CoreBundle.js  |
| 182b3fe2 | 2026-10-26 | Breadth Y3: the money you chased closes only when it really arrives (switch off) (#242) | core/README.md core/extract.js core/money-arrived.js  |
| 5fb9717f | 2026-10-26 | A plumber's or technician's day and hours becomes a Visit hold in mail and chat (BOOKING_NOTICE / CHAT_TASK_CARD, off), proved on Outlook and WhatsApp | core/chat-delivery-window.js core/incoming-judge.js src/chat-task-card.js glance-gmail-addon/CoreBundle.js  |
| bed0c823 | 2026-10-26 | The person's own 'I paid invoice N' in a chat offers Mark done on their own Pay task; read back, Undo reopens (run 108) | core/chat-payment-claim.js src/chat-task-card.js  |
| e66736b1 | 2026-10-26 | An invoice with a number and a day but no amount in a chat becomes the task 'Pay invoice N' (CHAT_TASK_CARD, off), proved on the WhatsApp fixture (run | src/chat-task-card.js  |
| c65f0716 | 2026-10-26 | A plain 'please bring X tomorrow' becomes the reminder task; real-browser proof for the invoice-with-no-amount task (run 106) | core/chat-reminder.js  |
| a6d2c507 | 2026-10-26 | AI engine: the extension can run Glance's model on real mail with the lab-proven safety floor (#240) | core/README.md core/ai-engine.js core/ai-floor.js  |
| bf793889 | 2026-10-26 | Hebrew asks for a link, folder, logo, recording or a place in a group offer the reply card; phone-card bundle rebuilt (run 105) | core/intent.js core/judgment.js glance-gmail-addon/CoreBundle.js  |
| 863a0e17 | 2026-10-26 | AI engine: a mail today's engine misses arrives as a planned, followed card, in one call (#206) | core/README.md core/ai-engine.js  |
| 74038697 | 2026-10-26 | Invoice due with a number and a day but no amount becomes the task 'Pay invoice N' (PAYMENT_ASK, off); phone-card core bundle rebuilt (run 104) | core/chat-payment-ask.js core/incoming-judge.js glance-gmail-addon/CoreBundle.js  |
| 24a10ede | 2026-10-26 | Asks for a reply, decision or signature (get back to me, let me know your decision, kindly revert, אשמח שתחזור אליי) offer the reply car | core/judgment.js  |
| c0a0ac20 | 2026-10-26 | Hebrew second-person 'can you' asks (את יכולה / אתה יכול / אתם יכולים / היית יכולה) and 'Are you able to' offer the re | core/judgment.js  |
| 58623039 | 2026-10-26 | Polite English asks with a deadline (grateful if you could, do you think you could, we need X back, helpful to have X) offer the reply card (run 101) | core/judgment.js  |
| d85ca466 | 2026-10-26 | Polite Hebrew asks opened with האם (תוכל / אפשר לקבל) and 'Would it be possible to get' offer the reply card (run 100) | core/intent.js core/judgment.js  |
| 2f506238 | 2026-10-26 | Pickup told in days ('pick it up within 3 days', «תוך 3 ימים») and held items ('we hold it until Thursday', התרופה) become the pickup t | core/chat-pickup-notice.js  |
| 3a4482f5 | 2026-10-26 | Chat: polite and waiting-for-your asks (נא לשלוח ... עד יום רביעי, Please let me have ... by Friday, I am waiting for your ... by Fri | core/chat-deadline-ask.js  |
| 8515e4bc | 2026-10-26 | Chat: the polite Hebrew payment ask (נא להעביר ... עד מחר, אפשר להעביר?, תוכל לשלם) is a payment task, and the payment  | core/chat-payment-ask.js src/chat-task-card.js  |
| 7054e874 | 2026-10-26 | A plain reminder ('Your appointment is tomorrow at 14:00', 'in 3 days', «התור שלך מחר ב-14:00») is a booking too; a form deadline that na | core/chat-appointment-notice.js  |
| a0d685af | 2026-10-26 | A booking that repeats ('your lesson is every Monday at 17:00') is recognised in chat and mail; the hold is the next lesson and, with RECURRING_HOLD o | core/chat-appointment-notice.js  |
| 7e4a54eb | 2026-10-25 | Chat 'sent' claim reads short real replies (Sent!, Done sent, Just emailed it, שלחתי); a recipient or a channel is not the thing sent; the Hebrew | core/chat-sent-claim.js  |
| 8fdef8e4 | 2026-10-25 | Chat: the person's own promise closes when they write that they sent it (Mark done, read back as completed, Undo reopens); the other side's claim fits | src/chat-task-card.js  |
| 2ccf2a2a | 2026-10-25 | Chat: a document that was asked for and sent closes its 'Waiting on' task (Mark done, read back as completed, Undo reopens); 'I sent you the contract' | core/README.md core/chat-payment-claim.js core/chat-sent-claim.js manifest.json  |
| 22acfd1d | 2026-10-25 | Late 'Waiting on' reminder quotes a document request instead of splicing it into a sentence; proved on Messenger and Instagram with Microsoft To Do (C | core/chat-chase.js  |
| 65b91941 | 2026-10-25 | Chat: a late 'Waiting on Dana: ...' task is chased with a short polite draft in the chat box (never sent, never the close; one per task per 3 days; Un | core/README.md core/chat-chase.js core/labs-switches.js manifest.json  |
| 1a2ff65d | 2026-10-25 | SharePoint: save the mail's own attachment, bytes untouched, on the one site the mail names; read back by id with the same name and size, Undo refuses | core/README.md core/labs-switches.js core/onedrive-new-file.js core/sharepoint-new-file.js  |
| 4ce7bb24 | 2026-10-25 | Hebrew new-file asks read the infinitive (אפשר לפתוח מסמך בשם …) on the Microsoft side too; a past ask and the writer's own promise  | core/onedrive-new-file.js core/workspace-file.js  |
| 5291d831 | 2026-10-25 | SharePoint: an empty Word or Excel file on the one site a mail names, read back by id, Undo refuses after an edit (SHAREPOINT_NEW_FILE, off; Sites.Rea | core/README.md core/consent-catalog.js core/labs-switches.js core/outlook-calendar.js  |
| c6c27a30 | 2026-10-25 | Invitations take their told hours ("from 20:00 to 23:00", "for 2 hours"): held for those hours in chat and mail; "between 2 and 3pm" starts at 2pm (BO | core/chat-appointment-notice.js core/chat-invitation-notice.js core/incoming-judge.js src/chat-task-card.js  |
| 410a8c93 | 2026-10-25 | Calendar holds take the told length of an appointment ("from 14:00 to 15:30", "for an hour and a half", «למשך שעה»): chat, Outlook and Gmail  | core/chat-appointment-notice.js core/incoming-judge.js src/chat-task-card.js  |
| 14c77acf | 2026-10-25 | Gmail: a cancellation mail offers to remove the Google Calendar hold Glance wrote for that booking (lane undo, read back; an edited event is left alon | src/content-gmail.js  |
| 8eb2c0f5 | 2026-10-25 | Lab: bill-paid-proof (#208) | core/README.md core/bill-paid.js  |
| b958ab23 | 2026-10-25 | Outlook web: a cancellation mail offers to remove the calendar hold Glance wrote for that booking (read back that it is gone; an edited event is left  | src/content-outlook.js  |
| b3ff4c73 | 2026-10-25 | The payment loop closes on Microsoft To Do too: the chat card marks the 'Waiting on' To Do task done (outlookTaskClose: completed, read back, snapshot | src/background.js src/chat-task-card.js  |
| 7b7c8884 | 2026-10-25 | The payment loop closes: when the other side says they paid, the chat card offers to mark the 'Waiting on' Google Task done, read back as completed, w | core/README.md core/chat-payment-claim.js core/google-task-close.js manifest.json  |
| 6d4f3af6 | 2026-10-25 | Self-note reader: a bare Reminder: in front of words addressed to somebody is an ask of them, not a note to self (the own-ask follow-up takes it); CHA | core/chat-self-note.js  |
| cc469be8 | 2026-10-25 | A Hebrew date written day first (01/11) is read day first; fixes the headless E2E that failed on the first days of a month | core/README.md core/actions.js core/active-question.js core/ai-ladder.js  |
