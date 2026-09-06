# Flow Trial

The free, lean version of Flow: a Chrome extension that watches Gmail
passively and, when an email actually decides something, puts one `Do It`
button next to it that writes the record for you. No chat, no prompts, no
if-this-then-that rules.

## What actually works today

**Judgment runs on this device.** `src/judgment.js` scores each message from
weighted, named signals — a currency figure, a commitment verb, a dated
obligation, a direct request, a stated loss — against negative ones like an
automated sender or mailing-list boilerplate. It speaks only above a threshold
that moves as you click and dismiss. No email text is sent anywhere to reach
this decision, which is what lets the trial hold the same local-first line as
the full product.

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

## Set up Notion (works immediately, no server, no app review)

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) →
   **New integration** → give it a name → copy the **Internal Integration
   Token**.
2. Open the Notion database you want Flow to write to as a full page, click
   **⋯ › Connections › Connect to**, and pick your integration. Without this
   step Notion returns 404 and the popup will tell you exactly that.
3. Copy that database's URL from the address bar.
4. Paste both into the extension popup and click **Connect Notion**. The
   credential is verified against the real API before it is stored, so a typo
   surfaces immediately rather than at the first click in Gmail.

Any column layout works. Flow fills a `title` property with the action, and
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
   Flow should post to (open the channel in Slack → **View channel
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
6. In the popup, after connecting, paste the **Board ID** Flow should write
   to (open the board — it's the number in the URL after `/boards/`).

Until step 4 is done the popup shows Monday.com as *Needs setup*.

## Load it locally

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open the popup, connect a system, pick the kind of work you do, **Save &
   start**.
4. Open Gmail. Most messages produce nothing — that is the product working.

## Layout

```
manifest.json          MV3, pinned key so the extension ID is stable
src/extract.js         money / date / decisive-sentence extraction (no network)
src/judgment.js        weighted on-device scorer + adaptive threshold
src/domains.js         per-field vocabulary and phrasing — never rules
src/connectors.js      catalog: what each destination is and how it authenticates
src/storage.js         chrome.storage wrapper; log and calibration
src/content-gmail.js   Gmail watcher, the chip, and the receipt after a write
src/background.js      credentials and the five write paths, plus undo
popup/                 the only configuration surface — two questions long
```

## What is still deliberately narrow

- **Gmail only.** The judgment engine takes plain text and knows nothing about
  Gmail; adding a second source surface is a content script, not a rewrite.
- **The scorer is not a language model.** It is a transparent, explainable
  weighting, which is why the popup can show why Flow spoke. A model would
  catch phrasings this misses; it would also need email text to leave the
  device, which is the trade this build declines to make.
- **Not on the Chrome Web Store.** Store submission needs a completed data-use
  disclosure; until then, Load unpacked.
