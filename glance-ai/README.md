# Glance model lab

Glance closes open loops. Gmail is where it starts today.

## Product definition

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. Gmail is the current primary entry surface. Execution goes through the places a close really happens. Glance stays silent when it is uncertain, never sends on your behalf, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate. This folder is Glance only.

## Implementation status

This directory is the offline model lab. Nothing in it is wired into the extension in this commit, and nothing here surfaces a Do It. Glance never sends. The engine-under-test is the in-repo extension tip at `flow-trial-extension/` (its `core/*.js`). The harness loads that core in a `vm` sandbox. It does not change the extension.

Large generated data was left out on purpose and is reproducible from the generators: full training splits, feature matrices, ONNX, LLM weights, GGUF, and the SFT train split. The small eval set is in `eval-data/`.

## Layout

| path | what it is |
|---|---|
| `model/` | Dataset generators, teacher loader, v2 / v2.1 training and eval, runtime, shadow harness, shadow package, suggest-save, stripper |
| `oss/` | OSS LLM eval, veto, cached shadow-combined predictions, parked GPU fine-tune scripts |
| `specs/` | suggest-save and related specs |
| `eval-data/` | v2 held-out test, suggest-save v22, shadow-combined cases, SFT v2 val |
| `labeling/` | Owner-gold schema, batch-001, answer ingest, strict scorer, CPU retrain dry-run. `owner-gold.jsonl` stays empty until the owner answers |
| `paths.cjs`, `paths.py` | Repo-relative locations. No machine-specific absolute paths |

## Which engine

`tip` is `flow-trial-extension` in this repository. The manifest version is registered as the same directory. Older unpacked trees are not assumed to exist.

```sh
# default: this repo's extension tip
node glance-ai/model/teacher/engine.cjs

# one other tree
GLANCE_ENGINE_ROOT=/path/to/unpacked node ...

# several named trees (absolute, or relative to the repository root)
GLANCE_ENGINE_ROOTS='{"0.9.35":"/path/to/0.9.35-unpacked","0.9.34":"/path/to/0.9.34-unpacked","r35p":"/path/to/r35p"}'
```

`GLANCE_V2_ENGINE` selects the name the v2 / v2.1 pipelines ask for (default `tip`). Historical reports in `model/shadow/out-v2/report.md` and `model/shadow/out-v21/report.md` were measured on engine 0.9.35. Re-running generators on `tip` produces labels for the current core, not those historical counts.

## CPU checks (no weights download, no GPU)

From the repository root:

```sh
bash glance-ai/run-cpu-checks.sh
```

That runs, in order:

1. Owner-label ingest and score (`labeling/test-ingest.cjs`, `labeling/test-score.cjs`). These do not need generated features.
2. Hebrew currency veto unit test (`oss/veto/test-hebrew-amount.cjs`).
3. Suggest-save: `node model/suggest-save/test-corpus.cjs` and `python3 model/suggest-save/test_corpus.py` (22 spec rows, edge cases, JS/Python parity), then `python3 model/suggest-save/check_dataset.py` on `eval-data/suggest-save-v22.jsonl`.
4. Dataset: `git archive` of commit `8f8edae` (Glance 0.9.34 test corpora) and commit `db563fd` (engine 0.9.35) into temp directories. `build-dataset.cjs` then `v2/build-dataset-v2.cjs` regenerate `model/dataset/out-v2/all.jsonl`. Its sha256 must equal `model/dataset/v2/all.jsonl.sha256` (`d4aab097339b6cafde9708082ab87803e7de7527d40e51a64b4cb8169b536e48`). The file stays gitignored.
5. Stripper: `node model/strip/test-strip.cjs` and `python3 model/strip/test_strip.py`. Stress-case hashes always run. With the regenerated dataset and engine 0.9.35, the gate is 767 raw flips, 767 removed, 0 left, 0 new. The current tip is measured in the same pass.
6. Norm-flip: `node model/shadow/norm-flips-v21.cjs`. Engine 0.9.35 raw is 767; the full stripper leaves 0 and adds 0. Tip is recorded beside that gate.
7. Shadow package: `bash model/shadow-pkg/run-tests.sh` (logging, feature parity, JS dense parity, Python decision parity against the checked-in sklearn preds, size under 871,000 bytes). Python parity is 6,977/6,982 (v2) and 6,976/6,982 (v2.1).
8. Gated OSS score from cached predictions: `node oss/shadow-combined/gated/score-gated.cjs qwen3.5-4b`. No LLM is run.

## Regenerating datasets

Training (`run-all*.sh`) needs a Python venv with scikit-learn and enough disk for the generated splits. Those training scripts are not part of the CPU check. The CPU check does regenerate `dataset/out-v2/all.jsonl` and checks its sha256. Labels in that regeneration use engine 0.9.35. A hand run of the generators without `GLANCE_V2_ENGINE` labels with `tip`.

```sh
cd glance-ai/model
./run-all.sh          # v1 dataset, features, train, parity, shadow
./run-all-v2.sh       # v2 dataset and shadow (see the script)
./run-all-v21.sh      # v2.1 dataset, train, parity, pack, shadow
./run-all-v22.sh      # shadow package, suggest-save dataset, stripper
```

`run-all-v21.sh` and `run-all-v22.sh` refuse to start with under 1.5 GB free. Generated files land in `model/dataset/out*` (gitignored).

## What is not in git

| left out | why |
|---|---|
| `model/dataset/out*` full splits, features, ONNX | Regenerated by `run-cpu-checks.sh` (v2 `all.jsonl`) and the training scripts. The v2 file's sha256 is `model/dataset/v2/all.jsonl.sha256` |
| `model/train/features-v2/` | Feature matrices for a v2 refit. The owner-label command still scores without them. The CPU refit runs only when `train.jsonl` is present, and it writes under `labeling/dry-run/` |
| `labeling/dry-run/work/`, `labeling/dry-run/artifacts/` | Override copies and the dry-run report. The summary files next to them are committed |
| LLM weights, GGUF, `oss/models/`, `oss/finetune/gguf/` | Not downloaded here. GPU work is parked |
| `oss/finetune/tools/llama.cpp` | Not vendored. Clone into that gitignored path when GPU work is unparked |
| `oss/finetune/data/v2/sft_train.jsonl` | Regenerated by `oss/finetune/build_sft_v2.py` after the v2 dataset exists. Val is `eval-data/sft-v2-val.jsonl` |
| Historical engine trees 0.9.34 / 0.9.35 / r35p | `run-cpu-checks.sh` materializes 0.9.34 and 0.9.35 with `git archive` into temp dirs. r35p stays optional via `GLANCE_ENGINE_ROOTS` |

Checked in on purpose: int8 JSON weights and the `.glw` shadow candidates under `model/artifacts` and `model/shadow-pkg/weights`, plus `model/artifacts/v2.test-preds.jsonl` and `v21.test-preds.jsonl` (sklearn float preds for Python decision parity). Each package stays under the 871 KB budget.

## GPU

Parked. Do not rent a machine and do not run `oss/finetune/gpu_run.sh run` until there are at least 200 owner-verified labels and the owner approves the spend. See `oss/finetune/GPU-RUNBOOK.md`.
