# The token relay (foundation, built once, reused by every connector that needs a client secret)

Status: **built and tested against a mock vendor. Not deployed.** Deploying is the owner's «מאשר» (Netlify is on HOLD).

**Why.** Google and Microsoft run as public clients with PKCE and no secret. Most other vendors need a client secret to exchange the authorization code and to refresh. A secret can never ship in the extension.

**What.** `flow-landing/netlify/functions/token-relay/token-relay.js`. `POST /.netlify/functions/token-relay` with `{vendor, grant: "code"|"refresh", redirect_uri, code?, code_verifier?, refresh_token?, install_id}`. It adds the vendor's client id and secret from **environment variables**, forwards **one** token request to that vendor's own token URL (hard-coded per vendor), returns the answer and forgets it.

**Env vars per vendor** (set by the owner in Netlify; never in the repo): Notion: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`. Shared: `EXTRA_EXTENSION_IDS` (comma list; the Chrome Web Store extension id). A new connector adds one `VENDORS` entry and its two vars.

**Hard rules (each tested in `token-relay.test.cjs`).** Fixed vendor allow-list, request-supplied URLs ignored; the secret is never in a request body to the vendor (Basic auth for Notion), never in a response (a response that echoes it is withheld) and never in a log; no request or response body is logged (only vendor, grant, status); `redirect_uri` must be this extension's `chromiumapp.org` URL; browser origin must be the extension's; rate limit per install id (in memory per warm instance: best effort, the vendor's limits are the hard stop); vendor 429 keeps `Retry-After`; vendor errors pass only a short reason code.

**What leaves the device through it.** The one-time authorization code, or the refresh token, on its way to the vendor. Nothing else: no mail, no task text, no title. The privacy-copy draft must say so in one plain sentence (Notion draft: `notion.md` §9.5).

**Existing exchange functions** (`hubspot-`, `salesforce-`, `slack-`, `monday-oauth-exchange`) are untouched. They can move onto the relay one connector at a time; not done in this run.

**Known limits.** In-memory rate limiting resets on a cold start. No per-vendor token revoke yet. A browserless caller with no Origin header can still reach it, but it can only exchange codes that the owner's registered app issued for the extension's redirect URI.
