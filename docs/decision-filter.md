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

> Companion rule: `docs/local-first-principle.md` (our code recognises before any model).

## Relationship to product-architecture.md §5.8

`docs/product-architecture.md` §5.8 ("Decision Filter — Use on Every
Feature") is the product owner's own authored checklist, added 2026-09-18
— a fast, five-question pass meant for day-to-day use while actually
building something:

1. Does this move us closer to "You intend — we execute"?
2. Does it increase the user's feeling that things get closed?
3. Does it protect or improve precision and silence?
4. Does it respect Zero-Prompt principles?
5. Does it create compounding value over time (memory, habit, trust)?

That checklist is canonical — it is the one to reach for first, every
time, because it is faster to run and it names the two phrases
("You intend — we execute," Zero-Prompt) everything in this product
ultimately has to answer to. This document is not a second, competing
filter that happens to sound similar. It is the detailed reference
underneath that checklist, for the two moments the five-question pass
alone doesn't resolve: when an answer is genuinely ambiguous and needs
tracing to actual code to settle, and when a "no" needs to be explained
to someone rather than just asserted.

The mapping is exact, not approximate — every one of the five questions
above lands on one or more of the four grounded terms below:

| §5.8 question | Grounded term(s) here |
|---|---|
| 1. "You intend — we execute" | Intention -> Execution, the whole pipeline |
| 2. Feeling that things get closed | Closed (accepted and not undone) |
| 3. Precision and silence | Reliable |
| 4. Zero-Prompt | Reliable (a prompt is a new failure mode: a mistuned or ignored one) |
| 5. Compounding value | Reliable, sustained — precision and closure holding as usage grows, not just on day one |

Run §5.8 first. If every answer is a clear yes, build it — there is no
need to re-derive the single question below on top of it. Come here only
when §5.8 leaves a real question mark on one of its five, and that
question mark needs settling against what "intention," "execution,"
"closed," and "reliable" actually cash out to in this codebase.

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
