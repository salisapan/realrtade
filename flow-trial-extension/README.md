# Glance

Glance turns decisions made in your inbox into records in the systems you
already use — automatically, with no data entry, no rules, no chat. Today
it ships as a Chrome extension that watches Gmail passively and, when an
email actually decides something, puts one `Do It` button next to it that
writes the record for you. The judgment engine itself knows nothing about
Gmail — it scores plain text — so Gmail is the first surface, not the
architecture's ceiling (see "What is still deliberately narrow" below).

Glance is a separate product from Flow (theflow-ai.com's enterprise workflow
engine for organizations with sensitive or regulated data) — not a stripped
tier of it. Glance is general-purpose, free-to-start, and makes no security
or compliance claims; see `docs/product-architecture.md` in the main repo for
the full split.

## What actually works today

**Judgment runs on this device.** `src/judgment.js` scores each message from
weighted, named signals — a currency figure, a commitment verb, a dated
obligation, a direct request, a stated loss — against negative ones like an
automated sender or mailing-list boilerplate. It speaks only above a threshold
that moves as you click and dismiss. No email text is sent anywhere to reach
this decision.

**Facts are extracted, not just detected.** `src/extract.js` pulls the amount
(with currency, `k`/`m` suffixes, and a refusal to treat a bare number or a
percentage as money), the date (resolving weekday references and month names,
and refusing to normalise a genuinely ambiguous `3/4`), and the sentence that
carried the decision. That is what makes the written record worth having.

**`Do It` closes one named process, not a pile of independent actions.**
`src/actions.js` maps each of the five classified intent types onto exactly
one process — Schedule & Confirm, Schedule It, Reply & Track, Follow
Through, or Log It — never a loose action list. Each process names an
*anchor* step (the concrete evidence it exists on — the calendar entry for
a schedule process, the draft for a reply) that can never be dropped or
reordered; the chip's lead sentence and post-write receipt both frame this
as one outcome closing ("Scheduling this and setting a reminder to
prepare." → "Closed — scheduled, with a reminder set."), not a set of
options. Clicking `Do It` runs the process's steps in order and reports
progress as each one closes; a single `Undo all` reverts the whole chain in
reverse order, stopping immediately if any one step can't be undone rather
than leaving the account guessing what did and didn't revert.

`src/execution-memory.js` is a small local (`chrome.storage.local`) event
log of what this account actually does with each process — which
non-anchor steps it keeps, strips off before confirming, or undoes after
the fact. `actions.js` reads it to order those steps by how often this
account has kept them, and to stop proposing a step it has net-rejected
across a real sample size. Nothing in this log ever leaves the device.

**A quiet Morning Brief for what's still open.** `src/brief.js` (rendering)
and `src/storage.js`'s `getPending()`/`consumeDailyBriefTrigger()` (data)
together are the one proactive surface Glance has, and it stays inside the
same Zero-Prompt rules as everything else: a process a chip was shown for,
and never closed with a Do It or a Dismiss, stays "pending" — that's just
the existing per-message log's own `hasTerminalOutcome` definition applied
in bulk, not a second store to keep in sync. When at least one thing is
pending, a small "N still open" indicator appears (page-level, not
per-message); clicking it opens a short list, and each row runs Do It /
Dismiss through the exact same process/Execution Memory machinery the live
chip uses — reconstructed entirely from the log's own snapshot, so it works
even for a message that's no longer open in Gmail. It auto-opens at most
once per calendar day, and only on a day something is actually open; with
nothing pending, nothing renders at all — no empty state, no badge, no
ritual to dismiss.

**Five real write paths, all undoable.**

| Connector | Auth | What one click does |
|---|---|---|
| **Notion** | Internal integration token you create yourself | Creates a page in a database you choose, filling whichever Amount / Date / Email / URL columns that database happens to have, with the quoted sentence and a link back to the Gmail thread in the body. Undo archives it. |
| **HubSpot** | OAuth (needs the owner to configure an app) | Logs a Note on the Contact matching the sender, with the same fields. Undo deletes it. |
| **Salesforce** | OAuth (needs the owner to configure an app) | Logs a Task on the Contact matching the sender, with the same fields. Undo deletes it. |
| **Slack** | OAuth (needs the owner to configure an app) | Posts one message to a channel you name, with the amount, the date and the quoted sentence. Undo deletes the message. |
| **Monday.com** | OAuth (needs the owner to configure an app) | Creates one item on a board you name, with the facts attached as an update. Undo deletes the item. |

Every path is additive only: it creates one new record and never edits or
deletes anything that was already there.

## Local Privacy Shield, and where masked text is allowed to go

Every message the sidebar or the chip ever reads is masked on-device first.
`src/privacyShield.js` finds every name, company, law firm, monetary amount,
date, email address, and phone number in a message and replaces each with a
placeholder token
(`[CLIENT_NAME_1]`, `[COMPANY_A]`, `[LAW_FIRM_B]`, `[OPPOSING_COUNSEL_1]`,
`[CURRENCY_VAL_1]`, `[DATE_1]`, `[EMAIL_1]`, `[PHONE_1]`) before anything
downstream sees it. A green
**Local Privacy Shield Active** badge sits at the top of the sidebar for
exactly this reason — hover it for the same claim in one sentence.

Two different things happen to that masked text after masking, and the
distinction matters:

- **The passive chip and judgment engine never send anything anywhere.**
  `src/judgment.js` and `src/extract.js` score plain text entirely on this
  device — see "What is still deliberately narrow" below. This has not
  changed.
- **Draft-It (below) and the attachment X-ray (below) are opt-in tools that
  do call a real language model** — `netlify/functions/glance-assist/glance-assist.js`,
  which calls the Anthropic API. They only ever receive the *masked* text:
  the placeholder tokens, never the real names/amounts/dates/emails/phones. The
  token↔real-value map is built and kept in this tab and is never sent
  anywhere; the model is instructed to reuse tokens verbatim, and the real
  values are substituted back in locally, after the round trip, by
  `FlowPrivacyShield.unmask()`. Anthropic is the only third party either
  feature's masked text ever reaches.

## Draft-It (Feature 2)

Click **Draft-It** in the sidebar while a thread is open. Glance harvests the
open message plus up to 3 prior messages in the same thread, masks all of them
together (as one batch, so the same client named across two messages gets the
same token rather than two independent — and potentially colliding — ones),
sends the masked text to `glance-assist.js`, and shows the drafted reply
(English or Hebrew, matched to the thread) with **Insert into Reply** and
**Redraft** buttons. Insert writes the unmasked draft directly into Gmail's own
reply compose box.

## Attachment X-ray (Feature 3)

Hover a `.docx` attachment chip on an open message and a floating card
appears with a one-line summary and an entity table (Counterparty, Effective
Date, Financial Value, Governing Law). `src/docreader.js` reads the `.docx`
entirely on-device (it's a ZIP of a few XML parts — the same insight
`src/docwriter.js` uses in the write direction), the extracted text is masked,
and only the masked text goes to `glance-assist.js` for summarization.

**PDF is not supported yet** — the hover card shows "Preview isn't available
for this file type yet" for PDFs and any other file type. Real PDF text
extraction (compressed content streams, font encoding tables) is a
library-sized undertaking, not something to bolt on unreliably alongside a
hand-rolled `.docx` reader; see `src/docreader.js`'s header comment.

## Next-Step CRM & Document Orchestrator (Feature 4)

The sidebar's **Do It: Log to [Connector] & Generate Next Step Document**
button runs both halves of "what happens after this decision" from one click:

- **Path A** logs to whichever connector is already connected (Notion,
  HubSpot, Salesforce, Slack, or Monday.com) — the exact same write path and
  `Undo` the chip itself uses, so the two never disagree about what a write
  looked like.
- **Path B** generates a real, Word-openable `.docx` locally (no server call,
  no library — `src/docwriter.js`) from the same extracted facts Path A just
  wrote, and downloads it.

Once both complete, the sidebar shows a receipt (where it logged to, a link,
Undo) and a one-time invitation to the Flow Pilot Program — Glance's own
upsell path into the full Flow product, shown only after the loop has
genuinely completed once, never speculatively.

## Set up Google (Tasks, Calendar, Gmail Drafts, Drive Picker) (needs the site owner)

Google is the default connector — Calendar, Gmail Drafts, and Google Tasks
all share one OAuth grant via `chrome.identity.getAuthToken` (Chrome's own
native Google account chooser, not `launchWebAuthFlow` like the four
connectors below). That means **no redirect URL, no client secret, and no
Netlify environment variable** — the entire flow is client-side. The Drive
picker needs one extra, unrelated credential: a plain API key (not OAuth)
that authenticates Google's picker *widget*, separate from the OAuth token
that authenticates *file access*.

### 1. Create or pick a Google Cloud project

[console.cloud.google.com](https://console.cloud.google.com) → project
picker (top left) → **New Project** (or reuse an existing one). Everything
below happens inside this one project.

### 2. Enable the APIs

**APIs & Services → Library**, enable all five — a missing one fails at
the first real API call with a 403 ("API not enabled"), not at OAuth time,
which is the single most common way this gets half-configured:

- Google Calendar API
- Gmail API
- Google Tasks API
- Google Drive API
- Google Picker API

### 3. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen.**

1. User type: **External** (or **Internal** if this is a Google Workspace
   account and you only ever intend to test with accounts on that
   workspace).
2. Fill in app name, support email, developer contact email. Nothing else
   here is required to start testing.
3. Leave **Publishing status** as **Testing** for now — this is what lets
   you skip Google's verification review entirely while testing on real
   accounts (see Test users, step 7).

### 4. Create the OAuth Client ID (type: Chrome Extension)

**APIs & Services → Credentials → Create Credentials → OAuth client ID.**

1. Application type: **Chrome extension** (not "Web application" — that's
   the type the other four connectors below effectively use via their
   redirect-URL flow; Google's flow is a different, extension-native type).
2. **Item ID / Application ID**: paste the extension's own ID —
   ```
   dnjhplgmnkabbjogfpbhofjedlkehkai
   ```
   This is the same ID already baked into the `chromiumapp.org` redirect
   URLs for HubSpot/Salesforce/Slack/Monday.com below, derived from the
   `key` pinned in `manifest.json`. It stays stable across reloads — don't
   regenerate that key without updating it everywhere it's registered,
   here included.
3. Create it, then copy the generated **Client ID**
   (`....apps.googleusercontent.com`). There is no client secret for this
   application type — Chrome itself is the OAuth client, so there's nothing
   to keep server-side.
4. Paste that Client ID into `manifest.json`'s `oauth2.client_id`, replacing
   the `YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com` placeholder.

### 5. Create the Picker API key

**APIs & Services → Credentials → Create Credentials → API key.**

1. Create the key, then click **Edit** on it immediately (an unrestricted
   key left as-is is a real, avoidable exposure).
2. **Application restrictions → HTTP referrers (web sites)** → add:
   ```
   chrome-extension://dnjhplgmnkabbjogfpbhofjedlkehkai/*
   ```
3. **API restrictions → Restrict key** → select **Google Picker API** only
   (it doesn't need Drive/Calendar/Gmail/Tasks API access — those calls all
   go through the OAuth token from step 4, never this key).
4. Paste the key into `picker/picker.js`'s `GOOGLE_PICKER_API_KEY` constant,
   replacing the `YOUR_GOOGLE_PICKER_API_KEY` placeholder.

### 6. Confirm the scopes match

`manifest.json`'s `oauth2.scopes` should already list all four (this ships
in the repo — nothing to add here unless it's been edited):

```
https://www.googleapis.com/auth/tasks
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/drive.file
```

`drive.file` is the narrow, per-file scope — it only ever grants access to
a file the user explicitly opens through the picker, never blanket Drive
access. There is nothing to add on the consent screen's own Scopes step for
Testing-mode use; that step only matters once you move toward verification
for production (see Common pitfalls).

### 7. Add yourself as a test user

**OAuth consent screen → Audience/Test users → Add users** → add the exact
Google account you'll sign into during manual testing. While the app is in
**Testing** status (step 3), only accounts explicitly listed here can
complete the OAuth grant — everyone else sees Google's "app hasn't
completed verification" blocking screen, not a partial failure.

### Common pitfalls

- **API not enabled ≠ scope not granted.** A 403 from Calendar/Gmail/Tasks/
  Drive after a successful sign-in almost always means step 2 was skipped
  for that specific API, not a scopes or Client ID problem.
- **Wrong OAuth client type.** "Web application" and "Chrome extension" are
  different Client ID formats; `chrome.identity.getAuthToken` only works
  with the Chrome extension type from step 4.
- **Forgetting the test user.** The single most common "it just won't sign
  in" report while in Testing status — the fix is step 7, not the Client ID.
- **Regenerating `manifest.json`'s `key`.** This changes the extension ID,
  which silently invalidates the Item ID in step 4, the Picker key
  restriction in step 5, and all four `chromiumapp.org` redirect URLs below.
  Don't touch it once any of these are registered.
- **Picker API key with no restrictions, or restricted to the wrong
  referrer.** Either leaves it wide open or failing every request;
  the exact pattern in step 5's referrer field matters (trailing `/*`
  included).
- **Production / many real users, later:** `gmail.compose`, `calendar.events`,
  and `tasks` are all Google "sensitive" scopes — fine for Testing and up to
  100 test users with zero review, but a real public launch beyond that
  eventually needs Google's verification process. Not a blocker for the
  manual testing this checklist exists for.

## Set up Notion (works immediately, no server, no app review)

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) →
   **New integration** → give it a name → copy the **Internal Integration
   Token**.
2. Open the Notion database you want Glance to write to as a full page, click
   **⋯ › Connections › Connect to**, and pick your integration. Without this
   step Notion returns 404 and the popup will tell you exactly that.
3. Copy that database's URL from the address bar.
4. Paste both into the extension popup and click **Connect Notion**. The
   credential is verified against the real API before it is stored, so a typo
   surfaces immediately rather than at the first click in Gmail.

Any column layout works. Glance fills a `title` property with the action, and
matches by name and type for the rest — a `number` column called Amount, a
`date` column called Due date, an `email` column called Contact, a `url`
column called Source. Anything it cannot map still reaches the page body, so
nothing extracted is silently dropped.

## Set up HubSpot (needs the site owner)

**Before this connector (or Salesforce/Slack/Monday.com) can actually be
selected and used, it also needs its API host added back to
`manifest.json`'s `host_permissions`** — they were deliberately removed
pending Chrome Web Store submission, since `popup.js`'s onboarding screen
only shows `mvp: true` connectors today (Google Tasks) and Web Store review
expects requested host permissions to match what's actually reachable. See
`src/connectors.js`'s own header comment for the exact hosts.

1. [developers.hubspot.com](https://developers.hubspot.com) → create a free
   developer account → **Create app**.
2. Under **Auth**, add this exact redirect URL:
   ```
   https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/
   ```
   It is derived from the `key` pinned in `manifest.json`, so the extension ID
   — and this redirect URL — stays stable across reloads. Don't regenerate the
   key without updating this URL.
3. Under **Scopes**, add `crm.objects.contacts.read` and
   `crm.objects.contacts.write`.
4. Put the app's **Client ID** into `src/background.js`
   (`HUBSPOT_CLIENT_ID`, top of the file). It is public, like a GA4
   measurement ID.
5. In the Netlify project, set `HUBSPOT_CLIENT_ID` and
   `HUBSPOT_CLIENT_SECRET`. Those back `netlify/functions/hubspot-oauth-exchange`
   and `hubspot-oauth-refresh` — the only two places the secret is ever used.
   **The secret must never appear in this repository or in the extension.**
6. HubSpot developer accounts include a free **test account** (a full CRM
   sandbox) if you don't have a live portal to try it against.

Until step 4 is done the popup shows HubSpot as *Needs setup* and says so
plainly rather than failing halfway through a handshake.

## Set up Salesforce (needs the site owner)

1. In your Salesforce org: **Setup → App Manager → New Connected App.**
2. Enable OAuth Settings, and add this exact callback URL:
   ```
   https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/
   ```
   Same derivation as HubSpot's — it comes from the pinned `key` in
   `manifest.json`, so don't regenerate that key without updating this URL
   everywhere it's registered.
3. Under **Selected OAuth Scopes**, add `Manage user data via APIs (api)` and
   `Perform requests at any time (refresh_token, offline_access)`.
4. Put the app's **Consumer Key** into `src/background.js`
   (`SALESFORCE_CLIENT_ID`, top of the file). It is public, like a GA4
   measurement ID.
5. In the Netlify project, set `SALESFORCE_CLIENT_ID` and
   `SALESFORCE_CLIENT_SECRET`. Those back
   `netlify/functions/salesforce-oauth-exchange` and
   `salesforce-oauth-refresh` — the only two places the secret is ever used.
   **The secret must never appear in this repository or in the extension.**
6. A free [Salesforce Developer Edition](https://developer.salesforce.com/signup)
   org gives you a full CRM to test against if you don't have a live one.

Until step 4 is done the popup shows Salesforce as *Needs setup*.

## Set up Slack (needs the site owner)

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** →
   **From scratch**.
2. Under **OAuth & Permissions**, add this exact redirect URL:
   ```
   https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/
   ```
3. Still under **OAuth & Permissions → Scopes → Bot Token Scopes**, add
   `chat:write` and `chat:write.public`.
4. Put the app's **Client ID** (Basic Information → App Credentials) into
   `src/background.js` (`SLACK_CLIENT_ID`, top of the file). It is public,
   like a GA4 measurement ID.
5. In the Netlify project, set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`.
   Those back `netlify/functions/slack-oauth-exchange` — the only place the
   secret is ever used. **The secret must never appear in this repository or
   in the extension.** There is no Slack refresh function: a bot token
   issued this way doesn't expire unless you separately opt this app into
   Slack's token-rotation beta, which it does not use.
6. In the popup, after connecting, paste the **Channel ID** of the channel
   Glance should post to (open the channel in Slack → **View channel
   details** → the ID is at the bottom). The bot only needs to be invited to
   a private channel; `chat:write.public` lets it post to public ones
   without an invite.

Until step 4 is done the popup shows Slack as *Needs setup*.

## Set up Monday.com (needs the site owner)

1. [monday.com](https://monday.com) → your avatar → **Developers** →
   **My Apps** → **Create app**.
2. Under **OAuth**, add this exact redirect URL:
   ```
   https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/
   ```
3. Under **Scopes**, add `boards:read` and `boards:write` (also grants
   `updates:write`, which the write path uses to attach the fact lines).
4. Put the app's **Client ID** into `src/background.js`
   (`MONDAY_CLIENT_ID`, top of the file). It is public, like a GA4
   measurement ID.
5. In the Netlify project, set `MONDAY_CLIENT_ID` and `MONDAY_CLIENT_SECRET`.
   Those back `netlify/functions/monday-oauth-exchange` and
   `monday-oauth-refresh` — the only two places the secret is ever used.
   **The secret must never appear in this repository or in the extension.**
6. In the popup, after connecting, paste the **Board ID** Glance should write
   to (open the board — it's the number in the URL after `/boards/`).

Until step 4 is done the popup shows Monday.com as *Needs setup*.

## Load it locally

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open the popup, connect a system, pick the kind of work you do, **Save &
   start**.
4. Open Gmail. Most messages produce nothing — that is the product working.

## Set up Draft-It / Attachment X-ray (needs the site owner)

Both features share one Netlify function and one environment variable:

1. In the Netlify project, set `ANTHROPIC_API_KEY` to a real Anthropic API
   key. `netlify/functions/glance-assist/glance-assist.js` is the only file
   that reads it, and it is never sent to, or readable from, the extension.
2. That's it — no extension-side configuration, no OAuth, no new
   `host_permissions` (the function lives on `theflow-ai.com`, already
   covered by the extension's existing host permission for the other five
   connectors' Netlify functions).

Until step 1 is done, Draft-It and the attachment X-ray show "This feature is
not configured yet" rather than failing silently or half-completing a request.

## Layout

```
manifest.json          MV3, pinned key so the extension ID is stable
src/extract.js         money / date / decisive-sentence extraction (no network)
src/judgment.js        weighted on-device scorer + adaptive threshold
src/domains.js         per-field vocabulary and phrasing — never rules
src/connectors.js      catalog: what each destination is and how it authenticates
src/storage.js         chrome.storage wrapper; log and calibration
src/execution-memory.js  local event log of what a user keeps/strips/undoes per named process — biases future step order and drops a net-rejected step (see "What actually works today")
src/privacyShield.js   Local Privacy Shield — masks names/companies/money/dates/emails/phones before anything leaves the device
src/sidebar.js         the injected sidebar pane: badge, Draft-It, Next-Step, attachment hover card
src/sidebar.css        sidebar/floating-card styles (CSS logical properties, RTL/LTR safe)
src/brief.js           Morning Brief UI: the page-level "N still open" indicator + its panel
src/brief.css          brief indicator/panel styles, reusing the chip's own button states
src/docwriter.js       generates a real .docx locally, no library (Feature 4 Path B)
src/docreader.js       reads a .docx locally, no library (Feature 3's attachment text extraction)
src/content-gmail.js   Gmail watcher, the chip, the sidebar wiring, and the receipt after a write
src/background.js      credentials, the five write paths, undo, and the glance-assist relay
popup/                 the only configuration surface — two questions long
netlify/functions/glance-assist/  masked-only backend proxy to a real LLM, for Draft-It + attachment X-ray
```

## Future: anonymous team-level pattern sharing (foundation only, not built)

`src/execution-memory.js` exports `toPatternSummary()`, a pure function that
collapses one account's local Execution Memory into a flat list of
`{processType, stepKind, accepted, removed, undone, pinned}` rows — no
`intentionId`, no timestamp, no message content, no per-install identifier.
That is the one hard design decision behind a real "see how your team
tends to close the same processes" feature: exactly which facts are safe
to aggregate across people. It is settled now so it doesn't get invented
under pressure later.

Nothing calls this function today. There is no team or org concept
anywhere in this product, no network transmission of this data, and no
UI for it. Building the real feature still needs, at minimum: an explicit
per-user opt-in (off by default, same posture as Draft-It's masked
processing — see above), an actual notion of "team," and a server
endpoint that only ever accepts rows in this exact shape. This is
foundation, not the feature.

## What is still deliberately narrow

- **Gmail only.** The judgment engine takes plain text and knows nothing about
  Gmail; adding a second source surface is a content script, not a rewrite.
- **The passive judgment engine is not a language model, and sends nothing
  anywhere.** `src/judgment.js`'s scorer is a transparent, explainable
  weighting, which is why the popup can show why Glance spoke — this has not
  changed. Draft-It and the attachment X-ray are separate, opt-in tools that
  do call a real model with masked-only text; see "Local Privacy Shield,
  and where masked text is allowed to go" above for exactly where the line is.
- **PDF attachments aren't previewable yet.** Only `.docx` is read today —
  see "Attachment X-ray" above.
- **Not on the Chrome Web Store.** Store submission needs a completed data-use
  disclosure; until then, Load unpacked.
