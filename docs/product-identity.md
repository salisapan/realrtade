# Product identity: AI is the engine, closure is the product

> Written 2026-10-02. Companion to `docs/local-first-principle.md` (how we
> recognise) and `docs/open-loops.md` (what Glance does). This file is about how
> Glance presents itself.

## The rule

Glance is built with AI techniques and must not be sold, worded or felt as "an AI
email product". It competes on what stays open until it is closed, not on
cleverness.

| Under the hood | On the surface |
|---|---|
| classification, language understanding, calibration | "this is handled", "still open", "money at risk" |
| models and algorithms are means | closure, open-loop ownership, protection |
| intelligence | responsibility for what is unfinished |

## What that means in practice

- Sell outcomes: closed loops, protected money, remembered follow-ups. Never
  "smarter email", "AI that understands your inbox", "AI assistant", "smart inbox".
- Prefer silence to AI theatre. No sparkle, no "thinking", no chat voice.
- Free builds trust by closing things locally; Pro protects the expensive open
  loops (every loop, the money owed, firmer nudges). Draft-It and summaries are
  "also".
- An external model, if one is ever used, assists hard cases and never becomes the
  identity or the spine (`docs/local-first-principle.md`).
- Being honest about the engine is fine and expected where someone asks (the FAQ
  answers "Is there AI in this?"): *yes, as the engine and not the product, mostly
  on your device.* We do not hide it; we do not lead with it.

## What a surface may and may not say

May: "stays on it until it is closed", "closes it", "still open", "your turn",
"nothing is ever sent for you", "runs on your device".

May not (Glance surfaces: `trial.html`, `pro-welcome.html`, the extension, the store
listing): "AI-powered", "AI assistant", "AI inbox", "AI email", "smart inbox/email/
assistant/replies", "understands your inbox/email", "copilot", "chatbot" as a
description of Glance. `test/identity-copy-corpus.cjs` enforces this. Flow (the
enterprise product) is a different audience and may describe AI plainly
(`docs/product-architecture.md`).

## Visual identity

The card's brand mark is a closed loop (a ring shut by a tick), not a sparkle. The
Do It button remains the single canonical primary CTA.

## When you add copy

1. Does the sentence describe a state of a loop (open, chased, yours, closed)?
2. Would it still be true if the model behind it were swapped for rules?
3. Would a user pay for what it says? If it only says the product is smart, cut it.
