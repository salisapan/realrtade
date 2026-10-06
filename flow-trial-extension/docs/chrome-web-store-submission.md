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
The four non-Google public client IDs live in `config/oauth.public.js` as
`REPLACE_WITH_*` placeholders (see `docs/SETUP.md`). They are not part of
this listing. Client secrets stay in Netlify. Do not invent IDs.

## Store listing text

### Extension name
`Glance` (already set in `manifest.json`)

### Short description (max 132 characters)

```
Glance stays on what you are waiting on until it is closed, and closes what is asked of you in one click. Judgment on your device.
```

130 characters.

### Detailed description

```
Glance closes open loops. Gmail is where it starts today. It watches the Gmail message you already have open. It doesn't scan
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

STAYS ON WHAT YOU ARE WAITING ON
When you send a message that asks someone for a reply, a signature or a
payment, Glance offers one small card: stay on it. If you say yes it adds a
Google Task for the day to chase, and when the person answers it reads what
the answer actually did. "Got it, thanks" and out-of-office replies leave the
loop open; a promise moves the day; a question back ("which invoice?") or "I
never got the attachment" keeps it open and hands the next move to you; a
plain "no" closes it as a no; a real answer, or for money a confirmation it
was paid, closes it. An answer that arrives in a new thread about the same
invoice settles the same loop. Nothing is ever sent for you. Free follows
three loops at a time; Pro follows every loop and shows the money still owed.

HOW JUDGMENT WORKS
The scoring that decides whether to show the Do It button runs entirely on
your device. It's a transparent, weighted scorer — not a black box, not a
language model — looking for a currency figure, a commitment verb, a dated
obligation, a direct request, a stated loss, and staying quiet on
automated-sender and mailing-list signals. No email text leaves your
machine to reach that decision. The threshold that decides "is this
confident enough to speak up" adjusts automatically as you click or
dismiss suggestions — no configuration screen, no rules to write.

Reading what you ask others for, and what their replies mean, follows the
same rule: Glance's own word-and-structure rules plus a small classifier that
runs entirely on your device (a few hundred kilobytes, no download, no
network). When it cannot tell, Glance stays silent. Learning from what you
accept or turn down is stored on your device as numbers only, never as text.

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
above, masked placeholder text only, (3) if you turn on the "second
reading" in the extension panel, one masked sentence at a time that Glance
could not place on your device (monthly allowance; never the thread;
suggestion only), and (4) a small number of anonymous
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
Glance's single purpose is to help the user close their open loops: what
they asked someone for, what they promised, and what was asked of them. It
starts in Gmail. On the user's device it detects when the currently open
Gmail message reflects a real decision or request, and only when the user
clicks an on-screen button does it close it by writing the appropriate
record(s) — a Google Calendar event, a Google Tasks reminder, a Gmail draft
reply, or a combination of these — to the user's own, already-signed-in
Google account; and, only when the user says yes, it stays on something the
user is waiting on until the other side really answers. It never sends
anything for the user, does not scan the mailbox in bulk, does not act
automatically, and does not serve any purpose unrelated to closing the
user's own open loops.
```

## Permission justifications (Privacy practices tab)

Chrome Web Store asks for a plain-language justification per permission.
Use these verbatim — each is traceable to the exact code that uses it.

| Permission | Justification |
|---|---|
| `storage` | Stores the user's chosen connector, line-of-work profile, sensitivity calibration, the local activity log, and the local Execution Memory log (which steps of a process this account tends to keep or remove) — entirely in `chrome.storage.local` on the user's own device (`src/storage.js`, `core/execution-memory.js`). Never synced to a Glance-owned server. |
| `identity` | Used only for `chrome.identity.getAuthToken()` — Chrome's own native Google account chooser — so Glance can write to Google Calendar, Google Tasks, and Gmail drafts using an OAuth grant to the Google account the user is already signed into (`src/background.js`). No redirect page, no third-party auth screen. |
| `scripting` | Registers Glance's reader for other websites (WhatsApp Web; Outlook on the web when Outlook is on) after the person turns them on in the setup and the browser grants that site's optional permission (`src/background.js`, `registerSurface`). Nothing is injected anywhere else. |
| `contextMenus` | Adds one right-click item, "Glance: stay on this", on selected text. Only the selection and the page's address without its query are stored, until the person answers one question (`src/background.js`, `core/capture.js`). |
| `offscreen` | Opens ONE hidden page that would hold an on-device language model (`src/hybrid-sw.js`, `src/offscreen.html`). **Declared but inert in this build:** `config/hybrid.public.js` has `enabled: false`, so the page is never created and nothing is downloaded. When it is turned on it runs only on a computer that passes a silent capability check, and the person can switch it off and free the disk. The extension-pages policy also gains `'wasm-unsafe-eval'`, which the model's WebAssembly library needs (the library is a file of the package: `vendor/`, Apache-2.0 for the runtime). |
| _Which zip to upload_ | Upload the **full** build: `python3 scripts/package_trial_extension.py --profile full --out <path>`. The zip the site serves is the **lite** profile while the switch is off: same manifest (so the permission is still declared), without `src/offscreen.*` and `vendor/`, 0.88 MB instead of 3.88 MB. `docs/hybrid-execution-architecture.md` §0c. |
| `optional_host_permissions: https://web.whatsapp.com/*` | Requested only when the person turns on WhatsApp Web in the setup, and removed when they turn it off. The reader (`src/content-whatsapp.js`) is read-only, reads only the open one-to-one chat, never a group, list, channel or status, and sends nothing to Glance's servers. |
| `optional_host_permissions: https://graph.microsoft.com/*` | Requested only when the person turns on Outlook in the setup, and removed when they turn it off. Microsoft Graph (Mail.Read, Mail.ReadWrite, User.Read): read the last 14 days of inbox and sent, and on Do It create/delete Glance's own reply drafts in Outlook Drafts — never send. Made from the extension panel while it is open and from an open Outlook-on-the-web tab (`src/outlook.js`, Graph GETs under /me through the worker). The worker also renews the Microsoft sign-in on an alarm (token endpoint on login.microsoftonline.com only). Nothing is sent to Glance's servers. |
| `optional_host_permissions: https://outlook.live.com/*`, `https://outlook.office.com/*`, `https://outlook.office365.com/*` | Requested with Outlook Turn on. Injects the same Glance Do It card as Gmail into the open message on Outlook on the web (`src/content-outlook.js`). Reads the open reading pane on-device to match a Graph-synced ask; writes only via Graph createReply (draft, never send). Removed when Outlook is turned off. |
| `optional_host_permissions: http://127.0.0.1/*, http://localhost/*` | Requested only when the person turns on "A model on your computer" in the extension panel, and only for the address of a program they run themselves (Ollama or LM Studio). Used to send one sentence at a time to that local program, and only after it has passed the precision test shown in the panel. The address is checked twice to be this computer (no other host is ever contacted), nothing is sent to Glance's servers, and the answer only proposes a loop that the person still has to tap. |
| `optional_host_permissions: https://login.microsoftonline.com/*` | Requested together with the one above. Microsoft's own OAuth endpoints: the sign-in (PKCE, through `chrome.identity.launchWebAuthFlow`) and the token refresh for that sign-in. |
| `host_permissions: https://mail.google.com/*` | The content script (`src/content-gmail.js`) runs only on Gmail to read the open message's visible text, subject, and sender, and to inject the Do It button / Morning Brief UI. |
| `host_permissions: https://tasks.googleapis.com/*` | Direct API calls to create/undo a Google Tasks reminder after the user clicks Do It. |
| `host_permissions: https://www.googleapis.com/calendar/*` | Direct API calls to create/undo a Google Calendar event after the user clicks Do It. Also one read: when the extension is opened, events with a given person on the invite, to close a "pick a time" loop (ids, times and invitee addresses only; `flow:outside-calendar`). |
| `host_permissions: https://www.googleapis.com/drive/*` | Read calls (`drive.readonly`) when the user clicks Do It on a message that clearly asks for one file: search that account's Drive and attach only a single high-confidence match to an unsent Gmail draft (`searchDriveFiles` in `src/background.js`, ranked in `core/file-attach.js`). The same read confirms there is exactly one file before a calendar, task, or template create. If more than one file could be the one, Glance stays silent. The optional Drive picker remains a secondary control, not the close. |
| `host_permissions: https://www.googleapis.com/oauth2/*` | Hand-armed Outlook file trace only. One call to Google's tokeninfo endpoint reads the scopes on the token Chrome already issued, so a silence can say whether Drive read is on that token. The access token is not logged and not stored. No new OAuth scope. No mail content. |
| `host_permissions: https://www.googleapis.com/upload/drive/*` | `drive.file` only. When a clear ask has no safe match and exactly one company template for that object exists, Do It uploads a new file made from that template and attaches it to the unsent draft. The same upload creates a Doc, Sheet, or saved file for a create-and-share close. Undo deletes that new file. Glance does not edit the template or any other Drive file. No full `drive`, `documents`, or `spreadsheets` scope. |
| `host_permissions: https://gmail.googleapis.com/*` | Direct API calls to create/undo a Gmail draft reply after the user clicks Do It. |
| `host_permissions: https://theflow-ai.com/*` | Calls Glance's own Netlify Functions for the opt-in AI features (Draft-It, attachment summary, and, once the person turns it on, the "second reading" of one sentence), which only ever receive masked placeholder text, and for the anonymous, aggregate-only usage-count pings described below. |

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
| Personally identifiable information | **Yes** | Only the fields the user explicitly approves via Do It (sender name/email, extracted amount/date, one quoted sentence) — sent directly to the destination *they* connected, not to Glance. Draft-It / attachment summary / the opt-in second reading send masked placeholder tokens only, never real PII. |
| Health information | No | — |
| Financial and payment information | **Yes** (narrow) | A monetary amount extracted from the open email, only when the user clicks Do It, sent only to their chosen connector. Masked before reaching Draft-It/attachment summary. |
| Authentication information | **Yes** | OAuth tokens for connected destinations, stored only in `chrome.storage.local` on the user's device; never transmitted to or stored by Glance. |
| Personal communications | **Yes** (narrow) | The open Gmail message's text is read locally to score it; only the fields above (never the full message) ever leave the device, and only on explicit click. The one other path is opt-in (off until the person turns on the "second reading" in the panel): a single sentence of the person's own newest message that Glance could not place, with names, amounts, dates and contact details replaced, sent to our server for a second reading, within a monthly allowance (`docs/ai-ladder.md`). |
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
- [x] Composite that screenshot onto a proper 1280×800 canvas — `docs/screenshots/cws-popup-setup-1280x800.png` (2026-10-06).
- [x] Build the upload zip — `python3 scripts/build_cws_zip.py` → `dist/glance-cws.zip` (v0.9.18). Owner steps: `docs/cws-owner-handoff.md`.
- [ ] Capture the other real screenshots above (need a live Gmail account) —
      the Do It chip, the Morning Brief indicator/panel, and the receipt
      after a write are the three that matter most now that the listing
      describes the process/Brief model rather than the five-connector one.
- [ ] Fill in the Developer Dashboard form itself using the text above.
- [ ] Paste the public listing URL into `flow-landing/assets/site-config.js` (`chromeStoreUrl`).
- [x] **`oauth2.client_id` in `manifest.json` is set.** The
      `YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com` placeholder
      is no longer in the manifest, so it is not a Store-submission
      blocker. See `README.md`'s "Set up Google" section if it needs to be
      rotated.
- [x] `privacy.html` checked against this doc's data-usage table and the
      actual `ALLOWED_EVENTS` list. Section 5's "What stays local" and
      "Connection credentials" bullets already covered the Morning
      Brief/Execution Memory local-storage additions correctly. The
      "Anonymous product-usage events" bullet named 7 of the 11 actually
      allowed events — missing `connector_configured`, `draft_generated`,
      `attachment_summarized`, and `weekly_habit_formed` — fixed to
      enumerate all 11, matching this table's own row above exactly.
- [ ] The four non-Google public client IDs in `config/oauth.public.js`
      (`hubspotClientId`, `salesforceClientId`, `slackClientId`,
      `mondayClientId`) are still `REPLACE_WITH_*` placeholders. They are
      out of scope for this listing — see the revision note at the top.
      `publicClientId()` treats those placeholders as unset, so the
      connectors report themselves unconfigured and do not open an OAuth
      window. Leave them unset until that scope is deliberately reopened.
      Client secrets stay in Netlify — see `docs/SETUP.md`. Do not invent
      IDs.
- [ ] Decide the release strategy: this project's earlier recommendation
      was a dual track — submit to the Web Store for the public listing,
      and keep documenting Load-unpacked in the README for anyone who
      wants an update before the next Store review completes (Store
      reviews apply to every version, not just the first).
