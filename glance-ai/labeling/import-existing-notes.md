# Import notes — `real-mail-gold.json` → M0 schema

> Read-only fetch via GitHub API · 2026-10-07 · **do not clone, do not edit the repo**.  
> Source path: `flow-trial-extension/test/fixtures/real-mail-gold.json`  
> Ref: branch `claude/install-uiux-pro-max-skill-a4agox` (also noted @ `a65c1af` / PR #81 in arch docs).

## What was fetched

| Fact | Value (from file / headers, not invented) |
|---|---|
| File `collected` | `2026-10-06` |
| `mail_of` | `2026-10-05` |
| Case count | **22** (`rm-001` … `rm-022`) |
| Label provenance | File `labels_note`: labels assigned by a **model** reading real text; **NOT checked by the owner**; “do not train on them” |
| Quality notes (#81) | n=22 (15 real); model labels; not a model-swap gate |

Breakdown by fixture `source` (fixture vocabulary, **not** gmail\|outlook):

| Fixture `source` | Count | Ids |
|---|---|---|
| `real_other` | 8 | rm-001, 003, 004, 005, 009, 015, 021, 022 |
| `real_own` | 7 | rm-002, 006, 007, 008, 010, 011, 012 |
| `dogfood_test` | 7 | rm-013, 014, 016, 017, 018, 019, 020 |

Exact per-id fixture labels (from file):

| id | lang | fixture label | task | confidence |
|---|---|---|---|---|
| rm-001 | he | HOLD | reply | clear |
| rm-002 | he | SILENT | intent | clear |
| rm-003 | he | SILENT | intent | clear |
| rm-004 | he | SILENT | intent | borderline |
| rm-005 | he | CLOSE | reply | clear |
| rm-006 | he | SILENT | intent | clear |
| rm-007 | he | PROMISE | intent | clear |
| rm-008 | he | ASK | intent | clear |
| rm-009 | he | HOLD | reply | clear |
| rm-010 | he | ASK | intent | clear |
| rm-011 | he | ASK | intent | clear |
| rm-012 | he | SILENT | intent | clear |
| rm-013 | he | SILENT | intent | clear |
| rm-014 | he | SILENT | intent | clear |
| rm-015 | en | HOLD | reply | clear |
| rm-016 | en | ASK | intent | clear |
| rm-017 | en | ASK | intent | clear |
| rm-018 | en | ASK | intent | clear |
| rm-019 | en | ASK | intent | clear |
| rm-020 | en | ASK | intent | clear |
| rm-021 | en | SILENT | intent | clear |
| rm-022 | en | SILENT | intent | clear |

Fixture `label` totals: **ASK 8** · **SILENT 9** · **HOLD 3** · **CLOSE 1** · **PROMISE 1** = **22**.  
Language: HE 14 · EN 8.

## Field mapping → M0 `schema.json`

| Fixture field | M0 field | Notes |
|---|---|---|
| `id` | `id` | Keep `rm-NNN`; set `importedFrom`: `real-mail-gold.json#rm-NNN` |
| — | `source` | Fixture has no gmail\|outlook. **Gap:** set during owner re-label from the surface used; do not invent per id. |
| — | `subject` | **Missing** (sentence-level `text` only). |
| `text` | `redactedBody` or `excerpt` | Already masked. Prefer `redactedBody` = `text` for draft import. |
| `label` | `modelLabelPrior` | Prior only. **Never** copy into `ownerLabel` without owner pass. |
| `expected` | `notes` (prefix) | Preserve rationale. |
| `lang` | `lang` | `he` \| `en` |
| — | `labeledAt` / `labeledBy` | **Missing** until owner labels. |
| — | `consent` | Fixture says do not train → default **`false`** until Sali opts in. |

## Suggested (not authoritative) M0 mapping for *owner review*

Checklist only — every row still needs an owner pass.

| Fixture label | Proposed `ownerLabel` | Proposed `wrongDoIt` | `expectedAction` hint |
|---|---|---|---|
| ASK (asked_of_you / clear ask of owner) | ASK | false | from `expected` / family |
| ASK (asked_of_others — owner *sent* the ask) | SILENT for Do It surface; note Waiting-on in `notes` | true if a Do It card would fire on sent mail | often null |
| SILENT | SILENT | true if a card would be harmful; else false | null |
| HOLD (OOO, hedged reply, forward≠answer) | SILENT | true | null (loop stays open — not a Do It) |
| CLOSE | SILENT | true if Do It would mishandle | null (true-close ≠ Do It) |
| PROMISE | SILENT for Do It surface | true if card would appear | null (You-promised loop ≠ Do It) |

**Critical gaps for swap gate:**

1. **0 / 22 owner-verified** — all labels are model priors.
2. No `subject`, no mail `source` (gmail\|outlook), no `labeledBy` / `labeledAt`.
3. Fixture tasks mix `intent` and `reply` (HOLD/CLOSE); M0 binary is Do It surface (ASK\|SILENT).
4. `dogfood_test` (7) must stay separable from real-only metrics (fixture `source_kinds`).
5. Explicit “do not train” → imported lines keep `consent: false` until opt-in.

## Import procedure (local only)

1. A read-only copy of the old fixture is optional. It is not in this repository, and it is not required.
2. Emit draft JSONL with `modelLabelPrior`, `importedFrom`, `consent: false`, TBD owner fields.
3. Sali / CoS walk ~20/day from the **live test inbox**; use imported rows as regression anchors only after owner confirms.
4. Do not treat model-agreement numbers from PR #81 as owner gold.

## Counts to quote externally

- Gold fixture cases: **22**
- Owner-labeled (verified): **0** (per file `labels_note`)
- Target before model swap: **≥200 owner labels** (`ai-engine-plan.md`)
