# Glance model scoreboard

Lab only. Labels are never owner-verified unless the first source below says so. Rates: value [95% Wilson interval] k/n.

## owner-verified (n = 0)
No rows. Phase 0 needs path A (own-use labels with read-back proof) to fill this source.

## two-pass agreement (NOT owner-verified) (n = 444)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 16.1% [11.3%–22.6%] 26/161 (13 undated) | 50.7% [39.2%–62.2%] 35/69 | 8 | 16/26 | 19/43 | 17.4 pts | n/a |
| v2 | engine+veto, then model | 18.0% [12.8%–24.7%] 29/161 (16 undated) | 49.3% [37.8%–60.8%] 34/69 | 7 | 16/26 | 18/43 | 19.7 pts | n/a |
| v2 | model alone | 1.9% [0.6%–5.3%] 3/161 | 84.1% [73.7%–90.9%] 58/69 | 3 | 22/26 | 36/43 | 0.9 pts | 0.159 / 0.205 |
| v23 | engine+veto, then model | 18.0% [12.8%–24.7%] 29/161 (16 undated) | 44.9% [33.8%–56.6%] 31/69 | 7 | 14/26 | 17/43 | 14.3 pts | n/a |
| v23 | model alone | 1.9% [0.6%–5.3%] 3/161 | 81.2% [70.4%–88.6%] 56/69 | 2 | 21/26 | 35/43 | -0.6 pts | 0.162 / 0.172 |
| v26 | engine+veto, then model | 16.1% [11.3%–22.6%] 26/161 (13 undated) | 37.7% [27.2%–49.5%] 26/69 | 7 | 13/26 | 13/43 | 19.8 pts | n/a |
| v26 | model alone | 0.6% [0.1%–3.4%] 1/161 | 69.6% [57.9%–79.2%] 48/69 | 3 | 19/26 | 29/43 | 5.6 pts | 0.155 / 0.164 |

## single blind pass (Claude, NOT owner-verified) (n = 500)

| model | order | 1 wrong Do It (of them undated asks) | 2 missed | 3 wrong action | HE missed | EN missed | 6 HE−EN missed gap | 5 ECE / Brier (gate) |
|---|---|---|---|---|---|---|---|---|
| engine-only | engine+veto, then model | 16.1% [11.3%–22.6%] 26/161 (13 undated) | 49.3% [38.2%–60.5%] 36/73 | 9 | 16/27 | 20/46 | 15.8 pts | n/a |
| v2 | engine+veto, then model | 18.0% [12.8%–24.7%] 29/161 (16 undated) | 47.9% [36.9%–59.2%] 35/73 | 8 | 16/27 | 19/46 | 18.0 pts | n/a |
| v2 | model alone | 1.9% [0.6%–5.3%] 3/161 | 80.8% [70.3%–88.2%] 59/73 | 3 | 22/27 | 37/46 | 1.0 pts | 0.14 / 0.191 |
| v23 | engine+veto, then model | 18.0% [12.8%–24.7%] 29/161 (16 undated) | 43.8% [33.0%–55.2%] 32/73 | 8 | 14/27 | 18/46 | 12.7 pts | n/a |
| v23 | model alone | 1.9% [0.6%–5.3%] 3/161 | 79.5% [68.8%–87.1%] 58/73 | 2 | 22/27 | 36/46 | 3.2 pts | 0.137 / 0.159 |
| v26 | engine+veto, then model | 16.1% [11.3%–22.6%] 26/161 (13 undated) | 37.0% [26.8%–48.5%] 27/73 | 9 | 13/27 | 14/46 | 17.7 pts | n/a |
| v26 | model alone | 0.6% [0.1%–3.4%] 1/161 | 68.5% [57.1%–78.0%] 50/73 | 4 | 20/27 | 30/46 | 8.9 pts | 0.131 / 0.152 |

4 Proof rate: n/a. No own-use data with `fetchedBack` read-back is available to the lab yet (path A, `docs/glance-ai/learning-from-use.md`).
7 Cost and latency: n/a. The device model runs in the extension runtime; cloud cost per close needs the M6 measurement (`docs/glance-ai/ai-product.md`).
