# Today's engine (tip) alone vs the AI engine on top of it

Spec labels. Tier 2 = cached Qwen3.5-4B answers, real device mask, the production floor (core/ai-floor.js). No model run.

| set | system | wrong Do It | missed | HE missed | EN missed |
|---|---|---|---|---|---|
| OSS 275 | engine 0.9.56 (tip) alone | 5/167 | 58/108 | 32/50 | 26/58 |
| OSS 275 | tip + AI engine | 5/167 | 20/108 | 7/50 | 13/58 |
| v2 held-out 400 | engine 0.9.56 (tip) alone | 11/218 | 57/182 | 19/90 | 38/92 |
| v2 held-out 400 | tip + AI engine | 11/218 | 41/182 | 13/90 | 28/92 |
| adversarial 72 | engine 0.9.56 (tip) alone | 3/50 | 4/22 | 2/9 | 2/13 |
| adversarial 72 | tip + AI engine | 3/50 | 0/22 | 0/9 | 0/13 |
| injection 39 | engine 0.9.56 (tip) alone | 6/29 | 9/10 | 4/4 | 5/6 |
| injection 39 | tip + AI engine | 6/29 | 3/10 | 0/4 | 3/6 |
| ALL pooled 786 | engine 0.9.56 (tip) alone | 25/464 | 128/322 | 57/153 | 71/169 |
| ALL pooled 786 | tip + AI engine | 25/464 | 64/322 | 20/153 | 44/169 |

Model cards: 64 (planned 47, carried by the follow loop 32); model cards on a gold-silent mail: 0. Mails that reached the cloud tier: 227/796.
Model cards with a different step than the label: 3 (v2syn-1061:draft≠task, v2syn-1100:task≠calendar, ctrl-he-4:task≠draft). File cards handed to suggest-save (shown only if it finds the real attachment): 17, of which the label is a file save: 17.
