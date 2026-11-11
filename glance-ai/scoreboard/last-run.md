# Glance model scoreboard

Lab only. Frozen label set, joined by text (491 rows). Engine hard quiets veto the model (--hard-quiets A). Labels are never owner-verified unless the first source says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 394)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 6.0% [3.5%–9.9%] 13/218 | 48.9% [41.6%–56.2%] 86/176 | 7 | 45/95 | 41/81 | -3.2 pts | n/a |
| v2 | engine+veto, then model | 6.0% [3.5%–9.9%] 13/218 | 44.9% [37.7%–52.3%] 79/176 | 9 | 42/95 | 37/81 | -1.5 pts | n/a |
| v2 | model alone | 7.3% [4.6%–11.6%] 16/218 | 71.6% [64.5%–77.7%] 126/176 | 8 | 68/95 | 58/81 | -0.0 pts | 0.13 / 0.194 |
| v23 | engine+veto, then model | 6.0% [3.5%–9.9%] 13/218 | 35.8% [29.1%–43.1%] 63/176 | 10 | 27/95 | 36/81 | -16.0 pts | n/a |
| v23 | model alone | 9.2% [6.0%–13.7%] 20/218 | 59.1% [51.7%–66.1%] 104/176 | 10 | 47/95 | 57/81 | -20.9 pts | 0.088 / 0.163 |
| v26 | engine+veto, then model | 6.0% [3.5%–9.9%] 13/218 | 32.4% [25.9%–39.6%] 57/176 | 10 | 27/95 | 30/81 | -8.6 pts | n/a |
| v26 | model alone | 11.5% [7.9%–16.4%] 25/218 | 50.6% [43.2%–57.9%] 89/176 | 9 | 44/95 | 45/81 | -9.2 pts | 0.097 / 0.149 |
| v28 | engine+veto, then model | 6.0% [3.5%–9.9%] 13/218 | 34.1% [27.5%–41.4%] 60/176 | 10 | 31/95 | 29/81 | -3.2 pts | n/a |
| v28 | model alone | 10.6% [7.1%–15.3%] 23/218 | 51.1% [43.8%–58.4%] 90/176 | 9 | 46/95 | 44/81 | -5.9 pts | 0.113 / 0.153 |
| claude-zero-shot | engine+veto, then model | 6.4% [3.9%–10.5%] 14/218 | 2.3% [0.9%–5.7%] 4/176 | 25 | 4/95 | 0/81 | 4.2 pts | n/a |
| claude-zero-shot | model alone | 11.0% [7.5%–15.9%] 24/218 | 4.5% [2.3%–8.7%] 8/176 | 33 | 7/95 | 1/81 | 6.1 pts | n/a |

## single blind pass (Claude, NOT owner-verified) (n = 15)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 100.0% [20.7%–100.0%] 1/1 | 21.4% [7.6%–47.6%] 3/14 | 2 | 2/10 | 1/4 | -5.0 pts | n/a |
| v2 | engine+veto, then model | 100.0% [20.7%–100.0%] 1/1 | 21.4% [7.6%–47.6%] 3/14 | 2 | 2/10 | 1/4 | -5.0 pts | n/a |
| v2 | model alone | 100.0% [20.7%–100.0%] 1/1 | 57.1% [32.6%–78.6%] 8/14 | 1 | 7/10 | 1/4 | 45.0 pts | n/a |
| v23 | engine+veto, then model | 100.0% [20.7%–100.0%] 1/1 | 21.4% [7.6%–47.6%] 3/14 | 2 | 2/10 | 1/4 | -5.0 pts | n/a |
| v23 | model alone | 100.0% [20.7%–100.0%] 1/1 | 57.1% [32.6%–78.6%] 8/14 | 1 | 7/10 | 1/4 | 45.0 pts | n/a |
| v26 | engine+veto, then model | 100.0% [20.7%–100.0%] 1/1 | 21.4% [7.6%–47.6%] 3/14 | 2 | 2/10 | 1/4 | -5.0 pts | n/a |
| v26 | model alone | 100.0% [20.7%–100.0%] 1/1 | 50.0% [26.8%–73.2%] 7/14 | 1 | 6/10 | 1/4 | 35.0 pts | n/a |
| v28 | engine+veto, then model | 100.0% [20.7%–100.0%] 1/1 | 21.4% [7.6%–47.6%] 3/14 | 2 | 2/10 | 1/4 | -5.0 pts | n/a |
| v28 | model alone | 100.0% [20.7%–100.0%] 1/1 | 35.7% [16.3%–61.2%] 5/14 | 1 | 4/10 | 1/4 | 15.0 pts | n/a |
| claude-zero-shot | engine+veto, then model | 100.0% [20.7%–100.0%] 1/1 | 21.4% [7.6%–47.6%] 3/14 | 2 | 2/10 | 1/4 | -5.0 pts | n/a |
| claude-zero-shot | model alone | 100.0% [20.7%–100.0%] 1/1 | 64.3% [38.8%–83.7%] 9/14 | 4 | 6/10 | 3/4 | -15.0 pts | n/a |

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
| v28 | engine+veto, then model | n/a (0 rows) | 51.5% [35.2%–67.5%] 17/33 | 7 | 11/18 | 6/15 | 21.1 pts | n/a |
| v28 | model alone | n/a (0 rows) | 90.9% [76.4%–96.9%] 30/33 | 0 | 16/18 | 14/15 | -4.4 pts | 0.454 / 0.336 |
| claude-zero-shot | engine+veto, then model | n/a (0 rows) | 36.4% [22.2%–53.4%] 12/33 | 9 | 8/18 | 4/15 | 17.8 pts | n/a |
| claude-zero-shot | model alone | n/a (0 rows) | 78.8% [62.2%–89.3%] 26/33 | 3 | 14/18 | 12/15 | -2.2 pts | n/a |

## Promotion gate (`promote_gate.cjs` decide, product order, two-pass agreement labels) against v2

- v23: HOLD (more wrong actions (9 -> 10))
- v26: HOLD (more wrong actions (9 -> 10))
- v28: HOLD (more wrong actions (9 -> 10))
- claude-zero-shot: HOLD (more wrong Do Its (all: 13 -> 14); more wrong Do Its (he: 8 -> 9); more wrong actions (9 -> 25))

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
