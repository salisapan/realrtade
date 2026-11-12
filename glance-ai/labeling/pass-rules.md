# Blind labelling rules (for a labelling pass; the conventions of docs/glance-ai/model-conventions.md, stated as an instruction)

You label ONE mail or chat message at a time, as the reader (Sali), for a tool that offers the reader ONE action or stays silent. Silence beats a wrong offer. Use only the message and these rules. Output, per case, exactly one step:

- `SILENT`: nothing should be offered.
- `draft`: the reader is asked for information, an answer, an approval, a file or a payment BACK (a reply or a send-back is the close), or is asked to confirm something.
- `task`: the reader is asked to DO work (prepare, create, review, sign, schedule, fix, pay a third party), or the reader's own dated promise ("you will send X by Friday", "as agreed, you will…", a note to self with a date) is to be tracked.
- `calendar`: a meeting or a time to hold, with a DATE AND A CLOCK TIME.
- `file_save`: the mail asks to save an ATTACHED file (the case says attachments > 0) to Drive or OneDrive.
- `CONTEXT`: the answer depends on who the reader is (a group greeting such as "Hi all" or «היי לכולם», a mail where the reader is only on Cc, a mail addressed to another named person). Do not guess.
- `UNSURE`: you cannot decide from the text.

Rules:
1. A mail that only confirms or reports an amount, a budget, a decision, a status or a past action, and asks nothing, is SILENT. An approximate amount ("about $4,200", «בערך», «כ-») is not a confirmed amount: SILENT.
2. An ask with NO date still gets an offer (draft or task as above). "asap", "as soon as possible", «בהקדם», «מיד» are not dates, but the ask still gets an offer.
3. A promise «לפני החג» ("before the holiday") is a task.
4. "today", «היום», "this week", "by end of week", «סוף השבוע» are deadlines.
5. "Attach X to the invite" is a draft. A promise to self with a clock time is UNSURE.
6. A reader's promise with NO date ("as agreed, you will send the invoice asap", «התחייבת לשלוח… ASAP») is a task: it reminds the reader of their own commitment, and tracking a commitment is what Glance is for.
7. "FYI", "no action needed", «לידיעתך», a newsletter or a receipt, an out-of-office reply, a webinar invitation, a meeting that already happened, marketing: SILENT.
8. If the same text could be two steps, choose the one whose completion CLOSES the loop (a reply is closed by sending the reply; work is closed by doing it).
9. Paying the SENDER is a payment back, so a draft: "Please pay the $1,200 renewal fee by November 2", «נא להעביר תשלום של ₪89.90 ביום שלישי», "please settle the ₪500 balance by Wednesday". Paying someone else (a supplier, a third party the mail names) is work, so a task. (The `draft` definition above, spelled out on 2026-11-12 after the teacher run labelled most pay-the-sender asks a task.)

Output format: JSON Lines, one object per case: {"item": <number>, "step": "<one of the above>", "undatedAsk": <true if the offer rests on an ask with no date, else false>}
