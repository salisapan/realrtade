# One decision for the card and for Why not shown

Glance closes open loops. Gmail is where it starts today.

Spec for Dima. Due 2026-10-18. The shown card and the Why not shown reason come from one engine decision object. This page is the contract. It does not change the extension.

Line numbers are `flow-trial-extension` on this tip.

## Product definition (vision-locked)

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect, carry, execute, true close. It starts in Gmail and executes where a close really happens. It stays silent when it is uncertain, never sends on your behalf, treats a prepared draft as unfinished, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.

A mail that has a card is a mail Glance decided to show. Why not shown is the list of mails it decided to leave quiet, each with the reason for that quiet. The two cannot describe the same open mail with two different reasons.

## Current implementation status (this tip)

The card and Why not shown read one decision record. `commitDecision` in `src/content-outlook.js` is the writer for the open mail. A quiet commit stores the reason of the branch that stayed quiet (`decideFromText`, or the page code that branch already uses, such as `note-to-self` or `page:no-mount`). It does not copy the sync row's `planned.reason` over that decision. A show commit stores the branch that painted, and drops the quiet record and the sync line for that id and for `priorConversationId`. `FlowDisplay.whyNotShownRows` lists quiet page records. A sync row is listed only when no page record claims that id. A commit whose epoch is not the current `mailEpoch` is dropped. Subject fallback sets `id` to the picked Graph message id and `hydrateHow` to `subject-fallback` only when that row is the open message: the same confirmed conversation, at the page minute. A row from another conversation is not adopted. A file links only to that open message. A kilobyte size match does not cross messages. An unconfirmed conversation stays quiet. Two rows with the same subject stay `hydrateHow: none` and do not copy either row's recipients. A click fails closed when the open-mail token, the epoch, or the card hash is missing or does not match. The hydrate cache key includes the epoch.

`flow-trial-extension/test/card-decision-corpus.cjs` locks that record. The sections below are the contract. The line numbers in them describe the split this record replaced.

## The split

Why not shown is built in `popup/popup.js` at 1135–1137. It concatenates `pageDiagnostics` and `diagnostics` and prints `reason — subject` for each row (1168–1176).

| Log | Written by | Read into the panel |
|---|---|---|
| `outlookPageDiag` | `pageReason` in `src/content-outlook.js` 143–185 | `pageDiagnostics` from `src/outlook.js` 142 |
| `outlookSync.diagnostics` | `FlowOutlookSync.plan` in `core/outlook-sync.js` `note` at 115–120 | `diagnostics` from `src/outlook.js` 140 |

`note` (115–120) records silence only. A successful show returns before a diagnostic row (`shown-offer` and `shown-incoming` return at 117). The page log is the other list. `clearReason` (206–234) is supposed to drop both lists for the open message once a card is visible. Several show paths never call it, so the sync reason stays on the panel next to a card.

The page also overwrites its own reason with the sync row before it stores anything:

| Site | What it stores |
|---|---|
| `src/content-outlook.js` 2243–2246 | Self-mail. `pageReason` gets `planned.reason` when the sync row has one, otherwise `note-to-self`. |
| `src/content-outlook.js` 2305–2306 | File chain did not run, and the sync row is a file silence. `finalReason` becomes `planned.reason`. |
| `src/content-outlook.js` 2343–2351 | Open-text judge is quiet, and the sync row's reason is not a file silence. `pageReason` stores `planned.reason` and drops `decided.reason`. |

`plannedRow` (1464–1468) is that sync row: the diagnostic whose `conversationId` matches the pane. `decideFromText` (341–387) is the open-text judge. It calls `FlowIncomingJudge.judge` (`core/incoming-judge.js` 55–129) and returns either `{ intent, process }` or `{ none: true, reason }`. The scan then throws that reason away in the three sites above.

Show paths that set `lastOutcome = 'card'` and do not call `clearReason`, so a sync silence for the same conversation can remain under Why not shown:

| Path | Lines | Debug reason while the card is up |
|---|---|---|
| Proved To Do / file receipt | 2146–2164 | `page:receipt-mounted`, `page:promise-proof` |
| Draft receipt kept from the log | 2172–2178, painter 1100–1137 | `page:draft-receipt` |
| Verifying placeholder | 2434–2449 | none stored |
| Receipt injected from the mailbox entry | 2391–2419 | `rendered` only |
| Calendar card already settled | 1932–1934 and 1940–1943 | none; `clearReason` runs only on a fresh paint at 1989 |

Paths that do call `clearReason` after a paint: file prepare 1658, Hold It chain 1699, fresh calendar hold 1989, calendar receipt mount 1855, main Do It card 2492, open-loop card 3283. The panel is correct only when the scan happens to leave through one of these.

## Three inputs that are not the same decision

### 1. The open-text judge

`scan` (2075) calls `decideFromText` (2251) after hydrate. The judge sees `pane.text`, `pane.subject`, `pane.to`, `pane.cc`, and the sender (373–385). Its reason is `r.reason` (387). That is the reason behind a card the page itself decided, and the reason behind a quiet the page itself decided.

### 2. The mailbox sync

`pageSync` (301–311) runs `FlowOutlookSync.plan`. For each thread the planner calls the same judge on the Graph utterance and, when it stays quiet, pushes `{ conversationId, subject, reason, direction }` (`core/outlook-sync.js` 115–120, incoming silence at 270). That row is keyed by conversation. It has no epoch, no card hash, and usually no message id. The panel prints it by subject, so it sits under the same heading as the open card.

### 3. Graph hydrate and the subject fallback

`scan` fills the pane from Graph before the judge (2135–2140). `hydratePane` is 2632–2707.

The conversation or item query can return nothing. The fallback is the subject query at 2663–2666 (`pane-hydrate-subject`). When several rows come back, a single exact subject match is chosen at 2678–2682. `subjectFilter` (2709–2714) strips a trailing ellipsis and uses `startswith` once the stem is at least 12 characters.

The mailbox ceiling constants at 2577–2578 (`MAILBOX_MATCH_CEILING`, `MAILBOX_PAGE`) are the file-link query, not this fallback. The subject fallback that can select a different message is 2663–2682. `mailboxBySubject` (2716–2726) is a second subject query, used when the page is matching a file, and it can name yet another id.

`hydratePane` copies sender, subject, To, and Cc onto the pane (2683–2706). It does not copy the picked row's `id` or `conversationId`. The judge then runs on the picked row's recipients and the page's old conversation id. The sync diagnostic still names the old conversation. `clearReason` filters on that old id (212–228), so it can delete the sync row for the mail that is actually open, or leave the sync row for the mail the subject query picked. The card and the line in Why not shown are no longer one decision.

The epoch path is the other split. `mailEpoch` (79) increments in `bumpMailEpoch` (858–867) when `openMailTokenNow` (841–849) changes. `armRender` (878–882) freezes `renderEpoch` for the scan. `injectCard` (900–907) refuses to paint when `renderLive` (884–886) is false, and stamps `data-glance-open` with the token. A scan that started on the previous mail does not paint. A click is a separate question, and most clicks never ask it.

## The decision record

One object per open mail per epoch. The card, the host attributes, and Why not shown all read it. Nothing else writes a reason for that mail.

```text
{
  id: string,
  epoch: number,
  source: "page" | "sync",
  verdict: "show" | "quiet",
  reason: string,
  cardHash: string | null
}
```

| Field | Rule |
|---|---|
| `id` | The Graph message id the judge ran on. When hydrate's subject fallback picked a row, that row's id is `id`. When Graph did not resolve a message, the conversation id. When the pane itself was unreadable, the address id already stored with `page:pane-unreadable`. |
| `epoch` | `mailEpoch` captured by `armRender` at the start of the scan that committed this record. A commit after `mailEpoch` has moved is dropped. |
| `source` | `page` when this scan of the open message decided. `sync` when the mailbox planner decided and this message is not the open one. A `page` commit replaces any `sync` record with the same `id`. |
| `verdict` | `show` only when a host was inserted and is still the card for this epoch. `quiet` when the scan ended in a reason and no card was left up. |
| `reason` | The reason from the branch that chose the verdict. For a page quiet, that is `decideFromText`'s `reason` (or the page code that branch already uses, such as `page:no-mount`). It is not `planned.reason`. For a show, it is the branch that painted: `shown`, `prepare`, `needs-you`, `calendar-hold`, `page:draft-receipt`, `page:receipt-mounted`, `page:promise-proof`, `page:still-open`. |
| `cardHash` | Hash of the rendered card. `null` when `verdict` is `quiet`. |

`cardHash` uses the hasher already in `content-outlook.js` 123–128, over one canonical string:

```text
messageId | intent.label | process.id | stepKind:stepId,... | chain
```

`chain` is the `data-glance-chain` value, or empty. The same string is hashed onto the host as `data-glance-card`. The host also gets `data-glance-epoch` (the record's epoch) and `data-glance-decision` (the record's `id`). `injectCard` (900–907) is the only place that stamps them. `paintUndoneStatus` (1059–1084) builds a host by hand and must go through the same stamp, or its clicks stay on the fail-open path.

Two companions live on the same object. They do not form a second decision and they are not a second line in Why not shown:

| Field | Rule |
|---|---|
| `hydrateHow` | `item`, `conversation`, `subject-fallback` (2663–2666), `subject-unique` (2678–2682), or `none`. |
| `priorConversationId` | The conversation id on the pane before hydrate replaced the audience. Why not shown drops a sync row for this id when the page record's `id` is the picked message. |

The panel lists a row only when `verdict` is `quiet`. It prints that record's `reason` and subject. It does not concatenate `outlookSync.diagnostics`. Sync rows remain only as `source: "sync"` records for mail the page has not decided, and a page record for the same `id` removes them.

`pageReason` and `clearReason` stop being two writers. One function, `commitDecision(record)`, replaces both for the open mail: a quiet commit upserts the record, a show commit upserts it and deletes any quiet record with that `id` or that `priorConversationId`.

## Invariants

1. One open mail, one epoch, one record. A second writer does not append another reason for that `id`.
2. `verdict === "show"` if and only if the host in the reading pane carries the same `id`, `epoch`, and `cardHash`.
3. `cardHash` is `null` if and only if `verdict` is `quiet`.
4. Why not shown shows `reason` only from a quiet record. A mail with a show record is absent from the list.
5. `reason` is the reason of the branch that set `verdict`. The sync row's `reason` is not copied over a page decision.
6. A click that can dismiss, undo, or write checks the record at the start and again after every `await`, before the write, the dismiss log, or the undo. The check fails when the host epoch differs from `mailEpoch`, the host `cardHash` differs from the record, the open-mail token differs from `data-glance-open`, the token is missing, or the current open-mail token is empty.
7. A subject-fallback pick sets `id` to the picked Graph message id and `hydrateHow` to `subject-fallback` or `subject-unique` on that same record. The sync reason for `priorConversationId` is not shown beside the card.
8. The hydrate cache key includes the epoch. A patch cached for the previous mail is not applied after `bumpMailEpoch`.

Invariant 6 replaces today's guard. `ignoreStaleClick` (891–898) returns false, and the click runs, when `data-glance-open` is missing or `openMailTokenNow` is empty (`|||`). That is the fail-open. After this spec, those two cases are stale and the click does nothing.

## Stale clicks to close

`onDoIt` (655) and `onSuggestDoIt` (2954) call `ignoreStaleClick` once, before the first `await`. They do not call it again after the network returns, and they still pass when the token is missing. These handlers do not call it at all:

| Handler | Line | What a stale click does today |
|---|---|---|
| Hold It | `onHoldingDoIt` 1536 | Sends `flow:execute-action` for `outlookDraft` with the closed-over body, sender, and subject. |
| Calendar | `onCalendarDoIt` 2011 | Sends `flow:execute-action` for `outlookCalendar` with the closed-over hold params. |
| Dismiss | `onDismiss` 1704 | Removes the host and writes a dismissed log, `falseClose`, and `falseDoIt` for `ctx.messageId`. |
| Undo after Do It | 771 | `flow:undo-action` for the draft ref captured when Do It finished, then `schedule`. |
| Undo on a kept draft receipt | 1124 | Same undo for `draft.ref` and `draft.messageId`. |
| Undo on Hold It | 1585 | Undo for the holding draft, and may stop the watch on `ctx.threadId`. |
| Undo on the scan's receipt remount | 2406 | Undo for `entry.ref` and `entry.messageId`. |

The calendar receipt's undo is the same hole at `calendarUndoHandler` (1789), called from 2055 and 1853. The suggest-save dismiss inside `injectCard` at 2931 removes the host and writes `suggestDismissals` with no token check. Cover both in the same pass. A fix that guards only the table and leaves 1789 and 2931 still acts on the previous mail.

`bumpMailEpoch` removes hosts when the token changes (858–862), so a click on a detached node is rare. The hole is a click that started while the token was still A's, or a click that runs because the token was missing or empty, then continues after `await` onto mail B. The closed-over `ctx`, `ref`, and `messageId` still name mail A.

## Test plan

Load the page logic the way `flow-trial-extension/test` loads a content script, or extend the Outlook e2e harness. Each case asserts the record and the panel list, not a debug string.

**One reason**

- Open-text judge returns `quiet:hedge`. Sync diagnostic for the same conversation is `intent-null`. The record is `{ source: "page", verdict: "quiet", reason: "quiet:hedge" }`. Why not shown shows `quiet:hedge` and does not show `intent-null`. This is the substitution at 2349–2351.
- Open-text judge returns `note-to-self` and the sync row says `own-sender`. The stored reason is the page reason. This is 2246.
- File chain does not run. Sync row says `drive-not-granted`. Page judge reason is `file-chain-not-run`. The stored reason stays the page reason unless that branch itself is the file silence the chain just returned. This is 2305–2306.
- Judge says show, `injectCard` paints. Sync diagnostic for the conversation remains in storage until the commit. After the commit, Why not shown has no row for that `id`. Repeat for the receipt paths that skip `clearReason` today: 2146, 2176, 2391, 2434.

**Hydrate**

- Conversation filter returns no rows. Subject query returns one other message, with a different id, and that message is a direct ask. `hydrateHow` is `subject-fallback`. `id` is the picked message id. `priorConversationId` is the id that was on the pane. The card hash matches the picked message's judge result. Why not shown does not list the sync reason of the old conversation next to that card.
- Subject query returns two rows with the same subject. No row is picked. The record does not take either row's recipients. `hydrateHow` is `none`.
- Cache a hydrate patch, then bump the epoch with a new subject. The next `hydratePane` does not apply the cached patch.

**Epoch and the fail-open guard**

Paint a card for mail A with a real token, epoch, and `cardHash`. Then open mail B (`mailEpoch` increments, token changes) and invoke the handler with A's host and A's closed-over ctx. Expect no `flow:execute-action`, no `flow:undo-action`, no dismiss log, and no `suggestDismissals` write.

| Case | Entry |
|---|---|
| Hold It | 1536, ctx from A's chain |
| Calendar Do It | 2011, ctx from A's hold |
| Dismiss | 1704 |
| Undo | 771, 1124, 1585, 2406, and `calendarUndoHandler` 1789 |
| Suggest dismiss | 2931 |
| Do It and suggest Do It, checked again after `await` | 655, 2954 |

Fail-open, both directions:

- Host has no `data-glance-open`. Open token is non-empty. The click is ignored. Today 891–893 returns false and the click runs.
- Host has a token. `openMailTokenNow` returns `|||` because the heading is empty mid-navigation. The click is ignored. Today 895 returns false and the click runs.
- Token, epoch, and `cardHash` all match. The click runs.

**Hash**

- Two paints with the same message id and different `intent.label` or step list produce different `cardHash` values. A click whose host hash is the old one is ignored after the new record is committed.
- A quiet record has `cardHash: null` and no host.

## Out of scope

This spec does not change `FlowIncomingJudge`, the profile relevance lock, or who is offered a card. It does not add a send. Mail.Send stays unbuilt. The quiet-set file next to this spec is a separate Gate input; it is not this decision record.
