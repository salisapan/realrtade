# Human-text evaluation: the first numbers on real mail

> Written 2026-10-03. Companion to `docs/ai-engine-upgrade.md` and `docs/intent-model.md`.
> Measured with `node scripts/intent/human-eval.cjs [--blind] [--errors]`.

## 1. What this is, and what it is not

Every earlier evaluation set was written by a model, so each one measured how well the engine matches a model's idea of an
email. This set is different in one way and the same in another:

- **The text is human.** The sentences come from the owner's own sent mail, read through the Gmail connector with the
  owner's explicit approval (2026-10-03), limited to outgoing messages. Nine of them were read in full, and the connector returned the quoted threads of other
  people inside some of them; none of that quoted text was kept. The rest were read as the first lines of each message (the
  search preview) only. Names, numbers, identifiers and anything sensitive were removed or
  replaced by neutral stand-ins before anything was saved. The files are `flow-trial-extension/test/fixtures/private/`
  and are **gitignored: they are not in the repository and must not be committed.** Only aggregate numbers are written down here.
- **The labels are not human-checked.** A model assigned ASK / PROMISE / INFORM / ACK (and "clear" or "borderline") to each
  sentence. The owner has not reviewed them. Until they do, read every number below as "agrees with a careful model reading real text".
- It is one person's mail: mostly Hebrew, a student, a tenant and a buyer writing to institutions, offices and vendors. It
  says little about English business mail, and nothing about mail written *to* the owner.

## 2. Size

| Set | Sentences | ASK | PROMISE | Role |
|---|---|---|---|---|
| `human-eval` | 96 | 40 | 5 | looked at, then used to find gaps (so tuned) |
| `human-blind` | 79 | 35 | 2 | different messages, measured BEFORE any fix made for them |

PROMISE has 5 and 2 examples. **No PROMISE number here means anything**; they are listed only so nobody invents one.

## 3. What was measured (pipeline = lexicon + model, as shipped)

| Moment | ASK precision | ASK recall (95% CI) | PROMISE precision / recall |
|---|---|---|---|
| First contact, `human-eval` (before any change) | 0.90 | **0.45** (0.31 to 0.60) | 0.40 / 0.40 (n=5) |
| First contact, `human-blind` (before any change made for it) | 0.90 | **0.77** (0.61 to 0.88) | 0.00 / 0.00 (n=2) |
| After the formal-Hebrew fix, `human-eval` (tuned, optimistic) | 0.95 | 0.88 | 0.83 / 1.00 (n=5) |
| After the same fix, `human-blind` (a fix for the over-broad frame it exposed was made on this set, so it is no longer blind) | 1.00 | 0.74 | 0.67 / 1.00 (n=2) |

For comparison the model-written sets sit at ASK recall 0.82 to 0.94 with precision 0.97 to 1.00.

## 4. What it found, and what was changed

On real mail the engine missed more than half of the polite requests a Hebrew writer actually uses in letters to offices:
"אודה ל…" (I would be grateful for…), "נודה ל…", "אבקש…" (I would ask…), "אני מבקש…", "ברצוני לדעת / לברר…" (I wish to know / check),
and "הארכת זמן" style asks. None of those frames existed in the lexicon or the training grammar, so recall on the sentences
the product is for was about 0.45, against 0.89 on the model-written sets. That gap was the point of getting real text.

Changed (general grammar, not the sentences):
- `core/request-types.js`: formal first-person request frames; a few Hebrew action words ("סיוע", "בירור", "לברר", "לדעת",
  "בדיקת", "לקבל", "הארכה"); more first-person future verbs ("נחתום", "אדאג", "אעשה" and others), and a relative
  "ש" in front of a verb no longer counts as a promise ("the form you asked me to send" is not a promise).
- `core/intent-pipeline.js`: a confident ask in a formal request frame that names no action ("אודה לסיוע בנידון")
  is an ask for a reply.
- `scripts/intent/generate.cjs`: formal-register templates and ten formulaic polite requests, then retrained.
- `ברצוני` ("I wish") became a request frame only before "לדעת / לברר / לקבל / לוודא / לבקש". As a bare frame it made
  "ברצוני לעדכן" (I wish to inform you) a false ask. This was found by the blind set, and fixed.

One test gate was changed: "pipeline recall at least 1.4x the word lists" on the teacher set became 1.3x, because the word
lists themselves improved (the lexicon's PROMISE recall on the teacher set is now 0.63) while the pipeline's own recall did not fall. No precision gate
was touched. Four fixtures in `outcome-labels-corpus.cjs` that were "asks the engine stays silent on" were replaced because the
engine now recognises two of them (an improvement).

## 5. What is still wrong, from the errors of the two sets

- English recall on the first set was 0.4 (n=11 sentences): unmeasured, probably weak for phrasings like "I don't see the refund".
- Present-tense reports of an action ("I am passing the file to you now") are read as promises.
- Bare imperatives to a friend with no frame ("send me her details") are only reached through the model.
- "אני עדיין …" statements trigger the loose first-person promise shape.
- Nothing here measures the mail the owner RECEIVES, which is where most asks and promises of other people arrive.

## 6. What would make this a real benchmark

1. The owner checks the labels (a quick pass over about 175 sentences, in a spreadsheet, without the product).
2. A larger and more varied sample, including received mail, and a second person's mail.
3. A rule that this set is never used to train anything, and that every fix made after looking at it is declared in this file.

## 7. Real-mail gold set

Measured 2026-10-06 with `node scripts/intent/real-mail-eval.cjs`. The sentences are `flow-trial-extension/test/fixtures/real-mail-gold.json`: 22 masked sentences from the owner's mail of 2026-10-05 (15 real: `real_other` or `real_own`; 7 `dogfood_test`, reported on their own line and left out of the real-only line). This file is committed because it is masked. The labels were assigned by a model and have not been checked by the owner. **n is tiny.** This is the first run; there is no earlier run to compare to. The sentences are evaluation only and were not used to train anything.

A sentence-intent row is the shipped pipeline, the same call as §3: unsure, INFORM and ACK are SILENT. A reply row is `classifyReply` on a waiting loop: closed, paid or declined is CLOSE, and every other outcome holds. Own mail is also checked with the loop opener (`classifyOutgoing` / `classifyCommitment`). Direction is incoming or own. rm-016 is the owner's sent ask and the same sentence on the test inbox; it is scored once.

### First run, before the general fixes in this section

Decision class. n is the gold count. P and R are precision and recall.

| Slice | ASK P / R (n) | PROMISE P / R (n) | HOLD P / R (n) | CLOSE P / R (n) | SILENT P / R (n) |
|---|---|---|---|---|---|
| All (22) | 0.8 / 1 (8) | 1 / 1 (1) | 1 / 0.667 (3) | 0.5 / 1 (1) | 1 / 0.778 (9) |
| Real-only (15) | 0.6 / 1 (3) | 1 / 1 (1) | 1 / 0.667 (3) | 0.5 / 1 (1) | 1 / 0.714 (7) |
| Dogfood (7) | 1 / 1 (5) | — | — | — | 1 / 1 (2) |
| Hebrew (14) | 0.75 / 1 (3) | 1 / 1 (1) | 1 / 0.5 (2) | 0.5 / 1 (1) | 1 / 0.857 (7) |
| English (8) | 0.833 / 1 (5) | — | 1 / 1 (1) | — | 1 / 0.5 (2) |
| Hebrew real-only (12) | 0.75 / 1 (3) | 1 / 1 (1) | 1 / 0.5 (2) | 0.5 / 1 (1) | 1 / 0.8 (5) |
| English real-only (3) | n=0, one false ASK, recall not defined | — | 1 / 1 (1) | — | 1 / 0.5 (2) |

Source-family recall on the first run (hits / n), where it was not already 1: `forward_handoff` 0/1, `silent_negative` 4/5, `ask_to_third_party` 0/1. The other families were 1. Dogfood was 7/7. Several source families share one label, so precision is the decision-class column above, not a separate number per source family.

Already right on the first run, so no change was made for them: the hedged "I hope to send it this week" (rm-001) was already a promise with no day, which holds; the out-of-office (rm-015) was already an auto-reply, which holds; the negative imperative (rm-014) and the conditional aside (rm-004, borderline) were already silent.

### After those fixes, same 22 sentences

| Slice | ASK P / R (n) | PROMISE P / R (n) | HOLD P / R (n) | CLOSE P / R (n) | SILENT P / R (n) |
|---|---|---|---|---|---|
| All (22) | 0.889 / 1 (8) | 1 / 1 (1) | 1 / 1 (3) | 1 / 1 (1) | 1 / 0.889 (9) |
| Real-only (15) | 0.75 / 1 (3) | 1 / 1 (1) | 1 / 1 (3) | 1 / 1 (1) | 1 / 0.857 (7) |
| Dogfood (7) | 1 / 1 (5) | — | — | — | 1 / 1 (2) |
| Hebrew (14) | 0.75 / 1 (3) | 1 / 1 (1) | 1 / 1 (2) | 1 / 1 (1) | 1 / 0.857 (7) |
| English (8) | 1 / 1 (5) | — | 1 / 1 (1) | — | 1 / 1 (2) |
| Hebrew real-only (12) | 0.75 / 1 (3) | 1 / 1 (1) | 1 / 1 (2) | 1 / 1 (1) | 1 / 0.8 (5) |
| English real-only (3) | — | — | 1 / 1 (1) | — | 1 / 1 (2) |

Source-family recall after the fixes is 1 everywhere except `ask_to_third_party` (0/1). The own-loop check agrees on every own sentence (it disagreed on rm-002 at the first run).

What changed, each one a general rule, each failing sentence added to an existing corpus:

- A model-only "reply" with no question and no reply cue is not an ask (`core/intent-pipeline.js`). That was the marketing line "You just need to point it at something" (rm-022).
- A short message that is only a contact line ("Phone:" / "טלפון:") holds the loop; it is a signature, not an answer (`core/follow-up.js`). That was the forward that left only a signature (rm-009), which had closed by default.
- The Hebrew forward banner "הודעה שהועברה" is a quote cut, the same as "Forwarded message" (`core/graph-mail.js`). Without it the owner's quoted ask in that forward was still visible and read as an incoming ask.
- "כשיהיה לך נוח" / "כשנוח לך" is the same convenience hedge as "כשיהיה לך זמן" (`core/follow-up.js`). The pipeline was already silent on rm-002; the loop opener was treating "מחכים לפירוט כשיהיה לך נוח" as a new ask.

Still open: rm-003, a feminine singular imperative ("עדכני" / "אשרי") the model names as an ask to approve. The masked sentence does not say who is addressed; the name in it is the person who would receive a green light, not the addressee. Suppressing feminine imperatives would be wrong for a reader the imperative does address, and there is no account-holder identity on the sentence. Left as a miss rather than a special case.

No precision gate was lowered. On the sets those gates measure, pipeline precision and recall were the same before and after the reply-cue change: teacher-eval ASK 1.00 / 0.92 and PROMISE 1.00 / 0.87; the second evaluation set ASK 0.97 / 0.82 and PROMISE 1.00 / 0.75; the blind set ASK 1.00 / 0.94 and PROMISE 1.00 / 0.83.
