# Glance cloud: cost per person (M6 model, no model called)

Measured: **19%** of mail reaches Tier 2 (150/796, Router v2 on the lab mix). Judge prompt 3058 characters.
Assumed: a real mail of 1500 characters, 3 characters per token, 250 output tokens, 1s per call on one L4. So about 1519 input tokens per call.
Prices: search results of 2026-10-12, not verified on the providers' pages.

| host | per 1,000 cloud calls | per person per month at 30 / 100 / 300 mails a day |
|---|---|---|
| Managed endpoint, pay per token (DeepInfra list price for Qwen3.5-4B) | $0.08 | $0.01 / $0.05 / $0.14 |
| Managed endpoint, pay per token (Fireworks list price, non-reasoning 4B) | $0.35 | $0.06 / $0.20 / $0.60 |
| Serverless GPU, pay per second (Modal L4 ~$0.80/h) | $0.22 | $0.04 / $0.13 / $0.38 |
| Serverless GPU, pay per second (Runpod L4 ~$0.39/h) | $0.11 | $0.02 / $0.06 / $0.18 |
| Dedicated L4 always on (Runpod ~$0.39/h) | fixed $280.80 a month | the same fixed cost shared by every user (one L4 serves many people) |

Sources: deepinfra.com/blog/qwen3-5-4b-deepinfra-benchmarks; artificialanalysis.ai/models/qwen3-5-4b/providers; pricepertoken.com/pricing-page/model/qwen-qwen3.5-4b; computeprices.com/providers/modal/gpus/l4; cerebrium.ai/blog/2026-gpu-buyers-guide; runpod.io/gpu-cloud/pricing (tracker figure).

Not in these numbers: cold starts on serverless GPU, retries, the allowance re-check on the server, and the device model (Tier 1), which takes calls off the cloud when present.
