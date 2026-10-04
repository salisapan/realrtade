# A model on the person's own computer (Ollama, LM Studio)

> Written 2026-10-04, at the owner's question: "can we use free models that run locally, like Ollama / LM Studio?"
> Companion to `docs/local-first-principle.md`, `docs/when-recognition-fails.md`, `docs/ai-engine-upgrade.md` §2.
> Code: `core/local-lm-server.js` (portable), the bridge in `src/background.js` and `src/follow.js`, the popup row
> "A model on your computer". Tests: `test/local-lm-server-corpus.cjs`, `test/follow-gmail-harness.cjs` section 33.

## 1. Yes, and it fits the architecture without bending it

Glance's tier 2 (`core/local-lm.js`) asks a `session` with one method, `prompt(text, schema) -> string`. Chrome's built-in model is
one source of that session. A server on this machine is another: Ollama (`/api/chat`, schema as `format`) and LM Studio
(`/v1/chat/completions`, schema as a strict `json_schema`) both do structured output, with no key and no credits.

It is the opposite of the remote-model option in `docs/when-recognition-fails.md`: the sentence goes from the browser to a
program on the SAME computer. Nothing is sent to Glance or any provider.

## 2. The rules it runs under (unchanged from tier 2, plus one)

- **Loopback only.** `127.0.0.1`, `localhost` or `::1`. Any other host (a LAN address, a look-alike such as `127.0.0.1.evil.com`,
  an address with credentials) is refused when the setting is saved, again in the popup, and again in the service worker right
  before each request. The browser permission asked for is that host only.
- **Off until turned on, and not trusted until it passes.** The popup runs the same precision self-test as for Chrome's model (0.97
  precision, a minimum number of proposals, a minimum recall), per language, against THIS model. English can pass while Hebrew
  fails: then Hebrew sentences are never sent to it. A saved pass belongs to one model at one address; change either and it is off.
  The pass expires after 30 days like the other.
- **It only proposes.** Asked twice with differently worded instructions that must agree, the right party must be doing the thing,
  dates and amounts are re-read by our own code from the sentence. A proposal still needs the person's tap. It never closes,
  writes or sends.
- **Silence on any failure.** Not running, wrong model name, refused origin, timeout (20 s per call, 25 s budget per message),
  chatty non-JSON answer: all are "no proposal".
- **One call at a time** (a laptop model asked several things at once only gets slower), at most two sentences per own message.
- **Nothing installed or downloaded by Glance.** The person installs the program and pulls a model themselves.

## 3. What the person has to do (and why most customers will not)

1. Install Ollama (or LM Studio) and pull a model: for example `ollama pull llama3` (a few GB of disk and RAM).
2. **Ollama only:** allow the extension's origin, `OLLAMA_ORIGINS=chrome-extension://*`, then restart Ollama. Without this Ollama answers
   403; the popup says exactly this. (LM Studio: enable its local server.)
3. Popup -> Where Glance watches -> "A model on your computer": choose the program, Find models, pick one, "Test and turn on".
   The test takes minutes (about 150 sentences, two questions each); keep the panel open.

This is a power-user tier. It is free and private, but needs a capable computer, a multi-GB download and a running program. The
default experience stays tiers 0-1, plus Chrome's built-in model where it exists.

## 4. What it is NOT

- Not a replacement for the lists and the learned model; those still run first and decide most things.
- Not used for closing loops, reading the issuer's answer, drafting, or any decision other than "is this unclear sentence an ask or a
  promise". (Voice-matched drafts or summaries through a local model are possible later and would be separate, opt-in.)
- AnythingLLM (chat with your documents) is a different kind of tool: it is an app for talking to files, not a model server Glance
  can call. Glance does not need it: Glance already reads the one message in front of it.
- A model bundled INTO the extension (WebGPU / transformers.js) would need no installation but a large first download and weights
  from a host the build sandbox cannot reach; not attempted.

## 5. Known limits

- Never run against the real Ollama or LM Studio from this environment: the tests use fake servers that speak each dialect. The
  `OLLAMA_ORIGINS` behaviour, LM Studio's structured-output support in older versions, and real latency are unverified.
- The self-test audit set (`core/local-lm-audit.js`, 100 English + 48 Hebrew sentences) is small and model-written; a pass shows the
  model reads those sentences well, not that it will on any real inbox.
- Hebrew quality depends heavily on the chosen model; a small English-centric model will fail the Hebrew gate, which is the point.
