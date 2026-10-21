# Value test on the test mailbox: what Glance misses (2026-10-21)

Glance closes open loops. Gmail is where it starts today.

Method: real subjects and lines from the Flow sales and test mailbox were run through the judge (`FlowIncomingJudge.judge`), plus invented lines of the same kinds that the author did not tune on. Status only. No private mail text is stored here.

**Fixed in this change** (`core/judgment.js`, `test/status-intro-ask-corpus.cjs`): a request for an update ("keep me posted", "what's the status of ... by tonight", "תעדכן אותי", "מה הסטטוס של") and for an introduction ("introduce me to", "connect me with", "תפגיש אותי") is a request, English and Hebrew. Recall on 12 invented lines: 0 of 12 before, 12 of 12 after; 9 quiet lines stay quiet.

**Open, in order of value for the routines** (each is a real ask kind that stays silent today):
1. A reader-decision ask in Hebrew ("תוכל לאשר לי את ההצעה עד מחר?") is silenced as `hedge` by `readerDecisionAsk` in `core/intent.js`, while the English "Can you approve the budget by Wednesday?" offers. Decide one rule for both languages; the person decides, Glance may draft the reply and set the task.
2. "Do you have the signed agreement? I need it today." (a question that is an ask for a file) stays `intent-null`.
3. "תשתף איתי את המצגת בבקשה" (share with me) stays `intent-null` while "Please share the presentation with me." offers.
4. A soft Hebrew opener before a comma ("אם יהיה לך זמן, נשמח לשמוע") still offers; the softener is checked only on the quoted ask, not on its sentence. Precision issue, small.
5. The file gate silences "send me the signed agreement" on purpose (Glance cannot produce the file); a Drive search for an existing artifact is the resolution path in `docs/resolution-paths.md`.
6. A secretary's scheduling line ("תואם עם סאלי מחברת flow") with the real details in an invite attachment stays `intent-null`: the details live in the `.ics`, which the judge does not read.
