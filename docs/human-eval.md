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
