# Router v2 with a simulated device Tier 1 (M4) end to end, real device mask, cached Qwen3.5-4B as Tier 2

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

## Plans (M5)

Model proposals on screen: 9. Planned into the product's own process: 9 ({"schedule":3,"log-it":4,"reply-track":2}); file saves left to suggest-save: 0; refused by the plan gate: {}.
Anchor step equals the gold step: 8/9. Every dated step on the gold due day: 8/8. Send steps: 0. Calendar steps with a clock: 3/3. A done-when condition: 9/9. Drawn by the steps list (one row per step): 9/9.
Carried by the follow loop (asks and promises): 6/6 (mine 2, theirs 4); loop deadline on the gold day: 5/5.

## Device Tier 1 (simulation: the cached answers play the device model)

Self-test on these cases: EN {"ok":false,"n":216,"tp":37,"fp":28,"fn":85,"precision":0.569,"recall":0.303}, HE {"ok":false,"n":206,"tp":53,"fp":41,"fn":57,"precision":0.564,"recall":0.482}. Tier 1 asked 0, answered 0; cloud calls 150.
