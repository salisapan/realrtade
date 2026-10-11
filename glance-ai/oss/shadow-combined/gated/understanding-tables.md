# Understanding validator (M1) on cached Qwen3.5-4B answers

No LLM was run. Spec labels. Confidence not measured (cached answers carry none).

### OSS 275

| system | n | wrong Do It | missed | HE missed | EN missed | wrong Do It HE / EN | wrong action | model card, wrong date |
|---|---|---|---|---|---|---|---|---|
| engine+veto (today) | 275 | 0/167 | 21/108 | 18/50 | 3/58 | 0 / 0 | 1 | 0/0 |
| model, no gate | 275 | 0/167 | 9/108 | 7/50 | 2/58 | 0 / 0 | 1 | 8/8 |
| model + Understanding validator (M1) | 275 | 0/167 | 12/108 | 10/50 | 2/58 | 0 / 0 | 1 | 0/5 |
| model + strict propose-gate | 275 | 0/167 | 13/108 | 10/50 | 3/58 | 0 / 0 | 1 | 8/8 |
| model + Understanding validator + strict gate | 275 | 0/167 | 16/108 | 13/50 | 3/58 | 0 / 0 | 1 | 0/5 |

### v2 held-out 400

| system | n | wrong Do It | missed | HE missed | EN missed | wrong Do It HE / EN | wrong action | model card, wrong date |
|---|---|---|---|---|---|---|---|---|
| engine+veto (today) | 400 | 0/218 | 20/182 | 10/90 | 10/92 | 0 / 0 | 6 | 0/0 |
| model, no gate | 400 | 8/218 | 11/182 | 4/90 | 7/92 | 4 / 4 | 6 | 0/0 |
| model + Understanding validator (M1) | 400 | 3/218 | 11/182 | 4/90 | 7/92 | 3 / 0 | 6 | 0/0 |
| model + strict propose-gate | 400 | 0/218 | 20/182 | 10/90 | 10/92 | 0 / 0 | 6 | 0/0 |
| model + Understanding validator + strict gate | 400 | 0/218 | 20/182 | 10/90 | 10/92 | 0 / 0 | 6 | 0/0 |

### adversarial 72

| system | n | wrong Do It | missed | HE missed | EN missed | wrong Do It HE / EN | wrong action | model card, wrong date |
|---|---|---|---|---|---|---|---|---|
| engine+veto (today) | 72 | 0/50 | 2/22 | 1/9 | 1/13 | 0 / 0 | 1 | 0/0 |
| model, no gate | 72 | 0/50 | 1/22 | 0/9 | 1/13 | 0 / 0 | 1 | 0/0 |
| model + Understanding validator (M1) | 72 | 0/50 | 1/22 | 0/9 | 1/13 | 0 / 0 | 1 | 0/0 |
| model + strict propose-gate | 72 | 0/50 | 2/22 | 1/9 | 1/13 | 0 / 0 | 1 | 0/0 |
| model + Understanding validator + strict gate | 72 | 0/50 | 2/22 | 1/9 | 1/13 | 0 / 0 | 1 | 0/0 |

### injection 39

| system | n | wrong Do It | missed | HE missed | EN missed | wrong Do It HE / EN | wrong action | model card, wrong date |
|---|---|---|---|---|---|---|---|---|
| engine+veto (today) | 39 | 0/29 | 3/10 | 1/4 | 2/6 | 0 / 0 | 0 | 0/0 |
| model, no gate | 39 | 0/29 | 2/10 | 0/4 | 2/6 | 0 / 0 | 1 | 0/0 |
| model + Understanding validator (M1) | 39 | 0/29 | 2/10 | 0/4 | 2/6 | 0 / 0 | 1 | 0/0 |
| model + strict propose-gate | 39 | 0/29 | 2/10 | 0/4 | 2/6 | 0 / 0 | 1 | 0/0 |
| model + Understanding validator + strict gate | 39 | 0/29 | 2/10 | 0/4 | 2/6 | 0 / 0 | 1 | 0/0 |

### ALL pooled 786

| system | n | wrong Do It | missed | HE missed | EN missed | wrong Do It HE / EN | wrong action | model card, wrong date |
|---|---|---|---|---|---|---|---|---|
| engine+veto (today) | 786 | 0/464 | 46/322 | 30/153 | 16/169 | 0 / 0 | 8 | 0/0 |
| model, no gate | 786 | 8/464 | 23/322 | 11/153 | 12/169 | 4 / 4 | 9 | 8/8 |
| model + Understanding validator (M1) | 786 | 3/464 | 26/322 | 14/153 | 12/169 | 3 / 0 | 9 | 0/5 |
| model + strict propose-gate | 786 | 0/464 | 37/322 | 21/153 | 16/169 | 0 / 0 | 9 | 8/8 |
| model + Understanding validator + strict gate | 786 | 0/464 | 40/322 | 24/153 | 16/169 | 0 / 0 | 9 | 0/5 |

## What the validator changed (8 model proposals)

| id | set/lang | gold | model | no gate | with validator | effect |
|---|---|---|---|---|---|---|
| oss-he-promise-044 | oss/he | task | task/2026-10-10 | task | SILENT (understanding:promise-without-date) | lost a right Do It |
| oss-he-promise-046 | oss/he | task | task/2026-10-10 | task | SILENT (understanding:promise-without-date) | lost a right Do It |
| oss-B-prom-01 | oss/he | task | task/2026-10-10 | task | SILENT (understanding:promise-without-date) | lost a right Do It |
| v2syn-3656 | v2test/en | SILENT | task/- | task | SILENT (understanding:promise-without-date) | prevented wrong Do It |
| v2syn-3698 | v2test/en | SILENT | task/2026-10-07 | task | SILENT (understanding:promise-without-date) | prevented wrong Do It |
| v2syn-9516 | v2test/he | SILENT | task/- | task | SILENT (understanding:promise-without-date) | prevented wrong Do It |
| v2repo-intent-teacher-eval-10-gmail | v2test/en | SILENT | reply/2026-10-07 | draft | SILENT (understanding:ask-without-date) | prevented wrong Do It |
| v2repo-intent-teacher-eval-50-gmail | v2test/en | SILENT | task/- | task | SILENT (understanding:promise-without-date) | prevented wrong Do It |
