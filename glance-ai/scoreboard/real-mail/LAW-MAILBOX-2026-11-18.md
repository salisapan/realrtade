# The owner's professional Microsoft mailbox, read on 2026-11-18 (counts and findings only; no text, names, matters or figures)

Owner, 2026-11-18: «עבור גם כל המייל של Microsoft ssapan@fbclawyers.com». Product definition (vision-locked): Glance closes open loops; Gmail is where it starts today. Current implementation status: lab measurement and general-grammar fixes only; no switch, scope or copy changed.

**What was read.** The mailbox is 2,369 messages in the Inbox and 553 in Sent Items (law-firm client correspondence). On the owner's word («כל ה-2,000, לא מדגם») the newest were read through the connector as short previews, newest first: **100 sent and 103 inbox so far** (the first pass read 50). The rest is not read yet: reading everything one page at a time through one session costs more than 100 more calls and mostly repeats the same shapes (mass notices, matter threads), so the cheaper way is to read in parallel in separate sessions; it needs the owner's word because it multiplies the number of sessions that see client mail.

**What was kept.** Only masked shapes (no names, matters, parties, figures or ids) were written, to `glance-ai/scoreboard/real-mail/private/` (gitignored, never committed, never pasted): 14 of the owner's own sent shapes and 14 inbox shapes. No weights were trained on them; a model trained on client mail would carry it. Nothing from this mailbox left the machine except through the session itself.

**What it found.**
- **Silence is right:** 10 of 10 inbox shapes that need nothing (state-registry receipts, an out-of-office-style notice, an FYI from a colleague, a 31-recipient broadcast, a status list, a thank-you) stayed silent. 0 wrong offers.
- **Own sent asks (follow loop):** 4 of 6 asks the owner sent opened a wait loop; 2 formal Hebrew shapes did not: «ממתין ממך ל<מסמך>» and «יש להעביר <סכום> לחשבון». Fixed in `core/follow-up.js` (ASK_HE): 6 of 6 now open, 0 of 5 non-asks open. Pinned in `test/follow-up-corpus.cjs`.
- **Inbox asks:** the polite Hebrew request put as a question, «האם ניתן לשלוח לי את הדוח המעודכן עד יום חמישי?», was silent; it is a request now (`core/judgment.js` HANDOFF_HE: «האם ניתן / אפשר ל<פועל>», «אשמח אם תגיב / תענה / תשלח …»). Pinned in `test/intent-actions-corpus.cjs`. The held-out kind sets did not move (69 of 89, 54 of 70, 0 wrong Do It).
- **Silent by design, not a gap:** a bare «could you respond to her questions?» with no deliverable and no day is silent in English and Hebrew alike; an urgent broadcast to a mailing list is silent; a nudge («why aren't you answering?») is silent. These stay until a contrast-pair shadow test (user-context lock).
- **Second and third pass (the next 50 sent, the next 75 inbox):** more formal Hebrew asks of an office now open a wait loop (`ASK_HE`: «אודה/נודה ל<סיוע|קבלת|עדכון>», a clock put as a question «אפשרי היום ב14:30?», «נזכיר כי טרם התקבלו …», «עדיין ממתינים לקבל …»): 17 of 17 asks open, 0 of 16 non-asks. A «העברת הזכויות» (transfer of rights) is no longer labelled a payment, and a negated instruction to a colleague («אל תעבירי עדיין …») opens nothing. On the inbox side: a purpose clause («כדי שתוכלו לאסוף …») is no longer read as «תוכלו» the request (it had offered a reply draft on a mail that asked nothing: a wrong offer, fixed); «תנו עדכון בבקשה», «אנא עדכנו», «תבדוק בבקשה מול …» and «אני זקוק לסיועך» (when it names something) are read. Bare masculine imperatives without «בבקשה» («תתקן את הנספח ושלח אליי») stay silent on purpose: widening them broke six contrast corpora, so they stay with `test/imperative-ask-corpus.cjs`.
- **Own promises in sent mail** («אעדכן כאשר יתקבל», «נבדוק ונעדכן אותך בהקדם») open no loop: the follow loop reads asks, and these promises carry no day. Declared, not built.

## Third pass (inbox 104-128)

Read 25 more inbox mails (128 of 2,369 so far); masked rows stay in the gitignored private folder. Findings: polite-framed Hebrew asks («אשמח שתעביר…», «אודה על הכנת…») were silent unless the verb was «תשלח»; they are now offered, with the framing, not a day, as the explicit ask. A negated please («נא לא לשלוח…») was offered a draft; it now stays quiet. Still silent by design: a bare imperative with no day («שלח אליי בבקשה לבדיקה»), a status question («אשמח לדעת היכן הדברים עומדים»), a hold instruction. Group status-chase mails and «היעדר תביעות» circulars to a mailing list stay quiet.

Sent pass 3 (sent 76-100): 13 more outgoing rows read, 22 of 23 asks now open a loop and 0 of 23 non-ask rows do. «נודה למענה / לטיפולכם / להתייחסותכם» now counts as a chase in a multi-line mail; a one-line «נודה למענה.» still opens no loop, because it names nothing to wait for. Read so far: inbox 128 of 2,369, sent 100 of 553.

## Fourth pass (inbox 129-153, sent 101-125)

Read 25 more inbox and 25 more sent mails (153 of 2,369 and 125 of 553 so far). Inbox: «אודה לאישורכם / לתשובתך / למענה» is now an explicit ask; a framed ask whose greeting names someone else stays quiet. Sent: 28 of 30 asks open a loop, 0 of 31 non-ask rows. A real false loop was found and fixed: the ask frame «שלח אלי» matched inside «יישלח אליכם», so a promise to send opened a chase. Still silent by design: a one-word «לאישורך.», a send-the-file ask (file chain off), «אני צריך בבקשה…».

## Fifth pass (inbox 154-178, sent 126-150)

Read so far: inbox 178 of 2,369, sent 150 of 553. Sent: 34 of 37 asks open a loop, 0 of 37 non-ask rows. Findings: «שלום וברכה» was read as a name; a short «אתה זמין?» opened nothing because the final-nun spelling was missing from the pattern; a retraction («אבקש להתעלם מפנייתי הקודמת… אין צורך בהתייחסות») correctly opens nothing, and the earlier open loop on that thread is not yet released by it (not built). Open question for the owner: a «נא + infinitive» line sent to a 21-recipient list offers a task to every recipient; per the user-context lock that needs a contrast-pair shadow test before any quiet is added.

## Sixth pass (inbox 179-203)

Read so far: inbox 203 of 2,369, sent 150 of 553. The partner's table request («צריכה את עזרתך בתיק… תעבור עליה בבקשה ותכין טבלה מסודרת») was silent; it is now offered as a task. Silent by design: group lists, mails addressed to another name, status chases to a list, and HR/IT notices.

## Seventh pass (sent 151-175)

Read so far: inbox 203 of 2,369, sent 175 of 553. Found two false chases (thanks and a done-report) and fixed them with contrast tests. Still silent: «אמרי לו שישלח אלי מייל» (an ask to relay a message), and an own promise («ברגע שנאתר נעדכן») which opens no loop yet because own-promise detection in sent mail is not built.

## Eighth pass (inbox 204-228, sent 176-200)

Read so far: inbox 228 of 2,371, sent 200 of 554. Roughly nine in ten inbox mails here are lists, notices and circulars, which the reader keeps quiet. Still silent: a bare «תאשר ואשלח», a request to relay a message («אמרי לו שישלח אלי מייל»), and a one-word «לאישורך.».
