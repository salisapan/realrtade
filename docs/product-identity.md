# Product identity: an AI product; the close is what we sell

> Written 2026-10-02. Companion to `docs/local-first-principle.md` (how we
> recognise) and `docs/open-loops.md` (what Glance does). This file is about how
> Glance presents itself.

## The locked identity (source of truth: every other file quotes this block verbatim)

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

`test/docs-consistency-corpus.cjs` fails if any file that quotes this block differs from it by a character, so there is one definition. To change it, change it HERE and in every file the test names, in one commit, with the owner's say-so.

### Two things that are never the same sentence

When anyone (a person, Claude, a Grok bot, David) describes Glance, the description starts from the block above, and any status report keeps two parts apart:

1. **Product definition (vision-locked).** What Glance is: the block above. It does not change because the code is behind it.
2. **Current implementation status (code reality).** What ships today: for example "the entry surface is a Chrome extension on Gmail; execution goes through Google Tasks, Gmail drafts and Drive; WhatsApp Web, Outlook and right-click capture are opt-in experimental; the second reading is built and off at the server". It is true of this commit only, and it lives in `docs/open-tasks.md`, `docs/product-architecture.md` §0a and the owner documents named in `docs/README.md`.

"Glance is a Chrome extension for Gmail" is a sentence of the second kind presented as the first. It describes today's entry surface, not the product.

### Required framing, forbidden framing

Required, in any description of Glance: a system that closes open loops / unfinished intentions; starts today in Gmail; executes through Tasks, Draft and Drive when that is what completion needs; a multi-surface path toward true close; silence when uncertain; preparation is not completion; true close only on real completion or a deliberate release.

Forbidden as the full product definition: "Chrome extension for Gmail", "Gmail add-on", "AI email assistant", "smart inbox", and tracking, a reminder or a prepared draft described as completion. A sentence about the form (it installs in Chrome, it reads the open Gmail thread) is fine when it is plainly a statement of how it works today, not of what it is.

### Standing constraints (the anti-drift list)

1. Glance is not only a Gmail add-on. Gmail is the entry surface.
2. Glance is an AI product: its own model understands each intention and plans the close; what we sell is the close, proven. It is never "an AI email assistant" that writes for you or "a smart inbox". (Owner, 2026-10-09; it replaces «Glance is not an AI email product». Plan: `docs/glance-ai/ai-product.md`.)
3. Pro is the personal depth layer: more loops, the money owed, firmer nudges, Draft-It and summaries, and, once the server switch is on, a larger allowance and a stronger second reading. It is not a team or enterprise tier and carries no compliance claim. That is Flow, and it is separate.
4. Waiting or tracking alone is not success. True close is: the original intention completed in fact, or released on purpose by the person.
5. Free must stay genuinely useful: Do It without limit, loops that close on the outcome, and, once the server switch is on, the second reading within its allowance. Never a dead demo.
6. Zero-Prompt is sacred: no chat, no rules screen, no setup questions beyond signing in, one card only when something real is decided; silence when unsure.
7. Multi-platform means execution and observation across the surfaces where a loop really opens, advances and closes, in service of closure. It does not mean a connector marketplace, inbox-zero, or integrations for their own sake. A new surface is opt-in, read-only, stricter than Gmail, and changes the privacy page and the store text in the same commit (`docs/multi-platform.md`).

### Before and after

| Before (drifted) | After (locked) |
|---|---|
| "Glance is a Chrome extension for Gmail." | "Glance closes open loops. Gmail is where it starts today." |
| "A free Gmail extension that turns an email into a calendar event." | "Glance stays on what you asked for or promised until it is truly closed, and turns what is asked of you into a calendar event, a task or a draft. It starts in Gmail." |
| "Glance reminds you to follow up." | "Glance stays on it until the answer arrives; the reminder is a means, the close is the product." |
| "Draft ready: handled." | "Draft ready, nothing sent. It closes when you send it with the file." (preparation is not completion) |
| "An AI email assistant that understands your inbox." | "It stays quiet unless something real is open, and says what is still open." |
| "Glance is a connector to Calendar, Tasks and Drive." | "Glance executes through Calendar, Tasks, Drafts and Drive when that is what completion needs." |

## The rule

Glance is an AI product (owner, 2026-10-09). Its own model understands each intention and plans the close, and Glance may say so plainly. It still
competes on what stays open until it is closed, not on cleverness: the AI is named as what understands and plans, the close is the promise. Never "an AI email
assistant" that writes for you, never "a smart inbox", and never AI in place of the outcome.

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
- An external model assists hard cases and never becomes the identity or the
  spine (`docs/local-first-principle.md`). Today that is one opt-in step, the
  "second reading" of a single masked sentence (`docs/ai-ladder.md`). Its words
  in the popup are about sentences and loops ("Second reading", "used up", "starts
  again on Nov 1"), never about cleverness; `test/ai-ladder-corpus.cjs` enforces it.
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
