# Glance shadow tier (tier A, local only): drop-in package, v2.2

For Dima. This is **Glance** (the extension + Glance cloud). It is not Flow.

**Status:** built and tested offline (2026-10-08). It is not in the repo, and nothing here changes what the user sees. It implements `shadow-logging-spec-v2.md` tier A: candidates run on-device, and records stay in local storage. Upload (tier B), features (tier C) and the remote-config fetcher are **not** part of this package.

## What ships (copy these into the extension, e.g. `shadow/`)

| file | where it runs | bytes | role |
|---|---|---|---|
| `src/gs-text.js` | content script | 11,442 | normalize-v21, `cleanText` / `stripBoilerplate`, FNV-1a, `norm`, addressee, product-rule regexes |
| `src/gs-features.js` | content script | 9,131 | featurizer v2 + v2.1 (bit-identical to `train/featurize-v2.cjs` / `-v21.cjs`) |
| `src/gs-prepare.js` | content script | 11,616 | engine adapter: re-runs the judge on the normalized body (base veto), computes facts, own text, `x2` / `x21` and veto inputs. Output is a **text-free** ShadowInput |
| `src/gs-hook.js` | content script | 2,638 | `GlanceShadow.afterJudge(...)`: pre-gate, idle callback, `sendMessage` |
| `src/gs-model.js` | service worker | 5,708 | glw/1 reader, sparse int8 scorer, `decide()` for v2 / v2.1 |
| `src/gs-log.js` | service worker | 21,403 | kill switch, consent, glance-shadow/2 records, enum guard, IndexedDB ring buffer, AES-GCM, tripwires, outcome joiner |
| `src/gs-sw.js` | service worker | 5,577 | runner: gate → lazy weights load with sha256 check → both models → records |
| `weights/v2.p0.glw` | SW (data) | 302,981 | v2 = **primary** candidate (lossless int8, glw/1) |
| `weights/v21.p0.glw` | SW (data) | 363,730 | v2.1 = **second** candidate (byte-identical to `artifacts/v21.p0.glw`) |
| `weights/manifest.json` | SW (data) | 584 | sha256 + model tag per file (`v2@a75d2884`, `v21@8d75a0cc`) |
| **total** | | **734,810** | vs the **871,000** budget: 136 KB headroom. 433 KB gzipped |

Not shipped: `tools/` (packer, size check), `test/`, `bench/`.

**Packaging rules:**
- Every file is plain JS.
- There is no `eval`, no `Function`, no remote URL, no XHR/WebSocket and no `importScripts`. A test checks this.
- Each file loads in three ways:
  - as a classic content script;
  - as a side-effect `import` in the module service worker, the same pattern `background.js` already uses for `core/*.js`;
  - via `require` in Node.
- Weights are package data, loaded with `fetch(chrome.runtime.getURL(...))`. `packagedLoader` refuses any URL outside `chrome-extension://<own id>/`.

## Wiring (4 edits)

### 1. Content scripts

Add these after the core files, in both the Gmail `content_scripts[0].js` list and Outlook `SURFACES.outlook.extra` in `background.js`:

```
"shadow/gs-text.js", "shadow/gs-features.js", "shadow/gs-prepare.js", "shadow/gs-hook.js"
```

They must load **after** `core/*.js`, because `gs-prepare` reads `FlowIncomingJudge`, `FlowGoogleCloses`, `FlowOutlookCalendar`, `FlowGraphMail`, `FlowExtract`, `FlowJudgment` and `FlowFileAttach` from globals. On the Gmail page `FlowOutlookCalendar` / `FlowGraphMail` may be absent. The adapter then takes the Gmail branch, which is exactly what the offline engine does.

### 2. Hook: right after the judge verdict, on show AND on silence

Do this **after** the chip or card has rendered (or the silence was recorded):

```js
GlanceShadow.afterJudge(
  { surface: 'outlook' /* or 'gmail' */, direction: 'inbound' /* 'outbound' | 'self' */,
    from: { name, email }, to: [addr...], cc: [addr...], subject, body: own, attachmentCount },
  r,                                   // the FlowIncomingJudge.judge(...) result you already have (no re-run for the incumbent)
  { messageId, ownEmail, ownNames: [displayName, firstName, hebrewName], engineVersion: chrome.runtime.getManifest().version });
```

Hook points:
- **Outlook:** `src/content-outlook.js`, right after `const r = FlowIncomingJudge.judge({...})` (0.9.39 line ~276), with `body: own`.
- **Gmail:** the path that turns the newest message (`judgeAt`) into the chip, or the silence recorded at `FlowStorage.recordSilence({ messageId, reason })` (0.9.39 `content-gmail.js` ~2063).

What `afterJudge` does:
- It reads `chrome.storage.local` first. If `shadow.kill`, consent off, no verified config, an active tripwire, or the message is sampled out, it returns **without computing anything**.
- Otherwise it defers to `requestIdleCallback`, builds the ShadowInput and posts `{type: 'glance-shadow/input', si}`.
- It swallows every exception.

### 3. Service worker (`src/background.js`)

```js
import '../shadow/gs-model.js'; import '../shadow/gs-log.js'; import '../shadow/gs-sw.js';
import SHADOW_MANIFEST from '../shadow/weights/manifest.json' with { type: 'json' };   // or fetch it once via getURL
const shadow = GlanceShadow.sw.createRunner({ manifest: SHADOW_MANIFEST, loadWeights: GlanceShadow.sw.packagedLoader('shadow/'),
  ext: chrome.runtime.getManifest().version });   // kv = chrome.storage.local, backend = IndexedDB 'glance-shadow' by default
shadow.listen();                                  // accepts only messages from this extension id
```

How the runner behaves:
- Weights load lazily on the first message that passes the gate, with a sha256 check against the manifest. They are cached in SW memory and re-parsed after the SW is evicted (parse takes 2–5 ms per file).
- The runner never answers the content script, so it cannot affect the UI.

### 4. Outcomes (weak labels, §3) and consent

Joined by the same `messageId` (it is HMAC'd in the SW and never stored):

```js
shadow.log.recordOutcome(surface, messageId, { doIt: true, fetchedBack: true });   // receipt path
shadow.log.recordOutcome(surface, messageId, { undo: true });                      // undo path (content-gmail ~2309/2344/2482)
shadow.log.recordOutcome(surface, messageId, { dismiss: true });                   // card ×     (content-gmail ~2768)
shadow.log.setConsent(true | false);   // popup toggle "Help improve Glance" tier A: writes consent.log; off = purge + rotate shadowId
```

Patch values must be booleans or null. Anything else is rejected and counted in `shadow.schemaReject`.

## Inputs and outputs

**ShadowInput (content script → SW, text-free):**

```
{ v:1, messageId, surface, direction, lang, shape, attachmentCount, rcpt, voc, subjPrefix, lenBucket,
  incumbent:{engine, show, reason, label, normalizedFlip}, x2:[u32...], x21:[u32...],
  veto:{base, product, cap:{draft, file_save, calendar, any}}, prepMs }
```

**Record (`glance-shadow/2`, §3):** one record per (message, model). Fields:
- `v`, `ts`, `ext`, `shadowId`, `msgKey`, `surface`, `direction`, `lang`, `shape`, `attachmentCount`, `rcpt`, `voc`, `subjPrefix`, `lenBucket`;
- `incumbent{…}`;
- `candidate{model, label, top, pShow, pLabel, tau, floorBlocked, veto, ms}`, or `candidate:null` + `reason:"timeout"|"error"`;
- `outcome{shown, doIt, fetchedBack, dismiss, undo, ignored, implicit}`.

There is **no `features`** field: that is tier C only, and the guard rejects it.

Two records per message, rather than a new `candidate2` field, keep the schema exactly as specced. Both carry the same `msgKey`, and `candidate.model` tells them apart. So the 5,000-record cap holds about 2,500 messages.

Field notes:
- `lang`: `he` if Hebrew letters are ≥ 80% of the letters in the own text, `en` if they are ≤ 20%, otherwise `mixed`.
- `lenBucket`: `min(6, floor(log2(1 + tokens(own))))`.
- `normalizedFlip`: the engine re-run on the normalize-v21 text gives a different label. It is only computed when normalize-v21 changed the text.
- `incumbent.reason`: canonicalized, so `google-wait(drive-lookup)` becomes `google-wait:drive-lookup`. Unknown reasons become `other`.

**What is never stored:** body, subject, own text, addresses, names, message id, attachment names, URLs, amounts or dates. A test runs 300 real messages and greps every kv value, every ciphertext and every decrypted record for body 3-grams, subjects, addresses and ids. It finds none.

## Storage keys

`chrome.storage.local`:

| key | meaning |
|---|---|
| `consent.shadow` | tier A on/off (default absent = off) |
| `consent.log` | `[{tier, on, version: 'shadow-consent-v2', ts}]` |
| `consent.shadowUpload`, `consent.training` | forced to `false` when A turns off |
| `shadow.config` | **your** signed-config fetcher writes `{verified: true, enabled, uploadEnabled, modelAllowlist: ['v2@a75d2884', 'v21@8d75a0cc'], sampleRate, maxMsP95, fetchedAt}` after checking the Ed25519 signature. Never fetched, or `verified !== true`, means off |
| `shadow.kill` | local hard kill (`true` = off, wins over everything) |
| `shadow.disabledUntil`, `shadow.tripCount`, `shadow.tripReason` | client tripwires: 7-day self-disable |
| `shadow.id`, `shadow.localSecret` | per-install rand128 id; 32-byte HMAC secret for `msgKey` (both rotate on consent-off) |
| `shadow.stats` | rolling window: last 200 ms values, n, err |
| `shadow.err`, `shadow.schemaReject` | counters |

**IndexedDB `glance-shadow` (v1):**
- `records` holds `{id, ts, msgKey, iv, ct}`, with `ct` = AES-GCM(JSON record).
- `outcomes` holds `{msgKey, ts, outcome}`.
- `queue` is created but **never written** in tier A.
- `meta` holds `aesKey`, the non-extractable CryptoKey.

**Retention:**
- The ring buffer holds **5,000 records or 30 days**, whichever comes first. It is pruned on every write.
- "Clear shadow data" = `shadow.log.purge()`.

## Kill switch (§7; the most restrictive wins)

The gate checks these in order:
1. `shadow.kill`
2. `consent.shadow`
3. `shadow.config.verified`
4. `enabled`
5. tripwire
6. `modelAllowlist`, per model
7. `sampleRate`, deterministic per message, in the content script

When the gate is off, nothing is computed, stored or counted (tested).

Tripwires:
- p95 > `maxMsP95` (default 50 ms) over 200 messages;
- error rate > 1% over ≥ 200 messages;
- weights sha256 mismatch;
- optionally, memory growth > 20 MB, if you pass `memProbe` (the SW has no `performance.memory`).

Timeouts: if the prepare + score time for a model exceeds 100 ms, that model's record gets `candidate: null, reason: "timeout"`.

## Size budget and memory

- **Shipped total:** 734,810 B, against 871,000 B (`node tools/size-check.cjs` fails the build if it goes over).
- **Weights:** 666,711 B for the two glw files.
- **Content-script code:** 34.8 KB.
- **Resident in the SW:** sparse rows (`Uint32Array` idx + `Int8Array` q), about 0.76 MB for v2 and 0.91 MB for v2.1. There is no dense `Float32Array(2^17)` expansion.
- **Fallback if the budget tightens:** v2.1 `p1` (243 KB) changes 6/6,982 decisions.

## Tests (`./run-tests.sh`)

**Parity (`test/parity.test.cjs`, v2 held-out test, n = 6,982):**
- Features are bit-identical to the training featurizers: v2 6,982/6,982, v2.1 6,982/6,982.
- Decisions against the existing Node runtime (dense JSON weights) are 6,982/6,982 for both models.
- Decisions against Python (sklearn float LR):
  - v2: **6,977/6,982 (99.93%)**;
  - v2.1: **6,976/6,982 (99.91%)**.
  - Both clear the ≥ 99.9% spec gate. The differences are int8-at-threshold, with a max |Δp| of 0.016 for v2 and 0.017 for v2.1.
- Masked wrong-Do-It and missed recomputed through the package match the v2.1 report:
  - v2: 0.06% (3) and 50.68%;
  - v2.1: 0.02% (1) and 54.82%.

**Logging (`test/log.test.cjs`):** 16/16 pass.
- off-by-default;
- every kill-switch layer;
- schema validity on 800 records;
- the enum-guard fuzz (every leaf field × 180+ real bodies and subjects never serializes; `features` or unknown keys are rejected);
- no raw text at rest;
- the 5,000 / 30-day ring buffer;
- consent-off purge and shadowId rotation;
- timeout;
- the p95, error-rate and sha256 tripwires;
- the outcome joiner;
- the IndexedDB backend (fake-indexeddb);
- the content-script pre-gate and sampling;
- the MV3 static checks.

**Perf (`bench/bench.cjs`, Node 20, one thread, on a shared box with llama-server running):** 2,000 mails after a 200-mail warm-up, in ms.

| stage | p50 | p95 | p99 |
|---|---|---|---|
| prepare (content script) | 1.09 | 3.13 | 4.30 |
| score v2 | 0.25 | 0.38 | 0.45 |
| score v2.1 | 0.28 | 0.42 | 0.48 |
| SW handle (end to end, both models) | 1.28 | 2.09 | 5.81 |

- The per-mail total is **2.4 ms p50 and 5.2 ms p95**, against the spec's 30 ms p95 budget and 100 ms hard limit.
- "SW handle" covers the gate, HMAC, both models, the guard, AES-GCM and the store.

## Not in this package (left for you)

- The signed remote config fetch and its Ed25519 check. The package only reads the verified result from `shadow.config`.
- Consent UI copy (HE + EN).
- Tier B/C upload.
- The local metrics page. `shadow.log.readAll()` returns the decrypted records with their outcomes merged in.
- `ignored` / `implicit` observers.
- The 200-string FNV test-vector file for CI. The parity test above covers it on 6,982 messages; a small fixture can be cut from `test/out/parity.json` if you want it in the repo.
