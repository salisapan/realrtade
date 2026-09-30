# The Magic Moment

> Written as part of the precision/harm + Execution Memory strategic layer
> (2026-09). This defines a specific product moment in concrete terms so
> onboarding, copy, and timing decisions can be checked against it, the same
> way `design-principles.md` gives a checklist for UI/copy changes.

## Definition

The Magic Moment is the first instant a new user thinks:

> "Wait — this actually closed something important for me, and I didn't
> have to open anything, remember anything, or manage it."

It is not the first time the chip appears (that's a *proposal*, and "You
intend — we execute" explicitly treats a proposal as unproven until
something real happens). It is not onboarding completing, and it is not a
tour or a demo. It is the first real **closure**: a Calendar event, a Gmail
draft, or a Google Task that now exists somewhere else, that the user did
not have to go create themselves, confirmed by the receipt the chip shows
the instant it happens.

Everything about the moment has to be true, not performed — the same "zero
gap between promise and reality" standard the marketing site holds itself
to. A user who reads "closed" and then checks and finds nothing there loses
more trust than a user who was never told anything happened.

## Why this moment, specifically

Glance's entire pitch is silence punctuated by real closure — not a chat
assistant, not a suggestion engine, not one more inbox to check. Until the
first real write happens, every prior interaction (seeing the chip, reading
its proposal) is still just a claim about what Glance *can* do. The first
successful "Do It" is the first moment that claim becomes demonstrated fact
for this specific person, in their own inbox, on their own real email — the
one thing a demo, a screenshot, or marketing copy can never substitute for.

## The fastest path to it

The shortest real path is: connect a tool in the popup -> open a real email
that already asked for or decided something concrete -> see the chip ->
click Do It -> see the receipt. Nothing in this product should add a step
between "Glance noticed something real" and "the user can act on it" —
every friction point removed from this path is removed in service of
reaching this moment sooner, ideally within the first session, not the
first week.

What actually gates how soon a real user reaches it is **precision**, not
onboarding polish: Glance is deliberately silent on anything it isn't
confident about (see `core/judgment.js`'s "extreme preference for precision
over recall"), so the moment can only arrive once a message in the user's
own inbox genuinely clears that bar. There is no version of this product
that fakes an earlier moment with a canned example — the trial's own
`assets/glance-engine.js` demo on the marketing site exists precisely so
someone can *see* the mechanism before connecting their real inbox, without
that demo ever pretending to be their own first real close.

## What reinforces it once it happens

The surrounding experience has to read as closure, not as an AI feature
firing:

- **Language**: the receipt leads with "Handled." The line under it is
  still the work, past tense — "Closed — scheduled and tracked," or that
  process's own closedLine — not "2 actions completed" (see
  `closedSummary()` in `src/content-gmail.js` and `FlowReceipt` in
  `src/receipt-copy.js`). A close where a step did not land says
  "Partly handled." instead. "Handled." is only a full close.
- **Undo safety**: every real write ships with an inline Undo right there in
  the receipt (`showMultiActionReceipt`) — closure has to feel safe to trust
  immediately, not something the user has to go verify or manually reverse
  elsewhere first. The control is the sentence itself ("Undo removes the
  Google Task."), not a second filled button. A reverse that did not finish
  leaves the word Undo and says the record is still there.
- **Timing**: nothing about the receipt is delayed, batched, or deferred to
  a summary later — the confirmation appears the instant the write actually
  succeeds, in the same chip the user is already looking at.
- **The early-closes line**: `showMultiActionReceipt` checks, before this
  close's own writes land, how many successful closes this account has had
  before this one (`writeStats.total`). For each of the first three *full*
  closes — not just the very first — the receipt adds one extra line under
  "Handled.": "Nothing else to open, nothing else to check — that's
  handled." The first close is the moment of discovery; trust in "this
  actually works" isn't fully earned on one data point, and the second
  and third closes are what confirm it wasn't a fluke. The line stays
  identical across all three rather than escalating into a growing
  narrative — repeating the same concrete claim is reinforcement, while
  three different lines a day or two apart would read as a script. From
  the fourth full close on, that extra line drops. The status word
  "Handled." stays on every full close after that — it is the confirmation
  that the write landed, not a slogan that expires. A partial close never
  gets the extra line, because "nothing else to check" would be false.

This is implemented entirely inside the existing receipt UI. No new screen,
no popup, no onboarding wizard — the Zero-Prompt rule applies to the Magic
Moment itself: the best version of "wow, this actually helped" is one the
user discovers by using the product normally, not one a UI announces at
them.
