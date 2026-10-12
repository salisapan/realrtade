# Router v2 (M2) end to end, real device mask, cached Qwen3.5-4B as Tier 2

No model was run. Spec labels. Tier 1 absent. Confidence not measured.

| set | n | wrong Do It | missed | HE missed | EN missed | wrong date (model cards) | reached Tier 2 | stopped by the mask |
|---|---|---|---|---|---|---|---|---|
| OSS 275 | 275 | 0/167 | 13/108 | 10/50 | 3/58 | 0/8 | 67/275 | 0 |
| v2 held-out 400 | 400 | 0/218 | 20/182 | 10/90 | 10/92 | 0/0 | 69/400 | 0 |
| adversarial 72 | 72 | 0/50 | 2/22 | 1/9 | 1/13 | 0/0 | 6/74 | 0 |
| injection 39 | 39 | 0/29 | 2/10 | 0/4 | 2/6 | 0/0 | 8/47 | 0 |
| ALL pooled 786 | 786 | 0/464 | 37/322 | 21/153 | 16/169 | 0/8 | 150/796 | 0 |

## Why a Tier 2 answer stayed silent

- model:no-actionable-intention: 117
- gate:save-suggest:attachments-unread: 15
- model:promise-without-date: 4
- model:ask-without-date: 2
- gate:unsupported-kind:attach-to-invite: 1
- model:meeting-without-date: 1
- gate:money-offer-acceptance: 1
