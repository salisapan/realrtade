# Glance as an AI product: the plan (levels 2 and 3, cloud + device)

> Written 2026-10-09 at the owner's request. **Direction decided by the owner (2026-10-09):** «רמה 2 ו־3, שילוב של ענן ומקומי».
> **Approved by the owner 2026-10-09** («מאשר את כל מה שהצעת»), including the identity wording in §8, now applied. Still owner decisions (§7): where the cloud model is served and its spend,
> the privacy and consent copy, labels, the allowance. Until the privacy copy is approved nothing here sends mail text off the device, and every new path ships behind an off switch. Built by the daily Claude routine (§9); progress log in §10.

## בעברית, בקצרה

Glance הופך למוצר AI אמיתי. מודל שפה הוא המנוע הראשי שמבין כל מייל (רמה 2), ומעבר להבנה הוא גם מתכנן, מכין, פועל ומשוחח (רמה 3).

המודל רץ בשילוב:
- **על המחשב:** מנקה ומסתיר פרטים מזהים, מחליט על המקרים הברורים, ושומר על השקט.
- **בענן של Glance:** המודל של Glance, Qwen3.5-4B, מקבל טקסט מוסתר בלבד.

שלושה דברים לא משתנים:
- **המודל מציע ולא סוגר.** לולאה נסגרת רק על עובדה מוכחת (ProofOfClose).
- **שום דבר לא נשלח בלי תצוגה מקדימה ולחיצה.**
- **כש־Glance לא בטוח, הוא שותק.**

מה שעדיין מחכה לך:
- אישור המסמך הזה
- 200 תיוגים
- בחירת שרת לענן ותקציב
- נוסח הפרטיות החדש

## 1. What "AI product" means here

| Level | What the person sees | Today (this branch) | Target |
|---|---|---|---|
| **2. AI is the main engine** | Glance understands any mail, in Hebrew or English: who asked whom for what, by when, what was already done, whether it is relevant to *this* person | Rules and lexicons decide (`core/intent-pipeline.js`, `core/request-types.js`, `core/reply-model.js`); a model is a last resort and is **off** (`docs/ai-ladder.md`, `docs/hybrid-execution-architecture.md`, dormant) | A model reads every mail that has a possible intention and returns one structured **Understanding**; rules become the safety floor (quiets, veto, gate) |
| **3. AI plans, acts and talks** | Glance proposes the steps to close the loop, prepares them (draft in your voice, the right file, the event), and you can ask it «על מה אני מחכה מדנה?» | Pieces exist: the steps list (row 52, Dima), Draft It with voice (`core/style-profile.js`), suggest-save, chat Slice 1 (#122), Mail.Send approved with preview (row 53) | One **Plan** produced by the model from the Understanding, rendered by the steps list; an «ask Glance» answer over the person's own open loops and sources |

What we sell does not change: the loop is closed, and proven. What changes is that the AI is visibly the thing that understands and plans; it is named as such in the product and on the site once §8 is approved.

## 2. The floor (stays locked whatever the model says)

1. **ProofOfClose.** Handled only with `{system, externalId, fetchedBack, verifiedAt}`, remount and Undo (`docs/true-close.md` §7). A model never marks anything closed.
2. **Never sends or writes without the person.** Mail.Send only after a preview and one click (owner lock). Every write is the person's click.
3. **Silence beats a wrong Do It.** The strict gate and the veto stay between the model and the screen (`docs/glance-ai/STATE.md`: gated Qwen propose-only is 0 wrong-Do-It on 786 cases; without the gate it is 3.7%).
4. **Masked before it leaves.** `core/privacyShield.js`, `core/mask-ids.js`, `core/exec-router.js` `maskForServer`; the server re-checks and refuses unmasked text (`glance-assist/scrub-e2e.test.cjs`).
5. **Consent, and Free stays useful.** Cloud reading is opt-in on the one consent screen. Without it, Glance still works on the device tiers.
6. **Per-user relevance** (`docs/glance-ai/user-context-v0.md`): offer or quiet uses the person's profile; `unknown` keeps today's behaviour.

## 3. Architecture: three tiers, one Understanding

```
mail / page text
  └─ Tier 0, device, always (ms, $0): normalize → hard quiets → mask → rules + v2 small model → UserContext relevance
        ├─ clear, low risk (obvious ask, obvious quiet) ─────────────► decision, no model call
        └─ anything else with a possible intention
              ├─ Tier 1, device model if present (Chrome built-in model `core/local-lm.js`, or Ollama/LM Studio `core/local-lm-server.js`)
              │     short extraction: dates, who, the ask sentence ─────► Understanding (draft)
              └─ Tier 2, Glance cloud model (Qwen3.5-4B, masked text only, strict JSON `core/json-enforce.js`)
                    Understanding + Plan  ─────────────────────────────► strict gate + veto (device) ─► card / steps list / silence
```

**What changes from today:** the cloud model stops being a last resort for unrecognised sentences and becomes the primary reader for everything Tier 0 does not settle. Tier 0 still runs first: it is free, private and decides the easy half, and its quiets and veto still have the last word.

**The Understanding** (one JSON object, schema to be fixed in M1, validated on the device):
`{ relevant: yes|no|unknown, intentions: [{ kind, actor, counterpart, ask_span, due, amount, evidence_span, confidence }], state: open|answered|waiting|released, needs: [file|event|reply|task|payment] }`.
Every field cites a span of the masked text (`evidence_span`); a field with no span is dropped. That is how a model answer stays grounded.

**The Plan** (level 3): `{ steps: [{ action, target_system, inputs, needs_click: true }], done_when: <ProofOfClose condition> }`. The steps list renders it; nothing runs without the click.

**Hosting.** Owner lock: «Glance's own model runs on Glance cloud». Qwen3.5-4B is the measured OSS winner (`docs/glance-ai/STATE.md`). Where it is served (an inference host, a GPU box, a managed endpoint) and the monthly spend are an **owner decision** (§7). Until then the server path is built and tested against a mock provider, and the existing `glance-assist` providers stay as they are (`docs/ai-ladder.md`).

## 4. Level 3 in detail

| Capability | Built from | Who builds |
|---|---|---|
| Steps list from the Plan | row 52 UI (Dima) + Plan object (this spec) | UI: Dima. Plan + gate: Claude routine |
| Draft in the person's voice | existing voice/style profile, now fed by the Understanding | Claude routine |
| Find the right file / event | `core/resolution.js`, `core/file-path.js`, Drive/OneDrive search | Claude routine (logic), Dima (connectors) |
| Mail.Send with preview | row 53, owner-approved, after the steps list | Dima, with the Plan as its preview |
| «Ask Glance» | chat Slice 1 (#122) + a local index of the person's open loops; the model answers only from cited sources | Claude routine (answer engine), Dima (surface) |
| Intent on any site | owner lock "next after Mail.Send" | later; same Understanding contract |

## 5. Cost (to be measured, not guessed)

Today's hard caps stay until measured: the deeper read is metered in units (`docs/ai-ladder.md`: Free 120, Pro 1,500 a month; 3,000 a day for everyone, about $3.6 a day at most). Model-first reading calls the cloud far more often, so the allowance model must be re-derived from **measured** numbers. M6 measures, per real-shaped mail: share that reaches Tier 2, tokens in and out, latency, and cost per 1,000 mails on the chosen host. The Free/Pro allowance proposal comes to the owner with those numbers; no price or allowance in this file is final.

## 6. Privacy: what leaves the device changes

Today the site promises judgment on the device, with one masked sentence for the deeper read. Under this plan, the **masked text of mail that has a possible intention** goes to Glance cloud. That change ships only together with: `flow-landing/privacy.html`, `trial.html`, the Chrome Web Store data-usage text, `popup.html` footer, `docs/local-first-principle.md`, `llms.txt` if public, and the consent screen, all in the same commit as the switch (rule in `docs/README.md` §2). Until the owner approves that copy, the switch stays off.

## 7. Owner decisions this plan needs

| # | Decision | Why it blocks |
|---|---|---|
| 1 | ~~Approve this spec, and the identity wording in §8~~ **done 2026-10-09** | - |
| 2 | ~~Where Glance cloud model is served~~ **approved 2026-10-14**: a pay-per-use GPU host running our own copy of the model; the cap amount (below $50) still to be set; not rented yet | Tier 2 cannot go live without a host |
| 3 | 200 owner-verified labels (`glance-ai/labeling/`, row 60): now from the owner's own use, path A of `learning-from-use.md` (2026-10-13) | Promotion of any model and any fine-tune needs them |
| 4 | ~~The new privacy and consent copy (§6)~~ **approved 2026-10-14** (`docs/glance-ai/proposals/2026-10-12-owner-decisions.md` §2); it ships in the commit that wires the switch, off, and goes live only with a Netlify «מאשר» | Nothing leaves the device under the new rule before it |
| 5 | Free/Pro allowance for model-first reading, after M6 numbers | Cost per user |

## 8. Identity change (approved and applied 2026-10-09)

Replace in `CLAUDE.md` "Standing constraints" and `docs/product-identity.md` rule 2:

- **Now:** «Glance is not an AI email product (AI is under the hood; outcomes are what we sell).»
- **Proposed:** «Glance is an AI product: its own model understands each intention and plans the close; what we sell is the close, proven. It is never "an AI email assistant" that writes for you or "a smart inbox".»

The locked first sentence («Glance closes open loops…») stays. Applied in `CLAUDE.md`, `docs/product-identity.md`, `docs/local-first-principle.md`, `docs/local-detection-plan.md`, `docs/README.md` and the consistency test. Public site copy is unchanged until the owner approves new copy (it ships with a Netlify deploy, which is on HOLD).

## 9. Milestones (what the daily routine builds, in order)

Each milestone is a draft PR into the working branch, behind an off switch, with corpus tests; none deploys, enables a switch, rents a machine or calls a paid API with real keys.

| M | What | Done when |
|---|---|---|
| M1 | **Understanding contract**: JSON schema, device-side validator (spans must exist in the masked text, enums, confidence), corpus | Validator rejects ungrounded or malformed answers; tests pass |
| M2 | **Router v2** (`core/exec-router.js` / `core/ai-ladder.js`): Tier 0 → Tier 1 → Tier 2 selection, model-first behind `AI_PRIMARY` (off), the gate and veto applied to every model answer | With the switch off behaviour is byte-identical; with it on in tests, wrong-Do-It stays 0 on the lab sets |
| M3 | **Server path for Glance cloud model** in `glance-assist`: masked-only check, strict JSON, mock provider, quota hooks | Server tests pass with the mock; no deploy |
| M4 | **Tier 1 extraction** with the device model when present | Same Understanding from Tier 1 on the lab cases where it is confident |
| M5 | **Plan object** + the gate for steps; hand-off contract to the steps list (coordinate with Dima on #77) | Steps render from a Plan in the harness; nothing runs without a click |
| M6 | **Measurement**: shadow run of model-first over `glance-ai/eval-data/` (cached predictions, no paid calls), cost and latency model; numbers into `docs/glance-ai/STATE.md` | A table the owner can decide §7 rows 2 and 5 on |
| M7 | **«Ask Glance» answer engine** over the person's loops, answers only from cited sources | Corpus of questions with right answers and refusals |
| M8 | **Per-user context in the engine** (`docs/glance-ai/user-context-v0.md`, owner lock 2026-10-08): the profile (role, history, work style) feeds the Understanding's `relevant` field; group and Cc mail decided by relevance, `unknown` keeps today's behaviour; contrast-pair shadow test before any product quiet is removed | The lab scorer runs inside the router behind the switch; the contrast-pair shadow test reports wrong-Do-It and missed-close on relevant mail |

## 10. Progress log

- 2026-10-09: spec written; direction decided by the owner; daily routine set (Sun–Thu, 10:52 Israel).
- 2026-10-09: the owner approved the spec and the identity wording; applied in the identity files. The old 07:47 open-tasks routine was switched off at the owner's request.
- 2026-10-10: M8 (per-user context) added at the owner's request. Three more routines set: breadth builder (open-tasks row 65), scenario rehearsal (66), red team (67).
- 2026-10-11: **M1 built** (branch `claude/ai-engine-2026-10-11`, switch `aiUnderstandingV1`, default off). `core/understanding.js` validates a model's Understanding against the masked text. Every claim must quote real words; the device reads the due date from the quoted words itself; `proposal()` gives at most one step. Corpus `test/understanding-corpus.cjs`. Measured offline on the 786 cached Qwen3.5-4B shadow cases (`glance-ai/oss/shadow-combined/gated/score-understanding.cjs`, no model run, spec labels):

  | system | wrong Do It | missed (HE / EN) | model card with a wrong date |
  |---|---|---|---|
  | model, no gate | 8/464 | 23/322 (11/153, 12/169) | 8/8 |
  | model + validator (no gate) | **3/464** | 26/322 (14/153, 12/169) | **0/5** |
  | model + strict gate (today's lab best) | 0/464 | 37/322 (21/153, 16/169) | 8/8 |
  | model + validator + strict gate | 0/464 | 40/322 (24/153, 16/169) | **0/5** |

  Finding: every Hebrew weekday date the model put on a card was wrong (8/8; for example «ביום רביעי» said on a Wednesday read as tomorrow). The strict gate let all 8 through, and the validator corrects or stops all of them. Cost: 3 Hebrew promise cards (they already carried a wrong date) go silent, because `core/extract.js` does not read «עד רביעי» or «עד שלישי» without «יום». That parser fix is the next step; it waits because `extract.js` is in an open PR. The cached answers carry no spans or confidence, so the scorer gives each claim the span the text offers and every act a confidence of 0.9. The confidence floor is not measured here.
- 2026-10-12: **M1 finished, M2 built** (same branch; switches `aiUnderstandingV1` and `aiPrimary`, both default off).
  - The validator now also reads a bare weekday that `core/extract.js` leaves unread («עד שלישי», «ביום ה׳», "by Thursday"). It reads exactly one named day, the next one. A Hebrew weekday needs its prefix (bare «שני» is "two"), and two weekdays mean two alternatives, so no day.
  - The 3 Hebrew cards M1 lost come back with the right date. On the 786 cached cases, validator + strict gate: 0/464 wrong Do It, 37/322 missed (21/153 HE, 16/169 EN), the same as the strict gate alone. Model cards with a wrong date: **0/8** (the gate alone: 8/8).
  - `core/understanding-router.js`: Tier 0 rules, then the device model, then Glance cloud with consent and only masked text; the strict gate and veto sit on every model answer.
  - End to end with the device's real mask in front of Tier 2 (`glance-ai/oss/shadow-combined/gated/score-router.cjs`, cached answers as Tier 2): 0 wrong Do It on every set, 37/322 missed, 0/8 wrong dates. The mask stopped none of the lab texts.
  - Cost input for M6 and owner decisions 2 and 5: **150 of 796 mails (19%) reach Tier 2**. The rest are settled on the device with no model call.
  - Corpora: `test/understanding-corpus.cjs` and `test/understanding-router-corpus.cjs`.
- 2026-10-12 (after the owner's «תעשה הכל»): **M6 cost model** (`glance-ai/oss/cost/cost-model.cjs`, tables in `cost-tables.md`). It uses the measured 19% Tier 2 share and assumes a 1,500-character mail. At 100 mails a day, Glance cloud costs about $0.05–0.20 per person per month on pay-per-use hosts; an always-on L4 is about $281 a month fixed. Prices come from a web search and are not verified on the providers' pages. The three owner decisions (host and cap, privacy and consent copy, batch-001 labels) are prepared as one-word approvals in `docs/glance-ai/proposals/2026-10-12-owner-decisions.md`.
- 2026-10-13: **M3 built** (same branch, PR #128). `flow-landing/netlify/functions/glance-assist/understand.js` adds the actions `understand-read` and `understand-status`.
  - Off until all three are set: `GLANCE_AI_PRIMARY` (languages), `GLANCE_AI_SPEND_CAP_USD` (the owner's monthly cap for everyone together, counted per read at `GLANCE_AI_CALL_MICROUSD`, default $0.0004) and the model endpoint (`GLANCE_MODEL_URL` + `GLANCE_MODEL_KEY`, any OpenAI-compatible server; the host is still the owner's §7 row 2).
  - Each person also has a monthly allowance (`GLANCE_AI_PRIMARY_FREE`/`_PRO`, placeholders 300/3,000 until §7 row 5).
  - The server refuses text that still holds a contact detail, an amount or a date, with no call and no charge. It grounds every quote with `validate(..., { placesOnly: true })` and returns no model text.
  - A model that never answered is refunded; an answered read is charged.
  - The one shared prompt is `core/understanding.js` `instructions()`.
  - Bug found and fixed while building: the server read values it cannot read (the placeholders) and lowercased the quotes, so a date never reached the device. Now the server keeps the quote as written and the device reads it.
  - Tests: `glance-assist/understand.test.cjs` (switch, cap, masking, allowance, refunds, wire format, and one pass device mask → server → device router).
  - Lab: `score-router.cjs --via-server`: 0/464 wrong Do It, 37/322 missed, 0/8 wrong dates, the same as in-process. 150/150 cloud reads answered; $0.06 counted against the cap.
- 2026-10-14: **M5 built** (same branch, PR #128): `core/model-plan.js`, switch `aiPlanV1` off.
  - A grounded model proposal becomes the product's own process (`actions.js` `planFor`), drawn by the steps list (`step-list.js` `rowsFor`).
  - The plan gate allows only calendar, draft and task writes (never a send or a page action), requires an anchor that matches the proposal, and accepts only dates the device read.
  - Each plan carries `doneWhen` (a sent reply, an event read back, the promised item arriving; never the draft or the task itself) and `carry` (when Glance looks again).
  - Lab (`score-router.cjs`, Plans section): the 9 closes only the model found reach the screen. Before, 0/9 had a plan the steps list could draw. Now 9/9 are planned (Schedule It 3, Log It 4, Reply & Track 2), with 0 plan-gate refusals, 8/8 dated steps on the gold day, 0 send steps and 9/9 with a done-when. Anchor equals the gold step on 8/9 (the one miss is the existing wrong-action case).
  - The owner decision on labels (§7 row 3) is now met by path A of `docs/glance-ai/learning-from-use.md`. The batch-001 ask is withdrawn: the owner does not label by hand.
- 2026-10-18: after merging the working branch (0.9.56, #163/#144), two hand-off defects in M1/M5 came to light and are fixed.
  - (1) `proposal()` dropped the meeting's clock (`due_time`), so a model meeting would have become a calendar event with no hour. The new `planFor` correctly refuses a calendar step without a clock, so the 3 lab meeting plans became `no-process`. The clock now travels from the quote to the step: calendar steps with a clock went from 0/3 to 3/3.
  - (2) `model-plan` did not pass the mail text to `planFor`, so its new meeting veto (cancelled, past, out-of-office, webinar) and its hedge check did not run on model plans. They do now, with corpus cases.
  - `extract.js` 0.9.56 now reads «עד 14/10» as 14 October; the corpus follows it, and «3/4» stays unread.
  - Lab after the fixes: 9/9 model proposals planned, 8/8 right dates, 0 send steps, 0/464 wrong Do It, 37/322 missed.
- 2026-10-19: **M8 built (silence-only)** (same branch, PR #128): `core/understanding-router.js` switch `aiRelevanceV1` (off).
  - The host's per-user profile scorer is injected as `deps.relevance`. A `not_relevant` mail is silenced right after the hard quiets, before any model call. `relevant` and `unknown` change nothing, so the router never adds a card today's rules would not show; the owner lock keeps the Cc-only, addressed-to-other and no-To/Cc hedges.
  - Measured through the real router on the frozen contrast-heldout-v0 pairs (`glance-ai/profile/run-router-relevance.cjs`; synthetic, `ownerVerified` 0), with Tier 0 as today's engine and the lab's `featurize` as the scorer: wrong Do It 10/60 → **5/60**, missed close on relevant mail 50/60 → 50/60 (unchanged). 33 of 120 mails end before any model call.
  - The offer side (the full lab judge) stays a shadow only: it would bring missed closes to 11/60, but wrong Do It stays at 10/60, so it is not built in.
  - With no profile the scorer says `unknown`, and the 786-case lab numbers do not move.
- 2026-10-20: **carry until closed for model closes** (same branch, PR #128, switch `aiPlanV1` off). `core/model-plan.js` `toWatch()` hands a planned ask or promise to the follow loop (`core/follow-up.js` `buildWatch`), so a close only the model found is carried like every other one.
  - An ask of you becomes a "mine" loop (`owe:reply`) that closes when your reply goes out.
  - A promise to you becomes a "theirs" loop, chased by the loop's own `chaseDate` until the item arrives.
  - A meeting stays on the calendar.
  - `carry` in the plan now uses the same rules, so the plan and the loop never disagree.
  - Lab: model asks and promises carried by the follow loop went from 0/6 to **6/6** (mine 2, theirs 4); loop deadline on the gold day 5/5.
- 2026-10-21: **M4 built** (same branch, PR #128): `core/understanding-device.js`, switch `aiDeviceTier1` off.
  - The device model reads a mail twice and counts an answer only when both readings agree. A per-language self-test (the `local-lm.js` bars) decides whether it may run at all; otherwise Router v2 sends the mail to Glance cloud, masked.
  - Lab simulation (`score-router.cjs --device`): the cached Qwen3.5-4B answers play the device model. Its self-test on these cases fails, with precision EN 0.57 and HE 0.56 before the gate, against a 0.97 bar. So Tier 1 stays off, all 150 mails go to the cloud, and the numbers do not move. The gate keeps a weak device model out.
  - What-if with the test forced to pass (`--device --device-pass`): the device answers 33 mails itself and cloud calls drop from 150 to 117. Quality is unchanged (0/464 wrong Do It, 37/322 missed, 0/8 wrong dates, 9/9 planned, 6/6 carried), because the strict gate and veto sit on Tier 1 too.
  - Not a measurement of any real browser model.
- 2026-10-25: **M9, the AI engine in one call** (branch `claude/ai-engine-2026-10-25`, switches `aiPrimary` and `aiPlanV1`, both off). `core/ai-engine.js` `read(mail, deps, flags)` is the one entry a host calls: Router v2, then for a model card the plan and the follow-loop watch. The engine's own card passes through untouched. A file card is marked `suggestSave`. A model card that cannot be planned is not shown. With `aiPrimary` off it returns `{used:false}` and calls nothing. Corpus: `test/ai-engine-corpus.cjs`. No host calls it yet.
  - First lab run against **today's engine** (0.9.56, `makeEngine('tip')`) instead of the stored 0.9.35 columns: `node glance-ai/oss/shadow-combined/gated/score-tip.cjs`. Cached Qwen3.5-4B answers as Tier 2, real device mask, strict gate and veto, spec labels, 786 cases.
  - ALL pooled: wrong Do It 25/464 → 25/464; missed 128/322 → 86/322 (Hebrew 57/153 → 29/153, English 71/169 → 57/169). OSS missed 58/108 → 31/108; v2 held-out 57/182 → 50/182; adversarial 4/22 → 1/22; injection 9/10 → 4/10. Wrong Do It is unchanged in every set.
  - 42 model cards, all 42 planned, 32 carried by the follow loop, 0 on a gold-silent mail. 227 of 796 mails reached the cloud tier.
  - Finding: the 25 wrong Do Its come from today's engine on its own (tier 0), not from the model chain. On the stored 0.9.35 columns the same chain had 0/464, so the engine moved on these cases between 0.9.35 and 0.9.56. Not yet broken down by commit.
- 2026-10-21: the AI-engine numbers (M1–M8) live in this §10 only. `docs/glance-ai/STATE.md` and `glance-ai/run-cpu-checks.sh` are left as on the working branch, because open PR #150 also changes both files and the auto-merge lock forbids a shared file. The lab scorers run on their own: `node glance-ai/oss/shadow-combined/gated/score-understanding.cjs`, `score-router.cjs`, `score-router.cjs --via-server`, `node glance-ai/profile/run-router-relevance.cjs`, `node glance-ai/oss/cost/cost-model.cjs`. They go back into `run-cpu-checks.sh` once #150 is closed.
- 2026-10-20 review: `negation-conditional` is red at the tip without this change. It was added in `8e0682f1` (#165), and its first failure is v2syn-1639 pos-meeting-ask, which wanted an offer and got intent-null. `gmail-outlook-parity` is green again. The others are unchanged from 10-19.
- 2026-10-19 review: the 7 corpora from 10-18 are still red at the tip. `realshape-0956` and `regress-144` are red too: their Hebrew hold fixture is pinned to «18/10 11:00», which is now in the past (date-bound, no code commit). `live-gate-0956` failed once and passed three times in a row (flaky).
- 2026-10-18 review, red on the working-branch tip without this change (with `jsdom` installed): `background-write`, `card-decision`, `gmail-outlook-parity`, `google-closes`, `outlook-runner` and `outlook-sync` break at `3bba620f` (#163, the 0.9.56 bundle). `flip-sample-0956` has been red since `183e1cd5` (#144). Without `jsdom` (a new devDependency) 10 more fail for that reason alone. `outlook-calendar` is green again.
- 2026-10-12 review, red on the working-branch tip without this change:
  - `outlook-calendar-corpus` is still red (the `instanceof Date` defect, see 10-11).
  - `glance-ai/profile/test-heldout.cjs:36` expects the learned profile scorer at 58.3% (35/60) and gets 60.0% (36/60). It is green on the first parent of `f8f57a6` and red from the #118 merge, so the 0.9.41–0.9.55 engine moved one pair. The number needs re-pinning by the lab owner. It also stops `run-cpu-checks.sh` before its later steps; both M1/M2 scorers were run directly and pass.
- 2026-10-11 review: `test/outlook-calendar-corpus.cjs` has been red on the working branch since 2026-10-08, with or without this change. Cause: `core/outlook-calendar.js:119` checks `i.now instanceof Date`, which is false for a Date from another realm (the test's vm sandbox), so the code falls back to the real clock, and the fixture's 2026-10-08 is now in the past. Clock-dependent, not a code commit (bisect lands on the docs-only #105). Fix: read `now` through `getTime()`. Also red on the base without this change: `glance-ai/run-cpu-checks.sh` step 4 (regenerated `all.jsonl` sha256 `d7961f08…` against the pinned `d4aab097…`), so steps 5–7 did not run. The gated score and the new Understanding score were run directly and pass.
