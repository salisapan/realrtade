# The deeper read: Glance's recognition order with a model in it, and what it costs

> Written 2026-10-04 from the code. Supersedes the "never call a model to recognise" line of `docs/when-recognition-fails.md` §1 and §4 (option B, with the
> owner's changes: free for everyone, with an allowance) and open-tasks rows 25 and 29. Companions: `docs/local-first-principle.md` (still true: our code
> recognises first), `docs/intent-model.md`, `docs/lm-fallback-evaluation-plan.md` (why no small model on the device is on this path), `docs/hybrid-execution-architecture.md`.
> Code: `core/ai-ladder.js` (policy, portable), `glance-assist/ladder.js` (server), `src/background.js` ("the deeper read"), `src/follow.js` (`ladderAsk`), `popup/popup.js`
> (`renderLadderRow`). Tests: `test/ai-ladder-corpus.cjs`, `ai-ladder-copy-corpus.cjs`, `ai-ladder-worker-corpus.cjs`, `ai-ladder-eval-corpus.cjs`,
> `glance-assist/ladder.test.cjs`, `test/follow-gmail-harness.cjs` section 34. Measurement: `scripts/ai-ladder/eval.cjs`.

## 1. What exists, and what is off

| Piece | State |
|---|---|
| Word lists, learned model, pipeline, reply reader, browser model, Ollama / LM Studio | on (unchanged) |
| **Deeper read** (this file): one masked sentence to our server, asked twice | **built and on in the extension; the server answers "not available" until the owner switches it on** (§7) |
| Whole-message classification for the Do It chip (`REMOTE_CLASSIFY`) | **still off, on purpose**: different output (a chip with entities), no measured precision, and a wrong chip is visible. A separate decision, not this one |
| On-device small model for intent (Phi-3 / Qwen / Gemma, hybrid path) | **not on this path**: measured NOT MET for recognition (`docs/lm-fallback-evaluation-plan.md` §6c). The hybrid path stays dormant (`config/hybrid.public.js`) |
| Draft-It, attachment summary | Pro only, enforced by the server (unchanged) |

A word on "our internal model". Glance has no model of its own to call; nothing is trained or hosted by us. What the owner called the internal tier is, in the
code, **our server asking a fast, cheap model** (Anthropic Haiku or xAI's fast Grok); what the owner called the external tier is **the same server asking a strong model**
(Anthropic Sonnet or xAI's stronger Grok), for Pro only. Both are third-party APIs behind our server and our masking. The privacy page names them.

## 2. The order

```
0  word lists + sentence frames        on the device
1  learned model + pipeline            on the device
2  a model on this computer, if any    the browser's own, or Ollama / LM Studio (opt-in, loopback only)
3  the deeper read                     our server, ONE masked sentence, a FAST model asked twice (Free and Pro)
     3b  Pro only, when the fast pair was torn: a STRONG model asked twice
4  silence, or one question            core/active-question.js
```

Rules that did not move: our code recognises first; the answer is a proposal and the person taps (it never closes, writes or sends); unsure is silent;
the masking happens on the device before anything leaves; a sentence is never sent without the person's one-time "Turn on" in the popup.

**Who is asked about what.** Only a sentence of the person's own newest message that: the lists and the learned model could not accept (the pipeline's `unsure`), that the
learned model nevertheless leaned to an ask or a promise on (the pipeline's own "residual"), that is 5-40 words, in a language the owner has measured and switched on,
not asked before (a hash cache), and only while the allowance has room. On the gold sets that is **23 of 378 sentences (6.1%)**; 14 of the 23 are real asks or promises.
Everything else never leaves the device.

**What accepts an answer.** Two askings in two wordings, run at the same time, must agree on the act, the action and the right party (an ask is for THEM, a promise is by YOU). The
reading is then checked again on the device: the vocabulary, every date/amount span literally in the sentence, placeholders put back from the map that never left, an invented
placeholder drops the span. Then the same structural gate the learned model needs: the sentence must be SHAPED like an ask or a promise. **Only for Pro, and only when the strong pair
read it,** the shape may be stood in for by independent evidence: the word list finds the very same verb in the sentence, and it is not a negation.

## 3. The allowance (what is counted, Free, Pro, when it ends)

- **A "deeper read"** is one sentence sent to the server and answered. A repeat of the same masked sentence is free (the device remembers a hash, never a sentence). A refusal, an error, a
  sentence the mask would not let go, and a read with no provider answer are not counted.
- **Units** (what a read costs): fast read **1**; a Pro read the fast pair was torn on goes on to the strong pair, **+4** (5 in all). The strong model costs about four fast reads.
- **Free: 120 units a month** (about 4 a day), fast model only. **Pro: 1,500 units a month** (about 50 a day), fast first and the strong pair when torn. About 12 times as many, **and** a stronger
  reading for the sentences the fast one could not settle, **and** the stand-in for the shape. The numbers are the owner's to change: `PLANS` in `core/ai-ladder.js`, one place.
- **Counted on the server**, atomically, three ways: the person (a hash of the random install id, or of the Pro key) per month; the network address per day (300 units, so a new install id is not a new
  allowance); everyone together per day (3,000 units, the automatic off switch). The device only shows what the server last said. Stored: a hash and a number. Never a sentence, never an answer.
- **When it ends.** The page stops asking (no round trip). Glance keeps working on the device exactly as before; the popup says once: "This month's second readings are used up. Glance keeps working on
  your device, as before. It starts again on Nov 1." Free also sees "Pro has about 12 times as many." Nothing in Gmail, no banner, no broken state. From 80% used the popup says how many are left.
  Pro at the end sees the same line without the sales sentence. A server failure rests the layer for 15 minutes and says so in the same quiet place.
- **Free is not a dead demo**: the deeper read is on for everyone, with the same masking, the same guards and the same two-asking agreement. **Pro is not "the same with a bigger number"**: it adds the strong pair for
  the torn cases, the wider door (§2), a far larger allowance, and Draft-It, summaries, voice-matched drafts, all loops and the money totals as before.

## 4. Cost (planning estimate; prices are assumptions, not verified from here)

A read is two provider calls of about 400 tokens in and 40 out. At assumed prices (fast model about $1 / $5 per million tokens in / out) a fast read is about **$0.0012**; a strong read (about $3 / $15)
about $0.0036-0.005 (so 4 units is about right).

| | per person per month, worst case | notes |
|---|---|---|
| Free, 120 units | about **$0.15** | a typical person uses far fewer: only the 6% of sentences the device is torn on |
| Pro, 1,500 units | about **$1.80-$2** | against $14 / month ($132 / year) before Stripe's fee |
| Everyone, the daily cap | about **$3.6 a day, $108 a month** at most | `GLANCE_AI_DAILY_UNITS`; at the cap the server answers "capacity" and the devices fall back |

## 5. What the owner sees (counts on the device, and the server's counter)

Device (`aiLadder.stats`): asked, proposed, nothing there, cached, strong reads, units, refused, **accepted** and **turned down** (the person's tap is the label). `FlowAiLadder.summarize` gives: the
share of deeper reads the person kept, the share that needed the strong pair, units per kept loop. Server: units per day in `ai_usage` (the daily rows). Together: cost per kept loop, and how often Free runs out
(the natural-upgrade moment) against how often Pro does.

## 6. The server contract (`glance-assist`, `action: 'ladder-read'`)

Request: `{ action, maskedSentence, installId, licenseKey? }`. Nothing else is read: the prompts are built on the server from `core/local-lm.js`, a client cannot add instructions, pick a tier or a model.
Response: `{ ok, reading: { act, action, who, when, amount } | null, tier: 'fast'|'strong', units, quota: { period, used, limit, plan } }`, or `{ ok:false, code }` with `quota_used` (429), `busy` / `capacity` (429),
`pii` / `language_off` (422), `no_identity` / `bad_request` (400), `provider` (502), `unavailable` (503). No model text, no provider name. `ladder-status` returns `{ available, languages, quota }` and charges nothing.
Fails closed: no switch, no counter, no provider key, a sentence that still looks like a contact detail or an amount, a language nobody measured: nothing is asked, nothing is charged.

## 7. Turning it on (the owner's steps, in order) and the measurement

1. **Supabase** (paused; the owner's action): apply `supabase/migrations/20261004000000_glance_ai_usage.sql`. It was run here on plain Postgres 16 (30 parallel charges against a limit of 10 allowed exactly 10; refunds floor at 0; the
   `anon` role is refused). It was not run on Supabase / PostgREST.
2. **Provider keys** in Netlify: `ANTHROPIC_API_KEY` and/or `XAI_API_KEY`. The model ids in `model-router.js` were never verified against the providers from this environment.
3. **Measure on real answers**: `ANTHROPIC_API_KEY=... XAI_API_KEY=... node scripts/ai-ladder/eval.cjs`. The gate is the one the on-device model is held to: on the 100 audit sentences, per plan and per language, precision of
   what it proposes >= 0.97 with at least 12 proposals and recall >= 0.4. It prints the languages that passed. `test/ai-ladder-eval-corpus.cjs` proves the script says PASS for a provider that is always right and DO NOT TURN ON
   for one that says yes to everything. It costs a few cents. **It has not been run on real answers.**
4. **Set `GLANCE_AI_LADDER` in Netlify to the languages that passed** (`en`, `he`, or `en,he`). Empty, or `1`, is off. The extension then shows the popup choice by itself.
5. Then the person's "Turn on" in the popup is the last gate.

## 8. What is measured, and what is not (read before believing any number)

Measured here, with scripted providers (no real model was called): the gate admits 23 of 378 gold sentences; with a **perfect** model Free would turn 7 of the 14 real residual asks/promises into proposals and Pro 9 of 14, with no wrong
proposal; with a model that says yes to everything, **the guards alone are not enough**: 3 of 8 proposals are wrong (a statement shaped like a promise). That is pinned in `ai-ladder-corpus.cjs` as a known limit, and it is why §7 step 3
exists. Those sets are the ones the engine was tuned on; on real first-contact mail the pipeline's ask recall was 0.45-0.77 (`docs/human-eval.md` §3), so the residual, and the room for a second reader, is larger there than 6%.

Not measured: any real provider answer, the precision of the strong tier, the cost per user on real mail, the share of Free people who hit the allowance, the effect on conversion, the browser flow in a real Gmail
(§9), the Postgres function on Supabase, the provider model ids and prices. The masking can miss a first name used alone or an unlabelled number (pinned in `scrub-e2e.test.cjs`).

## 9. Real Gmail test (the owner's: nothing here can drive a real Gmail)

Prerequisite: steps 1-4 of §7 on a Netlify deploy, and the extension built from this branch loaded unpacked (`python3 scripts/package_trial_extension.py --profile full --out ...`).

1. Open the popup: a "Second reading" row appears with "Turn on". If it does not, the server is not available (check §7). Press it. Expect: "Second reading is on", "0 of 120 used".
2. In Gmail, in a thread, send yourself a message with an ask Glance's lists do not know, for example: *"Wondering whether the permit fee came through on your side."* Open the thread. Expect: the usual "Waiting on a reply?" card, with the
   quote of the sentence, **or nothing** (a statement-shaped sentence). Never a close, never a send. In "What Glance learned" there is one line: it sent one sentence for a second reading.
3. Reload the thread: nothing is asked again (the popup count does not move).
4. Write one with a name and an amount ("…whether Dana Cohen got the $2,500 fee…"): in the browser's network tab (the service worker) the request to `glance-assist` must carry `[CLIENT_NAME_1]` and `[CURRENCY_VAL_1]`, never the real values.
5. Press "Not now" on one and "Stay on it" on another: the popup row's count of kept readings moves (counts only).
6. Free to Pro: paste a Pro key; the row says "Pro: about 1500 a month, and a stronger reading for the hard sentences".
7. Allowance: set the Free limit low in a test deploy (or use the memory counter) and confirm the popup says "used up", Gmail shows nothing different, and Glance still finds the asks the lists know.
8. Turn it off in the popup: nothing more is sent; the privacy page matches what you saw.

Report: every sentence it proposed that was wrong (with the sentence), and every real ask it missed.
