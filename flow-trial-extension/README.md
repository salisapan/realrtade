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

**Two real write paths, both undoable.**

| Connector | Auth | What one click does |
|---|---|---|
| **Notion** | Internal integration token you create yourself | Creates a page in a database you choose, filling whichever Amount / Date / Email / URL columns that database happens to have, with the quoted sentence and a link back to the Gmail thread in the body. Undo archives it. |
| **HubSpot** | OAuth (needs the owner to configure an app) | Logs a Note on the Contact matching the sender, with the same fields. Undo deletes it. |

Both paths are additive only: they create one new record and never edit or
delete anything that was already there.

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
src/background.js      credentials and the two write paths, plus undo
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
