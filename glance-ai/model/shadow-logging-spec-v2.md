# Real-traffic shadow logging, v2: engineering spec (Glance extension + Glance cloud)

> Design only, 2026-10-08. Nothing here is built in `salisapan/realrtade`. This replaces `shadow-logging-spec.md` (v1, kept unchanged). What changed since v1:
> - the candidate runs **on-device in shadow** (JS runtime, packed weights);
> - consent is tiered;
> - user actions are logged as weak labels;
> - there is an explicit kill switch;
> - there is a numeric Gate for each stage (shadow → veto-only → primary).
>
> **Deployment scope:** Glance is the personal product. Its model and all server pieces run on **Glance's own cloud**. Flow, the org product, can deploy on a customer's server (EDGE) or on our cloud. Flow is **out of scope** here and needs its own spec, because data residency, consent owner and kill-switch authority all differ.

## 0. Invariants (each one must hold in every stage)

1. **Off by default.** With `consent.shadow` off, the shadow code path logs nothing, computes nothing and counts nothing.
2. **No raw body or subject leaves the device** unless the user turned on the text tier (§2, tier C) *and* confirmed that specific item.
3. **The shadow candidate never changes what the user sees** in stage 1. Each later stage can only do what its Gate allows: veto-only can only *remove* a card.
4. **Silence beats a wrong Do It.** Every promotion metric puts wrong-Do-It first, and every rollback trigger fires on it.
5. **The kill switch wins** over every other setting (§7).

## 1. Where it hooks

- **Trigger:** after each `FlowIncomingJudge.judge(...)` result on all three surfaces: the Gmail chip, the OWA card and the Graph planner. It also runs on the engine's own silences (`own-sender`, `note-to-self`, `quiet:*`, `too-short`, …), so silence is measured too.
- **Message flow:** the content script posts `{judgeResult, caseLite}` to the service worker over `chrome.runtime.sendMessage`. `caseLite` is the surface, direction, `to`/`cc` *roles* (to / cc-only / none, never addresses), attachment count, subject and own text. Own text means the quote-stripped text the engine already computed. Both own text and subject stay in memory only: they are used to featurize, then dropped.
- **Off the UI path.** Shadow work starts only after the card or chip has rendered, using `requestIdleCallback` in the content script, or a queued task in the service worker.
- **Time budget per message:** 30 ms p95 and 100 ms hard. Over 100 ms, the record gets `candidate: null, reason: "timeout"`.
- **Failures:** any exception is swallowed and counted (`shadow.err`). It never surfaces to the user.

## 2. Consent (popup → Settings → "Help improve Glance")

| tier | key (chrome.storage.local) | default | what it allows |
|---|---|---|---|
| A, local shadow | `consent.shadow` | **off** | Run the candidate on-device and keep records **only in local storage**. Local metrics page. Nothing is uploaded. |
| B, shadow upload | `consent.shadowUpload` (requires A) | **off** | Upload **decision records**: enums, numbers, hashes. No features, no text. |
| C, training data | `consent.training` (requires A) | **off** | B, plus hashed **feature vectors**. In addition, the user can share **redacted text one item at a time** from the "Was this right?" flow. Each share is a separate confirm tap showing the exact redacted text. |

Rules:
- Every tier change writes `consent.log += {tier, on, version: "shadow-consent-v2", ts}`.
- The copy is versioned (HE + EN). If the copy version changes materially, every tier resets to off.
- **Turning A off:**
  - purges the local shadow store and the upload queue;
  - sends `DELETE /v1/shadow/install/{shadowId}` if tier B or C was ever on;
  - rotates `shadowId`.
- **Uninstalling** removes all local data, since it is all extension storage.
- The copy says it plainly: hashed features are *pseudonymous, not anonymous*. Someone holding our vocabulary could partly reverse them, which is why they stay on tier C only.

## 3. What is logged (record schema `glance-shadow/2`)

```jsonc
{ "v": 2, "ts": "2026-10-08T09:12:44Z", "ext": "0.9.36", "shadowId": "rand128 (per install, rotates on consent-off)",
  "msgKey": "HMAC-SHA256(localSecret, surface + messageId)",   // join key for outcomes; localSecret never leaves the device
  "surface": "gmail|outlook", "direction": "inbound|outbound|self", "lang": "he|en|mixed", "shape": "bare|mail",
  "attachmentCount": 0, "rcpt": "to|cc-only|none", "voc": "own|other|group|none", "subjPrefix": true, "lenBucket": 3,
  "incumbent": { "engine": "0.9.35", "show": true, "reason": "show|<silence reason>", "label": "<family>|<step>|SILENT", "normalizedFlip": false },
  "candidate": { "model": "v21@<sha8>", "label": "SILENT|<family>|<step>", "top": "<family>|<step>", "pShow": 0.912, "pLabel": 0.88,
                 "tau": 0.96, "floorBlocked": false, "veto": "base:<r>|product:<r>|cap:<r>|null", "ms": 7 },
  "outcome": { "shown": true, "doIt": false, "fetchedBack": null, "dismiss": false, "undo": false, "ignored": null, "implicit": null },
  "features": [/* hashed indices, 2^17 space, featurize-v21.cjs: tier C only; never with tier B alone */] }
```

- **Never logged:** the body, the subject, sender or recipient addresses, names, the message id, attachment names, URLs, amounts or dates.
- Facts reach the model only as features. `incumbent.normalizedFlip` records whether the engine's decision changes when normalize-v21 runs in front of it. That tracks the formatting bug in production without logging any text.
- **Enum guard (client).** The uploader serializes from an allowlist schema. Strings must be one of the enums above, an id/hash (≤ 64 chars, `[a-z0-9:@|._-]`) or a model tag. Anything else drops the record and increments `shadow.schemaReject`. A unit test feeds a body string into every field and asserts that it never serializes.
- **Weak labels from user actions.** These come from the existing receipt and Undo paths, joined by `msgKey`:

| event | source | weak label |
|---|---|---|
| Do It clicked + `fetchedBack: true` + no Undo within 10 min | receipt path | **positive** for `incumbent.label` (strong weak label) |
| Do It + Undo ≤ 10 min | undo path | **negative** (wrong Do It or wrong action) |
| Do It + `fetchedBack: false` | receipt path | execution failure. Not a judgment label. Excluded. |
| Dismiss (×) | card UI | **negative-ish**: the card was unwanted (weight 0.5) |
| Card shown, no interaction, thread left or archived within 24 h | DOM/thread observer | **ignored**: weak negative (weight 0.25). `ignored: true` |
| No card, and the user replied, created an event or saved the attachment within 48 h on that thread | `implicit` (optional, phase 2) | weak positive for "a close existed" |

Notes:
- The candidate never shows a card in stage 1. On model-only shows (engine silent, model would show), the only weak signal is `implicit`. Those rows go to the owner queue first (§8).
- Weak labels are *never* used as Gate evidence on their own. They rank the queue and serve as canary metrics only.

## 4. How the model runs in shadow (on-device JS)

**Pipeline:** identical to `runtime/glance-close-v21.cjs`. The extension port must not fork it.
1. `normalize-v21` (CRLF, nbsp, zero-width, bidi).
2. The engine result the extension *already computed*. Reuse it, don't re-run the engine. It supplies the base veto, the quote-stripped own text and the facts.
3. `featurize-v21.cjs` (the same file, bundled).
4. Gate LR → τ per `label@shape` → chooser floor → product veto (`product-rules.cjs`, bundled) → cap veto.

**Weights:**
- Packed binary from `runtime/pack-weights-v21.cjs`: `artifacts/v21.p0.glw` = **364 KB** (220 KB gzipped). It is lossless (6,982/6,982 identical decisions to the JSON runtime), against a **871 KB budget**.
- The JSON form is 1.62 MB and must not ship.
- `p1` (243 KB) changes 6/6,982 decisions. Use it only if the budget tightens.

**Loading:**
- The weights ship **inside the extension package** as data. MV3 forbids remotely hosted code, and weights-as-data in the package avoids that question entirely.
- A new model version ships with an extension release.
- A remote weights download is phase 2 only, and only as signed data: an Ed25519 signature checked against a key pinned in the extension, plus a sha256 in the remote config.
- Weights are loaded lazily on the first judged message after consent, then cached in service-worker memory.

**Memory:**
- Do **not** expand to dense `Float32Array(131072)` per class. The current Node runtime does that, which is ~4.7 MB for 9 rows.
- Instead keep a sparse sorted `Uint32Array` idx plus an `Int8Array` q per row and look features up by binary search. About 0.5 MB resident and ~20 µs per message.
- Alternative: one dense `Int8Array` per row (1.2 MB).

**Parity gate (CI):**
- The extension build runs `parity-check-v21` against fixed fixtures and needs ≥ 99.9% identical decisions vs the Python reference.
- The featurizer hash (FNV-1a) must match bit for bit. There is a test vector file of 200 strings → index lists.

**Server-side scoring (Glance cloud):**
- Used for re-scoring tier-C feature vectors with new candidate versions, offline. It is not used live.
- The ONNX files (`v21.gate.onnx`, `v21.chooser.onnx`) run there.

## 5. Storage and retention

**Device:**
- IndexedDB database `glance-shadow`, with stores `records`, `queue` and `outcomes`.
- Ring buffer capped at **5,000 records or 30 days**, whichever comes first.
- Records are encrypted at rest with AES-GCM under a non-extractable WebCrypto key kept in IndexedDB. This defends against casual export or inspection. It is not a defence against malware.
- The "Clear shadow data" button purges everything immediately.

**Glance cloud:**
- Postgres on Glance's own cloud project (region EU), in table `shadow_records` (B) plus `shadow_features` (C), and object storage for redacted per-item shares (C).
- Retention:
  - decision records: **180 days**;
  - feature vectors: **12 months**, or until consent is withdrawn;
  - redacted text shares: deleted **30 days after the owner labels them**, and in any case after 90 days.
- `DELETE /v1/shadow/install/{shadowId}` hard-deletes every row for that install within 24 h. A nightly job verifies this.
- Access: model-team service role only. Every read is audit-logged. No analytics/BI copies of tier-C data.

## 6. Upload path (tiers B/C only)

**Request:**
- `POST https://api.<glance-cloud>/v1/shadow/batch`
- Body: gzip JSON `{schema: "glance-shadow/2", shadowId, batchId (uuid, idempotency key), records: [...]}`
- Batches go up every 6 h or every 200 records, only when online and the browser is idle. Max 500 records / 256 KB per batch.

**Auth:**
- If the user is signed in to Glance: the existing Glance session token.
- Otherwise: a per-install bearer token minted by `POST /v1/shadow/register`, bound to `shadowId`.
- The server never receives a Google or Microsoft token, address or message id.

**Server guard:**
- JSON-schema validation using the same allowlist as the client.
- Any string field that fails its enum/regex → the **whole batch is rejected** (422), and `schema_violation` is logged *without* storing the payload.
- Per-install rate limit: 5k records/day.

**Retries:** exponential backoff (1 min → 6 h). The queue is capped at 2,000 records, oldest dropped first, and is never uploaded once consent B is off.

## 7. Kill switch (any layer stops shadow; the most restrictive wins)

1. **Remote config.**
   - `GET /v1/config/shadow` every 6 h returns a signed JSON: `{enabled, uploadEnabled, modelAllowlist: ["v21@<sha8>"], sampleRate, maxMsP95}`. It is cached.
   - If config has *never* been fetched, the state is off.
   - If it has been unreachable for more than 72 h, upload stops and local logging continues.
   - `enabled:false` → stop computing and stop logging. Upload of the existing queue is controlled separately by `uploadEnabled`.
2. **Server refusal.** A `410 {disable: true, purge: true}` from the batch endpoint makes the client disable upload and purge the queue.
3. **Client tripwires (automatic, per install).** Shadow self-disables for 7 days and increments a counter when:
   - candidate runtime p95 > `maxMsP95` (default 50 ms) over 200 messages;
   - error rate > 1%;
   - weights fail the sha256 check;
   - service-worker memory grows by more than 20 MB.
4. **User toggle** (tier A off), with the purge described in §2.
5. **Release.** Shipping an extension version without the module removes it entirely.

Stage 2/3 behaviour (veto or primary) sits behind its own flags (`vetoEnabled`, `primaryEnabled`) in the same signed config. Turning a flag off reverts to engine-only on the next config fetch, or immediately via a push message if the user has the side panel open.

## 8. Owner label queue (feeds `../labeling/owner-gold.jsonl`)

**Priority order** (~20 per day for Sali):
1. Model would show, engine silent. This is the potential model wrong-Do-It, or an engine recall gap: exactly the "unsure" region that separates the masked from the STRICT metric.
2. Engine shows, model silent. This is a potential engine wrong-Do-It, and it is the evidence for veto-only.
3. Undo or dismiss events.
4. A wrong-action disagreement: both show, but with different `family|step`.
5. A random 10% of agreements, stratified by lang × shape.

**What the owner sees:** text exists only on the device. The queue item is shown **locally** in the side panel, with the redacted own text the extension can re-read from the open thread. The label, `{msgKey, ownerLabel, ts}`, is uploaded under tier B. The text goes up only under tier C with a per-item confirm.

## 9. Metrics (computed nightly on Glance cloud from tier-B records + owner labels; offline harness = `shadow/run-shadow-v21.cjs`)

- **wrong-Do-It (owner)** = shows where the owner label is SILENT ÷ owner-labeled SILENT rows. Reported per stage, lang and shape, with a Wilson 95% interval. Engine-silent/model-show rows are weighted by inverse sampling rate.
- **Do-It precision (owner)** = shows whose owner label equals the shown `family|step` ÷ all owner-labeled shows.
- **missed-close (owner)** = SILENT on rows whose owner label is a close ÷ owner-labeled closes.
- **wrong action** = shown `family|step` ≠ owner `family|step`, as a share of owner-labeled closes. **wrong step** = shown step ≠ owner step: draft / task / calendar / file_save.
- **Weak (no owner label needed):**
  - Undo rate = Undo ÷ Do It;
  - dismiss rate;
  - Do-It-to-fetchedBack success;
  - engine/model agreement;
  - veto hit rate by veto reason;
  - `normalizedFlip` rate;
  - p95 latency and error rate.

## 10. Promotion Gates

**Stage 0 → 1, shadow on (log only).** Status: offline evidence exists for v2/v2.1, but tier-A code is not built.
- Offline on held-out data:
  - masked wrong-Do-It ≤ 0.29%;
  - STRICT not worse than the previous candidate;
  - adversarial wrong-Do-It = 0;
  - JS/Python parity ≥ 99.9%.
- Weights ≤ 871 KB.
- Runtime p95 ≤ 30 ms on a mid-range laptop.
- Privacy review of the §3 schema and the client/server enum guard tests pass.

**Stage 1 → 2, veto-only (the model may remove an engine card; it never adds one).** Every condition must hold:
- **G2.1:** at least 14 days of shadow, ≥ 5,000 judged messages and ≥ 1,000 engine shows, across ≥ 1 HE-heavy and ≥ 1 EN-heavy account.
- **G2.2:** ≥ 200 owner labels in total, of which ≥ 60 are on engine-show / model-silent disagreements.
- **G2.3:** on those disagreements, veto precision (owner says the engine card was wrong) ≥ 0.85, with a Wilson 95% lower bound ≥ 0.75.
- **G2.4:** among engine cards the model would veto, the strong-positive rate (Do It + fetchedBack + no Undo) is ≤ ⅓ of the rate on non-vetoed engine cards.
- **G2.5:** the veto removes ≤ 15% of engine shows overall, and ≤ 20% in any single lang × surface.
- **G2.6:** no tripwire fired on more than 1% of installs.

**Stage 2 → 3, primary (model + rule veto decide; the model may show where the engine is silent).** Every condition must hold:
- **G3.1:** at least 14 days at stage 2, and ≥ 500 owner labels in total, including ≥ 150 on model-show/engine-silent rows. Batch-001 items 1–8 count here.
- **G3.2:** owner wrong-Do-It ≤ 0.29% (point estimate) with a Wilson upper bound ≤ 1.0%. Do-It precision on model-only shows ≥ 0.97, with a lower bound ≥ 0.93.
- **G3.3:** owner missed-close ≤ the engine's + 5 pts overall, and ≤ the engine's in Hebrew.
- **G3.4:** owner wrong action ≤ 2.0% of closes, and wrong step ≤ 0.5%.
- **G3.5:** canary to opted-in installs at 5% → 25% → 100%, each step ≥ 7 days and ≥ 300 shown cards. At each step:
  - Undo rate ≤ 1.2× the engine baseline;
  - dismiss rate ≤ the engine baseline + 2 pts;
  - fetchedBack success ≥ 98%.

**Automatic rollback (stage 2 or 3 → engine-only via §7):**
- Undo rate > 1.5× baseline over 200 cards;
- any owner-confirmed wrong Do It on a payment or send-to-third-party action;
- error rate > 1%.

## 11. Build checklist (Dima)

1. A `shadow/` module in the extension: content-script hook, service-worker runner, IndexedDB store, outcome joiner.
2. Ports of `normalize-v21`, `featurize-v21`, `product-rules`, `veto-v2` and the packed-weights reader, with the parity test vectors in CI.
3. Consent UI (HE + EN) with tiers A/B/C, the consent log and the purge path.
4. Uploader with allowlist serializer and schema tests; the server endpoints `register`, `batch`, `DELETE install` and `config`, with signed config.
5. Nightly metrics job plus the owner-queue export to the side panel.
6. Kill-switch drills before stage 1: remote off, 410 purge, tripwire.
