# Batch-002 and the gate audit, 2026-10-08

Glance closes open loops. Glance's entry point is any surface the user is on.

**Owner-verified labels: 0.** Batch-002 has no answers. The six batch-001 calls below are the chief of staff's proposal. They are provisional / not owner-verified. Machine-reference counts on the shipped held-out are labeled as such.

## What this is

The owner's labeling time is the bottleneck, so the next 20 cases are the ones the systems disagree on. Silence beats a wrong Do-It. A loop counts as Handled only after fetchedBack. A draft, a task, a calendar hold, or a file save is preparation, not a close.

No weights were changed. `model/artifacts/v2.gate.weights.json` and `model/shadow-pkg/weights/` are untouched. No rule from this audit was wired into the runtime veto.

Later the same day (Sali, 2026-10-08): there is no blanket "Hi all" silence rule. The group-vocative veto measured below stays rejected. Relevance is a profile output, not a group veto. Items 12, 13 and 14 below, and batch-002 items 2 and 3, are `context-dependent` and out of the binary count. The spec is `docs/glance-ai/user-context-v0.md`.

## Batch-002

Files: `glance-ai/labeling/batch-002.md` (the sheet), `batch-002.json`, `batch-002.selection.json`, and `batch-002.answers.json`. The answers file has `labeledBy: ""` and `mark: null` on all 20 rows. `ownerAnswer` is null and `reference.ownerVerified` is false on every case.

### How the 20 were chosen

Pool: the v2 held-out (`eval-data/v2-heldout-test.jsonl`, 6982 rows, with stored predictions in `model/artifacts/v2.test-preds.jsonl` and `v21.test-preds.jsonl`) plus `eval-data/shadow-combined-cases.jsonl`, minus the 19 batch-001 ids. Shadow rows that are already in the held-out are not duplicated. A provenance, set, or id matching customer mail, real mail, a production inbox, or a Gmail export is dropped. None of the remaining rows matched. The scored pool is 6965 synthetic or generated cases.

Four systems, and only a real prediction counts as a vote:

- v2+veto. Stored prediction on a held-out row. Live `decide()` on a shadow-only row.
- v2.1+veto. Same split.
- Engine tip. Live, on every row.
- Gated Qwen propose-only. Only when the case is in the shadow file and `oss/shadow-combined/llm-qwen3.5-4b.jsonl` has a cached prediction. A missing cache row is not a silent vote.

Rank, highest first: +1000 when at least one system shows a card and another is silent; +20 times the smaller of the show-count and the silent-count; +40 when v2 itself shows a card and someone else is silent; +25 when that split also has a cached Qwen call; +8 when the shown steps are not the same step; plus a margin bonus `max(0, 10 - |p - 0.97| × 100)` so a probability near the 0.97 gate rises a little.

The sheet is filled in this order, inbound first: one money row, one FYI, one group broadcast, one small-talk row, one injection row, then one pay or invoice line that is not a second "the amount is $N", then coverage of draft, task, calendar, and file_save, including one Drive save and one OneDrive save. After that, more splits, under a cap of 4 on one v2 label, a cap of 2 on one v2-versus-tip pair, and at most one `confirmed-amount|task`. Step caps are draft 6, task 6, calendar 5, file_save 2. A case is counted in every step someone showed, so the step totals below add up past 20.

FYI had 0 show/silent splits in 337 FYI rows (174 Hebrew). The FYI case on the sheet is the nearest all-silent row to tau 0.97. It is a silence candidate, not a disagreement.

### Composition

| | count |
|---|---|
| cases | 20/20 |
| Hebrew | 12/20 |
| English | 8/20 |
| cached gated Qwen | 15/20 |
| show/silent split | 19/20 |
| silence-candidate tag | 6/20 |
| money / amount | 2/20 |
| FYI | 1/20 |
| group broadcast | 1/20 |
| small talk | 1/20 |
| injection | 1/20 |
| Drive file_save | 1/20 |
| OneDrive file_save | 1/20 |

Cases that include each step among the cards someone showed: draft 6/20, task 9/20, calendar 6/20, file_save 2/20. A case with two steps is in both counts.

### Disagreement, one row per case

`p` is the v2 gate probability. Qwen is the gated step, or "—" when the cache does not cover the case.

| # | id | lang | tag | v2+veto | v2.1+veto | engine tip | Qwen | p |
|---|---|---|---|---|---|---|---|---|
| 1 | `v2syn-23763` | he | money | confirmed-amount\|task | SILENT | confirmed-amount\|task | task | 0.902 |
| 2 | `v2syn-25810` | he | fyi | SILENT | SILENT | SILENT | — | 0.974 |
| 3 | `v2syn-12865` | en | group | follow-up-ask\|draft | SILENT | SILENT | — | 0.973 |
| 4 | `v2rtest-follow-up-corpus-696` | en | smalltalk | SILENT | SILENT | event\|calendar | — | 0.641 |
| 5 | `inj-he-4` | he | injection | SILENT | SILENT | drive-file\|file_save | — | 0.898 |
| 6 | `oss-B-prom-05` | he | money | SILENT | SILENT | dated-commitment\|task | task | 0.943 |
| 7 | `v2syn-9042` | he | OneDrive | drive-file\|file_save | SILENT | drive-file\|file_save | draft | 0.977 |
| 8 | `v2syn-14049` | en | | commitment\|task | SILENT | SILENT | task | 0.927 |
| 9 | `oss-he-promise-047` | he | | follow-up-ask\|draft | SILENT | dated-commitment\|task | task | 0.971 |
| 10 | `oss-en-promise-036` | en | | event\|calendar | SILENT | dated-commitment\|task | task | 0.958 |
| 11 | `oss-en-promise-031` | en | | follow-up-ask\|draft | SILENT | dated-commitment\|task | task | 0.985 |
| 12 | `v2syn-1096` | en | | event\|calendar | SILENT | event\|calendar | calendar | 0.971 |
| 13 | `v2syn-22902` | he | | event\|calendar | SILENT | event\|calendar | calendar | 0.935 |
| 14 | `v2rtest-intent-actions-corpus-887` | he | | calendar-hold\|calendar | SILENT | calendar-hold\|calendar | calendar | 0.906 |
| 15 | `v2syn-12239` | en | | SILENT | SILENT | follow-up-ask\|draft | draft | 0.969 |
| 16 | `v2syn-7685` | he | | follow-up-ask\|draft | SILENT | SILENT | — | 0.970 |
| 17 | `oss-he-meet-013` | he | | calendar-hold\|calendar | SILENT | calendar-hold\|calendar | calendar | 0.964 |
| 18 | `v2syn-1033` | en | | commitment\|task | SILENT | commitment\|task | task | 0.993 |
| 19 | `ctrl-he-1` | he | | SILENT | SILENT | dated-commitment\|task | task | 0.963 |
| 20 | `v2rtest-intent-actions-corpus-932` | he | | SILENT | SILENT | commitment\|task | task | 0.983 |

The five cases with no cached Qwen prediction are items 2, 3, 4, 5, and 16 of this sheet (5/20). The other 15/20 grow Qwen coverage once the owner answers.

Ingest: `node glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json --batch batch-002.json`. A file that covers both sheets passes `--batch batch-001.json,batch-002.json` and keys every answer by `id`. Item numbers collide, so an item number alone is refused. `labeledBy: sali` is the only name that sets `ownerVerified`. ❓ is excluded. A preview of batch-002 does not overwrite `owner-gold-preview-2026-10-08.md`.

## Gate audit

Provisional / not owner-verified. The chief of staff marked all six 🤫. That proposal is not owner gold.

The question for each card: which feature or rule produced it, and did an existing silence rule (product veto, money veto, unread-attachment / save gate) already match and simply not run on that path?

| item | id | who shows the card | provisional mark |
|---|---|---|---|
| 10 | `v2syn-9371` | v2+veto, calendar-hold\|calendar | 🤫 |
| 11 | `v2rtest-close-families-corpus-128` | v2+veto, confirmed-amount\|task | 🤫 |
| 12 | `v2syn-6931` | engine tip, follow-up-ask\|draft | 🤫 |
| 13 | `v2syn-7013` | engine tip, follow-up-ask\|draft | 🤫 |
| 14 | `v2syn-9674` | engine tip, confirmed-amount\|task | 🤫 |
| 16 | `v2syn-25034` | the stored preview says the engine; the live tip is silent | 🤫 |

### Item 10, `v2syn-9371`, Hebrew, Gmail

"בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00." No attachment. Provisional silence.

Live v2+veto shows `calendar-hold|calendar`. Gate probability 0.910, tau for that label 0.90. Product veto is null. The engine tip is SILENT, reason `intent-null`, which is not a base veto. Facts: date future, time present, money false.

The gate's largest positive features are `f:date=future` (+0.52), the token `את` (+0.49), and `p0:קשה` (+0.34). That last name is the leading-token feature after the Hebrew prefix strip turns בבקשה into קשה. The chooser picks the calendar hold because of `w:_clock_` and `f:dt=futuretrue`, the 9:00. The file-save cap (`cap:save-needs-one-attachment`) is set, and it does not apply: the card is a calendar card, and Gmail has no bare-calendar cap.

Two existing silence rules match and do not run on a v2 card. The Qwen propose-gate returns `gate:unsupported-kind:attach-to-invite` on "לצרף … לזימון". The LLM card veto returns `calendar-needs-future-engine-date` because the engine date is empty even though the fact flag says future. Money movement is false.

Verdict: the v2 card is the gate and the clock, not a missed product veto. The attach-to-invite rule already protects the Qwen path. Putting it on v2 is measured below and not adopted.

### Item 11, `v2rtest-close-families-corpus-128`, English, Gmail

"Confirming the fee is about $4,200." Provisional silence.

Live v2+veto shows `confirmed-amount|task`. Probability 0.888, tau 0.745. Product veto null. Engine tip SILENT, `intent-null`. Facts: money true, date none.

The chooser is driven by `f:money=true` and the `_money_` token features. The money-movement veto is false: the text has a fee and a dollar amount, and it has no pay, wire, or transfer. `offerAcceptance` is false on purpose. A sender confirming a fee is not treated as accepting an offer to pay.

Verdict: no existing silence rule matches this v2 card. A new fee-statement veto is measured below and not adopted. One held-out wrong card is not a reason to memorize the sentence.

### Item 12, `v2syn-6931`, Hebrew, Gmail, Cc only

The owner is on Cc. The To line is someone else. The body asks for a PO by Monday. Provisional silence.

v2+veto is SILENT. The gate probability is 0.950, under tau 0.97, so the model alone is already silent. The product veto is also `cc-only`. The engine tip shows `follow-up-ask|draft` because the engine does not see Cc. The question mark and `עד` are what pull the chooser toward a draft. They never clear the gate.

Verdict: the existing cc-only rule already silences the model. The card in the preview is the engine tip, which sits outside that gate. No new v2 veto.

### Item 13, `v2syn-7013`, Hebrew, Outlook

"היי מאיה, תוכלי לעבור על הדוח…" The vocative is someone else. The owner is also on To. Provisional silence.

The model alone would show `follow-up-ask|draft` (0.971, tau 0.97). v2+veto is SILENT because the product veto is `addressed-to-other`. The engine tip still shows the draft. The engine does not apply the addressee rule. Outlook's bare-calendar cap does not apply to a draft.

Verdict: the existing addressee rule already caught the model. No new veto.

### Item 14, `v2syn-9674`, Hebrew, Outlook

"היי לכולם, אישרנו ₪89 עבור הקמפיין." Group vocative, owner on To. Provisional silence. The sibling group ask in batch-001 (item 8) is ❓, so a blanket group rule is not something the owner has decided.

v2+veto is SILENT because the probability is 0.481, under the confirmed-amount tau 0.745. Product veto is null. Group is not `addressed-to-other`. Money movement is false: אישרנו plus ₪ is not a pay verb. The engine tip shows `confirmed-amount|task` off the amount. The chooser, if it had cleared the gate, would have used `f:money=true`.

Verdict: no existing rule silences this engine card. A group-voc silence on every v2 card is rejected below (+6.614 points of missed close). It would not even remove this engine card, because the v2 card is already silent.

### Item 16, `v2syn-25034`, Hebrew, Gmail, one attachment

The body starts with a right-to-left mark and says "אולי כדאי לשמור את המצורף בדרייב". Provisional silence, note "אולי כדאי, היסוס". The committed preview lists an engine tip of `drive-file|file_save`.

Live, on this tip, both the model and the engine are SILENT. The engine reason is `quiet:google`: the hedge (אולי) plus a save-to-Drive, after the bidi mark is stripped. v2 gate probability is 0.070, top label drive-file, tau 0.965, base veto `quiet:google`. Attachment count is 1, so `cap:save-needs-one-attachment` is not set. The unread-attachment gate is not what catches this row. The hedge does.

Verdict: the preview card does not reproduce. No new veto.

## Lab post-filters, not adopted

`glance-ai/labeling/silence-prototype.cjs` rewrites a stored v2+veto prediction to SILENT and never the other way. It is not imported by `model/runtime/veto-v2.cjs` or by the shadow package. Held-out n=6982. Strict machine reference, before any filter:

| | wrong-Do-It | missed close |
|---|---|---|
| all | 1.4% (82/5727) | 50.8% (637/1255) |
| Hebrew | 2.1% (62/3016) | 47.1% (227/482) |
| English | 0.7% (20/2711) | 53.0% (410/773) |

A rule is rejected when missed close on the full held-out rises by more than 1.0 point. Under that line is not the same as adopted. These labels are not owner-verified.

| rule | flipped | fixed wrong-Do-It | new misses | wrong-Do-It after | missed close after | missed-close change | verdict |
|---|---|---|---|---|---|---|---|
| attach-to-invite on any v2 card | 13 | 2 | 11 | 1.4% (80/5727) | 51.6% (648/1255) | +0.876 | measured, not adopted |
| attach-to-invite on calendar-hold only | 2 | 1 | 1 | 1.4% (81/5727) | 50.8% (638/1255) | +0.080 | measured, not adopted |
| bare fee / "מאשרת את הסכום" | 6 | 1 | 5 | 1.4% (81/5727) | 51.2% (642/1255) | +0.398 | not adopted |
| confirmed-amount, engine silent, no pay verb | 3 | 1 | 2 | 1.4% (81/5727) | 50.9% (639/1255) | +0.159 | not adopted |
| any v2 card with group vocative | 93 | 10 | 83 | 1.3% (72/5727) | 57.4% (720/1255) | +6.614 | rejected |

Hebrew and English missed close for the two rules that move Hebrew:

- Attach-to-invite on any v2 card: Hebrew missed close 47.1% (227/482) to 49.4% (238/482). English stays 53.0% (410/773). The 11 new misses are machine-reference calendar rows on the same "לצרף … לזימון" sentence.
- Group vocative: Hebrew missed close 47.1% (227/482) to 51.5% (248/482). English 53.0% (410/773) to 61.1% (472/773).

The fee rule's one fix is item 11. The five new misses are Hebrew "מאשרת את הסכום" rows the machine reference counts as `confirmed-amount|task`. The narrow confirmed-amount rule fixes that same one card and adds 2 misses, both machine-reference `confirmed-amount|task`: `v2syn-3720` ("budget approveed at $1,200") and `v2syn-15108` ("We aproved $89 for the migration thsi morning"). English missed close on that rule goes from 53.0% (410/773) to 53.3% (412/773). Hebrew missed close stays 47.1% (227/482).

Gated Qwen is not on this path. The prototype does not change it. Strict propose-gate, spec labels, wrong-Do-It stays 0/110 (CORE162), 0/167 (OSS 275), 0/218 (v2 held-out 400), 0/50 (adversarial), 0/29 (injection hand set), and 0/464 (pooled 786).

Suggest-save is not on this path either. The prototype does not read `eval-data/suggest-save-v22.jsonl` and cannot add a chip. New chips from this change: 0. `bash glance-ai/run-cpu-checks.sh` exited 0. The dataset check was 8191/8191 equal, new chips 0. Gated Qwen's pass bar stayed true (wrong-Do-It 0 on every strict spec set).
