# Latency and cost guard

Glance closes open loops. Gmail is where it starts today.

Short log for the performance routine. Numbers are from the scripted clocks in the tests, not from a live provider.

## 2026-10-15

Deeper read (`glance-assist/ladder.js`): the person, the network address and the daily cap were three counter round trips in a row before any model was asked. They now run together. A second ask for the same masked sentence, while the first is still running, waits on that read: one charge, one pair of model calls. The wait is dropped when the read finishes. The server still keeps no sentence and no answer.

On-device proposal (`core/local-lm.js`): the first suggestion still asks twice and both answers still have to agree. A repeat of a sentence that already became a proposal is not asked again. Silence is not remembered. The self-test still calls `classify`, and its precision gate is unchanged.

Measured in `ladder.test.cjs` with a 120ms counter and a 700ms model pair:

| | before | after |
|---|---|---|
| One deeper read | 1061ms | 821ms |
| Counter start spread | one after another | 0ms |
| Overlapping duplicate | 4 provider calls, 2 units | 2 provider calls, 1 unit |

Measured in `local-lm-corpus.cjs` with an 80ms prompt:

| | first suggestion | same sentence again |
|---|---|---|
| Prompts | 2 | 0 |
| Time | 162ms | 1ms |

The 821ms read is under the 1s p50 target on that clock. The old schedule was not (1061ms). Eval gates were not lowered.
