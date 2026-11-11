# Label conventions for Glance's model: one table

Glance closes open loops. Gmail is where it starts today.

Lab doc (Phase 0 of `docs/glance-ai/model-upgrade-plan.md`). Every convention the labels, the dataset and the gate rely on, with who decided it and where it lives. A label that follows a convention cites its id (`C-n`). **Who decided matters:** "owner" conventions are Sali's words; "lab" conventions were settled by the labelling passes and are Claude's reading, open until the owner confirms; "engine" rows describe what the product does today and are not a label rule.

| id | Convention | Decided by | Status | Source |
|---|---|---|---|---|
| C-1 | A mail that confirms an amount or an approved budget and asks nothing is **silent** («אישרנו 4,200», "Confirming the fee is about $4,200") | owner, 2026-10-14 | decided; the engine still offers a task on a confirmed amount (engine error on the scoreboard) | `glance-ai/labeling/owner-rules.md` 3b |
| C-2 | An **approximate** amount («בערך», «כ-», "about", "around", "roughly") is not a confirmed amount: silent | lab, 2026-11-08 (extends C-1) | lab; dataset rows added | `glance-ai/model/V23.md` |
| C-3 | A promise «לפני החג» ("before the holiday") is a **task** | owner, 2026-11-11 | decided; the engine does not yet resolve holiday-relative dates | `V23.md`, gold row `v2syn-22856` |
| C-4 | An **undated** ask ("send the deck asap", no date) is silent in the labels and in the device today | open owner decision (act or silence) | **open**: 13 of the 26 wrong Do Its of the engine on the agreement labels are this class | `MODEL-TRACK.md` "What waits on the owner", scoreboard |
| C-5 | "asap", "as soon as possible", «בהקדם», «מיד» are **not** a date | lab, 2026-10-26 | lab | `V23.md` run 2026-10-26 |
| C-6 | "today", «היום», "this week", "by end of week", «סוף השבוע» **are** a deadline | lab, batch-004 and batch-005 | lab; the engine date reader does not read them all (engine finding) | `BATCH-004.md`, `BATCH-005.md` |
| C-7 | An ask to do work that is not a reply is a **task**; a request for information or a file back is a **draft** (reply) | lab, batch-005 | lab | `BATCH-005.md` |
| C-8 | "Attach X to the invite" is a **draft**, not a calendar event and not silence (dataset label only; the runtime veto is unchanged) | lab, 2026-11-08 | lab | `V23.md`, `dataset/v2/build-dataset-v2.cjs` |
| C-9 | A promise to self **with a clock time** is not settled: task or calendar. Labelled UNSURE and left out | lab, batch-004 | **open** | `BATCH-004.md` |
| C-10 | A dated note to self without a time is a **task** | lab, v2.4 | lab | `gap-labels-v25.cjs` |
| C-11 | A commitment the person made ("you said you would…", «התחייבת…») is the reference's `commitment|task` class, not a new class | lab, v2.5 | lab | `gap-labels-v25.cjs` |
| C-12 | Cc-only, addressed-to-other, "Hi all" and group mail are **profile features**, not a blanket quiet; relevance is `relevant`, `not_relevant` or `unknown` and `unknown` keeps today's behaviour; no product quiet is removed before a contrast-pair shadow test | owner, 2026-10-08 | decided; labels keep these UNSURE | `CLAUDE.md` "Per-user context", `docs/glance-ai/user-context-v0.md` |
| C-13 | An ambiguous date (`5/11`) reads day first when a Hebrew weekday (`יום`, `ביום`) is beside it; English and mixed `12/4` stay month first; with a weekday and a clock that disagree, ask instead of picking | engine, 2026-10-25 and 2026-10-26 | shipped in code | `core/extract.js`, `test/hebrew-weekday-explicit-date-corpus.cjs`, `docs/vault/decisions.md` |
| C-14 | "No need to reply" cancels the reply draft and leaves the task when the mail also asks | engine, 0.9.50 | shipped in code | `CLAUDE.md` package 0.9.50 |
| C-15 | An approval ask with a deadline («אישור נדרש») is a **task** | owner, 2026-10-24 | decided, shipped | `docs/vault/decisions.md` |
| C-16 | Labels are never owner-verified unless `ownerVerified: true`; two blind Claude passes that agree are `agreed: true, passes: 2` and never count as owner-verified | owner, 2026-10-11 | decided | `oss/finetune/promote_gate.cjs` |
| C-17 | Rows copied from a blind label set never go into training; every fix made after looking at a set is declared in the run record | lab rule | active | `docs/human-eval.md` §6, `V23.md` |

**How to use it.** A new label or a new gap rule cites the id it follows. A disagreement between two passes that no row here settles is a new row marked **open**, and goes to the owner in the next batch note, not into training. When the owner decides an open row, change its status in the same commit and add one line to `docs/vault/decisions.md`.

**Open, in the order they limit the model:** C-4 (undated asks), C-9 (promise to self with a clock time).
