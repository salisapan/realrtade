# The owner's professional Microsoft mailbox, read on 2026-11-18 (counts and findings only; no text, names, matters or figures)

Owner, 2026-11-18: «עבור גם כל המייל של Microsoft ssapan@fbclawyers.com». Product definition (vision-locked): Glance closes open loops; Gmail is where it starts today. Current implementation status: lab measurement and general-grammar fixes only; no switch, scope or copy changed.

**What was read.** The mailbox is about 2,400 messages (553 in Sent Items). It is a law-firm mailbox with client correspondence, so only a **sample of the newest messages** was read through the connector (25 sent, 25 inbox, plus the three newest), as short previews. Reading all 2,400 would put every client matter through a model session for a gap-finding job that a sample answers, so the rest was not read. Say the word and more folders or dates can be read.

**What was kept.** Only masked shapes (no names, matters, parties, figures or ids) were written, to `glance-ai/scoreboard/real-mail/private/` (gitignored, never committed, never pasted): 14 of the owner's own sent shapes and 14 inbox shapes. No weights were trained on them; a model trained on client mail would carry it. Nothing from this mailbox left the machine except through the session itself.

**What it found.**
- **Silence is right:** 10 of 10 inbox shapes that need nothing (state-registry receipts, an out-of-office-style notice, an FYI from a colleague, a 31-recipient broadcast, a status list, a thank-you) stayed silent. 0 wrong offers.
- **Own sent asks (follow loop):** 4 of 6 asks the owner sent opened a wait loop; 2 formal Hebrew shapes did not: «ממתין ממך ל<מסמך>» and «יש להעביר <סכום> לחשבון». Fixed in `core/follow-up.js` (ASK_HE): 6 of 6 now open, 0 of 5 non-asks open. Pinned in `test/follow-up-corpus.cjs`.
- **Inbox asks:** the polite Hebrew request put as a question, «האם ניתן לשלוח לי את הדוח המעודכן עד יום חמישי?», was silent; it is a request now (`core/judgment.js` HANDOFF_HE: «האם ניתן / אפשר ל<פועל>», «אשמח אם תגיב / תענה / תשלח …»). Pinned in `test/intent-actions-corpus.cjs`. The held-out kind sets did not move (69 of 89, 54 of 70, 0 wrong Do It).
- **Silent by design, not a gap:** a bare «could you respond to her questions?» with no deliverable and no day is silent in English and Hebrew alike; an urgent broadcast to a mailing list is silent; a nudge («why aren't you answering?») is silent. These stay until a contrast-pair shadow test (user-context lock).
- **Own promises in sent mail** («אעדכן כאשר יתקבל», «נבדוק ונעדכן אותך בהקדם») open no loop: the follow loop reads asks, and these promises carry no day. Declared, not built.
