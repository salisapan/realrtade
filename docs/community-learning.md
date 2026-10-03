# Community learning: what is built, what the numbers say, and what is not built

> Written 2026-10-03. Companion to `docs/ai-engine-upgrade.md`, `docs/local-first-principle.md`,
> `docs/product-identity.md`. **Status: dormant. Nothing in the shipped extension sends anything.**

## 1. The idea, and the honest verdict up front

Every device learns a little from its owner (`FlowIntentModel.learn`): sparse numeric nudges to the on-device model, never
text. Across many devices those nudges point the same way for the same phrasings. Sharing them could make the shipped
model better for everyone without anyone's mail leaving the device.

**Verdict from the simulation (section 5): with the privacy noise a real deployment needs, nothing becomes publishable
until tens of thousands of devices take part, and in this simulation even the noiseless case gained nothing measurable (section 5).** It is
built, tested and switched off. Turn it on only when the active-user count makes it worth its privacy cost.

## 2. How it works (all in `core/community.js`, pure and tested)

1. **Allowlist.** Only feature buckets that are common in PUBLIC training text may be shared (`weights.common`, a 2 KB bitset
   built by the trainer from document frequency over the grammar and teacher sentences). Defence in depth: buckets collide,
   so a rare word can land in a common bucket; the noise below is the real guarantee.
2. **Sketch.** The sparse update (speech-act head only) is folded into a count sketch: 3 rows of 683 numbers, random signs.
   Three independent rows and a median at decode time stop two unrelated features that share a cell from being mistaken for
   each other (a single row published about 30 false coordinates for every real one; measured).
3. **Clip.** The sketch (after a public gain of 4 so a device uses its whole budget) is clipped to L2 norm 1. No device moves the
   result by more than that.
4. **Noise.** Gaussian noise is added on the device to every number, with the scale that makes one upload
   (epsilon, delta)-differentially private: the analytic Gaussian mechanism, solved numerically (epsilon 8, delta 1e-6 is
   sigma 0.653). The server refuses uploads claiming less than sigma 0.6, and refuses a sketch with no noise at all.
5. **Server (`netlify/functions/community-learn`).** Stores one noisy sketch per upload, no identifier, no address, no text;
   2 uploads per caller per day by a hashed in-memory key. Returns 503 until `COMMUNITY_ENABLED=1`.
6. **Aggregation (`scripts/community/aggregate-and-publish.cjs`, owner-run).** Mean of the round's sketches; a coordinate is
   published only if its median-of-rows estimate is 5 noise deviations from zero AND at least 200 devices took part
   (k-anonymity); published values are capped like on-device learning. **The canary**: the candidate delta is measured on the fixed audit sets and
   refused if ask or promise precision falls by more than half a point on any set, or recall falls on average. The delta is then
   signed (ECDSA P-256) and stored.
7. **Delivery (`netlify/functions/community-delta`).** Serves the latest signed delta. A device would apply it only after the
   signature verifies against the key in `core/community-key.js` (null until you generate one, so no delta can be applied by default),
   the shape and bounds validate, it is fresh and it is newer than what is applied; the model adds it as a layer
   (`FlowIntentModel.setCommunity`). A published `enabled:false` is a kill switch.

## 3. The privacy claim, stated as strongly as it deserves and no stronger

- Each upload is (epsilon about 8, delta 1e-6)-differentially private with respect to that week's update. **That is a weak
  guarantee**, and it degrades with repetition: weekly uploads over a year compose to a formal epsilon in the hundreds. We
  would describe this as "noisy, clipped, anonymous and unlinkable", NOT as "private by proof".
- Not stored anywhere: mail, text, feature indexes (they are folded and noised), an install id, an account.
  Not controlled by us: the network layer sees an IP address like any web request; Netlify may log it. The function does not.
- Honest-but-curious server: sees only noisy sketches. Malicious devices: bounded by the clip; a Sybil attacker needs a large
  share of the cohort (a third of it moved one coordinate through a plain average in `test/community-corpus.cjs`), rate limits make
  that expensive, and the canary refuses a harmful result. **Measured and reported: coordinate-wise trimming does NOT defend
  against in-bound attackers under this much noise**, so it is off by default.
- Tampering in transit: a delta is signed. Key compromise: needs an extension update to rotate (the key is embedded).

## 4. Chrome Web Store and the product promise

The product says the decision happens on your device. A weekly upload, even noisy, changes what "nothing leaves your device"
means for the people who opt in. Before launch: the privacy page (`privacy.html`), the store listing's data-usage disclosure and the
popup copy must change in the SAME commit as the switch (`docs/design-principles.md`, zero gap between promise and reality).
Draft popup text is already in the (dormant) design: "Off by default. About once a week Glance shares a small block of noisy
numbers describing what its on-device model learned from you: never any text, never an address, never an identifier, and scrambled
on this device before it leaves."

## 5. What the simulation says (`node scripts/intent/community-sim.cjs`, `docs/community-sim.json`)

Setup: the two held-out teacher sets pooled; the even rows are what simulated devices write, each device labelling three asks or
promises the engine missed; the odd rows are a NEW user's mail, never shared. The real code path is used (`learn`, `buildUpdate`,
mean, `decode`). Baseline for the new user: ASK precision/recall 0.99 / 0.888, PROMISE 1.00 / 0.844 (39 of 182 asks and promises missed in the world). Coordinates published per round, by privacy level and device count (the budget per upload is epsilon, delta 1e-6):

| epsilon | 1,000 devices | 5,000 | 20,000 | 80,000 |
|---|---|---|---|---|
| none (oracle) | 2 | 2 | 2 | 2 |
| 16 | 0 | 5 | 85 | 1,952 |
| 8 | 0 | 0 | 6 | 214 |
| 4 | 0 | 0 | 0 | 10 |

What the numbers say, without softening:

- **The new user's recall and precision did not move in any of the 16 runs**, not even the noiseless oracle at 80,000 devices. Measured gain from community learning in this simulation: zero.
- **Whenever anything was published, blind-set ASK precision fell from 1.00 to 0.97.** That is the failure the canary exists to refuse (precision loss above half a point); it is refused in the aggregator, so nothing would have shipped. It is also why a delta must never be applied without the canary.
- **Noise decides when anything appears at all:** epsilon 8 needs about 20,000 devices to publish a handful of coordinates, epsilon 4 needs more than 80,000.
- Caveats: a small world (the two teacher sets pooled, written by a model), three labelled misses per device, one seed per cell. This is a mechanism check, not a forecast of real traffic; real devices will see more varied phrasings, which could help or hurt.

Conclusion: keep it dormant. The mechanism is sound and tested, but there is nothing here worth the privacy cost, and the product should not say it "learns from the community".

## 6. What is built, and what is NOT

Built and tested (`test/community-corpus.cjs`, the two function tests, `scripts/community/lib.cjs`): the mathematics, the model layer, the
allowlist, the server endpoints (dormant), the migration (`supabase/migrations/20261003000000_community_learning.sql`, **not applied**:
the Supabase project stays paused without your OK), the aggregator, canary, signing and key generation, the simulation.

**NOT built: the on-device wiring** (the content-script upload and fetch, the service-worker relay for the two fixed endpoints, the storage
fields, the manifest entries and the popup switch). While building it, the Claude Code safety classifier refused the file-writing command
that would have added them, without giving a reason. I did not retry it in pieces or by another route. It is a feature that makes the
extension send derived data about the user's mail to a server, so it should be your explicit call: if you want it, tell me to build the
client wiring and I will, with the product switch still off.

## 7. Launch checklist (only when the user count justifies it)

1. Decide the privacy position (section 4) and write the privacy, store and popup copy.
2. Restore Supabase (your OK), apply the migration, set `SUPABASE_SERVICE_ROLE_KEY` and `COMMUNITY_ENABLED=1` on Netlify.
3. `node scripts/community/generate-keys.cjs`; commit the public key; keep the private key as `COMMUNITY_PRIVATE_KEY_PEM`.
4. Build the client wiring (section 6), set `FlowCommunity.ENABLED` and the worker's `COMMUNITY_BUILD_ENABLED` to true, release.
5. Per round: `aggregate-and-publish.cjs --round N --dry-run` and read the report (cohort size, published count, canary), then publish.
6. Monitor cohort size, published counts, canary results and `closureQuality` (reopened loops) after each release.

## 8. Decisions for the owner

- Build the client wiring now (dormant), later, or never?
- Wait for the user count the simulation says is needed, or consider a different route: an explicit, per-sentence "teach Glance this
  one" donation of a MASKED sentence (not differentially private, but consented item by item and worth thousands of times more per
  contribution). It changes the promise more visibly, and it is your call.
- Who holds the signing key.
