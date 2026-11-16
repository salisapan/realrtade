# Glance model scoreboard

Lab only. Frozen label set, joined by text (210 rows). Engine hard quiets veto the model (--hard-quiets A). Labels are never owner-verified unless the first source says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 171)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 8.6% [4.2%–16.8%] 7/81 | 51.1% [41.0%–61.2%] 46/90 | 8 | 18/44 | 28/46 | -20.0 pts | n/a |
| v2 | engine+veto, then model | 7.4% [3.4%–15.2%] 6/81 | 47.8% [37.8%–58.0%] 43/90 | 10 | 17/44 | 26/46 | -17.9 pts | n/a |
| v2 | model alone | 8.6% [4.2%–16.8%] 7/81 | 83.3% [74.3%–89.6%] 75/90 | 5 | 34/44 | 41/46 | -11.9 pts | 0.184 / 0.234 |
| v29 | engine+veto, then model | 6.2% [2.7%–13.6%] 5/81 | 41.1% [31.5%–51.4%] 37/90 | 11 | 15/44 | 22/46 | -13.7 pts | n/a |
| v29 | model alone | 7.4% [3.4%–15.2%] 6/81 | 67.8% [57.6%–76.5%] 61/90 | 8 | 25/44 | 36/46 | -21.4 pts | 0.158 / 0.184 |
| v31 | engine+veto, then model | 6.2% [2.7%–13.6%] 5/81 | 38.9% [29.5%–49.2%] 35/90 | 11 | 14/44 | 21/46 | -13.8 pts | n/a |
| v31 | model alone | 2.5% [0.7%–8.6%] 2/81 | 72.2% [62.2%–80.4%] 65/90 | 7 | 29/44 | 36/46 | -12.4 pts | 0.096 / 0.114 |

## single blind pass (Claude, NOT owner-verified) (n = 10)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 3/5 | 3/4 | -15.0 pts | n/a |
| v2 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 3/5 | 3/4 | -15.0 pts | n/a |
| v2 | model alone | 0.0% [0.0%–79.3%] 0/1 | 77.8% [45.3%–93.7%] 7/9 | 2 | 4/5 | 3/4 | 5.0 pts | n/a |
| v29 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 44.4% [18.9%–73.3%] 4/9 | 5 | 1/5 | 3/4 | -55.0 pts | n/a |
| v29 | model alone | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 2/5 | 4/4 | -60.0 pts | n/a |
| v31 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 3/5 | 3/4 | -15.0 pts | n/a |
| v31 | model alone | 0.0% [0.0%–79.3%] 0/1 | 77.8% [45.3%–93.7%] 7/9 | 1 | 4/5 | 3/4 | 5.0 pts | n/a |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against v2

- v29: HOLD (more wrong actions (10 -> 11))
- v31: HOLD (more wrong actions (10 -> 11))

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
