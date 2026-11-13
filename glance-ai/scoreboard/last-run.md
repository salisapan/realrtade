# Glance model scoreboard

Lab only. Frozen label set, joined by text (607 rows). Engine hard quiets veto the model (--hard-quiets A). Labels are never owner-verified unless the first source says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 485)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 6.4% [4.1%–10.1%] 17/264 | 50.7% [44.1%–57.2%] 112/221 | 12 | 54/116 | 58/105 | -8.7 pts | n/a |
| v2 | engine+veto, then model | 6.4% [4.1%–10.1%] 17/264 | 46.2% [39.7%–52.7%] 102/221 | 15 | 49/116 | 53/105 | -8.2 pts | n/a |
| v2 | model alone | 8.0% [5.3%–11.9%] 21/264 | 73.3% [67.1%–78.7%] 162/221 | 11 | 83/116 | 79/105 | -3.7 pts | 0.142 / 0.201 |
| v23 | engine+veto, then model | 6.4% [4.1%–10.1%] 17/264 | 37.1% [31.0%–43.6%] 82/221 | 17 | 33/116 | 49/105 | -18.2 pts | n/a |
| v23 | model alone | 9.8% [6.8%–14.0%] 26/264 | 60.6% [54.1%–66.8%] 134/221 | 15 | 59/116 | 75/105 | -20.6 pts | 0.083 / 0.171 |
| v26 | engine+veto, then model | 6.4% [4.1%–10.1%] 17/264 | 35.3% [29.3%–41.8%] 78/221 | 17 | 34/116 | 44/105 | -12.6 pts | n/a |
| v26 | model alone | 12.1% [8.7%–16.6%] 32/264 | 54.3% [47.7%–60.7%] 120/221 | 13 | 57/116 | 63/105 | -10.9 pts | 0.086 / 0.157 |
| claude-zero-shot | engine+veto, then model | 7.2% [4.7%–11.0%] 19/264 | 2.3% [1.0%–5.2%] 5/221 | 31 | 4/116 | 1/105 | 2.5 pts | n/a |
| claude-zero-shot | model alone | 9.8% [6.8%–14.0%] 26/264 | 4.1% [2.2%–7.6%] 9/221 | 33 | 7/116 | 2/105 | 4.1 pts | n/a |

## single blind pass (Claude, NOT owner-verified) (n = 25)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v2 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v2 | model alone | 50.0% [9.5%–90.5%] 1/2 | 65.2% [44.9%–81.2%] 15/23 | 3 | 11/15 | 4/8 | 23.3 pts | n/a |
| v23 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v23 | model alone | 50.0% [9.5%–90.5%] 1/2 | 56.5% [36.8%–74.4%] 13/23 | 5 | 10/15 | 3/8 | 29.2 pts | n/a |
| v26 | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 39.1% [22.2%–59.2%] 9/23 | 4 | 5/15 | 4/8 | -16.7 pts | n/a |
| v26 | model alone | 50.0% [9.5%–90.5%] 1/2 | 52.2% [33.0%–70.8%] 12/23 | 5 | 9/15 | 3/8 | 22.5 pts | n/a |
| claude-zero-shot | engine+veto, then model | 50.0% [9.5%–90.5%] 1/2 | 21.7% [9.7%–41.9%] 5/23 | 5 | 3/15 | 2/8 | -5.0 pts | n/a |
| claude-zero-shot | model alone | 50.0% [9.5%–90.5%] 1/2 | 47.8% [29.2%–67.0%] 11/23 | 4 | 7/15 | 4/8 | -3.3 pts | n/a |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 33)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | n/a (0 rows) | 51.5% [35.2%–67.5%] 17/33 | 7 | 11/18 | 6/15 | 21.1 pts | n/a |
| v2 | engine+veto, then model | n/a (0 rows) | 51.5% [35.2%–67.5%] 17/33 | 7 | 11/18 | 6/15 | 21.1 pts | n/a |
| v2 | model alone | n/a (0 rows) | 90.9% [76.4%–96.9%] 30/33 | 0 | 16/18 | 14/15 | -4.4 pts | 0.541 / 0.425 |
| v23 | engine+veto, then model | n/a (0 rows) | 51.5% [35.2%–67.5%] 17/33 | 7 | 11/18 | 6/15 | 21.1 pts | n/a |
| v23 | model alone | n/a (0 rows) | 93.9% [80.4%–98.3%] 31/33 | 0 | 17/18 | 14/15 | 1.1 pts | 0.506 / 0.354 |
| v26 | engine+veto, then model | n/a (0 rows) | 51.5% [35.2%–67.5%] 17/33 | 7 | 11/18 | 6/15 | 21.1 pts | n/a |
| v26 | model alone | n/a (0 rows) | 100.0% [89.6%–100.0%] 33/33 | 0 | 18/18 | 15/15 | 0.0 pts | 0.634 / 0.47 |
| claude-zero-shot | engine+veto, then model | n/a (0 rows) | 0.0% [0.0%–10.4%] 0/33 | 8 | 0/18 | 0/15 | 0.0 pts | n/a |
| claude-zero-shot | model alone | n/a (0 rows) | 0.0% [0.0%–10.4%] 0/33 | 3 | 0/18 | 0/15 | 0.0 pts | n/a |

## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against v2

- v23: HOLD (more wrong actions (15 -> 17))
- v26: HOLD (more wrong actions (15 -> 17))
- claude-zero-shot: HOLD (more wrong Do Its (all: 17 -> 19); more wrong Do Its (he: 9 -> 11); more wrong actions (15 -> 31))

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
