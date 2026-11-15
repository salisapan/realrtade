# What Glance's own model is for (2026-11-15)

Owner, 2026-11-15: think about what the model really is and what it can do, then keep building it so it is a product that works. This page is the working answer. It is lab status, not a product claim, and it changes no switch, scope or copy.

**Product definition (vision-locked):** Glance closes open loops. Gmail is where it starts today. The loop is detect, carry, execute, true close; it stays silent when unsure, never sends for the person, and counts a loop closed only on real completion or a deliberate release.
**Current implementation status (code reality):** the model measured here is a rules engine (about 25 kind readers, a shared judge, vetoes) with a small learned gate beside it in the lab. The learned parts are off in the product.

## 1. The essence

Glance's model is not a classifier of mail. A classifier answers "which label". The job here is a closer's judgment, and a closer is wrong in a more expensive way than a classifier: a wrong card costs the person's trust, a wrong write costs them a calendar entry, a task, a payment note. So the model is five competences that depend on each other, and the product is only as good as the weakest one:

| # | Competence | The question it answers | Where it lives today | How it is measured |
|---|---|---|---|---|
| 1 | **Read** | Is there an explicit intention in this text, on this surface, addressed to this person? | `core/intent.js`, `core/extract.js`, the kind readers, `core/incoming-judge.js` | the 701-row frozen eval; the kind-level frozen set (72 texts, 28 kinds); the probe sets |
| 2 | **Stay silent** | Is it uncertain, hedged, negated, past, someone else's, a mass mail, an injection? | the vetoes, `quiet-metrics`, the family quiets | contrast rows on every set: 50 of 50 silent on the kind set; the wrong-Do-It ratchet (22 open, 0 regressed) |
| 3 | **Plan the close** | Which close, with which slots (day, clock, amount, title, old slot), through which steps? | `core/actions.js` (`planFor`), `core/commitment-title.js`, `core/intent-decompose.js` | the slot gold (40 texts): 0 of 37 offered rows write a wrong slot, after four fixes of 4 |
| 4 | **Know it is done** | Did the reply, the file, the payment note really finish the request? Is the loop still open? | `core/reply-model.js`, `core/follow-up.js`, ProofOfClose (`fetchedBack`) | the completion gold (30 held-out pairs): 18 of 20 exactly right, 0 loops closed on a non-answer, 0 opt-outs left open; the `follow-up` and `reply` corpora; the real-thread check (8 of 8) |
| 5 | **Know the person** | Is this relevant to this person, in their role, with their way of working? | `docs/glance-ai/user-context-v0.md` (lab scorer, not wired) | nothing yet on real data |

The model has no job outside these five. It never closes, writes or sends by itself: its answer is a proposal that cites its evidence, and a feature must still work, more quietly, with the model off.

## 2. What it can do today, honestly

- **Read:** recall on the held-out kind set is 67 of 89 rows with a close (95% interval 65 to 83%), with 50 of 50 contrast rows silent. The first reading was 61 of 89 with one wrong Do It; the difference is four shapes the set exposed and that were then fixed.
- **Plan:** the slot gold first read 4 of 37 offered rows writing a wrong slot (11%). The causes were in the shared date reader, not in a rule: «by end of day Monday» was today; a clause about where the writer is away, or what was already overdue, supplied the date. They are fixed and pinned.
- **Breadth:** of the 62 close kinds in `docs/glance-ai/holistic-close-map.md`, the lab model's four labels say the exact close for 13, the family for 16 and nothing for 33. The engine's readers cover far more than the model does.
- **On the owner's real mailbox** (76 masked rows): nothing offered on the 38 automated and auto-reply rows. A sample that small does not say how often any kind occurs.

## 3. Where the model is weakest, and what each fix needs

| Weakness | Evidence | What closes it | Gated on |
|---|---|---|---|
| The learned part only sees 4 labels | kind map; the training pool has no positive for file, row, video or recurring kinds | a kind head trained on teacher-written paraphrases of the rare kinds, evaluated only on the held-out kind set | a teacher run: started 2026-11-15 in the `glance-model-lab` environment (cap 6 USD, owner-approved); not reported yet |
| Holds phrased as a question were silent | slot gold | done 2026-11-15 (`core/intent.js`, `core/day-words.js`): 40 of 40 offered, 0 wrong slot on fresh rows | nothing |
| Move and cancel were silent | probe | done behind `CALENDAR_CHANGE` (off), Gmail only | a Gate with ProofOfClose before it is on; an Outlook writer |
| Completion is judged by rules plus a small learned model | `reply-model`, `follow-up` | measured now (completion gold); next: information questions open no loop on purpose, a given time («מחר ב-15:00 מתאים») is read as a promise, a Hebrew out-of-office is not held | nothing: engine work |
| No evidence on real use | the real mailbox is 76 rows | shadow logging in the product, opt-in, masked | the owner's privacy decision |
| Relevance per person is not wired | `user-context-v0` | wire only after a contrast-pair shadow test | the owner |

## 4. The rules that keep it honest

1. A held-out set is never trained on and never tuned against. When a row exposes a fixable shape, the shape moves to a development set and a fresh row replaces it (kind-frozen and slot-gold both say so in their headers).
2. A wrong Do It is worse than a miss: contrast rows and the ratchet come first, recall second.
3. A card that names the wrong slot is a wrong Do It even when the family is right.
4. Every number on this page has its set size and interval next to it. A small hand-written set says where the engine is wrong on shapes someone thought of, not how often.
5. Nothing here turns a switch on, adds a scope, or changes public copy.
