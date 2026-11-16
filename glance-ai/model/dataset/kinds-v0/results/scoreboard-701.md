# Glance model scoreboard

Lab only. Frozen label set, joined by text (701 rows). Engine hard quiets veto the model (--hard-quiets A). Labels are never owner-verified unless the first source says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 565)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 7.0% [4.6%–10.5%] 21/299 | 47.0% [41.1%–53.0%] 125/266 | 12 | 56/139 | 69/127 | -14.0 pts | n/a |
| kinds-head | engine+veto, then model | 6.7% [4.4%–10.1%] 20/299 | 44.0% [38.1%–50.0%] 117/266 | 13 | 56/139 | 61/127 | -7.7 pts | n/a |
| kinds-head | model alone | 2.3% [1.1%–4.8%] 7/299 | 66.5% [60.7%–71.9%] 177/266 | 2 | 87/139 | 90/127 | -8.3 pts | 0.078 / 0.097 |

## single blind pass (Claude, NOT owner-verified) (n = 25)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| kinds-head | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| kinds-head | model alone | 50.0% [9.5%–90.5%] 1/2 | 78.3% [58.1%–90.3%] 18/23 | 2 | 12/15 | 6/8 | 5.0 pts | n/a |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 38)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | n/a (0 rows) | 52.6% [37.3%–67.5%] 20/38 | 8 | 12/21 | 8/17 | 10.1 pts | n/a |
| kinds-head | engine+veto, then model | n/a (0 rows) | 50.0% [34.8%–65.2%] 19/38 | 8 | 12/21 | 7/17 | 16.0 pts | n/a |
| kinds-head | model alone | n/a (0 rows) | 89.5% [75.9%–95.8%] 34/38 | 1 | 19/21 | 15/17 | 2.2 pts | 0.433 / 0.337 |

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
