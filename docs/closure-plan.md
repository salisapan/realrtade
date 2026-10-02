# Plan: unfinished intentions that reach real completion

> Written 2026-10-02 before the code, answering the "deepen Glance around
> active responsibility" brief. Companion to `docs/local-detection-plan.md`
> (which covered the detection side) and `docs/open-loops.md`.

## 1. What already supports true closure

A loop opens only on a recognised ask or promise and stays silent when unsure; a
reply is read for what it did (out-of-office, thanks, promise, paid, question
back, could-not-open, no); closing completes the Google Task; Reopen and Mark
done / Stop tracking exist; a kept promise closes itself; an answer in another
thread settles the same story; the chase day follows a stated deadline.

## 2. Where Glance still only notices

- A reply that hands the ball back ("which invoice?", "I never got the
  attachment") was noticed and the reminder moved, but **nothing was prepared**.
  The user still had to open Gmail and start from a blank reply.
- A loop opens on any ask that clears the frame+action bar, including soft ones
  ("let me know what you think") that never needed a loop; they spend one of the
  three Free slots.
- The deadline is used to place the first chase, then forgotten: a deadline that
  passed looks the same as a loop that is merely quiet.

## 3. Tracking without a path to done

`yours` loops (above); loops whose deadline passed; nudge drafts that did not
mention the deadline the person had actually set.

## 4. What is deepened in open/close intelligence

1. **Weight of intention (A).** Every candidate loop gets a weight from named
   signals (money, a stated deadline, an explicit need, a concrete action and
   object, softeners). A light, soft ask opens nothing: silence over a loop that
   never mattered. Money, a deadline, or an explicit short chase always open.
2. **Time as part of the intention.** A deadline that has passed is its own state
   ("Deadline passed Mon"), and firmer nudges name the deadline.
3. The reason a loop is `yours` and the sentence that caused it are kept on the
   watch so the next step can be prepared.

## 5. Execution paths that make completion feel real (D)

- **Prepare my reply.** When the ball comes back, the receipt carries one button.
  It writes a Gmail draft in that thread: for "could not open it", a resend note
  to attach the file to; for a question, the question quoted with room to
  answer; Hebrew and English. Nothing is sent, the person finishes and sends.
  Same button on the "Your turn" row in the Loops tab.
- Closing already completes the Task; declined and promised already move or
  finish it. Nothing else is added: no new surface.

## 6. How the UI stays minimal

No new screen, no setting. The only additions are one button on an existing
receipt, the same button on an existing row, and one label ("Deadline passed").
Everything else is behaviour.

## 7. Real-Gmail script (open -> carry -> advance -> close)

Added as steps 29-35 in `docs/open-loops.md` §9a.

## Risks

- The weight rule could silence a loop someone wanted. It never silences money,
  a stated deadline or an explicit chase, and the dropped class is only soft asks
  with no deadline, amount or named object. Measured in `follow-up-corpus`.
- A prepared draft could read as sent: it is a draft in Gmail's Drafts, the receipt
  says "Draft ready. Nothing was sent."

## Built (2026-10-02)

`intentionWeight`, `deadlinePassed`, deadline-aware `nudgeText` and `replyDraft`
in `core/follow-up.js`; `prepareReply` and the receipt button in `src/follow.js`;
the same button, the "Deadline passed" label and the removed nudge on "Your turn"
rows in `popup/popup.js`; `follow_yours` and `follow_reply_prepared` counts added
to the `track-event` allowlist (counts only). Checks: `test/closure-execution-corpus.cjs`
(new), 2 cases in `follow-gmail-harness.cjs`, 4 in `popup-open-corpus.cjs`.

Honest limits: the weight rule is a hand-written signal list and is tested on
cases I wrote, not on real inboxes; the draft is a starting point with
placeholders, not an answer (answering needs the person); no loop is closed from
outside email automatically (Mark done / Stop tracking remain the release).

