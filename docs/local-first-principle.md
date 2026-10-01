# Local-first recognition — a standing rule

> Instated 2026-10-01. Applies to every feature, every time.

**Our own code recognises first. An external model is never the first thing
that looks at a message, and never the thing a feature depends on to work.**

1. **Code before model.** Every kind of request, promise, answer or task a
   feature needs to understand must first be recognised by deterministic code
   in `core/` (vocabulary tables, patterns, dates, amounts, state). The goal is
   thousands of recognisable cases from data, not a handful of regexes: add
   words and frames to the lexicons, not special cases to the logic.
2. **A model is an optional last resort,** only for what the code genuinely
   cannot decide, only behind Pro and masking, and only when the code's own
   answer is "unsure". It may suggest; it never closes a loop, writes a record
   or spends money on its own. A feature must still work, more quietly, with
   the model off (`REMOTE_CLASSIFY = false` is the default and stays so).
3. **Unsure means silent.** When local code is not confident it shows nothing.
   Silence is cheaper than a wrong card and a wrong close.
4. **Every new case ships with its tests.** A recognised type needs positive
   and negative examples in a corpus under `flow-trial-extension/test/`, so
   precision is measured, not hoped for.
5. **Portable.** Recognition lives in `core/` with no `chrome.*` or DOM, so it
   can serve the future Flow runtime unchanged.

Why: privacy (nothing leaves the device to decide), speed and cost (no per-
message model bill), trust (the same input always gives the same answer), and
the decision filter (`decision-filter.md`): reliability beats cleverness.

Where it lives today (tests: `test/request-types-corpus.cjs`, `test/follow-up-corpus.cjs`): `core/request-types.js` (what is being asked or
promised), `core/follow-up.js` (what a reply did), `core/intent.js` and
`core/judgment.js` (what an incoming message asks of you).
