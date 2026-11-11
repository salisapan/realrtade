# Teacher runbook (Phase D on CPU): sealed baseline, cost probe, 10k labels, retrain, report

Glance closes open loops. Gmail is where it starts today.

Lab only. The strong reader is a TEACHER: it labels and evaluates; it does not go into the product. v2 stays the default; nothing is wired, merged to `main`, deployed, or changed in `manifest.json`, permissions or public copy.

## Preconditions (check first, change nothing)

1. The session runs in the **glance-model-lab** environment (the key is the variable `GLANCE_LAB_ANTHROPIC_API_KEY` there; the Default environment has no key and a running session cannot be moved). `python3 glance-ai/teacher/api.py spent` must print the ledger total; `python3 glance-ai/teacher/api.py ping` must print `ok` (a few thousandths of a cent). If it prints `Refused`, stop and report.
2. Never use or export `ANTHROPIC_API_KEY`. Never print, log, commit or paste the key. The scripts read only `GLANCE_LAB_ANTHROPIC_API_KEY` and send it only in a request header.
3. Budget: prepaid credit about $35, auto-reload off, workspace limit $30 a month. `api.py` refuses any call that would take `ledger.jsonl` past a $24 hard stop. Stop and report if a step would pass the remaining credit.
4. Prices: `teacher/prices.json` holds the 2026-11-11 figures (Haiku 5.5 $0.10 in / $0.50 out, Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20 per million tokens). **Verify them on the live pricing page first** and edit the file if they differ.
5. **A fresh container has none of the generated inputs** (they are gitignored): run `bash glance-ai/teacher/bootstrap.sh` first (about 30 minutes on CPU, no key needed: it rebuilds the historical engine trees by `git archive`, the dataset with its sha check, `model/.venv`, the features and the pickled lab models v2 and v29). After it, the engine environment below is what the scripts export themselves.
6. Engine environment for every lab script: `GLANCE_TIP=/tmp/harvest GLANCE_V2_ENGINE=0.9.35 GLANCE_NOW=2026-10-07T12:00:00+03:00 GLANCE_ENGINE_ROOTS='{"0.9.35":"/tmp/eng35"}'` (see `glance-ai/model/V23.md`; `/tmp/harvest` and `/tmp/eng35` are the pinned engine checkouts: rebuild them as `V23.md` says if the container is fresh) and `glance-ai/model/.venv` (Python with scikit-learn; rebuild per `V23.md`).

## 1. Sealed-set baseline (opens batch-009 ONCE)

```sh
cd glance-ai
node model/train/export-sealed.cjs                                  # engine + features for batch-009 (the opening starts here)
node teacher/make-cases.cjs sealed --out labeling/sealed/batch-009.cases.jsonl
python3 teacher/label.py --cases labeling/sealed/batch-009.cases.jsonl --out labeling/sealed/frontier-opus.labels.jsonl --model claude-opus-5-5 --tag sealed
node scoreboard/baseline/ingest.cjs ...   # or map the labels to judge format as in scoreboard/baseline (silent|draft|task|calendar|file_save)
(cd model && for t in v2 v26 v29 v30; do .venv/bin/python train/predict-set.py --model v2x/fz-$t/$t.model.pkl --set features-sealed/frozen.jsonl --out v2x/fz-$t/$t.sealed-preds.jsonl; done)
node scoreboard/run.cjs --frozen labeling/sealed/frozen-sealed.jsonl --models v2=model/v2x/fz-v2/v2.sealed-preds.jsonl,v29=... --judged frontier=... --hard-quiets A
```
Then add one line to `labeling/sealed/README.md` "Opening log": date, who, why, which models. The set is spent after that: it becomes a hold-out and is not used for any later candidate. (A pickled model `*.model.pkl` is absent in a fresh container: retrain with `train-v2.py --feat features-v2|v26|v29|v30 --tag <t> --out v2x/fz-<t> --predict-set features-sealed/frozen.jsonl --no-export`.)

## 2. Cost probe (200 rows, small model)

```sh
python3 teacher/label.py --cases labeling/teacher/sample-10k.cases.jsonl --out labeling/teacher/probe200.labels.jsonl --model claude-haiku-5-5 --limit 200 --tag probe
```
It prints `usd` and `usd_per_1000_rows`. Report the actual cost. Projected cost for 10,000 rows = `usd_per_1000_rows * 10` for the small model, plus the escalation share (step 3) at the strong model's price. **If the projection would pass the remaining credit or the $30 cap, stop and report.** The probe rows are part of the 10k run (the same file resumes).

## 3. Teacher-label about 10,000 training rows, escalate disagreements

```sh
python3 teacher/label.py --cases labeling/teacher/sample-10k.cases.jsonl --out labeling/teacher/small.labels.jsonl --model claude-haiku-5-5 --tag small   # resumes after the probe
node teacher/escalate.cjs select --labels labeling/teacher/small.labels.jsonl --meta labeling/teacher/sample-10k.cases.meta.jsonl --cases labeling/teacher/sample-10k.cases.jsonl --out labeling/teacher/escalate.cases.jsonl
python3 teacher/label.py --cases labeling/teacher/escalate.cases.jsonl --out labeling/teacher/strong.labels.jsonl --model claude-sonnet-5-5 --tag escalate
node teacher/escalate.cjs merge --labels labeling/teacher/small.labels.jsonl --strong labeling/teacher/strong.labels.jsonl --out labeling/teacher/teacher-labels-final.jsonl
```
Check the escalation share before running the strong pass; if its cost passes the budget, escalate a random half and say so.

## 4. Retrain on CPU, measure on frozen-eval joined by text

```sh
cd glance-ai/model
TEACHER_LABELS=teacher/teacher-labels-final.jsonl K=1 node train/gap-labels-v31.cjs        # features-v31 from features-v29 with the teacher rows replaced
.venv/bin/python train/train-v2.py --feat features-v31 --tag v31 --out v2x/fz-v31 --predict-set features-frozen/frozen.jsonl --no-export
cd .. && node scoreboard/run.cjs --models v2=model/v2x/fz-v2/v2.extra-preds.jsonl,v29=model/v2x/fz-v29/v29.extra-preds.jsonl,v31=model/v2x/fz-v31/v31.extra-preds.jsonl --gate-base v2 --hard-quiets A
node scoreboard/run.cjs --batches 007,008 --models <same> --gate-base v2 --hard-quiets A      # the validation batch
```
Never train or tune on the frozen, validation (007 and 008) or sealed texts: `make-cases.cjs` excludes them by text.

## 5. Stop rule

On the validation batch (007 + 008), at the **same or lower wrong-Do-It rate**, v3.1's missed closes must fall by at least **4 points** against the best prior in-house model (engine + v2.9: 41.1% on that batch) and are also reported against the default v2 (47.8%). If not, stop: spend no more, do not ask for more money. Write the report either way: what changed, the valid scoreboard numbers against the baseline (engine + v2 6.7% / 43.6%, v2.6 / v2.9 / v3.0 about 36 to 38% misses, a strong reader under the floor 2.3%), the cost from `ledger.jsonl`, whether the rule fired. Do not recommend wiring or merging.
