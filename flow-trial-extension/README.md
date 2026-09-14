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
and date in a message and replaces each with a placeholder token
(`[CLIENT_NAME_1]`, `[COMPANY_A]`, `[LAW_FIRM_B]`, `[OPPOSING_COUNSEL_1]`,
`[CURRENCY_VAL_1]`, `[DATE_1]`) before anything downstream sees it. A green
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
  the placeholder tokens, never the real names/amounts/dates. The
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
src/privacyShield.js   Local Privacy Shield — masks names/companies/money/dates before anything leaves the device
src/sidebar.js         the injected sidebar pane: badge, Draft-It, Next-Step, attachment hover card
src/sidebar.css        sidebar/floating-card styles (CSS logical properties, RTL/LTR safe)
src/docwriter.js       generates a real .docx locally, no library (Feature 4 Path B)
src/docreader.js       reads a .docx locally, no library (Feature 3's attachment text extraction)
src/content-gmail.js   Gmail watcher, the chip, the sidebar wiring, and the receipt after a write
src/background.js      credentials, the five write paths, undo, and the glance-assist relay
popup/                 the only configuration surface — two questions long
netlify/functions/glance-assist/  masked-only backend proxy to a real LLM, for Draft-It + attachment X-ray
```

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
