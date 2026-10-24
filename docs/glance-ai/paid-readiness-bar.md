# Paid-readiness bar — Glance (personal)

Glance closes open loops. Glance's entry point is any surface the user is on.

This page is Glance only. Flow, the org product, is separate. The chief of staff decides when Glance is worth paying for by reading the yaml block below. A feeling does not flip it. `overall` is `green` only when every criterion is `green`. Until then `charge` stays `false`.

```yaml
bar: glance-paid-readiness
product: glance
updated: 2026-10-08
package: 0.9.40
overall: red
charge: false
rule: charge is true only when overall is green. overall is green only when every criteria status is green. proxy never fills current. null current is red.
criteria:
  - id: live_loop_types
    threshold: 6
    current: 3
    unit: types
    status: yellow
    ids_now: [E1, E2, E4]
  - id: frequency_weight
    threshold: 0.60
    current: 0.33
    live_mass: 14
    total_mass: 42
    status: yellow
  - id: surfaces
    threshold: [mail, calendar, files, chat]
    current: [mail, files]
    status: yellow
  - id: weekly_closes
    threshold: 5
    current: null
    unit: proved_closes_per_active_user_per_week
    status: red
  - id: minutes_saved
    threshold: 30
    current: null
    unit: minutes_per_user_per_week
    status: red
  - id: wrong_do_it
    threshold_max: 0.02
    current: null
    min_n: 100
    owner_checked: true
    status: red
    proxy:
      counts_as_current: false
      v2_veto_machine_reference: 0.014
      counts: "82/5727"
      source: docs/glance-ai/STATE.md
  - id: silence_on_real_loops
    threshold_max: 0.20
    current: null
    min_n: 100
    owner_checked: true
    status: red
    proxy:
      counts_as_current: false
      human_blind_ask_miss: 0.26
      human_blind_n: 35
      real_mail_gold_ask_miss: 0.0
      real_mail_gold_n: 8
      labels: model_assigned
  - id: scenario_gate_pass_rate
    threshold: 1.0
    current: 0.0
    passed: 0
    required: 5
    ids: [A, B, C, D, E]
    status: red
  - id: setup_minutes
    threshold_max: 10
    current: null
    unit: minutes_to_first_proved_close
    consent_screens_max: 1
    status: red
  - id: dogfood_keep
    threshold: 4
    of: 5
    days: 14
    min_days_used: 10
    current: 0
    status: red
  - id: unprompted_pay
    threshold: 3
    of: 5
    current: 0
    prompted_counts: false
    status: red
```

## Product definition (vision-locked)

Glance is a system for unfinished intentions. Its loop is detect, carry, execute, true close. People would pay for a loop that actually finishes, with proof, across the places they work. A draft, a reminder, and a tracking list are not that.

The price written in `docs/monetization.md` is $14 a month, or $132 a year. It is not on sale. `PRO_PUBLIC` is not set.

## Current implementation status (this tip)

Package **0.9.40**. The owner’s judgment on this date: Glance is not valuable enough, and not good enough, for anyone to pay. This page turns that judgment into a bar. The bar is **red**. Nothing here is a usage, conversion, or revenue number. The repository has none (`docs/open-tasks.md` row 33).

## 1. What a paying user must get

The weekly set is every finish in `docs/glance-ai/holistic-close-map.md` with frequency 4 or 5. Quiet rows are not in it. A draft that is not a close stays in the set, because a payer is buying the finish.

| ID | Finish | Fq | Live on this tip |
|---|---|---|---|
| E1 | Dated ask becomes a task | 5 | yes. Google Tasks, Gate 0.9.30 |
| E2 | Your own dated promise becomes a task | 5 | yes. Same proof. Outlook To Do, Gates 0.9.31 and 0.9.39 |
| E3 | The reply is actually sent, after a preview | 5 | no. A draft is not a close |
| E4 | One attachment saved to OneDrive | 4 | yes. Gate 0.9.37, re-checked 0.9.39 |
| E6 | Suggest-save, accepted, then proved | 5 | no. Engine only. The steps list is not shipped |
| C1 | A named meeting on the calendar, proved | 5 | no. Writer exists. Not on the proof gate |
| F1 | A file they asked for, on a sent message | 5 | no. The chain prepares a draft |
| M2 | An answer in the chat, from a connected source | 4 | no. Row 54. Not built |
| Y1 | A receipt that already exists, sent | 4 | no. Same shape as F1, plus the payment check |

Frequency mass is 42. Live mass is 14 (E1, E2, E4). The share is 14/42 = 0.33.

| Criterion | Bar | Today | Status |
|---|---|---|---|
| Live loop types | At least 6 of these 9, each with ProofOfClose and Undo where the write can be reversed | 3 (E1, E2, E4) | yellow |
| Frequency weight | Live mass / 42 at least 0.60 | 0.33 | yellow |
| Surfaces | Mail, calendar, files, and chat, each with one proved close | Mail and files (OneDrive). Calendar and chat are not proved | yellow |
| Weekly closes | Median active user: at least 5 proved closes in a week | Not measured | red |
| Minutes saved | At least 30 minutes a week per active user, median, self-reported in week 2 of dogfood | Not measured | red |
| Wrong-Do-It | At most 2% of shown Do It cards, on owner-checked real mail, at least 100 shown cards | Not measured on that set | red |
| Silence on real loops | At most 20% of real asks that should show a card stay silent, owner-checked, at least 100 asks | Not measured on that set | red |
| Scenario Gates | A, B, C, D, and E in the close map all pass on the build you would charge for | 0 of 5. Single-action Gates are not these | red |
| Setup | One consent screen per ecosystem, and a first proved close in under 10 minutes | Not timed. The Microsoft screen exists. Checked boxes fail until Entra lists the permissions (rows 44, 45) | red |

Thirty minutes is the money test from `docs/monetization.md`: $14 a month is about $3.50 a week. Half an hour of a working person’s time clears that. The figure is a bar, not a result.

### What the evals actually say

They do not fill `wrong_do_it.current` or `silence_on_real_loops.current`.

| Source | What it measured | Number | Why it is not the bar |
|---|---|---|---|
| Real-mail gold, 2026-10-08, real-only | Sentence class. Model labels. Not owner-checked | ASK precision 0.889, recall 1.0, n=8 asks. The one false ASK is rm-003 | n is 8. The runner did not see a Do It card. `docs/real-mail-eval/2026-10-08.md` says on-device show/Undo signals were not reachable |
| Same file, dogfood | Same | ASK recall 0.833 on n=12. Two misses, dg-105 and dg-108 | Dogfood sentences, model labels |
| Human blind set | ASK on the owner’s sent mail. Model labels | Recall 0.74 on 35 asks after the fix. The set is no longer blind | Sent mail, not received mail. Not owner-checked. `docs/human-eval.md` §3 |
| v2 + veto, held-out | Machine-reference wrong-Do-It and missed close | Wrong-Do-It 1.4% (82/5727). Missed close 50.8% (637/1255) | Not owner-verified. Owner-verified labels are 0 of 200. `docs/glance-ai/STATE.md` |
| Local false-close bar | Dismiss or Undo on this device | Bar is 15% in `core/close-quality-metrics.js` | Looser than 2%, and there is no population reading |

A 1.4% machine figure must not be copied into `current`. The missed-close half is the closer warning: on that set the model stays quiet about half the time.

Single-action Gates that have passed, and are not scenario Gates: 0.9.30 Google Tasks, 0.9.31 Microsoft To Do, 0.9.37 OneDrive, 0.9.39 re-check of those Outlook writes plus Google connect (`docs/open-tasks.md` rows 46, 47, 49, 50). Row 48, the computer page, is open. The 0.9.40 Gate has not been run.

## 2. Dogfood before anyone is charged

Five people: the owner and four friends. Fourteen days. Real mail and real chats. The free build. No Pro key, no comp licence used as a trial of the price.

**Keep-using.** At least 4 of the 5 write a line on 10 of the 14 days, and each of those 4 has at least 5 proved closes in days 8–14. A proved close is a Handled row with `fetchedBack`, not a draft and not a chip.

**Unprompted pay.** At least 3 of the 5 say, in their own words, that they would pay, on a day nobody asked about price. A form that says “Would you pay $14?” does not count. Write down the sentence they used.

**Cheap collection.** One shared note. Columns: date, person, proved closes (a count), minutes they think it saved, what broke. No message text, no names of other people, no attachments. The count comes from the Activity list already on the device (`core/proof-of-close.js`, `core/quiet-metrics.js`). The chief of staff reads the note on day 7 and day 14 and updates this yaml in the same commit. That is the whole instrument.

## 3. What people already pay for

Public list prices, checked 2026-10-08. Aggregator pages disagree with each other. These are not Glance measurements. Glance’s own written price is $14 a month (`docs/monetization.md`, 2026-10-01).

| Product | Public price | What they already get | What Glance has to beat |
|---|---|---|---|
| Superhuman | About $30 a user a month, about $25 on an annual Starter, on 2026 comparison pages. The repo’s own category line is $15–$30 | A faster inbox and reminders | A proved close. A faster draft is what they already buy. E3 is still a draft |
| Motion | Individuals Pro AI $49 a month, or $29 on the annual plan (Motion’s rate card, as reported in 2026) | The calendar filled in for them | C1 proved, with no guests unless they approve. Until that Gate passes, they already pay someone else to hold the hour |
| Reclaim | A free Lite tier. Paid seats are about $10–$18 a month on 2026 write-ups of the pricing page | Focus time and scheduling links | The same calendar proof, plus silence when the slot is not real (C6 stays quiet on purpose) |
| Lindy | From $29.99 a user a month | An agent that drafts and acts across mail, Slack, and meetings | ProofOfClose, and a send that waits for one click. Autonomy that sends on its own is the thing this product refuses |
| Instinct | No published price. Invite beta, $0 on the pages checked. Terms allow a fee later. It works from chat and phone | The errand, in the place the person already is | M2: the answer in the chat, found in connected sources, sent only after approval. At a published price of zero, Glance does not win by being cheaper |

## 4. Scorecard and the shortest path

| Order | Criterion | Status | Shortest move | Breadth slice |
|---|---|---|---|---|
| 1 | Dogfood keep, weekly closes, minutes, unprompted pay | red | Run the 14-day note. No new close type | No |
| 2 | Wrong-Do-It and silence | red | Owner-check at least 100 real asks, including mail received, and score shown cards. The 0 of 200 owner labels block this | No |
| 3 | Scenario Gates | red | Run scenario A on the three proofs that already pass | Scenario A. Not a slice |
| 4 | Live types and frequency weight | yellow | Ship the steps list so E6 can be proved. Then C1 and F1 | E6 is 0.9.41. C1 is slice 2. F1 is slice 3 |
| 5 | Surfaces | yellow | Calendar proof, then the chat answer | Slice 2 (calendar). Slice 1 (chat, M2) |
| 6 | The sent reply and the sent file | red, inside the type count | `Mail.Send` as the preview on the steps list, then F1 and Y1 close on the sent message | Row 53, then slice 3. Y1 rides on slice 3 |
| 7 | Setup under 10 minutes | red | Fix the Entra boxes (rows 44, 45). Time five people who did not build it, one consent each, stopwatch to the first proved close | No |

Slice 1, slice 2, and slice 3 from the close map are necessary for the surface rule and for the type count. They are not sufficient. Dogfood and the owner-checked rates can stay red after all three slices ship, and `charge` stays false.

Six of the nine types, a weight of 0.60, and all four surfaces, is the coverage bar. One path that clears it is E1, E2, E4, E6, C1, F1, and M2 (seven types, mass 33/42 = 0.79, surfaces mail, files, calendar, chat). E3 and Y1 can follow. E3 should follow before a charge anyway: a payer who only gets drafts is buying the thing Superhuman already sells.

## 5. Money steps while the bar is red

| Step | Now | Until `overall` is green |
|---|---|---|
| Pro launch, `PRO_PUBLIC=1`, Stripe live keys (row 11) | Open, and the monetization doc already says do not set the switch yet | Pause. Do not take a card |
| Paddle | Not in the repository. The rail that exists is Stripe | Do not open an account |
| Paid Chrome Web Store listing | No paid listing | Do not put a price on the listing |
| Free Chrome Web Store listing (row 7) | Open. Developer-mode install is the drop-off named in `docs/monetization.md` §5 | Keep. The five dogfood people need a normal install. The listing stays free, and the page does not say Pro is for sale |
| Netlify deploy, Morning invoices | Hold until the owner writes «מאשר» | Unchanged. This bar does not release that hold |

When a criterion changes, edit the yaml `current` and `status` in this file in the same commit. Add a line to `docs/vault/decisions.md` only when `overall` changes. The chief of staff owns that edit.
