# Quiet set, 20 mails

Glance closes open loops. Gmail is where it starts today.

Twenty synthetic mails for the live Gate. They are not owner labels. `ownerLabeled` is false and `labelSource` is `synthetic` on every row. The file is `glance-ai/eval/quiet-set-20.json`.

## Product definition (vision-locked)

Glance is a system for unfinished intentions. Offer or quiet uses the mail and the person's profile together. A group greeting, a distribution list, and Cc are features of that judgment. They are not a blanket quiet. When the mail is relevant to this person, the ask is explicit, and a close is possible, Glance offers. When it is not relevant, Glance stays quiet. The lock is `docs/glance-ai/user-context-v0.md`.

## Current implementation status (this tip)

The profile is not wired into the extension. This set is an offline input to `FlowIncomingJudge.judge` on the Outlook surface. It does not change the extension, and it does not lift the quiets that `user-context-v0.md` still keeps until a contrast-pair shadow test.

The expected column is the product label for a person named Dana Cohen (`dana.cohen@northwind.example`). It is not a copy of today's judge output.

## What is in the set

Sixteen rows should stay quiet: Cc-only mail whose ask names someone else, newsletters, automated or no-reply mail, receipts, calendar auto-notices, and group FYI. Six of those bodies are Hebrew (`qs-02`, `qs-04`, `qs-07`, `qs-11`, `qs-13`, `qs-15`). Two are mixed Hebrew and English (`qs-12`, `qs-19`).

Four rows look quiet and must offer. Relevance is Dana's, the ask is explicit, and a reply can carry it:

| Id | Why it looks quiet | Why it must offer |
|---|---|---|
| `qs-17` | Opens with "Hi all". Product and Avi are on Cc. | Dana is the only person on To. The mail asks her to reply and confirm by 20 October. |
| `qs-18` | Opens with "היי לכולם". The team is on Cc. | Dana is on To and is named. The mail asks her for an update by Thursday. |
| `qs-19` | Mixed Hebrew and English. Legal is on Cc. The greeting is "Hi team". | Dana is on To and is named. The mail asks her to reply and confirm by Thursday. |
| `qs-20` | Dana is only on Cc. Finance is on To. The greeting is "Hi all". | The sentence asks Dana, by name, to reply and confirm by 20 October, and tells everyone else there is nothing to do. |

`qs-16` is the mirror image: a dated "could you confirm" sentence, Dana on To, and it stays quiet because the sender is a newsletter and the footer is an unsubscribe line. The ask shape does not make bulk mail her loop.

## How the judge was run

Same loader as `flow-trial-extension/test/mail-format-corpus.cjs`: Node `vm`, then `core/domains.js`, `extract.js`, `judgment.js`, `source-text.js`, `google-closes.js`, `close-families.js`, `fact-reply.js`, `intent.js`, `actions.js`, `file-attach.js`, `resolution.js`, `quiet-metrics.js`, `incoming-judge.js`.

```sh
node glance-ai/eval/run-quiet-set-20.cjs
node glance-ai/eval/run-quiet-set-20.cjs --fail-on-wrong-offer
```

Each row is `FlowIncomingJudge.judge` with `surface: "outlook"`, Dana as `userName` and the only own address, the row's To and Cc, and `now` fixed at `2026-10-14T09:00:00.000Z` (a timestamp, so the vm does not replace it with the wall clock). A quiet row with `show: true` is a wrong offer. The flag exits 2 when any quiet row shows.

## Result on this tip

One wrong offer. One contrast row the judge left quiet. The other eighteen match the product label.

| Id | Expected | Judge | Reason | Steps |
|---|---|---|---|---|
| qs-01 | quiet | quiet | `quiet:hedge` | |
| qs-02 | quiet | **show** | | `outlookDraft`, `googleTask` |
| qs-03 | quiet | quiet | `quiet:noise` | |
| qs-04 | quiet | quiet | `quiet:noise` | |
| qs-05 | quiet | quiet | `quiet:noise` | |
| qs-06 | quiet | quiet | `quiet:low` (`followup`) | |
| qs-07 | quiet | quiet | `quiet:noise` | |
| qs-08 | quiet | quiet | `quiet:noise` | |
| qs-09 | quiet | quiet | `quiet:noise` | |
| qs-10 | quiet | quiet | `quiet:noise` | |
| qs-11 | quiet | quiet | `quiet:noise` | |
| qs-12 | quiet | quiet | `quiet:noise` | |
| qs-13 | quiet | quiet | `quiet:noise` | |
| qs-14 | quiet | quiet | `quiet:noise` | |
| qs-15 | quiet | quiet | `quiet:noise` | |
| qs-16 | quiet | quiet | `quiet:noise` | |
| qs-17 | offer | offer | | `outlookDraft`, `googleTask` |
| qs-18 | offer | offer | | `outlookDraft`, `googleTask` |
| qs-19 | offer | offer | | `outlookDraft`, `googleTask` |
| qs-20 | offer | **quiet** | `quiet:noise` | |

`qs-02` is the wrong offer. It is the Hebrew twin of `qs-01`: Noa asks Avi to reply and confirm the move, and Dana is only on Cc. `qs-01` stays `quiet:hedge` because "can you reply" is the English reply gate and Dana is not on To. `qs-02` says "תוכל בבקשה להשיב ולאשר … עד" with a date. That is a request, and it is not the English reply gate, so the judge offers a draft and a task. The product label stays quiet: the ask names Avi.

`qs-20` is the missed contrast. The mail asks Dana by name to reply and confirm by 20 October, and then says "Everyone else, no action needed." The judge treats "no action needed" as a quiet for the whole mail and returns `quiet:noise`. The product label stays offer.

`qs-17`, `qs-18`, and `qs-19` offer, including the Hebrew group mail and the mixed mail, with Dana on To.

Re-run the script on the tip you are gating. The table above is this tip's judge, not a stored label.
