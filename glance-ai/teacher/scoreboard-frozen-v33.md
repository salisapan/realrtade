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
| v31 | engine+veto, then model | 6.4% [4.1%–9.7%] 19/299 | 36.8% [31.3%–42.8%] 98/266 | 20 | 43/139 | 55/127 | -12.4 pts | n/a |
| v31 | model alone | 8.0% [5.5%–11.7%] 24/299 | 69.2% [63.4%–74.4%] 184/266 | 18 | 88/139 | 96/127 | -12.3 pts | 0.109 / 0.154 |
| v32 | engine+veto, then model | 6.7% [4.4%–10.1%] 20/299 | 22.6% [17.9%–27.9%] 60/266 | 30 | 28/139 | 32/127 | -5.1 pts | n/a |
| v32 | model alone | 17.4% [13.5%–22.1%] 52/299 | 30.1% [24.9%–35.8%] 80/266 | 43 | 44/139 | 36/127 | 3.3 pts | 0.152 / 0.176 |
| v33 | engine+veto, then model | 6.4% [4.1%–9.7%] 19/299 | 25.6% [20.7%–31.1%] 68/266 | 17 | 32/139 | 36/127 | -5.3 pts | n/a |
| v33 | model alone | 14.7% [11.1%–19.2%] 44/299 | 37.6% [32.0%–43.6%] 100/266 | 12 | 54/139 | 46/127 | 2.6 pts | 0.152 / 0.176 |

## single blind pass (Claude, NOT owner-verified) (n = 25)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v2 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v2 | model alone | 50.0% [9.5%–90.5%] 1/2 | 65.2% [44.9%–81.2%] 15/23 | 3 | 11/15 | 4/8 | 23.3 pts | n/a |
| v31 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v31 | model alone | 0.0% [0.0%–65.8%] 0/2 | 87.0% [67.9%–95.5%] 20/23 | 1 | 14/15 | 6/8 | 18.3 pts | n/a |
| v32 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 26.1% [12.5%–46.5%] 6/23 | 4 | 3/15 | 3/8 | -17.5 pts | n/a |
| v32 | model alone | 0.0% [0.0%–65.8%] 0/2 | 52.2% [33.0%–70.8%] 12/23 | 2 | 8/15 | 4/8 | 3.3 pts | n/a |
| v33 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 26.1% [12.5%–46.5%] 6/23 | 7 | 3/15 | 3/8 | -17.5 pts | n/a |
| v33 | model alone | 0.0% [0.0%–65.8%] 0/2 | 65.2% [44.9%–81.2%] 15/23 | 5 | 10/15 | 5/8 | 4.2 pts | n/a |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 38)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | n/a (0 rows) | 52.6% [37.3%–67.5%] 20/38 | 8 | 12/21 | 8/17 | 10.1 pts | n/a |
| v2 | engine+veto, then model | n/a (0 rows) | 50.0% [34.8%–65.2%] 19/38 | 8 | 12/21 | 7/17 | 16.0 pts | n/a |
| v2 | model alone | n/a (0 rows) | 89.5% [75.9%–95.8%] 34/38 | 0 | 19/21 | 15/17 | 2.2 pts | 0.541 / 0.425 |
| v31 | engine+veto, then model | n/a (0 rows) | 50.0% [34.8%–65.2%] 19/38 | 8 | 12/21 | 7/17 | 16.0 pts | n/a |
| v31 | model alone | n/a (0 rows) | 89.5% [75.9%–95.8%] 34/38 | 1 | 19/21 | 15/17 | 2.2 pts | 0.384 / 0.246 |
| v32 | engine+veto, then model | n/a (0 rows) | 31.6% [19.1%–47.5%] 12/38 | 9 | 9/21 | 3/17 | 25.2 pts | n/a |
| v32 | model alone | n/a (0 rows) | 44.7% [30.1%–60.3%] 17/38 | 7 | 11/21 | 6/17 | 17.1 pts | 0.203 / 0.113 |
| v33 | engine+veto, then model | n/a (0 rows) | 31.6% [19.1%–47.5%] 12/38 | 8 | 9/21 | 3/17 | 25.2 pts | n/a |
| v33 | model alone | n/a (0 rows) | 52.6% [37.3%–67.5%] 20/38 | 2 | 13/21 | 7/17 | 20.7 pts | 0.203 / 0.113 |

## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against v2

- v31: HOLD (more wrong actions (15 -> 20))
- v32: HOLD (more wrong Do Its (he: 11 -> 12); more wrong actions (15 -> 30))
- v33: HOLD (more wrong actions (15 -> 17))

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
