# M0 labeling — Glance gold set

> Design notes from 2026-10-07, plus the in-repo path below. No live mail writes. No financial actions.
> The original design lived outside this repository. Those notes are not files here.

## In this repository

`owner-gold.jsonl` is the single owner-gold file. It is empty until the owner answers. A row is owner-verified only when `labeledBy` is `sali`.

Batch-001 is the first sheet: `batch-001.md` (Hebrew), `batch-001.json` (machine form, `ownerAnswer` still null), and `batch-001-cos-prefill.md` (chief of staff proposal, not confirmed). The machine answers for that proposal are `batch-001-cos-prefill.answers.json`. Items 8 and 17 stay unsure. Item 17's note says the close is a save to OneDrive.

Answers file shape:

```json
{
  "labeledBy": "sali",
  "labeledAt": "2026-10-08T12:00:00.000Z",
  "consent": false,
  "answers": [
    { "item": 1, "mark": "✅", "note": "optional" }
  ]
}
```

`item` is the batch-001 number, or use `id` (`v2syn-…`). `mark` is ✅ (model action), ⚙️ (engine action), 🤫 (silent), or ❓ (unsure, left out of the headline). `labeledBy` may also be `cos:<name>`. That stores the row and keeps `ownerVerified` false. The command refuses `ownerVerified: true` unless `labeledBy` is `sali`.

When the owner's file is in:

```sh
node glance-ai/labeling/apply-owner-answers.cjs --answers path/to/answers.json
```

That writes schema-valid rows into `owner-gold.jsonl`, scores v2 alone, v2+veto, v2.1+veto, the engine on the tip, and gated Qwen propose-only where the cache covers the case, then rescores the shipped v2 held-out file. If `model/train/features-v2/train.jsonl` exists, it also refits v2 on CPU into `labeling/dry-run/` and does not replace `model/artifacts/`.

The chief of staff preview (provisional / not owner-verified, kept out of `owner-gold.jsonl`):

```sh
node glance-ai/labeling/apply-owner-answers.cjs --answers glance-ai/labeling/batch-001-cos-prefill.answers.json --preview
```

`make-batch-001.cjs` rebuilds the sheet from `../model/dataset/out-v2/test.jsonl` and `../model/shadow/out-v2/test-preds.jsonl`. Those files come from `../model/run-all-v2.sh` and are not in git. The committed `batch-001.json` and `batch-001.md` are the snapshot. Re-running the generator overwrites them.

Tests: `node glance-ai/labeling/test-ingest.cjs` and `node glance-ai/labeling/test-score.cjs`. Both run at the start of `bash glance-ai/run-cpu-checks.sh`. They do not need the feature files.

Glance is a **close fabric** (detect → carry → execute → true close) — not a draft helper. Labeling teaches *judgment*: when to surface a single Do It vs stay silent. **Silence beats a wrong Do It.** Sending in the user's name is never automatic. Prepare/draft/attach/calendar-hold are intermediate steps on the path to Handled — never the definition of done.

## Who labels, where, pace

| | |
|---|---|
| **Who** | Sali (owner) or CoS under Sali's direction (`labeledBy`) |
| **Inbox** | Test only: `ai.local.flow@gmail.com` (and Outlook test surface if used) |
| **Pace** | ~**20 cases/day** until **≥200 owner labels** |
| **Today** | Existing fixture ≈22 cases, **model-labeled** — not enough to swap (see `import-existing-notes.md`) |
| **Consent** | Training consent is **opt-in, off by default**. Set `consent: true` only when Sali opts that batch into training use |

Do **not** label production customer mail into this gold file without explicit consent and redaction.

## Schema

One line = one JSON object matching `schema.json`.

Required fields:

| Field | Meaning |
|---|---|
| `id` | Stable id (`gold-YYYYMMDD-NNN` or imported `rm-NNN`) |
| `source` | `gmail` \| `outlook` |
| `subject` | Redacted subject |
| `redactedBody` **or** (`bodyHash` + `excerpt`) | Prefer full redacted body while labeling |
| `ownerLabel` | **`ASK`** or **`SILENT`** only (M0 binary for Do It surface) |
| `expectedAction` | If ASK: name what would **truly close** the loop (or the one next step on that path); `null` if SILENT. Not «draft reply» / «calendar hold» as done when the ask is issue invoice / pay / get file from third party / etc. |
| `wrongDoIt` | `true` if showing Do It would be wrong/harmful |
| `notes` | Why; HE/EN nuance; traps |
| `labeledAt` | ISO-8601 |
| `labeledBy` | `sali` or `cos:<name>` |
| `consent` | Explicit training consent for this record |

Optional: `lang`, `importedFrom`, `modelLabelPrior`.

Template: `gold-template.jsonl` (fake examples only).

## ASK vs SILENT vs wrong-Do-It

```
ASK     → a real open loop for the owner; a Do It card *may* be correct
SILENT  → no card; silence is the right product behavior
wrongDoIt = true  → if the product showed Do It here, that would be a failure
```

Rules of thumb:

1. **ASK + wrongDoIt=false** — clear ask of the owner (issue invoice, pay, get file from third party, confirm, schedule, reply with substance). `expectedAction` names the **true-close outcome** (or the single next step toward it) — e.g. `issue+verify invoice`, not «prepare invoice draft» as done; draft/file/calendar remain intermediate on the path to Handled. Labeling still judges *surface*; execution stays behind approval later.
2. **SILENT + wrongDoIt=true** — traps: marketing, OOO/auto-reply, ask addressed to someone else, owner's own descriptive text, quoted own ask in a forward, soft conditionals (“only if…”), prohibitions (“don’t forward”).
3. **SILENT + wrongDoIt=false** — rare: clearly no action and no plausible false Do It (e.g. pure FYI with no imperative). Still SILENT.
4. Never mark ASK just because the mail is “important.” If unsure → **SILENT** and set `wrongDoIt: true` when a card would mislead.

Map from the older intent pipeline (ASK / PROMISE / HOLD / CLOSE / SILENT) only in `notes` / `importedFrom`. M0 `ownerLabel` stays binary ASK|SILENT for the Do It decision. **Silence beats a wrong Do It.**

## Redaction / privacy

Mask before writing a line:

| Token | Use for |
|---|---|
| `[NAME]` | people |
| `[ORG]` | company / product |
| `[EMAIL]` | addresses |
| `[PHONE]` | phones |
| `[DATE]` | absolute dates |
| `[IMAGE]` | inline images |

Keep weekday words and relative times (“this week”, “בימים הקרובים”) — the engine uses them. No full unredacted bodies in logs, chat, or shared drives. `bodyHash` = sha256 of the canonical redacted body when you store excerpt only.

## HE + EN examples (from template)

**HE · ASK** (`example-he-001`): meeting request addressed to the owner → ASK, expectedAction = draft calendar-hold reply, `wrongDoIt: false`.

**EN · SILENT / wrong Do It** (`example-en-002`): OOO auto-reply → SILENT, `expectedAction: null`, `wrongDoIt: true` (do not close or “handle” the prior loop with a card).

**HE · SILENT / wrong Do It** (`example-he-003`): imperative to a named colleague; owner only in To/Cc → SILENT, `wrongDoIt: true`.

## Session checklist (~20/day)

1. Open test inbox; pick unread / recent threads (mix HE and EN if available).
2. Redact → write one JSONL line per *judgment unit* (usually one message; split if two independent asks).
3. Choose ASK or SILENT; fill `expectedAction` or `null`; set `wrongDoIt`.
4. One-line `notes` if non-obvious.
5. Append to your working `gold.jsonl` (local; not the product repo from this scaffold).
6. Stop at ~20; consistency beats volume.

## Out of scope for this folder

- Editing or cloning `salisapan/realrtade`
- Merges, Netlify, live payments / invoice issue
- Surfacing candidate-model Do It (see `../shadow/`)
- Calling Glance a “Gmail Chrome extension”

## Related

- Import map from existing fixture: `import-existing-notes.md`
- Shadow harness (incumbent vs candidate): `../shadow/`
