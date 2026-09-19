# The decision filter

> Instated 2026-09. Standing instruction, not a one-time checklist — apply
> it to every significant decision and every new piece of work from this
> point forward, the same way `design-principles.md` applies to every UI
> change and `magic-moment.md` defines what the product's first real win
> looks like.

## The question

Before building anything non-trivial — a feature, a new data path, a UI
surface, a piece of infrastructure — ask:

> **Does this strengthen our ability to become the most reliable system in
> the world at turning intention into closed execution?**

If the answer is not a clear yes, do not build it.

## What "reliable" and "closed execution" actually mean here

This is not a vague aspiration — it maps directly onto concepts already
load-bearing elsewhere in this codebase:

- **Intention** is what `core/intent.js` classifies: a real thing someone
  decided, asked for, or committed to, extracted from a real message.
- **Execution** is a real write — a Calendar event, a Gmail draft, a Task —
  the thing `background.js`'s connectors actually perform.
- **Closed** is the strict sense `core/pmf-metrics.js`'s closure rate uses:
  accepted **and not undone**, not merely "resolved one way or another."
  Reversed harm doesn't count as reliability.
- **Reliable** means precision holds under real, varied usage — the entire
  reason `judgment.js` biases toward silence over a wrong guess, and the
  entire reason a wrong or duplicate write is treated as the one failure
  this product cannot absorb (see `src/storage.js`'s own comments on
  `resolvedMessageIds` and the confirmed data-layer race fixes from this
  project's own history).

A feature can be interesting, technically impressive, or something a
competitor has, and still fail this filter — those are not the question.

## How to apply it

1. **State the decision plainly** before building: what is this, and what
   is it supposedly for?
2. **Trace it to one of the four terms above.** Does it help detect a real
   intention more precisely? Does it help execution actually close (not
   just attempt) more reliably? Does it help measure whether closure is
   actually happening? Does it remove friction between intention and
   closure without adding a new failure mode? If it doesn't touch any of
   these, it likely fails the filter.
3. **Prefer measurement and reliability work over new surface area** when
   both are plausible answers to the same underlying need — this project's
   own recent history (the data-layer hardening pass, the precision/harm
   calibration work, the PMF metrics work) is the filter already being
   applied correctly: closing races and duplicate-write risks, and
   building real visibility into closure rate, both score a clear yes;
   a new dashboard screen or a vanity feature would not have.
4. **When genuinely unsure, don't build it yet.** Ask, or find the smallest
   version of the idea that unambiguously passes the filter, rather than
   building the full version on a maybe.

## What this filter is not

It is not a ban on care, polish, or product feel — `magic-moment.md` and
`design-principles.md` both describe work that exists entirely to make
closure feel trustworthy and immediate, and that work clearly passes this
filter (trust and immediacy are exactly what make execution reliable in
the user's eyes, not decoration on top of it). The filter exists to block
scope creep that doesn't serve the actual mission, not to block the craft
that makes the mission's own deliverable good.
