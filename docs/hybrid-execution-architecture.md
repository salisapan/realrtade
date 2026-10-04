# Hybrid execution: the device first, the server when it is needed. Plan, what is built, what needs the owner

> Written 2026-10-04 from the owner's specification, before the code. **Status: built and tested, DORMANT.** Nothing in `manifest.json`,
> `background.js` or the content scripts references any of it, so no user is affected and no promise on the privacy page changes yet. The
> activation checklist (§11) is the list of things that must be decided or done first. Companion to `docs/when-recognition-fails.md`,
> `docs/local-model-server.md`, `docs/lm-fallback-evaluation-plan.md` (the measured result on small models), `docs/local-first-principle.md`.

## 1. What was asked

Three tiers for the `[Do It]` / `[Draft It]` action, plus strict JSON:

1. **Tier 1, first hours after install:** the click goes to the company server (a strong private model). No friction.
2. **Tier 2, permanent:** a small open model is downloaded quietly into the browser cache and runs locally on WebGPU (Phi-3-mini 4-bit or Llama-3-8B 4-bit).
3. **Tier 3, fallback:** if the local model errors or is not confident (< 0.85), mask the sensitive data on the device and ask Tier 1.
4. **Strict JSON** from both models, with a parser that never crashes the extension.

## 2. Where the specification meets rules that are already the owner's (read this first)

These are not objections to the direction; each one is a place where building it literally would break something the owner decided earlier.
Each is resolved below in the way that keeps the earlier rule, and each is a question for the owner in §11.

1. **Product boundary and compliance wording.** The spec describes Glance as "for highly regulated industries" with "100% Infosec compliance".
   `docs/product-architecture.md` (the owner's hard constraint) says Glance is for general business use, carries none of Flow's compliance guarantees, and that
   any change that makes Glance look like it does must be stopped and asked about. Nothing built here claims compliance, security certification or regulated-industry
   suitability, and no copy was written. The regulated-industry version of this idea belongs to Flow (a masked tenant or customer infrastructure), not to this extension.
2. **"Tier 1 first, for the first hours".** Today the server is Pro-only and licence-checked, and the privacy page says where judgment happens ("only on your device") and
   that the masked round trip exists only for Pro, opt-in features. Sending a user's text to the server by default from the first click contradicts that page, and the
   Chrome Web Store's user-data rules. So: **the server is used only after a one-time consent (`server` consent, default off), and only with masked text.** Without it the
   router returns a reason and stays silent. A free quota for everyone (owner decision 2026-10-04) is `open-tasks.md` row 29 and is not built.
3. **"Completely transparent, quiet" download of gigabytes.** Measured from the pinned model manifests (§8): **Phi-3-mini 4-bit is 2.15 GB in 91 files, Llama-3-8B 4-bit is 4.53 GB in
   114 files.** WebLLM's own published memory requirement is 3.7 GB and 5.0 GB of GPU memory, and both builds need the `shader-f16` WebGPU feature, so a large share of business laptops
   cannot run either (the share is unmeasured). Quiet is built (no interruption, polite, resumable); **unseen is not**: a multi-gigabyte download that the person does not know about is a
   promise-versus-reality gap, so it needs a consent (`localModel`, default off), always-readable progress, pause/resume, and one tap to remove it and free the disk.
4. **The evidence is thin.** The owner's own measurement rule applies (no integration before a measured comparison). The experiment in `docs/lm-fallback-evaluation-plan.md` found
   open models of 0.5B to 1.7B unusable for recognition at the product's precision bar. 3.8B and 8B models were **not tested**, and not for this task (proposing one action as JSON).
   "90% of tasks run locally" is a hypothesis, not a number. It has to be measured on a fixed set before the on-device tier is switched on for anyone (§11).
5. **"Confidence below 0.85".** A language model's own statement of confidence is not calibrated, so it is not used. Confidence here is measured (§7) and the 0.85 bar must be
   calibrated on real tasks before activation: a threshold that was never checked against outcomes is a guess with a decimal point.
6. **Server models named in the spec.** Llama-3-70B or Mistral-Large "self-hosted" needs GPU hosting that does not exist; the server calls provider APIs through
   `glance-assist/model-router.js` (model ids configured there are **unverified** against the providers, as noted in `when-recognition-fails.md`). "Claude 3.5 Sonnet" is not used: the
   router uses the ids configured there. DeepSeek and a special path for "highly unstructured legal documents" are not wired. The execute action uses the router's strong pair
   (Sonnet, then Grok-strong); cheapest-first routing is the still-open row 29.
7. **Remotely hosted code.** A model's WebGPU library is a WASM file, which is code. A Chrome extension may not execute remotely hosted code, so the runtime refuses any library that is not
   a file of the package (`model-lib-not-bundled`). The weights are data and may be downloaded. Bundling WebLLM (about 6.5 MB unminified) and one WASM (5.3 MB or 6.1 MB) adds
   roughly 12 MB to the install package; that is a packaging decision for the owner.
8. **`fill_field` does not exist.** The spec's example action fills a field on a web page. Glance has no such capability; its "Do It" writes a Gmail draft, a Google Task or a Calendar
   event (`core/actions.js`). The action vocabulary is closed and mirrors those. Adding page automation is a new permission surface, not a schema line.
9. **Recognition stays local-first.** `docs/local-first-principle.md` is untouched: our code recognises what is being asked before any model. This path only proposes the action to take once the
   person has chosen to act, and a proposal never closes, writes or sends anything by itself.

## 3. The architecture

```
 Gmail tab (content script)             service worker (orchestrates)           offscreen page (holds the model)       company server
 ─────────────────────────              ─────────────────────────────           ──────────────────────────────         ──────────────
 FlowHybrid.run(request)  ──status───►  consent + mirrored state
   core/exec-router.js                                                           core/model-store.js  (download,
   ├─ Tier 2: local.run ───infer─────►  forward  ───────────────────────────►    verify, cache)  → webllm/model cache
   │   asked twice, two wordings, JSON                                           src/hybrid-runtime.js (WebGPU, WebLLM,
   │   confidence = agreement × token prob                                       constrained JSON, logprobs)
   └─ Tier 3/1: mask (shield + ids)                                              
        server.call ───execute───────►  server consent?  → licence-checked  ───────────────────────────────────────►   glance-assist
        ◄── masked JSON ── validate ── restore placeholders locally ── validate again ── PROPOSAL                        action 'execute'
```

- **Content script (`src/hybrid-client.js` + `core/exec-router.js`)**: the routing decision, the masking, the JSON validation and the restore of placeholders. Real values never leave this tab: the token map stays here.
- **Service worker (`src/hybrid-sw.js`)**: consent, the offscreen page, a mirror of its state, an alarm that wakes a paused download, and the one licence-checked server call (`callGlanceAssist`). It does not hold the model:
  a worker is stopped when idle, which would drop the model and cut the download. This is the one deliberate difference from "download in the service worker".
- **Offscreen page (`src/offscreen.html`, `offscreen.js`, `hybrid-runtime.js`)**: the download and the model. It has no judgment, no masking and no network call except the pinned model files.
- **Server (`glance-assist` action `execute`)**: builds its own system prompt from the shared schema (the client's `instructions` are ignored), masks again, validates the answer, returns canonical JSON text.

Data layers stay separate: **masking** (`core/mask-ids.js` over `core/privacyShield.js`), **model I/O** (`core/json-enforce.js`), **routing policy** (`core/exec-router.js`), **download** (`core/model-store.js`),
**Chrome plumbing** (`src/`). Each is portable, `core/` has no `chrome.*` and runs under Node, and each has a corpus.

## 4. Files

| File | Layer | What it owns |
|---|---|---|
| `core/json-enforce.js` | core | The closed action schema, the instruction both tiers get, `parse()` that never throws, a JSON Schema export for constrained decoding |
| `core/mask-ids.js` | core | Labelled identifiers and IBANs → `[ID_n]`; `maskAll` = shield then identifiers |
| `core/exec-router.js` | core | Tier order, consent gates, the mask-as-hard-gate, confidence, fallback, the unknown-placeholder check |
| `core/model-store.js` | core | Manifest trust check, consented, polite, resumable, verified download, state machine, `networkConditions` |
| `core/model-manifests/*.json` | data | Pinned file lists with size and SHA-256 at an exact commit, written by CI (`scripts/hybrid/build-model-manifest.cjs`, `.github/workflows/model-manifest.yml`) |
| `src/hybrid-runtime.js` | src | Capability check, which model, engine start (refuses a remote WASM), one constrained inference with logprobs |
| `src/offscreen.html`, `src/offscreen.js` | src | The page that holds the store and the engine |
| `src/hybrid-sw.js` | src | Consent, offscreen lifecycle, state mirror, alarm, server call |
| `src/hybrid-client.js` | src | Gives the router its capabilities by messaging the worker |
| `glance-assist.js` (`execute`), `model-router.js` | server | The strict-JSON server action, on the strong pair |

## 5. The JSON contract

Every tier gets the same words (`FlowJsonEnforce.instructions`, two wordings so the device can be asked twice): "return ONLY valid JSON, one object, no markdown", the list of shapes, a way to decline
(`{"action":"none","reason":"..."}`), and "never invent names, amounts, dates, e-mail addresses or phone numbers; keep placeholders". The device additionally has decoding constrained to the JSON Schema.

| action | fields |
|---|---|
| `draft_reply` | `body` (≤ 4000) |
| `create_task` | `title` (≤ 200), `dueText` (words or a `[DATE_n]` token, or null) |
| `create_event` | `title` (≤ 200), `whenText` |
| `none` | `reason` |

Dates are **never** asked for as dates. The model points at the words; the device reads them with its own parsers after any placeholder is restored (the product's rule: the model supplies a place, never a value).
`parse()` strips a code fence, ignores prose around the object, drops a trailing comma, and refuses everything else: a truncated answer is not repaired (closing the brackets would invent the end), an extra
field, a wrong type, an unknown action, an over-long field, a huge input. It never throws (a getter that throws, deep nesting and `__proto__` keys are tested).

## 6. Masking, and what it does not catch

`FlowPrivacyShield` masks names, companies, amounts, dates, e-mail and phone. `FlowMaskIds` adds labelled identifiers (ID, passport, policy, case, claim, account, IBAN, Hebrew labels) as `[ID_n]`.
Before anything is sent, the router refuses if an e-mail, phone or amount survives, or if a masked value is found anywhere in the payload (`pii-blocked`, `mask-failed`). The token map never leaves the tab.
**Known limits, stated on the privacy page already and pinned by a test that fails the day they change:** a first name alone mid-sentence passes the shield; an unlabelled identifier passes the ID mask
(a bare 9 or 10 digit number is left alone on purpose because invoice and PO numbers look the same). This is why §2.1 matters: pattern masking is not a compliance guarantee.

## 7. Confidence

Two askings in different words must give the identical proposal (agreement 1.0; same action but different fields 0.6; otherwise 0), multiplied by the lowest token probability the runtime reports for
the answer (counted as 1 if the runtime reports none, and the trace says so). Below the bar (default 0.85) or on any error, malformed JSON or timeout, Tier 3. The server's answer has no confidence number: it is
accepted only if it is valid JSON of the schema and every placeholder in it is one the device issued (an invented placeholder means the model made something up: refused).

## 8. The download

Pinned manifests (built on CI from the Hugging Face repo at an exact commit): **Phi-3-mini-4k-instruct-q4f16_1-MLC: 91 files, 2,152 MB, largest 49 MB, WASM 5.3 MB. Llama-3-8B-Instruct-q4f16_1-MLC: 114 files, 4,527 MB, largest 251 MB, WASM 6.1 MB.**
The store refuses a manifest that is not fully pinned (https, an allowed host, a size and a SHA-256 per file), re-checks the host after redirects, verifies every file's hash, deletes and fails on a mismatch, and
re-verifies everything before saying `ready`. It is sequential (one file at a time), uses a duty cycle (reads a quarter of the wall time), pauses itself when offline, in data-saver mode, on a metered, 2G or 3G
connection, or when consent is withdrawn, resumes at file granularity, and never throws: every failure is a state the popup can show. `isModelLoaded` is set only by the runtime after the engine really started.
The files are stored where WebLLM looks for them (`webllm/model`, under their URLs at the pinned commit); **that the engine accepts pre-seeded files has not been verified in a real browser**. If it did not, it would
download them again itself.

## 9. The server action

`execute` is Pro-gated like every `glance-assist` action (a free user gets a clear 402 today), runs on the strong pair, validates against the shared schema, and is tested against prose, off-schema actions, raw
contact details in the answer, unmasked input, and an attempt to override the instructions from the client.

## 10. What the tests pin

`json-enforce-corpus` (28 checks), `mask-ids-corpus` (19), `exec-router-corpus` (39), `model-store-corpus` (35), `hybrid-path-corpus` (48, with a fake chrome and a fake model and server), and the `execute` cases in
`glance-assist/model-router.test.cjs`. Mutation checks were run: removing the consent gate, sending unmasked text, accepting unknown placeholders, ignoring the confidence bar, skipping the hash check, letting a
content script set consent, and allowing a remote WASM each make tests fail.

## 11. Before this can be switched on (in order)

1. **Owner decisions:** the boundary wording (§2.1); the server consent and its exact words; the local-model consent and where it is asked (the popup setup); the free-tier quota and daily spend cap (row 29); whether the
   package grows by about 12 MB; Phi-3-mini only, or Llama-3-8B as well.
2. **Measure before enabling the device tier:** a fixed set of real "Do It" prompts in English and Hebrew, run on Phi-3-mini (and Llama-3-8B) in a real browser with WebGPU; report agreement, the share that stays local,
   precision of the proposals, and the calibration of the 0.85 bar. If the pre-registered rule is not met, the device tier stays off and Tier 1 (with consent) is the product.
3. **Vendor the runtime:** `@mlc-ai/web-llm` 0.2.85 (Apache-2.0) into `src/vendor/web-llm.js`, and each model's WASM into `vendor/<model>-webgpu.wasm`, with their hashes recorded.
4. **Manifest:** add `"offscreen"` to `permissions`; add `'wasm-unsafe-eval'` to the extension-pages CSP; add the model hosts (`https://huggingface.co/*`, `https://cas-bridge.xethub.hf.co/*`) to
   `optional_host_permissions`, requested at the moment of consent; add `core/json-enforce.js`, `core/mask-ids.js`, `core/exec-router.js`, `src/hybrid-client.js` to the Gmail content scripts.
5. **Wire the worker:** in `background.js`, `const hybrid = FlowHybridSW.create(chrome, { callAssist: callGlanceAssist }); hybrid.install();` and delegate `hybrid.handle(msg, sender)` in `onMessage`.
6. **UI:** a popup row for the two consents, the progress, pause/resume and "remove and free the disk" (the Do It chip uses `FlowHybrid.run`).
7. **Copy, in the same commit as the code that makes it true:** the privacy page (what is downloaded, where it runs, what may be sent and when), the store justification for the new permissions, and
   `identity-copy-corpus` must still pass (no "AI-powered" wording).
8. **A real-browser trial** on the owner's machine, including a machine without WebGPU (it must fall back cleanly) and the pre-seeded cache question in §8.

## 12. Not built

Page automation (`fill_field`); a quota or free tier; cheapest-first routing; any self-hosted 70B or Mistral-Large; DeepSeek; a popup UI; the vendored runtime; any manifest or `background.js` change; any privacy-page change.
