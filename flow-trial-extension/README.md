# Glance

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

**Implementation status (code reality, this commit; not the product definition).** The entry surface is a Chrome extension that watches Gmail passively. It stays on what you are waiting on until the
other side really answers, and when an email decides something it puts one `Do It` button next to it that writes the record for you (a Google Calendar event, a Google Task, a Gmail draft; Drive for
files). Execution today goes through those Google surfaces; WhatsApp Web, Outlook and right-click capture are opt-in and experimental. The judgment engine itself knows nothing about Gmail: it scores plain
text, so Gmail is the first surface, not the architecture's ceiling (see "What is still deliberately narrow" below).

Glance is a separate product from Flow (theflow-ai.com's enterprise workflow
engine for organizations with sensitive or regulated data) — not a stripped
tier of it. Glance is general-purpose, free-to-start, and makes no security
or compliance claims; see `docs/product-architecture.md` in the main repo for
the full split.

## What actually works today

**Judgment runs on this device.** `core/judgment.js` scores each message from
weighted, named signals — a currency figure, a commitment verb, a dated
obligation, a direct request, a stated loss — against negative ones like an
automated sender or mailing-list boilerplate. It speaks only above a threshold
that moves as you click and dismiss. No email text is sent anywhere to reach
this decision. (The one optional exception is not part of judging a message:
the "second reading" of a single masked sentence, below.)

**Facts are extracted, not just detected.** `core/extract.js` pulls the amount
(with currency, `k`/`m` suffixes, and a refusal to treat a bare number or a
percentage as money), the date (resolving weekday references and month names,
and refusing to normalise a genuinely ambiguous `3/4`), and the sentence that
carried the decision. That is what makes the written record worth having.

**`Do It` closes one named process, not a pile of independent actions.**
`core/actions.js` maps each of the five classified intent types onto exactly
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

`core/execution-memory.js` is a small local (`chrome.storage.local`) event
log of what this account actually does with each process — which
non-anchor steps it keeps, strips off before confirming, or undoes after
the fact. `actions.js` reads it to order those steps by how often this
account has kept them, and to stop proposing a step it has net-rejected
across a real sample size. Nothing in this log ever leaves the device.

**A quiet Morning Brief for what's still open.** `core/still-open.js`
decides the list: at most three personal closes — a dated promise, an
explicit follow-up, or a confirmed amount — ranked by stakes, explicitness,
deadline, and confidence. Anything the chip would leave silent stays off
it: a hedge, more than one candidate, a weak or unsure score, an ask that
only survives in the quoted history, newsletter noise, and a fact ask the
list cannot check. A meeting, a nudge, or unread noise stays off too. Fewer than three clear the bar, fewer show; zero is
silence, not an empty widget to dismiss. `src/brief.js` renders that list.
The extension popup shows the same cards, each with Do It. Do It still
writes through the existing Google path and confirms with Handled / טופל
and Undo. A local inbox scan (subject and snippet already on screen) can
notice a close before the thread is opened; opening the thread drops that
snapshot and the full message is judged the usual way. The brief auto-opens
at most once per calendar day, and only when the list is non-empty. One
optional morning notification can point at that same list — never one ping
per item. The in-thread Do It chip is unchanged.

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

## Built since this page was first written (one line each, with the document that owns it)

| What | Where it is described |
|---|---|
| **Waiting on / what you promised**: loops that close on the outcome of a reply, with the Free cap of 3 | `docs/open-loops.md`, `docs/monetization.md` |
| The on-device engine: word lists, a learned model, a reply reader, one story across threads | `docs/intent-model.md`, `docs/reply-model.md`, `docs/ai-engine-upgrade.md` |
| A model on your own computer (Ollama, LM Studio), loopback only | `docs/local-model-server.md` |
| **Second reading**: one masked sentence to our server for what the code could not place; opt-in; Free 120 and Pro 1,500 a month | `docs/ai-ladder.md` |
| **True close**: a short reply with no answer in it never closes a loop; a draft is not a delivery | `docs/true-close.md`, `docs/resolution-paths.md` |
| Receipts and documents (contract, quote, proposal, signed copy) as a path to a real delivery | `docs/resolution-paths.md`, `docs/true-close.md` §4 |
| Other apps (WhatsApp Web, Outlook through Graph, right-click capture), opt-in and read-only | `docs/multi-platform.md` |
| Hybrid on-device model + masked server for Do It proposals (**dormant**, `config/hybrid.public.js`) | `docs/hybrid-execution-architecture.md` |
| Pro (Stripe, licence key, server-enforced paid features) | `docs/monetization.md`, `docs/revenue-routines.md` |
| What is open, blocked or decided | `docs/open-tasks.md` |

The full reading order for a human or an agent is `docs/README.md`.

## Local Privacy Shield, and where masked text is allowed to go

Every message the sidebar or the chip ever reads is masked on-device first.
`core/privacyShield.js` finds every name, company, law firm, monetary amount,
date, email address, and phone number in a message and replaces each with a
placeholder token
(`[CLIENT_NAME_1]`, `[COMPANY_A]`, `[LAW_FIRM_B]`, `[OPPOSING_COUNSEL_1]`,
`[CURRENCY_VAL_1]`, `[DATE_1]`, `[EMAIL_1]`, `[PHONE_1]`) before anything
downstream sees it. A green
**Local Privacy Shield Active** badge sits at the top of the sidebar for
exactly this reason — hover it for the same claim in one sentence.

Two different things happen to that masked text after masking, and the
distinction matters:

- **The judgment engine never sends anything anywhere.** `core/judgment.js`
  and `core/extract.js` score plain text entirely on this device. A quiet
  decision (noise, a hedge, a low-confidence catch-all, a Drive close that
  stayed silent) stays on the device. The chip asks the masked classifier
  only when that local pass found nothing and did not choose silence.
- **Draft-It, the attachment X-ray, and that one classify fallback call a
  routed model** — `netlify/functions/glance-assist/glance-assist.js`. They
  only ever receive masked text: placeholder tokens, never the real
  names, amounts, dates, emails, or phones. The token↔real-value map stays
  in this tab; the server masks again before any provider; the model is
  told to reuse tokens verbatim; `FlowPrivacyShield.unmask()` puts the real
  values back locally. Drafts use Anthropic Haiku or xAI Grok-fast.
  Summaries use Gemini Flash (OpenAI mini only if Gemini is missing or its
  circuit is open), then Haiku or Grok-fast. Classification uses Anthropic
  Sonnet, then a stronger Grok, and is never sent to Gemini or OpenAI.

  **Second reading (docs/ai-ladder.md).** One masked sentence at a time, only
  after the person turns it on in the popup, for what Glance's own code could
  not place. A fast model (Haiku or Grok-fast) is asked twice and must agree;
  Pro adds a strong model (Sonnet or Grok-strong) when they disagree. Monthly
  allowance, counted on the server: 120 on Free, 1,500 on Pro. Off at the
  server until `GLANCE_AI_LADDER` lists the languages that passed the measurement (`en`, `he`, or `en,he`).

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
Date, Financial Value, Governing Law). `core/docreader.js` reads the `.docx`
entirely on-device (it's a ZIP of a few XML parts — the same insight
`core/docwriter.js` uses in the write direction), the extracted text is masked,
and only the masked text goes to `glance-assist.js` for summarization.

**PDF is not supported yet** — the hover card shows "Preview isn't available
for this file type yet" for PDFs and any other file type. Real PDF text
extraction (compressed content streams, font encoding tables) is a
library-sized undertaking, not something to bolt on unreliably alongside a
hand-rolled `.docx` reader; see `core/docreader.js`'s header comment.

## Next-Step CRM & Document Orchestrator (Feature 4)

The sidebar's **Do It: Log to [Connector] & Generate Next Step Document**
button runs both halves of "what happens after this decision" from one click:

- **Path A** logs to whichever connector is already connected (Notion,
  HubSpot, Salesforce, Slack, or Monday.com) — the exact same write path and
  `Undo` the chip itself uses, so the two never disagree about what a write
  looked like.
- **Path B** generates a real, Word-openable `.docx` locally (no server call,
  no library — `core/docwriter.js`) from the same extracted facts Path A just
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

`manifest.json`'s `oauth2.scopes` should already list all five (this ships
in the repo — nothing to add here unless it's been edited):

```
https://www.googleapis.com/auth/tasks
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/drive.file
```

`drive.readonly` is read access across the whole Drive. When an open
message clearly asks for one file, Glance searches the account's own
Drive (hundreds of files, ranked — see `searchDriveFiles` in
`src/background.js` and `core/file-attach.js`) and attaches only a single
high-confidence match to an unsent Gmail draft. If that search has no
safe match and exactly one company template file for the same object
exists, Do It uploads a new file made from that template and attaches it.
Undo deletes that new file. It does not rename, browse, or edit the rest
of Drive.

The same `drive.file` upload is how a create-and-share close writes a
Doc, Sheet, or saved attachment Glance itself owns (a quote, proposal,
invoice, letter, decision log, a new amount sheet, or the one file on
the message). Those closes share the new file's link on the draft, or
place one already-found file on a calendar hold or a task. They do not
run a second attach search. Undo deletes the file this close created,
through the same delete the template copy uses.

This build does not request `drive` (full), `documents`, or
`spreadsheets`. A Docs comment on a file Glance did not create would
need the restricted `drive` scope, so that ask stays silent.

A prepare/draft close stays silent unless `chrome.storage.local` already
holds `glanceCompanyTemplate` — one template object, or
`{ templates: [...] }`, each with `artifact`, `kind` (`doc` or `sheet`),
and `name`. There is no template setup tour. No template means no Doc.
Missing details stay on that same close card. Four or fewer empty slots
are fields on the card, and chat stays closed. More than four opens a
short checklist that only names those slots and accepts two replies at
most. A reply that is not those slots, a dismiss, or a second reply that
still leaves more than four empty is silence: nothing is created.

There is nothing to add on the consent screen's own Scopes step for
Testing-mode use; that step only matters once you move toward verification
for production (see Common pitfalls — `drive.readonly` sits in a stricter
verification tier than the other scopes below).

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
  eventually needs Google's verification process. `drive.file` is
  non-sensitive (files this app creates). `drive.readonly` is a
  step further: read access across a user's whole Drive sits in Google's
  stricter "restricted scope" tier, not just "sensitive," which in practice
  means a slower, costlier verification path (up to and including a
  third-party security assessment) before a wide public launch — confirm
  the current requirements on Google's own developer documentation before
  relying on this summary. Not a blocker for the manual testing this
  checklist exists for.

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
`core/connectors.js`'s own header comment for the exact hosts.

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
4. Put the app's **Client ID** into `config/oauth.public.js`
   (`hubspotClientId`). It is public, like a GA4 measurement ID. Leave
   `REPLACE_WITH_HUBSPOT_CLIENT_ID` in place until you have the real one.
   **Do not put the client secret in that file.** The full secret list is
   `docs/SETUP.md`.
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
4. Put the app's **Consumer Key** into `config/oauth.public.js`
   (`salesforceClientId`). It is public, like a GA4 measurement ID. Leave
   `REPLACE_WITH_SALESFORCE_CLIENT_ID` in place until you have the real one.
   **Do not put the client secret in that file.** The full secret list is
   `docs/SETUP.md`.
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
   `config/oauth.public.js` (`slackClientId`). It is public, like a GA4
   measurement ID. Leave `REPLACE_WITH_SLACK_CLIENT_ID` in place until you
   have the real one. **Do not put the client secret in that file.** The
   full secret list is `docs/SETUP.md`.
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
4. Put the app's **Client ID** into `config/oauth.public.js`
   (`mondayClientId`). It is public, like a GA4 measurement ID. Leave
   `REPLACE_WITH_MONDAY_CLIENT_ID` in place until you have the real one.
   **Do not put the client secret in that file.** The full secret list is
   `docs/SETUP.md`.
5. In the Netlify project, set `MONDAY_CLIENT_ID` and `MONDAY_CLIENT_SECRET`.
   Those back `netlify/functions/monday-oauth-exchange` and
   `monday-oauth-refresh` — the only two places the secret is ever used.
   **The secret must never appear in this repository or in the extension.**
6. In the popup, after connecting, paste the **Board ID** Glance should write
   to (open the board — it's the number in the URL after `/boards/`).

Until step 4 is done the popup shows Monday.com as *Needs setup*.

## What a confirmed signup installs

The download after email confirmation is a zip of this folder, built by
`scripts/package_trial_extension.py` and served by
`flow-landing/netlify/functions/download-trial-zip`. It is not checked in.
How Netlify produces it, and which OAuth values the owner still has to
paste, is `docs/SETUP.md`. The packager has two profiles: **lite** (what the
site serves while `config/hybrid.public.js` is off: no on-device runtime,
0.9 MB) and **full** (with the 11.3 MB runtime: the Chrome Web Store upload);
`--profile auto|lite|full`, `docs/hybrid-execution-architecture.md` §0c.

## Load it locally

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open the popup, connect a system, pick the kind of work you do, **Save &
   start**.
4. Open Gmail. Most messages produce nothing — that is the product working.

## Set up Draft-It / Attachment X-ray (needs the site owner)

Both features, and the masked classify fallback, share one Netlify function.
Set these environment variables on the Netlify project (the extension never
sees them):

1. `ANTHROPIC_API_KEY` — Haiku for drafts and summary fallback, Sonnet for
   classification.
2. `XAI_API_KEY` — Grok-fast as the other draft/summary model, Grok-strong
   as the classify fallback.
3. `GEMINI_API_KEY` — Gemini Flash, the primary attachment summarizer.
4. `OPENAI_API_KEY` — optional. Used only to summarize an attachment when
   Gemini's key is missing or Gemini's circuit is open. Never used for
   drafts or classification.

Also read by the same function (all optional; a provider with no key is
skipped, never called):

5. `SUPABASE_SERVICE_ROLE_KEY` — licence checks (every Pro-only action) and the
   second reading's counter (`supabase/migrations/20261004000000_glance_ai_usage.sql`).
6. `GLANCE_AI_LADDER` — the languages that passed `scripts/ai-ladder/eval.cjs`
   (`en`, `he` or `en,he`). Empty = the second reading is off for everyone.
   `GLANCE_AI_DAILY_UNITS` (default 3000) and `GLANCE_AI_IP_DAILY_UNITS`
   (default 300) are the cost caps. `docs/ai-ladder.md` §7.
7. `MISTRAL_API_KEY`, `LLAMA_API_KEY` (+ `LLAMA_API_URL`, `LLAMA_MODEL`),
   `DEEPSEEK_API_KEY` — only for the dormant Do It proposal (`execute`).

No extension-side configuration, no OAuth, no new `host_permissions` (the
function lives on `theflow-ai.com`, already covered by the extension's
existing host permission).

Until a provider is set for the action, Draft-It and the attachment X-ray
show "This feature is not configured yet" rather than failing silently or
half-completing a request. A classify miss with no usable model stays silent.

## Layout

`core/` is the portable brain — intention classification, process planning,
Execution Memory, precision/harm calibration, document read/write. Nothing in
it references `chrome.*`, `document`, or `window`; every module is loaded as a
plain script here and also runs unmodified under Node (see `test/*.cjs`). This
is the part a future Flow enterprise runtime would reuse without a rewrite —
see `core/README.md` for the boundary contract. `src/` is everything that
makes Glance's current entry surface a Chrome extension talking to Gmail (implementation status, not the product definition): persistence,
the injected UI, the service worker, and the one file (`chrome-storage-
adapter.js`) that wires core/'s storage seam to `chrome.storage.local`.

```
manifest.json          MV3, pinned key so the extension ID is stable

core/domains.js         per-field vocabulary and phrasing — never rules
core/connectors.js      catalog: what each destination is and how it authenticates
core/extract.js         money / date / decisive-sentence extraction (no network)
core/judgment.js        weighted on-device scorer + adaptive threshold + precision/harm calibration
core/intent.js          classifies extracted facts into one of five intent types
core/actions.js         intent -> named PROCESS -> ordered steps, biased by Execution Memory
core/execution-memory.js  local event log of what a user keeps/strips/undoes per named process — biases future step order and drops a net-rejected step (see "What actually works today"); storage is an injected adapter, not hardcoded
core/privacyShield.js   Local Privacy Shield — masks names/companies/money/dates/emails/phones before anything leaves the device
core/docwriter.js       generates a real .docx locally, no library (Feature 4 Path B)
core/docreader.js       reads a .docx locally, no library (Feature 3's attachment text extraction)
core/ (the other ~60 modules)  one line each in `core/README.md`; a test keeps that list complete
core/ai-ladder.js       the second reading's policy: who may be asked about what, the Free/Pro allowance, the checks an answer passes
core/resolution.js      multi-step resolution: receipts and the documents the person sends; closes only on a real delivery
core/follow-up.js       Waiting on, promises, what a reply did to a loop, the true-close rules
config/                 public switches: oauth.public.js, hybrid.public.js (off), ladder.public.js (on; the server decides)

src/storage.js          chrome.storage wrapper; log, calibration, weekly/badge counters — Glance's own persistence choices, not core logic
src/chrome-storage-adapter.js  wires core/execution-memory.js's storage seam to chrome.storage.local
src/sidebar.js          the injected sidebar pane: badge, Draft-It, Next-Step, attachment hover card
src/sidebar.css         sidebar/floating-card styles (CSS logical properties, RTL/LTR safe)
src/brief.js            Morning Brief UI: the page-level "N still open" indicator + its panel + Contextual Resurfacing
src/brief.css           brief indicator/panel/resurface styles, reusing the chip's own button states
src/weekly.js           Weekly Closing Summary banner ("closed N this week / N still open")
src/weekly.css          weekly summary banner styles
src/receipt-copy.js     the receipt's status words ("Handled." / "Partly handled.") and the Undo label — pure, no DOM
src/content-gmail.js    Gmail watcher, the chip, the sidebar wiring, and the receipt after a write
src/background.js       credentials, the five write paths, undo, the glance-assist relay, and the extension-icon badge

popup/                  the only configuration surface, plus the Open tab (Unified Open Items Surface)
../flow-landing/netlify/functions/glance-assist/  masked-only backend proxy to a real LLM: Draft-It + attachment X-ray (Pro), the second reading (ladder.js, Free and Pro), the dormant Do It proposal
../supabase/migrations/  licences and the second reading's counter (the project is paused; the owner restores it)
../scripts/             packager (lite/full), verify, vendor-runtime, ai-ladder/eval.cjs (the measurement gate)
```

## Future: anonymous team-level pattern sharing (foundation only, not built)

`core/execution-memory.js` exports `toPatternSummary()`, a pure function that
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

- **Gmail first, other apps opt-in and experimental.** The judgment engine takes
  plain text and knows nothing about Gmail. Other apps speak the same small
  contract (`core/channel.js`), are off until the person turns them on, and are
  stricter than Gmail until measured: WhatsApp Web (read-only, one-to-one chats,
  `src/content-whatsapp.js`), a right-click "stay on this" on any page
  (`core/capture.js`), and Outlook through Microsoft's own mail API (read-only, last 14
  days, while the panel is open: `src/outlook.js`, needs a Microsoft app registration
  and its client id in `core/outlook-config.js`). See `docs/multi-platform.md`.
- **The passive judgment engine is not a language model, and sends nothing
  anywhere.** `core/judgment.js`'s scorer is a transparent, explainable
  weighting, which is why the popup can show why Glance spoke — this has not
  changed. The whole-message classify fallback is switched off
  (`REMOTE_CLASSIFY = false`); the one external step on recognition is the
  opt-in "second reading" of a single masked sentence (`docs/ai-ladder.md`).
  Draft-It and the attachment X-ray are separate tools that call a routed
  model with masked-only text; see "Local Privacy Shield, and where masked
  text is allowed to go" above for exactly where the line is.
- **PDF attachments aren't previewable yet.** Only `.docx` is read today —
  see "Attachment X-ray" above.
- **Not on the Chrome Web Store.** Store submission needs a completed data-use
  disclosure; until then, Load unpacked.
