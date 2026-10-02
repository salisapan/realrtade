# Plan: file-backed execution for open loops

> Written 2026-10-02 before the code. Cross-platform (Drive, Gmail attachments)
> only matters when it helps an open intention become done. Not a Drive
> product, not an attachments assistant. Builds on `docs/open-loops.md`,
> `docs/closure-plan.md`.

## 1. File-related execution that already exists

- **Incoming asks** ("send me the receipt"): `core/file-attach.js` recognises one
  clear file object, the host searches Drive (`flow:search-drive`), `decide()`
  attaches only when exactly one confident match exists (otherwise silence, or a
  draft from a company template), and the Do It draft writer attaches it
  (`driveFileId`, `attachSource:'found'`). Wrong file is already worse than none.
- A thread attachment can be re-attached (`fetchAttachmentBase64`, `thread`
  source), the user can pick from Drive (`flow:open-drive-picker`), and Drive
  lookup by name exists (`flow:drive-find-one`).
- **Loops** have no idea a file is involved. "Prepare my reply" writes a plain
  draft with a placeholder; closure is decided from reply text alone.

## 2. Intention classes whose completion depends on a file

| Class | Direction | Done when |
|---|---|---|
| I asked them for a file ("please send the signed contract") | theirs | their reply carries a real attachment |
| I promised a file ("I'll send the contract Friday") | mine | my message carries the real attachment |
| They could not open what I sent ("I never got the attachment") | yours | I resend (the same file I sent) |
| They ask me for a file ("can you send the receipt?") | yours | I send it |

## 3. How file selection plugs in

No new surface. Three existing places get one capability each:

- **Receipt / "Your turn" row, "Prepare my reply"** becomes *"Prepare reply with
  file"* only when a file was resolved with high confidence: for "could not open
  it", the single attachment of my own earlier message in the thread (the file I
  actually sent, bytes fetched like the Do It `thread` source); for "send me the
  receipt", `FlowFileAttach.decide` over a Drive search, accepted only on one
  clear `attach` (a `create` template or any silence means no file, plain draft).
  The draft writer `followDraftCreate` accepts the same two attachment inputs the
  Do It writer already takes.
- **"You promised" rows** for a file-backed promise look up the one Drive file
  for the object, lazily, and show *"Prepare reply with file"* only on a single
  confident match.
- **Reply judging** (`classifyReply`) learns whether a real attachment came with
  the message.

## 4. Loop state: prepare versus true completion

- Prepare: draft written (unsent), `preparedAt` and the file name stored on the
  loop; stage unchanged; the row says "draft ready". Preparing never closes.
- Advance: my own newer message resolves `yours` (hands the ball back) exactly as
  today.
- Close, file-backed ask (theirs): a real attachment arrives (and the reply is
  not a promise, a decline or a question). A reply that *claims* "attached" with
  no attachment keeps the loop open and says so once.
- Close, file-backed promise (mine): my newer message carries a real attachment
  and says it delivers. "Attached" with nothing attached never closes it.
- External close: Mark done / Stop tracking stay valid.

## 5. Precision risks

- Wrong file: never guess. Zero or several candidates means no file and a plain
  draft; names are shown in the receipt line; the draft is never sent.
- False trigger: a loop is file-backed only when `FlowFileAttach` finds exactly
  one clear object in the ask sentence (plurals, "or/and", hedges, FYI and
  negations already block). A promise needs a send verb plus one file object.
- False close: attachment evidence only upgrades an ack/closed reply on a
  file-backed ask; it never overrides a promise, decline, question or auto-reply.
- Missing evidence: when the page cannot report attachments, behaviour is the old
  one.

## 6. Test corpus and real Gmail

`test/file-path-corpus.cjs` (classification, evidence, judging, picking, drafts),
cases in `follow-gmail-harness.cjs` (open / prepare / advance / close),
`follow-write-corpus.cjs` (attachment in the draft writer), `popup-open-corpus.cjs`.
Real-Gmail steps are added to `docs/open-loops.md` §9a-iii.

## Built (2026-10-02)

`core/file-path.js` (new: file-backed classification, attachment evidence, reply and
promise judging, one-file picking, prepared patch), `FlowFileAttach.mention`,
`classifyOutgoing` / `classifyCommitment` / `buildWatch` carry `file`, `classifyReply` takes
`ctx.evidence`, `deliversFor`, `replyDraft` / `promiseDraft` with an optional file name;
`followDraftCreate` takes a thread attachment or a Drive file and writes no draft at all when the
file cannot be read; `src/follow.js` (file-aware card and receipts, `resolveFile`,
`prepareReply`), `src/content-gmail.js` (`attachmentsOf`, `fetchAttachment` for the loops),
`popup/popup.js` ("draft ready", Prepare reply with file on yours rows and, after a quiet
Drive lookup, on file-promise rows), `follow_file_prepared` count added to the allowlist.

Checks: `test/file-path-corpus.cjs` (new, about 70), +6 in `follow-write-corpus.cjs`, +13 in
`follow-gmail-harness.cjs` (89 passing in all), +9 in `popup-open-corpus.cjs`. Real Gmail:
`docs/open-loops.md` §9a-iii steps 36-44.

Honest limits:
- File-backed detection reuses the object list in `core/file-attach.js` (invoice, receipt,
  contract, quote, proposal, deck, report ...). A file object outside that list is simply not
  file-backed, so nothing changes for it.
- A real attachment from them closes a file-backed ask whatever its name: we do not judge the
  *content*. A wrong file from them is still a reply in the thread.
- "Here is the old one, the new one comes Monday" with a file reads as delivered (the existing
  text rule counts "here is" as delivery). Known gap, not fixed.
- Gmail's own attachment markup (`download_url`) is the evidence source; if Google changes it the
  page reports "unknown" and the old text rules apply. The Playwright harness models it; real
  Gmail has not been run.
- The Drive lookup needs Google connected and uses the existing read scopes; no new permission.
