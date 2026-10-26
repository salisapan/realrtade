# Today's engine (tip) alone vs the AI engine on top of it

Spec labels. Tier 2 = cached Qwen3.5-4B answers, real device mask, strict gate and veto. No model run.

| set | system | wrong Do It | missed | HE missed | EN missed |
|---|---|---|---|---|---|
| OSS 275 | engine 0.9.56 (tip) alone | 5/167 | 58/108 | 32/50 | 26/58 |
| OSS 275 | tip + AI engine | 5/167 | 31/108 | 11/50 | 20/58 |
| v2 held-out 400 | engine 0.9.56 (tip) alone | 11/218 | 57/182 | 19/90 | 38/92 |
| v2 held-out 400 | tip + AI engine | 11/218 | 50/182 | 17/90 | 33/92 |
| adversarial 72 | engine 0.9.56 (tip) alone | 3/50 | 4/22 | 2/9 | 2/13 |
| adversarial 72 | tip + AI engine | 3/50 | 1/22 | 1/9 | 0/13 |
| injection 39 | engine 0.9.56 (tip) alone | 6/29 | 9/10 | 4/4 | 5/6 |
| injection 39 | tip + AI engine | 6/29 | 4/10 | 0/4 | 4/6 |
| ALL pooled 786 | engine 0.9.56 (tip) alone | 25/464 | 128/322 | 57/153 | 71/169 |
| ALL pooled 786 | tip + AI engine | 25/464 | 86/322 | 29/153 | 57/169 |

Model cards: 42 (planned 42, carried by the follow loop 32); model cards on a gold-silent mail: 0. Mails that reached the cloud tier: 227/796.
