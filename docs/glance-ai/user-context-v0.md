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
