# User context v0

Glance closes open loops. Glance's entry point is any surface the user is on.

## Owner lock — 2026-10-08, about 18:02 Israel

Sali locked this in Hebrew. The filing recorded the intent and did not attach a verbatim transcript, so this page does not put invented Hebrew inside quotation marks.

The lock:

Glance keeps a profile of the person across the whole product: who they are, their role, how they handled similar mail, and how they work. Offer or quiet uses the mail and that profile together. This is the judgment for every loop, not a one-off rule for one kind of email.

On group or broadcast mail, relevance decides. When the mail is relevant to this person, the mail has an explicit intent span, and a close is possible, Glance offers. When it is not relevant, Glance stays quiet. "Hi all", "היי לכולם", a distribution list, and Cc are profile features. They are not a blanket quiet.

## Product definition (vision-locked)

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. A user's intent, wherever the user is (the floating extension on any site, plus the user's own computer), is closed end to end and proven. Glance stays silent when it is uncertain, never sends on its own, treats a draft as unfinished, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.

The profile does not change that block. `unknown` is the uncertainty the block already keeps quiet. A `relevant` mail with an explicit intent span and a possible close is not uncertainty, and Glance offers it.

## Current implementation status (this commit)

UserContext v0 is a lock and a schema. It is not built. This commit does not change `flow-trial-extension` and does not wire a profile into Do It.

Two quiets stay until a contrast-pair shadow test shows the profile changes the answer on the same mail:

- Cc-only and addressed-to-other. The shadow pack already returns those reasons from `glance-ai/model/shadow-pkg/src/gs-prepare.js` (`productVeto`).
- A reply ask with no To and no Cc. Open PR #118 records that as `quiet: hedge` ("No To and no Cc is not that ask"). This docs change does not remove that hedge.

They lift only after that shadow test passes. Until then, `unknown` and a cold profile keep today's quiet-first behavior, including those quiets.

## What the profile holds

Features and counts only. No mail body is stored in the profile.

| Block | Contents | Source |
|---|---|---|
| A. Identity and role | Name, aliases, emails, title, department, manager, reports, distribution lists | Graph `/me` and `/me/manager`, the signature on sent mail, Instinct onboarding |
| B. Relationships | Per sender and per group: reply rate, reply speed, and whether they reply when they are only one of a group | Sent Items and thread metadata. No bodies |
| C. Glance decision history | Per intent family and per sender or group: approve, reject, Undo, edit, and missed close. Counts decay over time. The half-life is not chosen in v0 | Extension events and ProofOfClose |
| D. Work style | Active hours, languages, preferred tools (Drive or OneDrive, To Do or Tasks), channels | The same event log, plus what Connect already knows |
| E. Explicit preferences | What the person stated, including "don't offer me X" | The person, in the product |

Approve means Do It and `fetchedBack`. A missed close means Glance stayed quiet and the person closed that loop alone.

Instinct onboarding writes role and department on the first day. A missing role is therefore short-lived. History starts empty. An empty history is not, by itself, `not_relevant`.

## Privacy

- The profile stores features and counts. It does not store mail bodies.
- It is per user, encrypted, on Glance cloud. The writer is not built. The privacy page, the store text, and `docs/local-first-principle.md` change in the same commit as that writer.
- The person can view, edit, and delete the profile.
- Training consent is off by default. A shared base model does not train on one person's profile unless that consent is on.

## Judgment

`relevance(email, profile)` is an explicit output:

| Value | Meaning |
|---|---|
| `relevant` | This mail is this person's, with a reason |
| `not_relevant` | This mail is not this person's, with a reason |
| `unknown` | The profile cannot say. Today's behavior |

The reason is kept with the value. Examples of features that feed it: `user_is_approver_for`, reply rate on that sender or group, accept rate on that intent family. In Qwen the profile enters as a short prompt summary. It is not a per-user fine-tune.

Offer and quiet:

1. A hard quiet stays a quiet: negation, mass-mail footer noise, injection.
2. No explicit intent span in the mail stays a quiet. The profile decides relevance. It never invents a request.
3. A close that is not possible is not offered.
4. Otherwise read relevance.
   - `relevant`: Glance must offer.
   - `not_relevant`: quiet.
   - `unknown`: today's behavior.

Group and broadcast mail use the same three values. "Hi all", "היי לכולם", a distribution list, and Cc are features (`approver-for-group`, group-mail reply rate, role matches the topic). None of them is a veto.

Relevance may come from a proven role (Graph or Instinct onboarding), from history, or from work style. Any one of those is enough. An earlier draft of this lock said a quiet becomes an offer only after *k* similar past closes, or a proven role. That *k* gate is not the rule.

An explicit preference ("don't offer me X") makes that family `not_relevant` for this person.

When the profile is what made the offer, the card says why. Example: "you usually approve onboarding from HR". A reject on that card is written back into block C.

The floor, unchanged:

- Do It only when the mail itself has an explicit intent span.
- Negation, mass-mail footer noise, and injection stay quiet.
- Handled only after `fetchedBack`.
- A send is a preview and one click. Glance does not send by itself.

## Metric

Beside wrong Do It, the primary metric is missed closes on relevant mail: `relevant`, an explicit intent span, a possible close, and Glance stayed quiet.

A quiet on `not_relevant` is a correct quiet. `unknown` is scored as today's behavior until the profile can say `relevant` or `not_relevant`. This metric is defined here. It is not measured yet.

## Labeling

Owner gold continues for items that do not depend on who the person is: negation, noise, a direct ask, money. Those still count toward the 200 binary owner labels.

Items that depend on the person get a context-dependent label with `depends_on`, naming the profile feature that must be true. They are not counted toward the 200 binary gold. Item 8 (`v2syn-405`, "Hi all, approve onboarding asap") is that kind of item, and so are the same shape: group greeting, Cc, addressed to someone else, FYI. A future question asks what must be true about the person for this to be theirs. It does not ask for a bare yes or no.

The proof that the model uses the profile is a contrast-pair set: the same mail, two profiles, two correct answers. One pair: "Hi all, can you please approve onboarding asap?" With a profile that is the onboarding approver, the correct result is an offer. With a profile that is not, and whose history stays out of that list, the correct result is quiet. The pair fails if both profiles get the same answer.

## GPU

A GPU is still not the critical path. The blocker is data: the event log and this schema. There is no per-user fine-tune. The shared base model stays, with CPU priors, and the profile is a summary in the prompt.

Sali's GPU gate stays: 200 owner-verified labels, plus held-out v2. This lock adds three things that have to exist before GPU training is useful: the UserContext v0 schema, a shadow event log of the counts in blocks B and C, and the contrast-pair set. Cap and the parked runbook stay as in `docs/glance-ai/STATE.md`. Do not rent a machine for this.

## What this file does not do

It does not lift cc-only, addressed-to-other, or the no-To/Cc hedge in PR #118. It does not change the release order in `docs/open-tasks.md`. It does not turn on a model, a send, or Morning. It does not describe Flow.

## Lab contract

The owner lock above wins where this lab contract differs. Cc-only, addressed-to-other, and the no-To/Cc hedge in PR #118 stay until a contrast-pair shadow test. This lab scores synthetic pairs. It does not lift those quiets in the product, and it is not wired into the extension, the manifest, or any shipped path.

The code is `glance-ai/profile/` and `glance-ai/labeling/contrast-v0.jsonl`. No mail body is stored in the profile. Owner-verified labels stay 0. Nothing in the contrast set is labeled by the owner.

The lab scorer uses a 30-day half-life on decision counts. The product half-life is not chosen in v0.

## Profile fields

Stored per user as features and counts. Never a mail body.

| Field | What it holds |
|---|---|
| Identity / role | Aliases, title, department, manager, groups and distribution lists with role `member`, `owner`, or `approver`, and people who report to the user |
| Relationships | Per sender or group: reply count, seen count, reply rate, median latency, whether the user answers that group's mail, and whether the user covers a named person |
| Decision history | Per intent family × sender or group: approved with `fetchedBack`, dismissed, Undo, edited, and missed close (silent, then the user closed it by hand). The lab scorer decays counts with a 30-day half-life |
| Work style | Working hours and timezone, languages, preferred file place (Drive or OneDrive), preferred task place (To Do or Google Tasks), `savesFiles` (`always`, `never`, `unknown`), `answersGroupMailRate` |
| Explicit preferences | A class (`group`, `cc`, `fyi`, `save`, `vendor`) set to `offer` or `silent` by the person |

`trainingConsent` is false unless the person turns it on.

## Where each field comes from

| Field | Source |
|---|---|
| Aliases, title | Graph `GET /me`, plus the name the person confirms |
| Department, and the day-one role | Instinct onboarding. One screen, role and department, not a questionnaire |
| Manager | Graph `GET /me/manager` |
| Groups and who owns them | Graph group membership. Address and role only |
| Reply rate and latency | Sent Items metadata: counts and timestamps. Not the message body |
| Answers group mail | The same metadata, on threads whose recipients are a group |
| Decision history | Extension events below, plus ProofOfClose. `approvedFetchedBack` increments only when `fetchedBack` is true |
| Missed close | `manual-close-after-silence` |
| Hours and languages | Onboarding, plus a histogram of send times (counts, not text) |
| Preferred tools and explicit preferences | The person edits them. Glance does not infer a preference from one mail |

The record is per user, encrypted at rest, and the person can view it, edit it, and delete it. Delete drops the features and the event log for that user. Training consent stays off by default and is not implied by having a profile.

## How the lab enters judgment

The classifier sees the email plus the feature object from `glance-ai/profile/featurize.cjs`. A later Qwen call, if one is used, sees a short profile summary (role, the one relevant rate or count, the reason code). It does not see a mail archive.

Order:

1. Featurize. If relevance is `unknown`, return today's decision unchanged. Do not re-apply a silence.
2. Hard floor. If it trips, stay silent.
3. If `not_relevant`, stay silent.
4. If `relevant`, offer only when an explicit intent span exists and the close is feasible. The card's because-line is the reason codes (`user_is_approver_for`, `manager_request`, `covers_addressee`, `named_addressee`, `role_matches_topic`, `history_closed`, `work_style_saves`, `answers_group_mail_rate`, `cc_reply_rate`, `explicit_preference`).

A proven role outweighs a low group reply rate. In the lab pairs, mail addressed to someone else, when the profile knows who the user is and that person is not an alias and not someone they cover, is `not_relevant`. That lab result does not lift the product quiets named in the owner lock.

"לא נדרשת פעולה" / "no action required" removes a reply or task span. It does not by itself forbid filing an attachment when the work style is to file that mail. "Do not save" / "אל תשמור" stays a negation.

### Hard floor (unchanged)

- An offer needs an explicit intent span. Glance does not invent an ask. A bare "we approved ₪89" is a span only for the role that owns that money; it is not a span for anyone else.
- Negation stays silent.
- Noise-footer and injection stay silent.
- Handled only after `fetchedBack`.
- Send only after a preview and a click. Glance never sends on its own.

Group address, a vocative, Cc-only, and FYI are not in this floor. They stay product quiets until the shadow test in the owner lock.

## Event log (spec for Dima)

The extension does not write this yet. One row is one event. No subject, no body, no snippet.

```json
{
  "eventId": "uuid",
  "userId": "the profile id",
  "at": "2026-10-08T12:00:00.000Z",
  "type": "shown",
  "messageIdHash": "sha256 of the provider message id",
  "intentFamily": "follow-up-ask",
  "partyKey": "sender or group address, lowercased",
  "action": "follow-up-ask|draft",
  "fetchedBack": false,
  "surface": "the surface the person had open"
}
```

`type` is one of `shown`, `approved`, `dismissed`, `undo`, `manual-close-after-silence`.

| Event | What it does to the profile |
|---|---|
| `shown` | Counted. Does not by itself close or dismiss |
| `approved` | Increments `approvedFetchedBack` only when a later read sets `fetchedBack` |
| `dismissed` | Increments `dismissed` for that family × party. The next similar mail can go `not_relevant` |
| `undo` | Increments `undo` |
| `manual-close-after-silence` | Increments `missedClose`. Glance was silent and the person closed the loop themselves |

`edited` increments when the person changes the prepared action before approving it. Preparation is not completion. A draft, a task, a calendar hold, or a file save counts toward `approvedFetchedBack` only after ProofOfClose.

## Contrast set

`glance-ai/labeling/contrast-v0.jsonl` is 40 pairs, 20 Hebrew and 20 English. Each pair is the same email with two synthetic profiles and two different correct actions. `labeledBy` is `synthetic-contrast`. `ownerVerified` is false. `trainingConsent` is false.

The pairs cover group asks (the approver is offered, the non-approver is silent, including pairs whose right answer is the offer), mail addressed to someone else, Cc-only, FYI, a recurring vendor, a manager's request to the team, and "save the file" for someone who always saves and someone who never does.

Pair accuracy requires both sides right. The same answer on both sides fails the pair. Missed close on relevant mail is reported next to wrong Do It. The 40/40 figure in `docs/glance-ai/STATE.md` is in-sample: the hand rule was written against this file.

`glance-ai/labeling/contrast-heldout-v0.jsonl` is a separate 60-pair set, frozen before any change to the scorer. sha256 `8dcc096806b0f59c9062be9f07caacf3ffe1c6b5102598c34e92ff5c2170322c`. The hand rule and a logistic regression trained only on `contrast-v0` plus `generate-train.cjs` are both scored there. Those numbers, and the feature weights, are in `docs/glance-ai/STATE.md`.

## What the event log captures first

Ranked from the relevant-class weights on the frozen held-out run. The extension still does not write the log.

1. `approved` counts only with `fetchedBack`. Store `partyKey`, `intentFamily`, and `at`. This is the heaviest feature (`history_approved`).
2. `dismissed` and `undo` on that same key, with `at`. A later dismissal has to be able to outweigh an older preference.
3. `shown` is not enough for a reply rate. Also store that the person replied, as a count. A missing rate stays missing.
4. `partyKey` is the exact address. A nearby domain is not the same party.

Role, department, and whether the person files attachments are onboarding fields. They are not rows in this log, and on this run they outweigh most mail features.
