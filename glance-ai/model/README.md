# Glance in-house close model: v2.2 (shadow package, suggest-save, stripper), with v2.1, v2 and v1 kept below

The lab now lives in this repository under `glance-ai/`. How to regenerate data and which engine the harness loads: `../README.md`. The numbers below were measured on engine 0.9.35 on the training machine. Re-running on this repo's extension tip does not reproduce those historical counts unless `GLANCE_ENGINE_ROOTS` points at that unpacked tree.

> **v2.2 status (2026-10-08): offline only.** This lab is in the repo under `glance-ai/`. Nothing in it surfaces a Do It. No retraining: the v2 and v2.1 weights are unchanged. v2.2 adds four reference pieces:
> - **(1) A drop-in local-only shadow package.** It runs v2 (primary) and v2.1 (second) alongside the engine verdict.
> - **(2) The suggest-save eligibility rule, plus a dataset target.**
> - **(3) The footer / signature / disclaimer / `[image]` stripper** for the engine fix.
> - **(4) This section and `run-all-v22.sh`.**
>
> Glance only, never Flow.

## v2.2: what was built

| piece | path |
|---|---|
| shadow drop-in package (tier A, local only), plain JS, MV3-safe | `shadow-pkg/` (`src/`, `weights/`, `README-integration.md`, `run-tests.sh`) |
| content-script side: normalize, engine adapter, featurize v2 / v2.1, veto inputs, text-free ShadowInput, idle hook | `shadow-pkg/src/gs-text.js`, `gs-features.js`, `gs-prepare.js`, `gs-hook.js` |
| service-worker side: glw/1 sparse int8 scorer, kill switch, glance-shadow/2 records, enum guard, IndexedDB ring buffer (AES-GCM), tripwires, outcome joiner | `shadow-pkg/src/gs-model.js`, `gs-log.js`, `gs-sw.js` |
| packed weights. v2 is packed fresh in the same glw/1 format; v2.1 is byte-identical to `artifacts/v21.p0.glw` | `shadow-pkg/weights/v2.p0.glw` (302,981 B), `v21.p0.glw` (363,730 B), `manifest.json` (sha256) |
| tests: parity, logging, perf, size | `shadow-pkg/test/parity.test.cjs`, `test/log.test.cjs`, `bench/bench.cjs`, `tools/size-check.cjs` (→ `test/out/*.json`, `bench/out/bench.json`) |
| suggest-save rule, JS + Python, identical outputs | `suggest-save/suggest-save.js`, `suggest-save/suggest_save.py`, `suggest-save/README.md` |
| suggest-save fixtures: 22 spec rows (24 cases) + edge cases in `cases-extra.json` (31 original, plus Outlook bare Drive / דרייב) | `suggest-save/corpus-22.json`, `cases-extra.json`, `test-corpus.cjs`, `test_corpus.py` |
| suggest-save dataset target: a synthesized attachment-meta layer over v2 rows | `suggest-save/build-suggest-dataset.cjs` → `dataset/out-v22/suggest-save.jsonl` + `.summary.json`; `check_dataset.py` |
| stripper reference, JS + Python, byte-identical | `strip/glance-strip.js`, `strip/glance_strip.py`, `strip/test-strip.cjs`, `strip/test_strip.py`, `strip/README.md` |
| one-shot | `./run-all-v22.sh` (~5 min; refuses to start with < 1.5 GB available) |

## v2.2 results

### (1) Shadow package (`shadow-pkg/`)

**JS == Python on the v2 held-out test (n = 6,982):**

| check | v2 | v2.1 |
|---|---|---|
| features bit-identical to the training featurizer | 6,982/6,982 | 6,982/6,982 |
| decision == existing Node runtime (dense JSON weights) | 6,982/6,982 | 6,982/6,982 |
| **decision == Python** (sklearn float LR) | **6,977/6,982 (99.93%)** | **6,976/6,982 (99.91%)** |
| max \|Δ pShow\| vs Python | 0.016 | 0.017 |
| masked wrong-Do-It / missed, through the package | 0.06% (3) / 50.68% | 0.02% (1) / 54.82% |

- Both models clear the spec's ≥ 99.9% parity gate.
- The 5 and 6 Python differences are int8 quantization right at τ, the same 6 already reported for v2.1.
- The metrics reproduce the v2 and v2.1 reports exactly.

**Logging tests: 16/16 pass.**
- Gate: off by default (nothing computed, stored or counted), and every kill-switch layer works.
- Schema: 800 records are schema-valid.
- Enum guard: a fuzz puts 180+ real bodies and subjects into every leaf field, and none serializes; `features` and unknown keys are rejected.
- Privacy: no body 3-gram, subject, address or message id appears anywhere at rest, and records are encrypted.
- Retention: the ring buffer holds 5,000 records or 30 days.
- Consent off: purges the store and rotates `shadowId`.
- Timeout and tripwires: a timeout gives `candidate: null`; the p95, error-rate and sha256 tripwires each trigger a 7-day self-disable.
- Outcomes: the joiner merges receipt, undo and dismiss events, and rejects non-boolean values.
- Storage: the IndexedDB backend works (tested with fake-indexeddb).
- Sampling: the content-script pre-gate samples deterministically.
- MV3 static checks: no eval, no Function, no remote URL.

**Perf (Node 20, one thread, on a shared box with llama-server running, 2,000 mails), in ms:**

| stage | p50 | p95 |
|---|---|---|
| prepare (content script) | 1.09 | 3.13 |
| score v2 | 0.25 | 0.38 |
| score v2.1 | 0.28 | 0.42 |
| SW end to end (gate + HMAC + both models + guard + AES-GCM + store) | 1.28 | 2.09 |
| **per-mail total** | **2.4** | **5.2** |

The budget is 30 ms p95 and 100 ms hard. Weights parse in 2–5 ms per file. Sparse rows keep about 1.7 MB resident for both models.

**Size: 734,810 B shipped, under the 871,000 B budget** (136 KB headroom; 433 KB gzipped).
- Weights: 666,711 B.
- Code: 67,515 B, of which 34.8 KB is content-script code.

**Design choice that departs from the spec text.** The spec's record has a single `candidate`. v2.2 writes **one record per (message, model)**, both with the same `msgKey`, instead of adding a `candidate2` field. This keeps the schema exact, but the 5,000-record cap now covers about 2,500 messages.

### (2) Suggest-save (`suggest-save/`)

**Rule results:**
- **22/22 spec rows pass in JS and in Python** (24 cases, since rows 13 and 14 run on both surfaces).
- 31/31 extra edge cases pass.
- JS and Python outputs are byte-equal: 24/24 corpus cases, 31/31 edge cases, and 8,191/8,191 dataset rows.

**Reason codes.**
- Dima's eight are used verbatim: `suggest:other-card`, `already-saved`, `dismissed`, `bulk`, `no-consent`, `attachments-unread`, `negated`, `too-large`.
- The spec gives no code for some quiet cases, so these were added and **need confirming**: `suggest:not-inbound`, `suggest:no-files`, `suggest:onedrive-target-on-gmail`, `suggest:drive-target-on-outlook`, `suggest:other-target`.

**Choices to confirm:**
- **Negation is core `SAVE_NO` OR the v2 product-rule `NEG_SAVE`.** Core `SAVE_NO` alone let 26 refusals through on the dataset layer, e.g. "You don't need to save the attachment…" and "אל תעלי את המצורף ל-OneDrive". Under spec §5 a chip on those is a wrong suggestion.
- **Engine silences that hand the mail to another chain count as `other-card`.** These are `file`, `file-chain-not-run`, `google-wait(drive-lookup)` and `calendar-wait(file-lookup)`.
- **The n = 1 chip wording follows row 1 / §3** ("Save file to OneDrive?"). Row 21 says "Save invoice.pdf to Drive?", so the spec conflicts with itself here.

**Dataset target (`dataset/out-v22/suggest-save.jsonl`, 8,191 rows).** The rows are:
- all 5,167 v2 rows with attachments;
- 3,000 seeded rows without attachments;
- the 24 spec cases.

The dataset has only `attachmentCount`, so a seeded **attachment-meta layer is synthesized** on top of each row. It covers:
- files: real files (names follow body cues), inline `image001.png` with a cid when the body carries `[image…]`, non-inline Outlook logos, `.ics` on meeting scenarios, `smime.p7s`, `winmail.dat`, attached emails, reference attachments;
- headers: List-Unsubscribe on 85% of marketing;
- mailbox state: read failures, consent off, saved / dismissed state, upload-limit cases;
- sender-is-user.

Targets: `suggest-save` 2,186, SILENT 4,663, explicit card 1,318.

Gate checks:
- **0** chips on mails with no real file, out of 800 rows that have attachment parts but no real file;
- **0** chips on reference shows;
- **0** new explicit cards.

These rates come from synthetic metadata. They test the rule; they are not real-traffic rates.

### (3) Stripper (`strip/`)

**Format flips on the 25,848 synthetic v2 rows:**

| engine | raw flips | removed | left | new flips |
|---|---|---|---|---|
| **0.9.35** | **767** | **767 (100%)** | **0** | **0** |
| 0.9.34 | 774 | 774 | 0 | 0 |
| r35p | 754 | 754 | 0 | 0 |

The minimal normalizer alone leaves 482 of the 0.9.35 flips.

**Gold decisions don't move:**
- Running the stripper on the clean renders changes 0 decisions.
- gold22: 0 changes.
- Repo rows: 0 changes out of 3,757.
- Agreement with the reference label goes from 19,925 to 20,289 out of 22,457.
- Adversarial: 2 of 114 change, and both are fixes:
  - a CRLF / nbsp / mobile-footer ask gets its draft back;
  - an RLM-prefixed HE hedge loses its wrong Do-It.

**Python == JS byte-for-byte on 207,908 texts.** These are all v2 bodies, clean bodies and subjects, v2.1 test bodies, gold22, adversarial, and 38 stress strings.

## v2.2: what failed or is not done

- **Real-traffic numbers: none.** The shadow package has not run in Chrome. All tests run in Node, with fake-indexeddb standing in for IndexedDB and a vm-loaded core 0.9.35 standing in for the content-script globals. The first in-browser run will be Dima's.
- **The signed-config fetch, consent UI, local metrics page and tier B/C are out of scope.** The package reads `shadow.config` only when `verified: true`.
- **The memory tripwire is a hook only.** The MV3 SW has no `performance.memory`.
- **The suggest-save "1,015 gold utterances → 0 new explicit cards" gate is not run here.** Those utterances live in the extension test corpora. By construction the rule never creates an explicit card, and the dataset layer confirms 0.
- **The suggest-save attachment layer is synthetic.** Real List-Unsubscribe, inline-image and cid distributions need a metadata-only sample from real mail.

## Recommended next stage (v2.3)

1. **Dima integrates `shadow-pkg/` in the next release.**
   - Ship it with `shadow.config.enabled = false`.
   - Run the kill-switch drills from spec §11.6: remote off, tripwire, consent-off purge.
   - Turn it on for Sali's own install only. Stage 0 → 1 then needs only the privacy review of the §3 schema; the enum-guard tests are already here.
   - Amend the spec in one line: one record per (message, model).
2. **The owner labels batch-001 (items 1–8 first).** This decides masked versus STRICT and seeds the G2.2 owner queue. Without it, no promotion past stage 1 is possible.
3. **Engine fix from `strip/`.** Put `stripForEngine` in front of `FlowIncomingJudge.judge` on every surface. After that, `incumbent.normalizedFlip` should read about 0 in shadow, which is a live check that the fix works.
4. **Suggest-save in 0.9.38.**
   - Confirm the 5 added reason codes, the n = 1 wording, and SAVE_NO ∪ NEG_SAVE.
   - Dima drops `corpus-22.json` + `cases-extra.json` into the extension test corpus as the gate.
   - Then take a **metadata-only** real sample (types, sizes, inline/cid, List-Unsubscribe; no names or text) to replace the synthetic layer's rates.
5. **Model work only after real shadow data arrives.** Retrain on engine-with-stripper references, and decide between v2 and v2.1 as primary from owner labels, not from synthetic STRICT.

## How to run v2.2
```bash
./run-all-v22.sh                       # everything (~5 min)
./shadow-pkg/run-tests.sh              # package only: pack, parity, logging, perf, size
(cd suggest-save && node test-corpus.cjs && python3 test_corpus.py)   # 22 spec rows, JS + Python
(cd strip && node test-strip.cjs && python3 test_strip.py)            # 767 flips + byte equality
```

---

# (v2.1 section, unchanged)


> **v2.1 status (2026-10-08, offline/shadow only, nothing surfaces a Do It).** On the same v2 held-out test (n=6,190 masked, the minimal normalizer runs in front of every system), v2.1+veto vs v2+veto:
> - wrong-Do-It **0.02% (1)** vs 0.06% (3)
> - STRICT **1.29%** vs 1.43%
> - wrong action **26 (2.07% of closes)** vs 36 (2.87%)
> - but missed-close **54.8%** vs 50.7%
> - repo fixtures (bare sentences) missed **95.2%** vs 98.4%. That is **not** back to v1's 90.3%.
>
> It is a safer operating point, not a strict improvement. Labels are still rule-corrected engine output, and **none are owner-verified**.

## v2.1: what was built (writes only `*-v21` / `v21.*`; v1 and v2 outputs untouched)

| piece | path |
|---|---|
| short / bare phrasing pool: 313 new frames (EN 167, HE 146). One-line asks, imperative fragments ("Need the W-9 by EOD", "{obj} {date} pls", "תשלח את … עד מחר"), question fragments, bare reader families (the sender's own commitment, event and decision statements), and bare silent controls (acks, FYI, negations, paid/cancelled) | `dataset/v21/templates-v21.cjs` |
| bare and subject-only shapes. No greeting or signature; dropped final period; lowercase start; "thx" tails. Subject empty 55% of the time (repo rows always have an empty subject). Subject-only = the ask sits in the subject line and the body is "" / "Thanks" / "ראה נושא". Mix: 30% bare / 3% subject-only on v1/v2 frames, 60% / 6% on v21 frames | `dataset/v21/shapes-v21.cjs` |
| dataset builder → `dataset/out-v21/`. Phrasing-disjoint guard: a v21 frame whose skeleton (lowercased, fillers removed) equals or is contained in an existing frame inherits that frame's split, and the most held-out split wins (38 exact, 62 contained, 19 same-skeleton). Unsure masking is extended to Gmail Drive saves with one attachment, Gmail calendar holds and the bare reader families | `dataset/v21/build-dataset-v21.cjs` |
| adversarial-v21 = v2's 74 + 40 bare probes (16 positive non-file asks, 21 short traps, 3 AMBIGUOUS) | `dataset/v21/adversarial-v21.cjs` |
| featurizer v2.1 = v2 features + shape features (subject empty, greeting line, line count, bare flag, ends-with-?) + **delexicalized backoff n-grams** ("could you sign the X before the X ?") + leading-token × fact interactions | `train/featurize-v21.cjs`, `runtime/pipeline-v21.cjs`, `train/export-features-v21.cjs` |
| trainer, four changes: **(a)** repo rows ×3 sample weight (in-domain bare sentences); **(b)** τ per `label@shape` (shape = bare\|mail, deterministic); **(c)** a **STRICT budget at calibration**, where unsure rows are scored out-of-fold by the fold holding out their frame and τ must keep OOF masked ≤ 0.29% **and** OOF strict ≤ 1.8%; **(d)** a **chooser confidence floor**, where the card is suppressed when chooser p(label) < 0.70, chosen on OOF with a wrong action costing 3 correct closes | `train/train-v21.py` |
| minimal normalizer (CRLF→LF, nbsp→space, zero-width and bidi removed) in front of engines and models | `runtime/normalize-v21.cjs` |
| JS runtime + parity: **6,976/6,982** identical decisions (the 6 that differ are at threshold, max Δp 0.017) | `runtime/glance-model-v21.cjs`, `runtime/glance-close-v21.cjs`, `runtime/parity-check-v21.cjs` |
| packed on-device weights: **364 KB** lossless (220 KB gz) vs the 871 KB budget; the JSON form is 1.62 MB | `runtime/pack-weights-v21.cjs` → `artifacts/v21.p0.glw` (p1 = 243 KB, 6/6,982 decisions change) |
| harness | `shadow/run-shadow-v21.cjs` → `shadow/out-v21/report.md` / `report.json` / `test-preds.jsonl` |
| format-flip count | `shadow/norm-flips-v21.cjs` → `shadow/out-v21/norm-flips.json` |
| shadow logging spec v2 (Glance cloud + extension) | `shadow-logging-spec-v2.md` |
| one-shot | `./run-all-v21.sh` (~8–9 min, 2 threads; refuses to train with < 1.5 GB available) |

**Dataset:** 37,987 rows.
- Synthetic: 34,240.
- Repo: 3,747.
- Splits: train 24,381, val 4,680, test 8,926.
- Unsure: 5,449.

**Leak check:** no v2-test frame lands in v2.1 train or val. Exact clean-body overlap with the v2 test is 27 rows (2 of them shows), the same level as v2's own 30 (3).

## v2.1 results: v2 held-out test (same rows and labels as the v2 report, masked n=6,190; minimal normalizer in front of every system)

| system | wrong-Do-It | STRICT | missed | HE missed | EN missed | wrong action (% of closes) | wrong step |
|---|---|---|---|---|---|---|---|
| engine 0.9.35 raw | 10.33% (510) | 9.43% | 7.7% | 3.5% | 10.2% | 19 (1.51%) | 13 |
| engine 0.9.35 + norm | 10.33% (510) | 9.43% | 4.8% | 2.7% | 6.1% | 17 (1.35%) | 14 |
| engine r35p + norm | 9.24% (456) | 8.49% | 4.8% | 2.7% | 6.1% | 17 | 14 |
| v1 + veto | 1.20% (59) | 1.22% | 83.9% | 90.5% | 79.8% | 29 (2.31%) | 12 |
| v2 + veto | 0.06% (3) | 1.43% | **50.7%** | **47.1%** | **52.9%** | 36 (2.87%) | 3 |
| **v2.1 + veto** | **0.02% (1)** | **1.29%** | 54.8% | 52.1% | 56.5% | **26 (2.07%)** | **2** |
| v2.1 + veto, no floor | 0.08% (4) | 1.36% | 53.0% | 50.2% | 54.7% | 33 (2.63%) | 2 |
| v2.1 model alone | 11.19% | 11.07% | 51.0% | | | 26 | 2 |

How to read the engine rows:
- The reference is engine 0.9.35 + rules, so engine missed-close is low by construction.
- "+ norm" lowers engine missed-close (7.7% → 4.8%) because it removes the format flips.

**Missed-close per source** (v1 / v2 / v2.1):

| source | v1 | v2 | v2.1 |
|---|---|---|---|
| repo fixtures (bare sentences, 62 closes) | 90.3% | 98.4% | **95.2%** |
| repo test strings | 65.8% | 80.2% | 78.4% |
| synthetic v1 frames | 85.5% | **42.0%** | 51.0% |
| synthetic v2 frames | 85.3% | **46.7%** | 49.6% |

**New-shape slice** (3,300 rows from held-out frames: bare / subject-only renders and v21 frames; v2.1 dataset labels):

| system | wrong-Do-It | STRICT | missed |
|---|---|---|---|
| v1 | 2.16% | 2.70% | 76.4% |
| **v2** | **0.33%** | **2.19%** | **59.4%** |
| v2.1 | 0.41% | 2.79% | 61.9% |

v2 already generalised to bare renders better than expected. The 11 v2.1 wrong-Do-Its are listed in the report:
- 4 "Calling off …'s meeting" → event;
- 5 HE "להעלות/לשמר את המצורף בדרייב/OneDrive" → save, where the reference silence is itself doubtful;
- "paid $500 by Nov 2" → task;
- a typo'd HE NDA ask.

Subject-only asks are silent for every system: the engine's `too-short` is a base veto.

**Adversarial** (spec labels, correct / wrong-Do-It):

| system | v1 + v2 set (72) | new bare set (37) |
|---|---|---|
| engine 0.9.35 raw | 53 / 15 | 24 / 4 |
| v1 + veto | 54 / 3 | 25 / 1 |
| v2 + veto | 67 / 0 | 27 / 0 |
| **v2.1 + veto** | **68 / 0** | 27 / 0 (no-floor: 28 / 0) |

**OSS eval** (wrong-Do-It, missed):
- v2: 0/167, 59.3%
- v2.1: 0/167, 59.3% (HE 66%)
- v2.1 without the floor: 0/167, 51.9%

### Ablations (Python, same v2 test, masked wrong-Do-It / STRICT / missed / wrong action / repo-fixture missed)

| variant | wDI | STRICT | missed | WA | repo fx |
|---|---|---|---|---|---|
| v2 | 0.06 | 1.43 | 50.7 | 36 | 98.4 |
| + bare shapes only (v2 calibration: masked budget only) | 0.08 | **2.51** | 49.7 | 28 | 98.4 |
| + STRICT budget 1.2% OOF | 0.02 | 0.82 | 60.5 | 19 | 96.8 |
| + repo ×3 | 0.04 | 0.94 | 60.8 | 11 | 98.4 |
| + shape τ, STRICT 1.43% OOF | 0.02 | 1.03 | 59.1 | 17 | 96.8 |
| STRICT 1.8% OOF | 0.02 | 1.31 | 56.7 | 16 | 96.8 |
| **+ delex features = v2.1** | **0.02** | **1.31** | **54.7** | 25 | **95.2** |
| v2.1 with STRICT 2.2% OOF | 0.02 | 1.61 | 49.9 | 30 | 93.5 |
| v2.1 with no STRICT budget | 0.08 | 1.87 | 50.5 | 20 | 91.9 |

## v2.1: what helped / what didn't

**Helped:**
- **Delexicalized backoff features.** They were the only change that moved recall on bare and repo sentences without spending safety: missed 56.7 → 54.7, repo fixtures 96.8 → 95.2, repo test strings 82.0 → 78.4, at the same STRICT.
- **The chooser floor.** It cut wrong action from 33 to 26. Of the 26, 24 stay in the same step: 22 are dated-commitment → commitment and 2 are calendar-hold → event. It also cut masked wrong-Do-It from 4 to 1, at a cost of 1.8 pts of recall.
- **STRICT-aware calibration.** It removed v2's blind spot. Bare shapes alone pushed STRICT to 2.5%, because the bare-ask region is exactly where the engine says `intent-null` (unsure rows).
- **Shape-specific τ and repo ×3:** small gains.

**Didn't help, or not done:**
- **Repo-fixture recall is in direct tension with STRICT.**
  - Only by dropping the STRICT budget (1.87%) do repo fixtures reach 91.9%, still 1 row short of v1's 90.3%.
  - Of the 62 fixture closes, many are reader families that are not asks, such as "The contract was countersigned on the 3rd and filed." (decision) and "Yes, Thursday at 3 works for me." (dated-commitment). The gate gives these p < 0.5 at any setting.
  - The owner's answer on batch-001 items 1–8 (are engine-silent bare asks real closes?) decides which side to trade.
- **Overall recall at equal STRICT is about v2's level, not better.** Interpolating the ablation sweep gives about 52–53% missed at 1.43% STRICT, vs v2's 50.7%.
- **Subject-only asks:** recall 0 by design, because the engine's `too-short` is a base veto.
- **Most "wrong actions" are not wrong steps.** Of the 26:
  - 22 are dated-commitment → commitment, a phrasing-idiosyncratic split of the engine, with the same `task` step;
  - 2 are calendar-hold → event (same step);
  - 2 are draft → file_save, the only wrong *step* (2/1,255).
- **e5-small gate features: skipped.** `free -g` showed about 2 GB available at both checks (the threshold is ≥ 4 GB). The other worker was running llama-server (Qwen3.5-4B) plus a LoRA dry-run. The model files exist under `../oss-models/models/e5-small/` (int8 ONNX + tokenizer) and were not re-downloaded.

## Normalization (step 2): format flips

`shadow/norm-flips-v21.cjs` covers the 25,848 non-typo synthetic v2 rows, with 767 tagged formatSensitive for engine 0.9.35. Results:

| normalizer in front of engine 0.9.35 | flips left | of the 767, removed | new flips |
|---|---|---|---|
| none (v2 tag) | 767 | 0 | 0 |
| **minimal**: CRLF, nbsp, zero-width, bidi | **482** | **288 (37.5%)** | 3 |
| + whitespace collapse (`cleanText`) | 482 | 288 | 3 |
| + boilerplate strip (`stripBoilerplate`: signature, disclaimer, `[image]`, mobile footer) = v2 model path | 0 | 767 | 0 |

**The 482 that survive the minimal normalizer** all carry boilerplate:
- mobile footer alone: 174
- signature + mobile: 93
- signature + disclaimer + `[image]`: 96
- other combinations of signature / disclaimer / mobile / `[image]`: 119

The 3 new flips are HTML-shaped mails with a disclaimer. There the engine flips to `quiet:family` once nbsp becomes a space.

Engines 0.9.34 and r35p behave the same: 297/774 and 275/754 removed, with 3 new flips each.

**Engine-core fix to propose separately:** normalize, then strip footers and disclaimers before judging.

## How to run v2.1
```bash
./run-all-v21.sh                       # full pipeline (~8-9 min)
node shadow/run-shadow-v21.cjs         # re-score only (~1 min)
node runtime/pack-weights-v21.cjs v21 1   # packed weights with |q|<=1 pruned + parity
```

---

# (v2 section, unchanged)

> **v2 status (2026-10-07, offline/shadow only, nothing surfaces a Do It).** On the held-out test (unseen phrasing), v2+veto has
> **wrong-Do-It 0.06% (3/4,935)**, missed-close **50.7%** (HE **47.1%**). v1+veto on the same test: 1.20% / 83.9% / HE 90.5%.
> Adversarial: 67/72 correct, 0 wrong-Do-It. OSS-worker eval: 0/167 wrong-Do-It. Caveat: those figures leave out
> 3,655 *unsure* rows. Counted strictly (every engine silence treated as true), v2 wrong-Do-It is **1.43%**. Owner labels
> (batch-001) decide which number is the real one. All labels are rule-corrected engine output; **none are owner-verified**.

## v2: what was built (v1 files untouched; v2 outputs are versioned `*-v2` / `v2.*`)

| piece | path |
|---|---|
| multi-engine loader (0.9.34 / 0.9.35 / r35p side by side) | `teacher/engine.cjs` |
| phrasing pool: 632 new frames (HE 423, EN 209) via small cross products; HE written in both genders and plural, mixed HE/EN, abbreviations | `dataset/v2/templates-v2.cjs` |
| live-shaped rendering: greeting on its own line, blank lines, sign-offs, signature blocks, HTML-derived nbsp, `[image: logo]`, disclaimers, `\r\n`, RLM, "Sent from my iPhone", subject prefixes. Typo twins at ~8% | `dataset/v2/shapes.cjs` |
| addressee detector (`ownNames` → voc own/other/group/none; recipient role to/cc-only) | `runtime/addressee.cjs` |
| product rules (shared by the label overrides and the runtime veto) | `runtime/product-rules.cjs` (`dataset/v2/overrides.cjs` re-exports it) |
| dataset builder → `dataset/out-v2/` | `dataset/v2/build-dataset-v2.cjs` |
| adversarial-v2 (74) and OSS eval conversion (275, read-only input) | `dataset/v2/adversarial-v2.cjs` |
| body normalizer (nbsp / RLM / zero-width / CRLF, signature, disclaimer and mobile-footer strip) | `runtime/normalize.cjs` |
| featurizer v2 (2^17 hashed: v1 features plus char 3–5-grams, leading-token mood, addressee, subject-prefix) | `train/featurize-v2.cjs` |
| shared prep (normalize → engine 0.9.35 → features + veto inputs) | `runtime/pipeline-v2.cjs` |
| training: (A) gate = binary LR, (B) chooser = multinomial LR; grouped 5-fold OOF calibration with per-label τ | `train/train-v2.py` |
| veto v2 (base = engine 0.9.35 rule silences on the normalized body; product rules; cap) | `runtime/veto-v2.cjs` |
| JS runtime + parity | `runtime/glance-model-v2.cjs`, `runtime/glance-close-v2.cjs`, `runtime/parity-check-v2.cjs` |
| shadow v2 | `shadow/run-shadow-v2.cjs` → `shadow/out-v2/report.md` / `report.json` / `test-preds.jsonl` |
| owner-label batch #1 (19 items, Hebrew UI-friendly; **not sent**, to be routed to Sali via דוד) | `../labeling/batch-001.md` (+ `.json` with an `ownerAnswer` slot; generator `make-batch-001.cjs`) |
| one-shot | `./run-all-v2.sh` (about 6 min; 2 BLAS threads; heavy steps run one after another) |

Artifacts:
- `artifacts/v2.gate.weights.json` (401 KB int8) and `v2.chooser.weights.json` (962 KB) for the JS runtime.
- `v2.gate.onnx` (1.3 MB) and `v2.chooser.onnx` (5.2 MB). ONNX vs sklearn max |Δp| ≈ 1e-6.
- JS int8 vs python: 6,977/6,982 identical decisions. The 5 that differ sit right at the threshold.
- `v2.report.json` holds the τ sweeps.

## v2 dataset (`dataset/out-v2/`; v1's `dataset/out/` is untouched because the OSS worker reads it)

**31,618 rows:**
- **Synthetic: 27,861**
  - from v1 frames: 11,866
  - from v2 frames: 15,995
  - includes 2,013 typo twins
- **Repo: 3,757**
  - fixtures: 1,986
  - test strings: 1,771

By language: EN 15,397 and HE 16,221. Splits: train 20,966, val 3,670, test 6,982.

**Frames:** 972 = 340 v1 + 632 new (25 duplicates dropped). That is 2.9× overall, and Hebrew went 149 → 572 (3.8×).

**Splits stay phrasing-disjoint.** v1 frames keep v1's templateIds, so they keep v1's split. New frames use the same bucket function on new ids. Repo rows keep their v1 split. This means v1 is never scored on its own training phrasing.

**Reference label.** Engine 0.9.35 runs on the clean render, then the product-correct overrides are applied. Every override is tagged `ruleCorrected` and `ownerVerified:false`. Counts:
- addressed-to-other 1,107
- cc-only 449
- no-action-fyi (HE+EN) 193
- gmail-onedrive-target 168
- outlook-onedrive-save 116 (the engine was silent or only offered a reply draft)
- negated-save 47
- conditional 47
- marketing 35
- negated-ask 23

Positive `נדרשת פעולה:` asks are left untouched. `'Hi Sali,'` / `'סאלי,'` / no-name asks still show; a named colleague in the greeting, or the user only on Cc and not named, means silence.

**Typo twins** inherit the clean row's label. **formatSensitive: 767 rows**: the engine's decision flips between the clean and the live render (nbsp, RLM, iPhone footer). Example: RLM + "אולי כדאי לשמור את המצורף בדרייב" → the engine shows a Drive save. This is an engine-robustness bug worth fixing in the core: normalize the text before judging.

**Unsure rows (3,655: HE 2,757, EN 898).** The engine said `intent-null` (not a rule silence) on an ask-shaped frame addressed to the user, and no product rule fired. Hebrew sure-shows number 2,652, so these unsure rows are about as many. That gap is the engine's Hebrew recall problem. Handling:
- The label stays SILENT (strict).
- They are not used to train the gate.
- Metrics are reported both **masked** (excluded) and **STRICT**.

## v2 results: held-out test (n=6,190 masked; engines run on the live body as production would)

| system | wrong-Do-It | missed-close | HE missed | EN missed | wrong action (of shows) | STRICT wrong-Do-It |
|---|---|---|---|---|---|---|
| engine 0.9.34 | 9.71% (479) | 9.5% | 3.5% | 13.2% | 19 | 8.89% |
| engine 0.9.35 | 10.33% (510) | 7.7% | 3.5% | 10.2% | 19 | 9.43% |
| engine r35p | 9.34% (461) | 7.7% | 3.5% | 10.2% | 19 | 8.57% |
| v1 + full veto | 1.20% (59) | 83.9% | 90.5% | 79.8% | 29 | 1.22% |
| v2 model alone | 11.31% | 46.9% | 42.5% | 49.7% | 37 | 11.24% |
| **v2 + veto** | **0.06% (3)** | **50.7%** | **47.1%** | **52.9%** | 36 (2.9%) | 1.43% (79 shows on unsure rows) |

How to read the table:
- The reference *is* engine 0.9.35 plus rules, so engine missed-close is low by construction.
- The engines' ~10% wrong-Do-It is almost entirely the confirmed bugs, measured per rule:
  - addressed-to-other: 94% shown
  - cc-only: 90%
  - Gmail-OneDrive: 91% on 0.9.35
  - HE no-action FYI: 91% on 0.9.35, 0% on r35p
  - marketing: 94%
  - negated save: 100%
  - format-sensitive rows: 66%
- v2+veto has 0 wrong-Do-Its on every one of those rule slices, and 0 on typo and format-sensitive rows.

**Per source (missed):**

| source | v2 missed | v1 missed |
|---|---|---|
| synthetic v1-frames | 42.0% | 85.5% |
| synthetic v2-frames | 46.7% | 85.3% |
| repo fixtures | 98.4% | 90.3% |
| repo test strings | 80.2% | 65.8% |

The repo rows got worse; see below.

**HE follow-up asks missed:** 30.5% for v2 vs 89.3% for v1.

**Adversarial-v2 (spec labels, 72 scored):**

| system | correct | wrong-Do-It |
|---|---|---|
| **v2+veto** | **67/72** | **0** (v1 set 38/40, v2 set 29/32) |
| v1+veto | 54 | 3 |
| engine 0.9.35 | 53 | 15 |
| r35p | 55 | 13 |

v2's 5 misses:
- 2 Drive/OneDrive saves where p sat below the save τ of 0.965
- the Outlook HE OneDrive save
- an HE meeting
- "Can you confirm **whether**…", which the engine's hedge rule vetoes

**OSS-worker eval (275, external phrasing, binary):**

| system | wrong-Do-It | missed | HE missed |
|---|---|---|---|
| **v2+veto** | **0/167** | 59% | 64% |
| v1+veto | 4/167 | 72% | 82% |
| engine 0.9.35 | 15/167 | 21% | 36% |

All wrong-Do-Its are listed in `shadow/out-v2/report.md`. The 3 held-out ones for v2:
- "Confirming the fee is about $4,200." → task
- "As a reminder, you agreed to send the invoice by Friday, September 18." (a past date) → task
- "בבקשה לצרף את טופס 101 לזימון של הדמו…" → calendar hold

**Gate check:**
- **Met** on the masked definition: 0.06% ≤ 0.29%. Missed-close fell from 83.9% to 50.7% (HE 90.5% → 47.1%) on the same test.
- **Not met** on the strict definition: 1.43%, all of it shows on engine-recall-gap rows. Batch-001 items 1–8 are exactly this question.

## v2: what helped / what didn't

**Helped:**
1. Training the gate only on rows the hard veto does *not* already silence. Otherwise "Hi Dana, could you…" teaches it that ask text means silence.
2. Pulling engine-recall-gap rows out of gate training (unsure masking).
3. Grouped 5-fold OOF calibration over train+val. The val set alone holds about 120 frames, so its 0.29% point swung on 2–3 frames.
4. Per-label τ. Missed-close went 61.8% → 50.7% at ≤ OOF budget. The draft τ is 0.97; confirmed-amount is 0.745.
5. Normalize-before-engine in the v2 path. It removes all format flips.
6. Addressee features plus the shared detector.
7. 3.8× the Hebrew frames.

**Didn't help, or not done:**
- C sweeps (C=4/16/64: ±3 pts).
- Model-alone is unsafe (11% wrong-Do-It). The veto is load-bearing.
- Repo fixture recall dropped against v1: 98% missed vs 90%. The pool is now mostly live-shaped mail, and the repo rows are bare sentences.
- The **e5-small encoder gate was not run.** The box had 1.7–2.5 GB available while the OSS worker ran Qwen3.5-4B. Its own result for frozen e5+LR was weak (18.6% wrong-Do-It at t=0.5). The hook is ready: `train-v2.py --extra <npz>`, with embeddings via `oss-models/eval/encoder_gate.py`.
- The OSS worker's `REPORT.md` has not appeared yet (only `report-parts/shortlist.md`), so there is no recommendation to plug in.
- An adversarial-labeling fix of my own: the v2 addressing, format and typo probes first used "send me <file>" asks. Those belong to the file chain, which this harness does not run. They were rewritten as non-file asks; the file ask is kept as AMBIGUOUS.

## v2 next steps
1. **Run batch-001 with Sali (via דוד).** Answers go into `batch-001.json` → `ownerAnswer`. Then:
   - flip resolved unsure frames to owner-verified labels
   - retrain
   - report the strict metric on owner-verified rows only
2. **Engine fixes surfaced by v2** (repo work for the core owner, not done here):
   - normalize nbsp / RLM / CRLF / footers before judging (767 format flips, including a hedge → Drive save)
   - HE OneDrive save on Outlook
   - the addressee / Cc rule
   - HE no-action FYI is already fixed in r35p
3. **Model:**
   - add bare-sentence repo shapes back to recover repo recall
   - try e5-small gate features once the OSS worker is done and RAM is free
   - per-family chooser confidence for the 2.9% wrong-action
   - shadow-log real traffic with `shadow-logging-spec.md`

---

# v1 (unchanged below)

# Glance in-house close model: v1 baseline (M2 start)

> Built 2026-10-07 on the box, all offline. No repo edits, no PRs, no cloud agents, nothing sent. Plan: `../ai-engine-plan.md`.
> **Status: shadow-only baseline.** Nothing here surfaces a Do It. Owner-verified labels used: **0**.

## What exists

| Piece | Path | What it does |
|---|---|---|
| Teacher | `teacher/teacher.cjs` | The 0.9.34 deterministic engine (read-only from `${GLANCE_ENGINE_ROOT:-<repo>/flow-trial-extension}`), loaded in a node vm realm. Host order is copied from `content-gmail.js` / `content-outlook.js`: own mail → silent; Outlook calendar probe; `needsOneAttachment` attachment count; `FlowIncomingJudge.judge`. Output: show/silence, reason, intent type, family, steps, primary step, label `family\|step`. Also exports `preprocess()`: own text with quoted history cut, plus extractor facts. Both are deterministic. |
| Dataset builder | `dataset/build-dataset.cjs`, `templates*.cjs` | EN+HE, Gmail+Outlook shapes (subject, body, from/to, direction, attachmentCount). Covers 25 scenario families. Every row gets a teacher label. Rows are deduped. Split is grouped by template, so val and test use phrasings the model never saw. |
| Adversarial set | `dataset/adversarial.cjs` | 41 known-bug and trap cases with **spec** labels (written by me from the product rules; not owner-verified). Never trained on. |
| Featurizer | `train/featurize.cjs` | Canonical pure-JS hashed features (2^16 dims): words, bigrams, trigrams, negation-scoped tokens, Hebrew prefix-stripped forms, char 3–4-grams, subject, surface/direction/attachments, date/clock/money facts. The same file runs in training and inference. |
| Trainer | `train/train.py` | Multinomial logistic regression (sklearn). Tunes the show-threshold τ on grouped val (val wrong-Do-It ≤0.3%). Exports int8 sparse JSON and ONNX, with a parity check. `train/experiment.py` compares LR against an MLP. |
| Runtime | `runtime/glance-model.cjs`, `runtime/veto.cjs`, `runtime/glance-close.cjs` | JS inference with no deps. The model can only answer `SILENT` or **one** `family\|step`. Hard veto wraps it (see below). `runtime/parity-check.cjs` compares the JS int8 runtime against ONNX. |
| Shadow harness | `shadow/run-shadow.cjs` → `shadow/out/report.md`, `report.json`, `*.test-preds.jsonl` | Teacher vs model on held-out, gold22 and adversarial: agreement, **wrong-Do-It**, missed-close, wrong action, breakdowns by source/lang/family/teacher label, τ sweep, and every wrong-Do-It row listed for the owner to adjudicate. |
| Logging spec | `shadow-logging-spec.md` | Real-traffic shadow logging for the extension, behind opt-in consent (for Dima). |

**Hard-veto layer** (`runtime/veto.cjs`). A veto can only remove a card, never add one.
- **base**: the engine's rule silences. That covers own mail / note-to-self, `quiet:noise|hedge|google|family`, third-party, file / file-chain-not-run, fact-reply-block, no-draft-close, Drive/calendar waits, and too-short. `intent-null` and `chip-low-confidence` are *not* vetoes. That is the only region where the model has its own opinion.
- **cap**: surface capability. A save needs exactly one attachment. Outlook has no bare calendar writer. A file ask that `FlowFileAttach.gate` recognizes belongs to the file chain, not a plain draft.
- **v2** (PROPOSED, not in 0.9.34): negation on an action verb (EN+HE), marketing cues, payment injection, "nothing decided", quoted-only forwards.

## How to run
```bash
cd glance-ai/model
./run-all.sh                   # dataset → adversarial → features → train v1,v1c → ONNX parity → shadow report (~4 min)
node shadow/run-shadow.cjs v1  # re-score only
node teacher/probe.cjs         # eyeball the teacher on a few cases
```
The Python venv is at `.venv` (sklearn 1.9, skl2onnx, onnxruntime; 383 MB).

## Dataset (`dataset/out/`)
| | rows | teacher shows | HE |
|---|---|---|---|
| train | 11,114 | 2,913 | 4,708 |
| val (unseen templates) | 2,132 | 473 | 794 |
| test (unseen templates) | 4,111 | 969 | 1,594 |
| **total** | **17,357** | | |

By provenance: **synthetic 13,600** · **repo fixtures 1,986** (intent-gold/blind/teacher-eval/chat/reply sentences, each wrapped as a Gmail and an Outlook inbound) · **repo test strings 1,771** (natural-language literals pulled from the tip's `test/*-corpus.cjs`) · **owner-verified 0**. gold22 (`gold22.jsonl`) is the 22 model-labeled real-mail rows, mapped to M0 binary and kept for eval only. Every row carries `provenance` and `ownerVerified:false`.
Teacher labels: SILENT 13,002 · follow-up-ask\|draft 2,149 · event\|calendar 691 · confirmed-amount\|task 469 · drive-file\|file_save 315 · commitment\|task 254 · calendar-hold\|calendar 213 · dated-commitment\|task 196 · decision\|task 58 · calendar-cancel\|calendar 10.

## Model
**v1** is a multinomial logistic regression over 65,536 hashed features × 10 classes, about 655k parameters. On disk:
- `artifacts/v1.weights.json`: **871 KB** int8 sparse, about 101k non-zero weights.
- `artifacts/v1.onnx`: **2.9 MB** float32.

ONNX matches sklearn to 2e-6. The JS int8 runtime matches ONNX on 400/400 argmax (max Δp 0.037). Training takes about 30 s on CPU.
**v1c** is the same model trained on teacher labels plus 2 spec corrections on training rows only: negated saves → SILENT, and an Outlook OneDrive save with exactly one attachment → file_save.

## Results: held-out test, n=4,111, unseen templates (`shadow/out/report.md`)
| mode | agree w/ teacher | **wrong-Do-It** (shows where teacher silent) | missed-close | wrong action (both show) |
|---|---|---|---|---|
| teacher + proposed v2 rules | 99.27% | 0.00% | 3.10% (all 30 are negation/marketing silences, i.e. bug fixes) | 0% |
| v1 model alone (τ 0.95) | 82.90% | 0.70% (22/3142) | 65.2% | 3.6% |
| **v1 + hard veto (base+cap+v2)** | **82.70%** | **0.29% (9/3142)** | **67.4%** | 3.8% |
| v1c + hard veto (τ 0.96) | 79.88% | 0.83% (26; 22 of them are the intended OneDrive saves) | 79.5% | 7.5% |

v1 + veto broken down:
- **By source:** repo fixtures 90.6% agree / 0.17% wrong-Do-It; repo test strings 84.3% / 0.76%; synthetic 80.7% / 0.23%.
- **By language:** EN 0.44% wrong-Do-It / 59% missed; **HE 0.08% / 88% missed**.
- **τ sweep** (wrong-Do-It / missed-close): 0.5 → 2.3% / 41% · 0.8 → 1.0% / 55% · 0.9 → 0.45% / 63% · 0.95 → 0.29% / 67%.

All 9 remaining wrong-Do-Its are cases where the teacher returned `intent-null` on what read as real asks. Examples: "We still need the lease from you by Oct 15", "Can you countersign the lease and send it back?", and one HE ask ("I need the laptop's serial number, can you find it and send it?"). There is also 1 genuine model error: "Suppose we approved the $40,000…" → task. Most of these are file asks that should go to the file chain rather than a plain draft. They are listed in the report for owner adjudication.

**gold22** (model-labeled, NOT owner-verified; M0 binary; 2 ASK / 20 SILENT). As-direction view: teacher and v1 both get Do It precision 100%, silence recall 100%, ASK recall 1/2, wrong-Do-It 0/20. Text-only view: teacher 1/20 wrong-Do-It, v1 0/20. The teacher's one miss is rm-018, an artifact: it is the owner's own sent ask viewed as if inbound. n=22 proves nothing.

## Adversarial (40 scored + 1 ambiguous; spec labels)
| | correct | failures |
|---|---|---|
| **teacher (0.9.34)** | 26/40 | 6/6 negated Drive saves → **save card** (EN "Please don't save the attachment to Drive", "Do not…", "No need to…", HE "אל תשמור…", "אין צורך לשמור…"); 6/6 OneDrive saves → silent or plain reply draft; HE webinar marketing → calendar event; "If we approve the $40,000… nothing decided" → confirmed-amount task |
| teacher + v2 | 34/40 | the 6 OneDrive saves (a rule fix belongs in the engine, not a veto) |
| v1 alone | 29/40 | inherits 3 negation bugs (p≈0.99) plus the OneDrive saves |
| **v1 + veto** | 34/40 | the 6 OneDrive saves only; negation forced silent by the v2 veto |
| v1c + veto | 35/40 | learned negation itself (all 6 p≤0.03) and HE/upload OneDrive; 4 OneDrive saves scored p 0.76–0.95, just under τ 0.96; plain Drive save p 0.51 |

8 of the 41 adversarial bodies also appear verbatim inside training templates. Those wins are partly memorization.

**More teacher bugs at scale** (synthetic, spec judgment, needs owner confirmation):
- Asks addressed to a named colleague ("Noa, please send the W-9 to the client…") show a card in 107/160 EN and 111/200 HE.
- HE "מצורף X לתיעוד, לא נדרשת פעולה" ("X attached for the record, no action needed") → reply draft in 69/280.
- Cancelled meetings → event in some of 19.
- "The interview was on Monday at 11:15" → event in 5/360.

v1 copies these wherever no veto covers them.

## Honest limits
- **Synthetic ≠ real.** 13.6k rows come from 340 hand-written templates. Accuracy on unseen phrasing is about 85% at argmax vs about 97% on seen templates. The model memorizes phrasing faster than it learns the teacher's logic. An MLP was no better (`train/experiment.py`).
- **Recall is poor.** At the safe operating point the model recovers only about a third of teacher closes, and almost none in Hebrew (the HE template pool is small). Today it is a *conservative second opinion*, not a replacement. The engine plus the v2 rules is currently the stronger judge.
- **Labels are the teacher's, bugs included.** "Agreement" means agreeing with 0.9.34, not with Sali. Wrong-Do-It here means *vs the teacher*. The true wrong-Do-It can only be measured on owner gold.
- Host-runtime steps are labeled silent with an explicit reason, because they need runtime: Drive lookup, the Graph file chain (`file-chain-not-run`), calendar file waits. Calendar `fetchedBack` and Handled are untouched. The model only picks *what*; the existing chain proves the close.
- The v2 rules are proposals. They fix the negation bug and cost 0 real teacher closes on test, but they need the owner's OK and should be implemented in the engine itself.
- Stage-4 replacement is **not** close. It needs ≥200 owner labels, a gate on that gold, and a shadow week.

## Next 3 concrete steps
1. **Real-traffic shadow logging** (Dima, behind the new opt-in `consent.shadow`, off by default; spec in `shadow-logging-spec.md`). Hashed features plus incumbent/candidate decisions only, no text. Server-first ONNX scoring, with disagreements queued for labeling.
2. **Owner label session** (~20/day into `../labeling/owner-gold.jsonl`). Start with the 9 wrong-Do-It rows, the adversarial set, and the colleague-addressed and HE-FYI teacher shows. Each decision fixes either the teacher or the model target. Re-run `shadow/run-shadow.cjs` against owner gold as soon as n≥50.
3. **Distill v2:**
   - Retrain on teacher + owner-corrected labels plus real shadow features.
   - Triple the HE/EN phrasing pool (or paraphrase from the M1 router with consent).
   - Split the head into show/silence and action.
   - Try a small multilingual encoder (MiniLM-class, ONNX int8) once there is real data. Box RAM was about 0.7 GB free today, so it was not attempted.
   - Engine-side fixes to propose separately: negation guard, OneDrive save on Outlook, colleague-vocative silence.
