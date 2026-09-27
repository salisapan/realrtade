# Chrome Web Store submission — Glance

This file is a draft. Glance is **not** on the Chrome Web Store. The install
path that exists today is Load unpacked: confirm email, download the zip,
Developer mode, Load unpacked, sign in with Google. `trial.html` step 5 and
`README.md` say that. Do not describe a store listing as live, and do not
submit this draft from the repo.

`manifest.json` version is **0.7.0**. The live Do It path writes to the
user's Google account: a Calendar event, a Google Task, a Gmail draft, and
(when a file is needed) a read-only Drive search. That is a real Calendar
API write, not a hold template. Notion's token writer is in
`src/background.js` and is not an onboarding card. HubSpot, Salesforce,
Slack, and Monday.com stay hidden while their client ids are unset, and
their API hosts are not in `host_permissions`.

`oauth2.client_id` in `manifest.json` is set — it is not the
`YOUR_GOOGLE_OAUTH_CLIENT_ID` placeholder. `picker/picker.js`'s
`GOOGLE_PICKER_API_KEY` is still `YOUR_GOOGLE_PICKER_API_KEY`, so the Drive
picker is blocked on an owner key. This draft does not invent either value.

Everything below is drafted from `manifest.json`, `README.md`, and source.
Copy/paste the listing fields into the Developer Dashboard only after the
checklist at the bottom is done by the account owner.

**Revised for the current Google-only MVP scope.** The listing text below
was rewritten to describe exactly what a real install can do today: Google
Tasks/Calendar/Gmail Draft, reached through `mvp: true` in
`core/connectors.js`. Notion/HubSpot/Salesforce/Slack/Monday.com have real,
working code in `src/background.js` but no live path to reach them from the
popup — describing them in the public listing would be a real
promise-vs-reality gap (this project's own standing review principle,
`docs/design-principles.md`) and, more concretely, Chrome Web Store review
can reject a listing whose description doesn't match what the extension
actually does. `manifest.json`'s `host_permissions` were narrowed to match
for the same reason — see `core/connectors.js`'s header comment. Re-widen
both together (listing copy and host_permissions) if/when those connectors
rejoin onboarding — not just the code that already exists for them.

## Store listing text

### Extension name
`Glance` (already set in `manifest.json`)

### Short description (max 132 characters)

```
When an email actually decides something, Glance closes it for you — one click, straight into Google, judgment on your device.
```

126 characters.

### Detailed description

```
Glance watches the Gmail message you already have open. It doesn't scan
your whole mailbox, doesn't need rules or triggers, and doesn't chat. When
a message actually decides something — a meeting is proposed, a deadline
is set, a request is made, a commitment is agreed — one Do It button
appears next to it, describing exactly what it's about to close: "Scheduling
this and setting a reminder to prepare," for example. Click it, and Glance
closes the whole thing — a calendar event, a reminder in Google Tasks, a
drafted Gmail reply, whichever combination the message actually calls for
— in one step. Every write comes with an Undo.

Most emails produce nothing. That's the product working, not a bug —
Glance is built to stay quiet on price lists, newsletters, and automated
mail, and to speak up only when something real happened.

HOW JUDGMENT WORKS
The first pass runs on your device: a transparent, weighted scorer looking
for a commitment, a date, a request, and similar signals, and staying quiet
on automated mail. No email text leaves your machine for that pass. If it
finds nothing, Glance may send a masked copy — names, companies, amounts,
dates, emails, and phone numbers already replaced with placeholders — for
one remote classification. The threshold adjusts as you click or dismiss.
There is no rules screen.

CLOSES A NAMED PROCESS, NOT A PILE OF BUTTONS
Glance doesn't propose loose, independent actions — it recognizes one of a
few real outcomes ("Schedule & Confirm," "Reply & Track," "Follow
Through," "Log It") and closes the whole thing at once: Google Calendar,
Google Tasks, and a Gmail draft, in whatever combination that message's
outcome actually needs. It also quietly learns which parts of a given
outcome you actually keep versus strip off before confirming, and adjusts
future defaults accordingly — visible and one-click reversible from the
extension popup, never a silent, unexplainable change in behavior.

A MORNING BRIEF FOR WHAT'S STILL OPEN
If something Glance proposed was never closed — no Do It, no dismiss — a
small, silent-by-default indicator lets you close it later, even after
you've moved on to a different email. Nothing appears at all when there's
nothing left open.

WHAT GLANCE NEVER DOES
Glance doesn't read your mailbox in bulk, doesn't send the full email
anywhere to decide whether to act, doesn't sell data, and doesn't use your
data to train any AI model. What can leave your device: (1) the fields you
approve when you click Do It, written to your own Google account (Calendar,
Tasks, a Gmail draft, and a Drive file only when the message asks for one),
(2) a masked copy of the open message only when the on-device scorer found
nothing, and (3) anonymous usage counts tagged with a random per-install
ID, never message content. Full detail: theflow-ai.com/privacy.html

Glance is free and general-purpose. It's a separate product from Flow
(theflow-ai.com), our enterprise workflow platform for organizations with
regulated or sensitive data — Glance carries none of Flow's compliance
guarantees and isn't intended for that kind of material.

Setup takes under a minute: sign in with the Google account Glance should
write to, and open an email.
```

### Category
`Productivity`

### Single purpose description (required field, plain text, no formatting)

```
Glance's single purpose is to detect, on the user's device, when the
currently open Gmail message reflects a real decision (a commitment, a
scheduled event, a request, a deadline) and, only when the user clicks an
on-screen button, close it by writing the appropriate record(s) — a Google
Calendar event, a Google Tasks reminder, a Gmail draft reply, or a
combination of these — to the user's own, already-signed-in Google
account. It does not scan the mailbox in bulk and does not write unless
you click. If the on-device scorer finds nothing, it may send a masked
copy of that one message for a single classification. It does not serve
any purpose unrelated to turning one open, user-selected email into one
user-approved, one-click-undoable record.
```

## Permission justifications (Privacy practices tab)

Chrome Web Store asks for a plain-language justification per permission.
Use these verbatim — each is traceable to the exact code that uses it.

| Permission | Justification |
|---|---|
| `storage` | Stores the user's chosen connector, line-of-work profile, sensitivity calibration, the local activity log, and the local Execution Memory log (which steps of a process this account tends to keep or remove) — entirely in `chrome.storage.local` on the user's own device (`src/storage.js`, `core/execution-memory.js`). Never synced to a Glance-owned server. |
| `identity` | Used only for `chrome.identity.getAuthToken()` — Chrome's own native Google account chooser — so Glance can write to Google Calendar, Google Tasks, and Gmail drafts using an OAuth grant to the Google account the user is already signed into (`src/background.js`). No redirect page, no third-party auth screen. |
| `host_permissions: https://mail.google.com/*` | The content script (`src/content-gmail.js`) runs only on Gmail to read the open message's visible text, subject, and sender, and to inject the Do It button / Morning Brief UI. |
| `host_permissions: https://tasks.googleapis.com/*` | Direct API calls to create/undo a Google Tasks reminder after the user clicks Do It. |
| `host_permissions: https://www.googleapis.com/calendar/*` | Direct API calls to create/undo a Google Calendar event after the user clicks Do It. |
| `host_permissions: https://www.googleapis.com/drive/*` | Direct, read-only API calls (`drive.readonly` scope — cannot write, rename, or delete anything) used two ways when the user clicks Do It on a message that asks for a file: (1) behind the optional Drive picker, when the user explicitly chooses a file to attach; (2) automatically, when nothing is already attached and nothing was manually picked, Glance searches the account's own Drive by filename/content for a file matching what the email asked for and attaches the best match itself (`driveSearchAttachment` in `src/background.js`). Either way the file only ever lands in a Gmail draft — never sent — and an auto-found file is flagged in the draft's own text as unverified, for the user to confirm before sending. |
| `host_permissions: https://gmail.googleapis.com/*` | Direct API calls to create/undo a Gmail draft reply after the user clicks Do It. |
| `host_permissions: https://theflow-ai.com/*` | Calls Glance's own Netlify Functions for the masked remote classification (only when the on-device scorer found nothing) and for anonymous, aggregate-only usage counts. Draft-It and the attachment X-ray call the same host from code that is not mounted in the Gmail UI. |

Notion's token writer, and HubSpot, Salesforce, Slack, and Monday.com, have
code in `src/background.js`. Onboarding does not offer them. Their API
hosts are not in `host_permissions` and they are not in this listing.
Draft-It, the docx X-ray, and the sidebar Privacy Shield badge are in the
tree and unmounted (`content-gmail.js` does not call `mountSidebar()`).
Do not paste them into the store listing until that UI is on. Re-add a
connector's host permission and its listing sentence in the same change.

## Data usage disclosure (Privacy practices tab — data types collected)

Chrome Web Store requires checking which data categories the extension
handles and confirming each is disclosed in the privacy policy. Answer
based on what the code actually does:

| Category | Collected? | Notes |
|---|---|---|
| Personally identifiable information | **Yes** | Only the fields the user explicitly approves via Do It (sender name/email, extracted amount/date, one quoted sentence) — sent directly to the destination *they* connected, not to Glance. Draft-It / attachment summary send masked placeholder tokens only, never real PII. |
| Health information | No | — |
| Financial and payment information | **Yes** (narrow) | A monetary amount extracted from the open email, only when the user clicks Do It, sent only to their chosen connector. Masked before reaching Draft-It/attachment summary. |
| Authentication information | **Yes** | OAuth tokens for connected destinations, stored only in `chrome.storage.local` on the user's device; never transmitted to or stored by Glance. |
| Personal communications | **Yes** (narrow) | The open Gmail message's text is read locally to score it; only the fields above (never the full message) ever leave the device, and only on explicit click. |
| Location | No | — |
| Web history | No | — |
| User activity | **Yes** (aggregate only) | Anonymous, aggregate product-usage counts only — a suggestion was shown/clicked/dismissed, a write completed, an action was undone, a process closed (and by which method), a connector was set up, Draft-It generated a reply, an attachment was summarised, one ping per day the extension was active, and (at most once per install per calendar week) whether a recurring usage habit had formed — each tagged with a random per-install ID, never message content, never which specific email or record. Full allow-list: `flow-landing/netlify/functions/track-event/track-event.js`'s `ALLOWED_EVENTS`/`PARAM_VALIDATORS`, which reject anything else server-side. |
| Website content | **Yes** (narrow, as above) | Same as Personal communications — the open message only, never bulk-scanned. |

This table predates the `drive.readonly` scope added for the automatic
Drive search-and-attach feature (see the permission-justification row
above) — Drive file names/content read during that search don't map
cleanly onto any of the categories above (they're neither the Gmail
message nor page content). Re-check this table against whatever category
list the live Chrome Web Store Developer Dashboard actually presents at
submission time — it may have its own "Files and documents" or similar
category this doc can't predict.

Certification checkboxes this data supports:
- Not sold to third parties. ✅ (true — see privacy.html "what we do not do")
- Not used for purposes unrelated to the extension's single purpose. ✅
- Not used to determine creditworthiness or for lending purposes. ✅

Link the **Privacy policy URL** field to: `https://theflow-ai.com/privacy.html`

## Screenshots — what's needed and why this doc can't produce them

Chrome Web Store requires 1–5 screenshots, 1280×800 or 640×400 PNG/JPEG (no
alpha). These need a **real, signed-in Gmail account with the extension
actually loaded** — faking or mocking one would misrepresent the product,
which is both against Store policy and against this project's own
promise-must-match-reality standard. So this is the one piece of the
submission that has to happen outside this session. Recommended shots, in
priority order:

1. **The Do It chip on a real decided email** — open any email that states
   a price, deadline, or agreement; the chip should be visible next to the
   message. This is the single most important screenshot — it's the whole
   product in one frame.
2. **The extension popup, Setup tab** — Google sign-in, not a list of CRM
   connectors and not a "kind of work" picker. Capturable without Gmail.
3. **The written record** — a Google Calendar event, a task in the Glance
   list, or a Gmail draft right after Do It. Not a Notion page and not a
   Slack message; those are not what this build writes from the chip.
4. **Do not shoot Draft-It or the docx X-ray for this submission.** Both
   UIs are unmounted until glance-assist is configured. A screenshot of
   either would advertise a click the extension does not offer.

`docs/screenshots/popup-setup-tab.png` is a real unpacked-extension capture,
380×620, extension id `dnjhplgmnkabbjogfpbhofjedlkehkai`. It is **not** the
current setup screen: it shows Notion, HubSpot, Salesforce, Slack, and
Monday.com, with **Needs setup** on the four OAuth connectors. Do not upload
it. Recapture the popup after this change (Google sign-in only) and composite
that capture onto 1280×800 or 640×400. Store screenshots cannot be this size
as-is, and a fake or old frame would misrepresent 0.7.0.

## Manifest notes confirmed correct (no action needed)

- **`manifest.json`'s pinned `key` field is intentional and correct** — it
  keeps the extension ID (`dnjhplgmnkabbjogfpbhofjedlkehkai`) stable across
  reloads and across the eventual Store listing. That exact ID is what
  Google's own OAuth Client ID (the live connector — see `README.md`'s "Set
  up Google" section, step 4's "Item ID") is registered against, and it's
  also baked into the four non-Google connectors' OAuth redirect URLs even
  though they're out of scope for this listing today. **Do not remove this
  key before submitting** — removing it would let Chrome Web Store assign a
  different ID and break Google sign-in along with every other connector's
  redirect.
- `chrome.tabs.create()` in `background.js` does not require the `"tabs"`
  permission (only reading cross-tab data would) — no permission gap there.
- Icons (16/48/128) are present and correctly sized.

## Still open — not something this doc can close alone

- [ ] Recapture the popup Setup tab. The file on disk
      (`docs/screenshots/popup-setup-tab.png`) is an older Notion / Needs
      setup screen, 380×620. Composite a new Google-only capture onto
      1280×800 or 640×400. Do not upload the old file.
- [ ] Capture the other real screenshots above (need a live Gmail account
      the owner controls) — the Do It chip, the Morning Brief, and a
      Calendar event, Task, or Gmail draft after a write. Do not fake them.
- [ ] Fill in the Developer Dashboard form itself. This repo cannot do that.
      Do not submit the listing from here.
- [x] `oauth2.client_id` is no longer the `YOUR_GOOGLE_OAUTH_CLIENT_ID`
      placeholder. Confirm in Cloud Console that this client is the Chrome
      extension item id `dnjhplgmnkabbjogfpbhofjedlkehkai`, that the consent
      screen is in Testing with the right test users, and that the sensitive
      scopes (`tasks`, `calendar.events`, `gmail.compose`) and the restricted
      `drive.readonly` scope are the ones you intend to ship. Public launch
      past Testing still needs Google's verification. Not done in this PR.
- [ ] `GOOGLE_PICKER_API_KEY` in `picker/picker.js` is still
      `YOUR_GOOGLE_PICKER_API_KEY`. Drive picker stays off until the owner
      pastes a restricted key. Do not invent one.
- [x] `privacy.html` checked against this doc's data-usage table and the
      actual `ALLOWED_EVENTS` list. Section 5's "What stays local" and
      "Connection credentials" bullets already covered the Morning
      Brief/Execution Memory local-storage additions correctly. The
      "Anonymous product-usage events" bullet named 7 of the 11 actually
      allowed events — missing `connector_configured`, `draft_generated`,
      `attachment_summarized`, and `weekly_habit_formed` — fixed to
      enumerate all 11, matching this table's own row above exactly.
- [x] HubSpot, Salesforce, Slack, and Monday.com client ids stay
      `YOUR_*` placeholders. The popup hides them. Leave the ids unset
      until those connectors are deliberately reopened, with host
      permissions added in the same change. No real client ids were added
      in this draft.
- [ ] Release track, once the owner is ready: submit this listing, and keep
      Load unpacked in the README for anyone installing before review
      finishes. Until that submission exists, Load unpacked is the only
      install. Store review applies to every version, not just the first.
