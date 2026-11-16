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
| v31 | engine+veto, then model | 6.2% [2.7%–13.6%] 5/81 | 38.9% [29.5%–49.2%] 35/90 | 11 | 14/44 | 21/46 | -13.8 pts | n/a |
| v31 | model alone | 2.5% [0.7%–8.6%] 2/81 | 72.2% [62.2%–80.4%] 65/90 | 7 | 29/44 | 36/46 | -12.4 pts | 0.096 / 0.114 |
| v32 | engine+veto, then model | 7.4% [3.4%–15.2%] 6/81 | 24.4% [16.7%–34.2%] 22/90 | 13 | 8/44 | 14/46 | -12.3 pts | n/a |
| v32 | model alone | 7.4% [3.4%–15.2%] 6/81 | 27.8% [19.6%–37.8%] 25/90 | 10 | 13/44 | 12/46 | 3.5 pts | 0.062 / 0.088 |
| v33 | engine+veto, then model | 6.2% [2.7%–13.6%] 5/81 | 30.0% [21.5%–40.1%] 27/90 | 10 | 11/44 | 16/46 | -9.8 pts | n/a |
| v33 | model alone | 3.7% [1.3%–10.3%] 3/81 | 40.0% [30.5%–50.3%] 36/90 | 3 | 20/44 | 16/46 | 10.7 pts | 0.062 / 0.088 |

## single blind pass (Claude, NOT owner-verified) (n = 10)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 3/5 | 3/4 | -15.0 pts | n/a |
| v2 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 3/5 | 3/4 | -15.0 pts | n/a |
| v2 | model alone | 0.0% [0.0%–79.3%] 0/1 | 77.8% [45.3%–93.7%] 7/9 | 2 | 4/5 | 3/4 | 5.0 pts | n/a |
| v31 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 66.7% [35.4%–87.9%] 6/9 | 3 | 3/5 | 3/4 | -15.0 pts | n/a |
| v31 | model alone | 0.0% [0.0%–79.3%] 0/1 | 77.8% [45.3%–93.7%] 7/9 | 1 | 4/5 | 3/4 | 5.0 pts | n/a |
| v32 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 33.3% [12.1%–64.6%] 3/9 | 3 | 1/5 | 2/4 | -30.0 pts | n/a |
| v32 | model alone | 0.0% [0.0%–79.3%] 0/1 | 22.2% [6.3%–54.7%] 2/9 | 1 | 1/5 | 1/4 | -5.0 pts | n/a |
| v33 | engine+veto, then model | 0.0% [0.0%–79.3%] 0/1 | 33.3% [12.1%–64.6%] 3/9 | 6 | 1/5 | 2/4 | -30.0 pts | n/a |
| v33 | model alone | 0.0% [0.0%–79.3%] 0/1 | 44.4% [18.9%–73.3%] 4/9 | 5 | 2/5 | 2/4 | -10.0 pts | n/a |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against v2

- v31: HOLD (more wrong actions (10 -> 11))
- v32: HOLD (more wrong Do Its (he: 2 -> 3); more wrong actions (10 -> 13))
- v33: BETTER ON SPEC LABELS (needs 200 owner-verified or 200 two-pass-agreement labels; has 0 and 171)

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
