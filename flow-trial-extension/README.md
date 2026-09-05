# Flow Trial

The free, lean version of Flow: a Chrome extension that watches Gmail
passively and surfaces one `Do It` chip when it recognizes something worth
logging to a connected system. No prompts, no if-this-then-that rules.

**HubSpot is now a real, working connector** — not a simulation. Once
configured (see below), clicking `Do It` looks up the Gmail sender by email
address in your HubSpot account and logs a real Note on the matching
Contact. If there's no matching contact, it says so rather than creating
one — this build never auto-creates records.

**Judgment is still a stub.** Deciding *whether* an email is worth flagging
runs on a keyword table per work domain (`src/domains.js`), not a model call.
That's the one piece that still needs an Anthropic API key wired into a
Netlify function — see "What Phase 2 replaces" below. The entity match
(which HubSpot contact an email corresponds to) is fully deterministic
today and needs no model at all: it's just the sender's email address.

## Set up the real HubSpot connection

1. Go to [developers.hubspot.com](https://developers.hubspot.com) → create
   a developer account (free) → **Create app**.
2. Under **Auth**, add this exact redirect URL:
   ```
   https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/
   ```
   This is derived from the `key` already pinned in `manifest.json`, so the
   extension's ID — and this redirect URL — stays the same across reloads.
   Don't regenerate the key unless you also update this redirect URL to
   match.
3. Under **Scopes**, add `crm.objects.contacts.read` and
   `crm.objects.contacts.write`.
4. Copy the app's **Client ID** into `src/background.js`
   (`HUBSPOT_CLIENT_ID` constant, top of the file).
5. In the site's Netlify project, set two environment variables:
   `HUBSPOT_CLIENT_ID` (same value as step 4) and `HUBSPOT_CLIENT_SECRET`
   (from the same HubSpot app page). These back the two new functions:
   `netlify/functions/hubspot-oauth-exchange` and
   `netlify/functions/hubspot-oauth-refresh` — the only two places the
   Client Secret is ever used.
6. If you don't have a live HubSpot portal to test against, HubSpot's
   developer accounts include a free **test account** (a full CRM sandbox)
   for exactly this purpose — no paid subscription needed to build and test
   the connector.
7. In the extension popup, click **Connect** next to HubSpot. This opens a
   real HubSpot OAuth consent screen via `chrome.identity.launchWebAuthFlow`.

## Load it locally

1. `chrome://extensions` → enable Developer Mode → **Load unpacked** → select
   this folder. Because the ID is pinned via `manifest.json`'s `key`, it
   will always load as `dnjhplgmnkabbjogfpbhofjedlkehkai`.
2. Open the popup, connect HubSpot (see above), pick a work domain, save.
3. Open Gmail, open an email from a sender who already exists as a HubSpot
   Contact, whose text matches one of the demo triggers in
   `src/domains.js` (e.g. "We're good at $12,000, signing Monday" for the
   sales domain) — the chip should appear above the message.
4. Click it. If the sender's email matches an existing HubSpot Contact, a
   real Note is created on that Contact — check the Contact's timeline in
   HubSpot to confirm.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| Extension shell, manifest, injection into Gmail | Real |
| Onboarding (connector checklist + domain picker), stored via `chrome.storage.local` | Real |
| Activity log (shown/clicked/dismissed) | Real |
| Chip rendering, dismiss, pending/done/warning/error states | Real |
| **HubSpot OAuth connect/disconnect** (`chrome.identity.launchWebAuthFlow` + the two Netlify functions) | **Real**, once `HUBSPOT_CLIENT_ID`/`HUBSPOT_CLIENT_SECRET` are set |
| **HubSpot write** (contact lookup by email + Note creation via the CRM API) | **Real** |
| **Judgment** (`src/judgment.js`) — *should* I flag this email at all | **Stub** — regex table per domain in `src/domains.js`, not a model call |
| Monday / Notion / Salesforce / Pipedrive | Not built yet (`status: 'planned'` in `src/connectors.js`) |

## What Phase 2 replaces, and what it doesn't touch

Wiring in the real judgment model touches exactly one file:

- `src/judgment.js` — `evaluate()` becomes a message to `background.js`,
  which calls a two-stage judgment endpoint (cheap filter, then the model
  call on survivors) instead of running the regex table. **The function
  signature and return shape (`{ label, confidence, domain }` or `null`)
  stay identical**, so neither `content-gmail.js` nor the HubSpot write path
  in `background.js` need to change.

Adding a new connector never touches the content script or the judgment
contract — it's a new entry in `src/connectors.js` plus its own OAuth +
write functions in `background.js`, following the same shape as the HubSpot
ones.

## Known fragility (by design, not an oversight)

Gmail's DOM has no public contract; the selectors in `content-gmail.js`
(`div[role="main"]`, `div[role="listitem"]`, the sender's `[email]`
attribute) are a best-effort reading of the current structure. If Gmail
changes it, the failure mode is "the chip stops appearing" — never a wrong
action, because judgment only ever reads `innerText`, it never simulates a
click inside Gmail.

## Still needed before this can go live (see the spec, §11)

- An Anthropic API key, wired into `background.js` via a Netlify function
  (reusing the existing `netlify/functions/` pattern in the main site repo),
  to replace the keyword-table judgment stub with a real model call
- Chrome Web Store developer account, before submitting for review
- A real HubSpot production portal once you're ready to move past the free
  developer test account
