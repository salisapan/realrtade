# The reply model: closing on understanding, not on the fact that someone wrote

> Written 2026-10-03. Part of `docs/ai-engine-upgrade.md`. Trainer: `node scripts/train-reply-model.cjs` (after `python3 scripts/reply/build.py`).
> Metrics: `docs/reply-model-metrics.json`. Gate: `flow-trial-extension/test/reply-model-corpus.cjs`.

## 1. Where the product was not intelligent enough

The one expensive mistake in Glance is closing a loop that is still open. Reading a reply was rules (out-of-office, "got it", "I'll send it
Friday", "I paid"), and when no rule fired the code assumed the oldest thing there is: *they wrote back, so it is answered*
(`basis: 'default'` in `core/follow-up.js`). Measured on 126 replies of every kind (written by the build-time teacher, so it says
how the rules behave on non-answers, not how often real replies are non-answers): the rules closed **88 loops, 42 of them wrongly**
("Still going through the documents, give me a few days", "Alright, thanks", "Please direct this to our accounting department",
"The attachment didn't open on my computer").

## 2. What was built

`core/reply-model.js`: a small on-device classifier (hashed words and word pairs, multinomial logistic regression, int8, 59 KB) that
reads a short reply the rules could not place and says what it is: answered, interim ("looking into it"), thanks, unrelated, the ball
back to you, or declined. It is used in exactly one way: **when it is at least 90% sure the reply is not an answer, the loop stays
open and silent**. It never closes anything, including a close chain (`core/close-chains.js` closes only when completion evidence is real: a sent file, a sent fact, an accepted event, a sent approval or a sent answer). An ask that gets someone else to send a file is not a file prepare and not a close. So it can make a close rarer, never wronger.

Guards: only replies of up to 18 words (long substantive replies are not "thanks" and the model saw mostly short ones); never when a
rule already decided (confirm, paid, declined, promised, handed back, or a contact-line signature, which holds on its own);
never on a payment loop (which already only asks); and with no
weights the rules behave exactly as before. The signature rule is in `core/follow-up.js`, not in this model (`docs/true-close.md` §3, `docs/human-eval.md` §7). Each time it holds a loop open it writes one line in the learning list ("A reply
"…" did not answer it (still working on it), so I kept the loop open"), so it can be checked on real threads.

## 3. Numbers, and what they do not prove

| | without the model | with it |
|---|---|---|
| loops closed (126 replies) | 88 | 60 |
| of which not a real answer | 42 | 15 |
| real answers still closing | 46 of 48 | 45 of 48 |

The model alone, on `replies-eval2.json` (written after the model was designed and never looked at while training): accuracy
0.86, and when it is confident a reply is not an answer it is right 17 of 19 times; both mistakes were real answers held open (the safe
direction). The first eval set guided the second training bank, so it is not blind any more. Honest limits:
- **All sentences are model-written** (training and evaluation), in two languages, about 1,200 training rows built from about
  250 hand-written bases. The owner's real replies have not been used; there is no human-written reply set yet.
- 0.86 accuracy over six classes is modest; the product only acts on its confident "not an answer".
- The false-close numbers describe how the old rules behave on non-answers. How many real replies are non-answers is unknown.
- Four evaluation sentences were also in the training data; they were removed from the evaluation sets, not from training.
- One real regression was caught by an existing test while building it: "Never mind, found it. Thanks!" (a reply that resolves a
  hand-back) was held open; resolutions of that kind were added to the training data.

## 4. How to validate on real threads

Open a thread where you asked something and the other person replied "looking into it" or "thanks for letting me know". The loop should
stay in Waiting on, with no card, and the Activity tab's "What Glance learned from you" should say a reply did not answer it. If a real
answer is ever held open, Reopen is not needed (the loop never closed): reply to it yourself or mark it done, and tell me the sentence
so it can be added to the data. Never lower the 0.9 threshold to catch more.

## 5. What was refused

- Letting the model close loops: a confident "answered" is not used, because the cost asymmetry is the whole point.
- A remote model for this: the question is short, frequent and private; it runs on the device (`docs/local-first-principle.md`). Still true: the second reading (`docs/ai-ladder.md`) is about recognising an ask or a promise in your own sentence, never about judging a reply.
- A short reply nothing could place used to close a loop by default; since 2026-10-04 a reply of three words or fewer with no answer in it is held open instead (`docs/true-close.md`). The model is unchanged.
- A bigger or fancier model: the data, not the architecture, was the limit (see how accuracy moved with the second and third data banks).

## 6. Rules added from real mail (2026-10-08)

These are rules, not a change to the reply model or its 0.9 threshold. A redirect ("this is not my job, contact X", "I retired", "please direct this to …") closes the loop as declined, not as done. A bare "לא" declines only when that is the whole sentence. A short suggestion to talk does not close the loop. "אעדר" and a recipient bounce ("message blocked", "recipient address rejected") are auto-replies, so the loop stays open. Found on the real-mail gold set (`docs/human-eval.md` §7, `docs/real-mail-eval/2026-10-08.md`). The model still never closes anything.
