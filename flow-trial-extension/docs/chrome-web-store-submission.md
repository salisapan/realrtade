# Chrome Web Store submission — Glance

Everything below is drafted from the actual `manifest.json`, `README.md`, and
source (`src/background.js`, `core/actions.js`, `core/execution-memory.js`,
`src/brief.js`, `core/privacyShield.js`, `src/content-gmail.js`) as of this
doc's writing — nothing is invented. Copy/paste text fields directly into
the Developer Dashboard; the checklist at the bottom tracks what still needs
a human (screenshots and the dashboard form itself).

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
The scoring that decides whether to show the Do It button runs entirely on
your device. It's a transparent, weighted scorer — not a black box, not a
language model — looking for a currency figure, a commitment verb, a dated
obligation, a direct request, a stated loss, and staying quiet on
automated-sender and mailing-list signals. No email text leaves your
machine to reach that decision. The threshold that decides "is this
confident enough to speak up" adjusts automatically as you click or
dismiss suggestions — no configuration screen, no rules to write.

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

LOCAL PRIVACY SHIELD
Before any text reaches an AI-assisted feature (see below), Glance's
on-device Privacy Shield finds every name, company, monetary amount, date,
email address, and phone number in the message and replaces each with a
placeholder token. A visible badge in the sidebar confirms this is active
— it isn't a policy promise, it's what the code does before anything is
sent anywhere.

DRAFT-IT (opt-in)
Click Draft-It in the sidebar and Glance drafts a reply to the open thread,
matched to whether the thread is in English or Hebrew. Only masked
placeholder text — never a real name, company, amount, date, email
address, or phone number — is sent to generate the draft; the real values
are substituted back in on your device before you see it. Insert it
directly into Gmail's reply box, or ask for a redraft.

ATTACHMENT SUMMARY (opt-in)
Hover a .docx attachment on an open message and a card appears with a
one-line summary and the key facts (counterparty, effective date,
financial value, governing law). The file is read entirely on-device;
again, only masked placeholder text is sent to generate the summary. PDF
attachments aren't supported yet.

WHAT GLANCE NEVER DOES
Glance doesn't read your mailbox in bulk, doesn't send full email content
anywhere to decide whether to act, doesn't sell data, and doesn't use your
data to train any AI model. The only things that ever leave your device
are: (1) the exact fields you approve when you click Do It, written
directly to your own Google account, (2) for the two opt-in AI features
above, masked placeholder text only, and (3) a small number of anonymous
usage counts (was a suggestion shown/clicked/dismissed/undone) tagged with
a random per-install ID, never message content. Full detail:
theflow-ai.com/privacy.html

Glance is free and general-purpose. It's a separate product from Flow
(theflow-ai.com), our enterprise workflow platform for organizations with
regulated or sensitive data — Glance carries none of Flow's compliance
guarantees and isn't intended for that kind of material.

Setup takes under a minute: sign in with the Google account Glance should
write to, say what kind of work you do, and open an email.
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
account. It does not do anything else: it does not scan the mailbox in
bulk, does not act automatically, and does not serve any purpose unrelated
to turning one open, user-selected email into one user-approved,
one-click-undoable record.
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
| `host_permissions: https://www.googleapis.com/drive/*` | Direct API calls behind the optional Drive picker, used only when the user explicitly chooses to attach a Drive file to a drafted reply (`drive.file` scope — access is limited to files the user opens through the picker, never blanket Drive access). |
| `host_permissions: https://gmail.googleapis.com/*` | Direct API calls to create/undo a Gmail draft reply after the user clicks Do It. |
| `host_permissions: https://theflow-ai.com/*` | Calls Glance's own Netlify Functions for the two opt-in AI features (Draft-It, attachment summary), which only ever receive masked placeholder text, and for the anonymous, aggregate-only usage-count pings described below. |

Notion, HubSpot, Salesforce, Slack, and Monday.com have real, working
connector code in `src/background.js`, but no live path to reach them from
onboarding today (see the top of this document) — their API hosts are
deliberately not in `host_permissions` and are not represented in this
listing. Re-add both together if that scope is reopened.

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
2. **The extension popup, Setup tab** — showing the connector list and
   "what kind of work you do" picker (this one *can* be captured without
   Gmail, since it's just the popup UI — see note below).
3. **The written record** — a Notion page or Slack message right after a
   Do It click, showing the real fields that landed (amount, date, sender,
   quoted sentence).
4. **The Draft-It sidebar** — the drafted reply with Insert/Redraft buttons.
5. **The attachment X-ray hover card** — the summary + entity table over a
   `.docx` attachment.

**#2 is done.** `docs/screenshots/popup-setup-tab.png` is a real capture —
the extension was actually loaded unpacked into Chromium (via
`--load-extension`) and its live popup was screenshotted, so `chrome.storage`
and `chrome.runtime` are real, not stubbed; the extension ID that came back
(`dnjhplgmnkabbjogfpbhofjedlkehkai`) matches the one pinned in
`manifest.json` and baked into every connector's OAuth redirect URL in the
README, confirming that setup is still correct. It's 380×620 — Chrome Web
Store screenshots must be exactly 1280×800 or 640×400, so this is source
material to composite onto a listing-sized canvas (centered, with your own
background/framing), not something to upload as-is.

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

- [x] Screenshot #2 (popup Setup tab) — `docs/screenshots/popup-setup-tab.png`.
- [ ] Composite that screenshot onto a proper 1280×800 or 640×400 canvas.
- [ ] Capture the other real screenshots above (need a live Gmail account) —
      the Do It chip, the Morning Brief indicator/panel, and the receipt
      after a write are the three that matter most now that the listing
      describes the process/Brief model rather than the five-connector one.
- [ ] Fill in the Developer Dashboard form itself using the text above.
- [ ] **`oauth2.client_id` in `manifest.json` is still the placeholder**
      (`YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com`) — this
      genuinely IS a Store-submission blocker now, since Google is the only
      live connector. See `README.md`'s "Set up Google" section for the
      full Cloud Console walkthrough.
- [x] `privacy.html` checked against this doc's data-usage table and the
      actual `ALLOWED_EVENTS` list. Section 5's "What stays local" and
      "Connection credentials" bullets already covered the Morning
      Brief/Execution Memory local-storage additions correctly. The
      "Anonymous product-usage events" bullet named 7 of the 10 actually
      allowed events — missing `connector_configured`, `draft_generated`,
      `attachment_summarized`, and `weekly_habit_formed` — fixed to
      enumerate all 10, matching this table's own row above exactly.
- [ ] The four non-Google connector `CLIENT_ID` placeholders in
      `src/background.js` (`HUBSPOT_CLIENT_ID`, `SALESFORCE_CLIENT_ID`,
      `SLACK_CLIENT_ID`, `MONDAY_CLIENT_ID`) are out of scope for this
      listing entirely now — see this doc's revision note at the top. Leave
      them unset until that scope is deliberately reopened.
- [ ] Decide the release strategy: this project's earlier recommendation
      was a dual track — submit to the Web Store for the public listing,
      and keep documenting Load-unpacked in the README for anyone who
      wants an update before the next Store review completes (Store
      reviews apply to every version, not just the first).
