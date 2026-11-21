# Personal model

Glance closes open loops. Gmail is where it starts today.

This is what Glance can know about the person, on this computer. It is off until the person accepts a category. Nothing here is uploaded. Gate: not run live.

## What is stored

People, habits, style, work, a city, and the person's own identity. A fact is `{id, subject_id, predicate, object, source, confidence, evidence, valid_from, valid_to, learned_at, retired_at, consent_category, schema_ver}`. Evidence is a surface, an id, and a time. It is not the mail.

Tie strength is `0.45 * recency + 0.35 * frequency + 0.20 * reciprocity`. Recency halves every 30 days. Frequency caps at 20 notes. Reciprocity is zero when only one side has written.

A third party keeps an alias, an address, a relation, tie strength, a channel, a language, and a reply-latency bucket. A role, an organization, a habit, a place, and a mail body are not kept for them.

A city is stored only when places is on. A street, a map pin, or a number is dropped.

## Consent

Every category starts off. Turning one on shows one screen: what is learned, that it stays on this computer, and that it can be edited or deleted. Confirm, edit, forget, and never-learn are on the «Glance יודע עליי» card.

## Closure

`resolvePerson` and `suggestSlots` rank candidates. Two close candidates ask. Nothing is auto-picked. The decision log records `model_assist` as `on`, `off`, or `holdout`. One install in ten is the holdout.

## Slices

Slice 2 reads style from the person's own sent mail: greeting, sign-off, length, formality, emoji, and mixing. A short scrubbed example is capped and encrypted. A draft uses a rule the person edited, or asks.

Slice 3 reads work facts with character offsets, not a copy of the sentence. Two people with the same name and different addresses wait for a review. A short profile is built from confirmed lines.

Slice 4 keeps a LinUCB bandit off. It does not explore a Do It, and it does not go under the guard of 0.8. The same confirmed facts can be read by the Gmail add-on. Flow on a customer's server, and iPhone, use this contract later. They are not built here.

## Surfaces

| Surface | Status |
|---|---|
| Gmail (Chrome extension) | Done. Header metadata only. |
| Outlook on the web | Done. The same header offer. |
| Google Calendar | Done when a calendar list was already fetched. City or nothing. |
| Gmail add-on | Confirmed facts only. |
| Outlook add-in | The engine is in the task-pane bundle. |
| Slack, Telegram | Follow-up. No mail headers in this slice. |
| WhatsApp, Messenger, Instagram | Not in this change. |
| iPhone, Flow on-prem | Documented. Not built. |
