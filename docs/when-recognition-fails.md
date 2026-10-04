# When Glance cannot recognise an intent: what it does, and which models exist

> Written 2026-10-04 from the code, not from memory. Companion to `docs/intent-model.md`, `docs/local-first-principle.md`,
> `docs/ai-engine-upgrade.md`.

> **Update 2026-10-04: §1 and §4 are superseded.** The owner decided (open-tasks rows 25 and 29): a masked sentence may go to our server for a second reading, free for everyone with a monthly allowance,
> local steps first. It is built and described in `docs/ai-ladder.md`; this file's description of steps 0-3 and of the Do It chip's `REMOTE_CLASSIFY` (still off) remains true.

## 1. The short answer

**By default Glance calls no external model when it cannot recognise something. It stays silent, and at most asks one question.**
The remote classifier exists in the code but is switched off (`REMOTE_CLASSIFY = false` in `src/content-gmail.js`).

## 2. The chain, in order (what actually runs)

| Step | What | Where it runs | Leaves the device? |
|---|---|---|---|
| 0 | Word lists and sentence frames (English, Hebrew, chat register) | `core/request-types.js` | No |
| 1 | Learned model: hashed n-grams, two softmax heads (act, action), plus a reply model that can only hold a loop open | `core/intent-model.js`, `core/reply-model.js` | No (weights ship in the extension) |
| 2 | **The browser's own built-in language model**, asked twice with differently worded instructions; must agree; only after a precision self-test passes on THIS device, per language | `core/local-lm.js` through `src/local-lm-chrome.js` (Chrome's `LanguageModel` / Prompt API; present only on some Chrome versions and hardware) | No (the browser runs it locally) |
| 2b | **A model the person runs on their own computer** (Ollama or LM Studio), only if they turned it on and it passed the same precision test per language; it replaces step 2 when present. Loopback addresses only | `core/local-lm-server.js`, `docs/local-model-server.md` | No: the sentence goes to a program on the same computer |
| 3 | Silence. If the sentence still looks undecided, the one most uncertain sentence may become **one question** in the popup ("Are you waiting on a reply to this?"), rationed | `core/active-question.js` | No |

Nothing in 0-3 can close, write or send on its own. A proposal becomes a loop only when the person taps.

## 3. The server-side router (built, not on the recognition path)

`flow-landing/netlify/functions/glance-assist/model-router.js` is a per-action router behind a Glance Pro licence check. It only
ever receives text that `core/privacyShield.js` has masked (emails, phones, money, dates replaced by tokens), and it refuses to send
anything if one of those survives masking.

| Action | Who calls it | Order of providers (configured in the router) |
|---|---|---|
| `draft-reply` (Draft It, only when the person asks) | the popup / chip | Haiku or Grok-fast, whichever has been faster, then the other, else a hard failure (never an invented draft) |
| `summarize-attachment` (only when asked) | the chip | Gemini Flash, then the faster of Haiku / Grok-fast, then the other |
| `classify` (**the "could not recognise it" path**) | `ensureRemoteClassification` in `src/content-gmail.js` | Sonnet, then Grok-strong, then silence. Never called when the local pass was quiet on purpose (noise, hedge, family, calibration); only for a true miss |

Configured model ids in the router today: `claude-haiku-4-5`, `claude-sonnet-5`, `grok-4-fast-non-reasoning`, `grok-4.6`,
`gemini-3.8-flash`, `gpt-5.4-mini` (OpenAI only when Gemini's key is missing or its circuit is open). **I could not verify those ids
against the providers from this environment**, and the router's tests use fakes. Check them in the provider consoles before turning
anything on.

`classify` is **off** on purpose. `ensureRemoteClassification` carries this comment: sending even masked text on every message
Glance cannot read would contradict the page's one promise (the decision happens on your device). If it is ever turned on it must be
opt-in in the popup, Pro-only, and the privacy page must change in the same commit.

## 4. The decision this leaves to the owner

Option A (today): never call a model to recognise. Silence plus one question. Cleanest promise, lowest recall on odd wording.

Option C (built, 2026-10-04): a model on the person's own computer. Free, private, no credits, but the person installs and runs it (`docs/local-model-server.md`).

Option B: an opt-in, Pro-only "ask a model when unsure" switch in the popup. Only the sentence in question (not the thread), masked,
through the existing router; the answer is a **proposal** exactly like tier 2 (the person still taps; no close, no write, no send);
every call listed in the "What Glance learned" ledger ("asked a model about 1 sentence"); a visible counter. Costs: a privacy-page
change, a store-listing disclosure, a provider data-processing review. Not built until you decide.

## 5. What is not a model

Everything in the receipt path (`docs/resolution-paths.md`) is code over evidence, not a model: matching a file, checking a payment,
reading what the issuer says back (the same reply reader every loop uses, plus a narrow "we do not issue" lexicon), and deciding the
next move.
