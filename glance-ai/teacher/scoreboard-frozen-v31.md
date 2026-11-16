# Glance model scoreboard

Lab only. Frozen label set, joined by text (701 rows). Engine hard quiets veto the model (--hard-quiets A). Labels are never owner-verified unless the first source says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 565)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 7.0% [4.6%–10.5%] 21/299 | 47.0% [41.1%–53.0%] 125/266 | 12 | 56/139 | 69/127 | -14.0 pts | n/a |
| v2 | engine+veto, then model | 6.7% [4.4%–10.1%] 20/299 | 43.6% [37.8%–49.6%] 116/266 | 15 | 53/139 | 63/127 | -11.5 pts | n/a |
| v2 | model alone | 7.7% [5.2%–11.3%] 23/299 | 75.6% [70.1%–80.3%] 201/266 | 13 | 102/139 | 99/127 | -4.6 pts | 0.144 / 0.206 |
| v29 | engine+veto, then model | 6.4% [4.1%–9.7%] 19/299 | 37.6% [32.0%–43.6%] 100/266 | 17 | 43/139 | 57/127 | -13.9 pts | n/a |
| v29 | model alone | 10.0% [7.1%–14.0%] 30/299 | 62.8% [56.8%–68.4%] 167/266 | 18 | 74/139 | 93/127 | -20.0 pts | 0.126 / 0.17 |
| v31 | engine+veto, then model | 6.4% [4.1%–9.7%] 19/299 | 36.8% [31.3%–42.8%] 98/266 | 20 | 43/139 | 55/127 | -12.4 pts | n/a |
| v31 | model alone | 8.0% [5.5%–11.7%] 24/299 | 69.2% [63.4%–74.4%] 184/266 | 18 | 88/139 | 96/127 | -12.3 pts | 0.109 / 0.154 |

## single blind pass (Claude, NOT owner-verified) (n = 25)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v2 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v2 | model alone | 50.0% [9.5%–90.5%] 1/2 | 65.2% [44.9%–81.2%] 15/23 | 3 | 11/15 | 4/8 | 23.3 pts | n/a |
| v29 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 30.4% [15.6%–50.9%] 7/23 | 6 | 3/15 | 4/8 | -30.0 pts | n/a |
| v29 | model alone | 0.0% [0.0%–65.8%] 0/2 | 60.9% [40.8%–77.8%] 14/23 | 4 | 9/15 | 5/8 | -2.5 pts | n/a |
| v31 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v31 | model alone | 0.0% [0.0%–65.8%] 0/2 | 87.0% [67.9%–95.5%] 20/23 | 1 | 14/15 | 6/8 | 18.3 pts | n/a |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 38)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | n/a (0 rows) | 52.6% [37.3%–67.5%] 20/38 | 8 | 12/21 | 8/17 | 10.1 pts | n/a |
| v2 | engine+veto, then model | n/a (0 rows) | 50.0% [34.8%–65.2%] 19/38 | 8 | 12/21 | 7/17 | 16.0 pts | n/a |
| v2 | model alone | n/a (0 rows) | 89.5% [75.9%–95.8%] 34/38 | 0 | 19/21 | 15/17 | 2.2 pts | 0.541 / 0.425 |
| v29 | engine+veto, then model | n/a (0 rows) | 42.1% [27.9%–57.8%] 16/38 | 8 | 10/21 | 6/17 | 12.3 pts | n/a |
| v29 | model alone | n/a (0 rows) | 76.3% [60.8%–87.0%] 29/38 | 1 | 16/21 | 13/17 | -0.3 pts | 0.368 / 0.291 |
| v31 | engine+veto, then model | n/a (0 rows) | 50.0% [34.8%–65.2%] 19/38 | 8 | 12/21 | 7/17 | 16.0 pts | n/a |
| v31 | model alone | n/a (0 rows) | 89.5% [75.9%–95.8%] 34/38 | 1 | 19/21 | 15/17 | 2.2 pts | 0.384 / 0.246 |

## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against v2

- v29: HOLD (more wrong actions (15 -> 17))
- v31: HOLD (more wrong actions (15 -> 20))

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
