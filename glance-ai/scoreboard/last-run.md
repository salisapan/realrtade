# Glance model scoreboard

Lab only. Labels are never owner-verified unless the first source below says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 407)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 9.6% [5.7%–15.7%] 13/136 (0 undated) | 50.7% [39.2%–62.2%] 35/69 | 8 | 16/26 | 19/43 | 17.4 pts | n/a |
| v2 | engine+veto, then model | 11.0% [6.8%–17.4%] 15/136 (2 undated) | 49.3% [37.8%–60.8%] 34/69 | 7 | 16/26 | 18/43 | 19.7 pts | n/a |
| v2 | model alone | 1.5% [0.4%–5.2%] 2/136 | 84.1% [73.7%–90.9%] 58/69 | 3 | 22/26 | 36/43 | 0.9 pts | 0.141 / 0.192 |
| v26 | engine+veto, then model | 9.6% [5.7%–15.7%] 13/136 (0 undated) | 37.7% [27.2%–49.5%] 26/69 | 7 | 13/26 | 13/43 | 19.8 pts | n/a |
| v26 | model alone | 0.7% [0.1%–4.0%] 1/136 | 69.6% [57.9%–79.2%] 48/69 | 3 | 19/26 | 29/43 | 5.6 pts | 0.127 / 0.155 |
| v28 | engine+veto, then model | 11.8% [7.4%–18.3%] 16/136 (3 undated) | 37.7% [27.2%–49.5%] 26/69 | 7 | 13/26 | 13/43 | 19.8 pts | n/a |
| v28 | model alone | 2.2% [0.8%–6.3%] 3/136 | 68.1% [56.4%–77.9%] 47/69 | 2 | 19/26 | 28/43 | 8.0 pts | 0.144 / 0.163 |
| v3a | engine+veto, then model | 9.6% [5.7%–15.7%] 13/136 (0 undated) | 39.1% [28.5%–50.9%] 27/69 | 7 | 12/26 | 15/43 | 11.3 pts | n/a |
| v3a | model alone | 0.7% [0.1%–4.0%] 1/136 | 71.0% [59.4%–80.4%] 49/69 | 3 | 18/26 | 31/43 | -2.9 pts | 0.121 / 0.156 |
| v3b | engine+veto, then model | 11.0% [6.8%–17.4%] 15/136 (2 undated) | 46.4% [35.1%–58.0%] 32/69 | 7 | 13/26 | 19/43 | 5.8 pts | n/a |
| v3b | model alone | 2.2% [0.8%–6.3%] 3/136 | 79.7% [68.8%–87.5%] 55/69 | 3 | 19/26 | 36/43 | -10.6 pts | 0.156 / 0.155 |

## single blind pass (Claude, NOT owner-verified) (n = 463)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 9.6% [5.7%–15.7%] 13/136 (0 undated) | 49.3% [38.2%–60.5%] 36/73 | 9 | 16/27 | 20/46 | 15.8 pts | n/a |
| v2 | engine+veto, then model | 11.0% [6.8%–17.4%] 15/136 (2 undated) | 47.9% [36.9%–59.2%] 35/73 | 8 | 16/27 | 19/46 | 18.0 pts | n/a |
| v2 | model alone | 1.5% [0.4%–5.2%] 2/136 | 80.8% [70.3%–88.2%] 59/73 | 3 | 22/27 | 37/46 | 1.0 pts | 0.121 / 0.179 |
| v26 | engine+veto, then model | 9.6% [5.7%–15.7%] 13/136 (0 undated) | 37.0% [26.8%–48.5%] 27/73 | 9 | 13/27 | 14/46 | 17.7 pts | n/a |
| v26 | model alone | 0.7% [0.1%–4.0%] 1/136 | 68.5% [57.1%–78.0%] 50/73 | 4 | 20/27 | 30/46 | 8.9 pts | 0.103 / 0.143 |
| v28 | engine+veto, then model | 11.8% [7.4%–18.3%] 16/136 (3 undated) | 37.0% [26.8%–48.5%] 27/73 | 9 | 13/27 | 14/46 | 17.7 pts | n/a |
| v28 | model alone | 2.2% [0.8%–6.3%] 3/136 | 65.8% [54.3%–75.6%] 48/73 | 3 | 19/27 | 29/46 | 7.3 pts | 0.123 / 0.15 |
| v3a | engine+veto, then model | 9.6% [5.7%–15.7%] 13/136 (0 undated) | 38.4% [28.1%–49.8%] 28/73 | 9 | 12/27 | 16/46 | 9.7 pts | n/a |
| v3a | model alone | 0.7% [0.1%–4.0%] 1/136 | 68.5% [57.1%–78.0%] 50/73 | 4 | 18/27 | 32/46 | -2.9 pts | 0.107 / 0.144 |
| v3b | engine+veto, then model | 11.0% [6.8%–17.4%] 15/136 (2 undated) | 45.2% [34.3%–56.6%] 33/73 | 9 | 13/27 | 20/46 | 4.7 pts | n/a |
| v3b | model alone | 2.2% [0.8%–6.3%] 3/136 | 76.7% [65.8%–84.9%] 56/73 | 4 | 19/27 | 37/46 | -10.1 pts | 0.132 / 0.143 |

## owner-convention, rule-derived (C-4: an undated ask gets a Do It; NOT agreement, NOT owner-verified) (n = 37)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | n/a (0 rows) (0 undated) | 38.1% [20.8%–59.1%] 8/21 | 7 | 4/10 | 4/11 | 3.6 pts | n/a |
| v2 | engine+veto, then model | n/a (0 rows) (0 undated) | 38.1% [20.8%–59.1%] 8/21 | 7 | 4/10 | 4/11 | 3.6 pts | n/a |
| v2 | model alone | n/a (0 rows) | 100.0% [84.5%–100.0%] 21/21 | 0 | 10/10 | 11/11 | 0.0 pts | n/a |
| v26 | engine+veto, then model | n/a (0 rows) (0 undated) | 38.1% [20.8%–59.1%] 8/21 | 7 | 4/10 | 4/11 | 3.6 pts | n/a |
| v26 | model alone | n/a (0 rows) | 100.0% [84.5%–100.0%] 21/21 | 0 | 10/10 | 11/11 | 0.0 pts | n/a |
| v28 | engine+veto, then model | n/a (0 rows) (0 undated) | 38.1% [20.8%–59.1%] 8/21 | 7 | 4/10 | 4/11 | 3.6 pts | n/a |
| v28 | model alone | n/a (0 rows) | 100.0% [84.5%–100.0%] 21/21 | 0 | 10/10 | 11/11 | 0.0 pts | n/a |
| v3a | engine+veto, then model | n/a (0 rows) (0 undated) | 38.1% [20.8%–59.1%] 8/21 | 7 | 4/10 | 4/11 | 3.6 pts | n/a |
| v3a | model alone | n/a (0 rows) | 100.0% [84.5%–100.0%] 21/21 | 0 | 10/10 | 11/11 | 0.0 pts | n/a |
| v3b | engine+veto, then model | n/a (0 rows) (0 undated) | 38.1% [20.8%–59.1%] 8/21 | 7 | 4/10 | 4/11 | 3.6 pts | n/a |
| v3b | model alone | n/a (0 rows) | 100.0% [84.5%–100.0%] 21/21 | 0 | 10/10 | 11/11 | 0.0 pts | n/a |

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
