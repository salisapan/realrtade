# Plan: outcome identity + deeper local detection and closure

> Written 2026-10-02, before the code. Results are appended at the bottom once
> measured. Builds on `docs/open-loops.md`, `docs/local-first-principle.md`,
> `docs/intent-model.md`. Nothing here replaces Waiting on, Do It or the Pro
> foundations.

## 1. Detection architecture today (local vs remote)

| Layer | Where | Local? |
|---|---|---|
| Lexicon: frame + action + object, EN/HE | `core/request-types.js` | yes |
| On-device model, two heads | `core/intent-model.js` | yes |
| Pipeline (lexicon + model veto/propose, "unsure" = silence) | `core/intent-pipeline.js` | yes |
| Outgoing asks / promises -> loops | `core/follow-up.js` | yes |
| Incoming mail -> Do It chips | `core/intent.js`, `core/judgment.js` | yes |
| What a reply did to a loop | `classifyReply` (regex) | yes |
| Draft-It, attachment summary | `glance-assist` (masked, Pro) | remote, optional, never closes or writes alone |
| Remote classifier hook | `REMOTE_CLASSIFY = false` | off |

Remote is not in the spine today. The risk the brief names is real in a
different form: the local base is *narrow* in three places (below), and a thin
base makes a future remote fallback tempting.

## 2. Where the base is too thin

1. **Reply understanding closes too easily.** `classifyReply` returns `closed`
   for anything that is not an acknowledgement or a promise. So "I never got the
   attachment", "which invoice do you mean?", "can you resend it?" and "we are
   not going ahead" all close the loop. The first three are *not* completion
   (the ball is back with you); the last is a deliberate release and should be
   recorded as such.
2. **One story, many threads.** A loop is one Gmail thread. When the person
   answers in a new thread ("Re:" dropped, subject edited, a fresh message "paid
   the INV-204"), the loop never sees it and keeps chasing someone who already
   answered. A second thread about the same invoice opens a second loop.
3. **Short real-world asks.** The lexicon needs frame + action. "Invoice?",
   "Signed yet?", "Any update?", "?מה הסטטוס" are one-to-three-word asks that
   people really send. Nothing recognises them.
4. **No measurement of local share.** We can say recall on two small sets; we
   cannot say, on a real inbox, how often the local base decided versus stayed
   unsure.

## 3. Detection classes strengthened locally first

In order, each with a corpus of misses and of what must stay silent:

1. Closure vs non-closure in replies: `blocked` (did not get it / cannot open
   it), `question` (they need something from you), `declined` (a deliberate "no"),
   alongside the existing paid / closed / promised / ack / auto.
2. Ball-in-court state `yours`: the loop stays open, the chase to *them* stops,
   a reminder to *you* is set, and it flips back when you answer.
3. Story continuity across threads (counterpart + normalised subject +
   reference numbers + amount), used both to settle a loop from another thread
   and to avoid opening a duplicate.
4. Short, unambiguous asks (status chasers), EN/HE, with an evidence record
   (strong vs weak signals) attached to every recognition.
5. Local-hit accounting: every message decision is counted as local-hit,
   local-silence or residual (the only class a remote model could ever see).

## 4. Identity and copy

Rule, written into `docs/product-identity.md` and `CLAUDE.md`: Glance sells
what stays open until it is closed. AI is the engine and is not the headline.

- No "AI assistant / AI inbox / smart email / understands your inbox" on any
  Glance surface (site, extension, store text). A copy test enforces it.
- The AI-forward sparkle on the chip is replaced by a closed-loop mark.
- The FAQ answers "is this an AI email tool?" with what it does, not what it is.
- Pro copy stays on protection: every loop followed until closed, money still
  owed, firmer nudges. Draft-It and summaries are "also".

## 5. How local success vs remote fallback is measured

- Offline: `docs/intent-model-metrics.json` already holds precision/recall
  against the word lists; it gains `localShare` (the share of real asks and
  promises solved locally) and `residual` (the rest, the only remote
  candidates). Remote share is 0 by construction (`REMOTE_CLASSIFY=false`).
- On device: `recognitionStats` in storage, counts only, never text:
  `localHit`, `localSilence`, `residual`, `remote`. Read via
  `FlowStorage.getRecognitionStats()` and summarised by
  `FlowRecognitionStats.rates()`.

## 6. Risks to precision

- A new `question`/`blocked` outcome could keep a loop open that should have
  closed. Mitigation: they need an explicit cue (a question mark with a request
  frame, or a named failure phrase), no delivery word in the same message, and
  the default stays the old behaviour for anything else.
- `declined` must never fire on a polite "no worries". Mitigation: sentence-level
  cues plus guards, negatives in the corpus.
- Story matching could attach a reply to the wrong loop. Mitigation: it needs the
  same counterpart *and* (the same normalised subject, or a shared reference
  number, or the same amount); ties are not resolved, the answer is "no match".
- Short asks could turn chatter into cards. Mitigation: only an object noun or a
  fixed status phrase plus a question mark, <= 4 words, and only inside a message
  the person themself sent.

## 7. Real Gmail test set

Added to `docs/open-loops.md` (steps 20+): open -> carry -> advance -> close,
with the reply variants above (question back, "did not receive", a "no", a
answer in a new thread, a bare "Paid?" chaser, a reopen, a manual let-go).

## Results

(filled in below after measurement)
