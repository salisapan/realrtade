---
tags: [locked]
source: docs/product-identity.md
---
# Glance definition (locked)

Verbatim copy of the block in [[product-identity]]. Do not edit here: change it only in `docs/product-identity.md`, with the owner's say-so, and in every file `test/docs-consistency-corpus.cjs` lists (this note is one of them, so a drift fails the test).

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

## How to use it
- Any description of Glance (reply, report, commit, blurb) starts: **"Glance closes open loops. Gmail is where it starts today."**
- Every report keeps two parts apart: **Product definition (vision-locked)** = the block above; **Current implementation status (code reality)** = what ships in this commit.
- "It is a Chrome extension on Gmail" is a status sentence, never the definition.
- Flow (enterprise) is a separate product: [[product-architecture]].
