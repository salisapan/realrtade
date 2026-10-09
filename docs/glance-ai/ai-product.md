# Glance as an AI product: the plan (levels 2 and 3, cloud + device)

> Written 2026-10-09 at the owner's request. **Direction decided by the owner (2026-10-09):** «רמה 2 ו־3, שילוב של ענן ומקומי».
> This spec itself **waits for the owner's approval**. Until then the locked identity sentence in `CLAUDE.md` and `docs/product-identity.md` is unchanged (§8 has the proposed wording),
> nothing here sends mail text off the device, and every new path ships behind an off switch. Built by the daily Claude routine (§9); progress log in §10.

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
| 1 | Approve this spec, and the identity wording in §8 | The locked block changes only with the owner's say-so |
| 2 | Where Glance cloud model is served, and the monthly spend cap | Tier 2 cannot go live without a host |
| 3 | 200 owner-verified labels (`glance-ai/labeling/`, row 60) | Promotion of any model and any fine-tune needs them |
| 4 | The new privacy and consent copy (§6) | Nothing leaves the device under the new rule before it |
| 5 | Free/Pro allowance for model-first reading, after M6 numbers | Cost per user |

## 8. Proposed identity change (not applied)

Replace in `CLAUDE.md` "Standing constraints" and `docs/product-identity.md` rule 2:

- **Now:** «Glance is not an AI email product (AI is under the hood; outcomes are what we sell).»
- **Proposed:** «Glance is an AI product: its own model understands each intention and plans the close; what we sell is the close, proven. It is never "an AI email assistant" that writes for you or "a smart inbox".»

The locked first sentence («Glance closes open loops…») stays. The change lands in one commit with every file the consistency test names, after the owner approves.

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

## 10. Progress log

- 2026-10-09: spec written; direction decided by the owner; spec awaiting approval. Daily routine set (Sun–Thu, 10:52 Israel).
