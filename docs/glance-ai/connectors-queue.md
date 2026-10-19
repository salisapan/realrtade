# Connectors queue (read this first, every run of the connector builder)

Glance closes open loops. Gmail is where it starts today. A connector exists only where a close really finishes and can be read back as proof (`ProofOfClose`, `docs/true-close.md` §7). It is never a connector marketplace. This page is Glance (the personal product). Flow, the enterprise product, is separate.

## OWNER DIRECTIVE 2026-10-13 (binding, overrides any earlier "skip it" in the routine prompt)

The owner (Sali) decided: "do everything possible so that all of them work, with a client secret or whatever is needed; and of course we will submit and get the apps approved."

1. **A connector that needs a client secret is NOT skipped.** It uses the token relay below.
2. **The owner registers every vendor app and passes every vendor review.** The builder never registers or submits on his behalf. It prepares an OWNER PACK per connector so he can finish in minutes.
3. **Approval is given in principle** for the relay design. Privacy-page text and store permission text are still drafted, not edited, in any merge-eligible PR. A change to `manifest.json` hosts or scopes, to `flow-landing/` (the relay function included) or to privacy text keeps the PR a DRAFT: that is the owner's «מאשר».
4. **A row blocked by an owner action** (app registration, vendor review) is built as far as it can go, marked "ready, waiting for owner" below, and the next row is taken the next day.
5. **Nothing is deployed** (the relay included) and no switch is turned on without the owner.
6. **Every connector must also feed Glance's learning.** The owner approved four learning paths on 2026-10-13 («מאשר את כולם»): read `docs/glance-ai/learning-from-use.md` first. Path A (the owner's own use as owner-verified labels), B (training on closing plans that really finished) and C (per-user calibration on the device) are to be built; path D (opt-in federated contribution) is a dormant specification. A connector without its learning hook is not done.

## The queue

| # | Connector | The close it makes real | Auth | State |
|---|---|---|---|---|
| 0 | FOUNDATION: token relay + consent catalogue + learning hook (build once, with row 1) | - | - | **built 2026-10-14, tested against mocks, not deployed, not wired to any screen**: `token-relay/` ([doc](connectors/token-relay.md)), `core/consent-catalog.js` (the owner designs the screen), `core/connector-outcome.js` (events + pure conclusions; the card does not read the conclusions yet). The older exchange functions are not moved onto the relay yet |
| 0b | LEARNING: per-user calibration (path C), then the path D design and its dormant code, one slice per run, after the foundation | - | - | not started |
| 1 | Notion | a task or a page row exists | OAuth2 + secret (relay) | **ready, waiting for owner** (2026-10-14): [doc](connectors/notion.md); built and tested against a mock; DRAFT PR; switches `notionReadBack`, `notionOAuth` off. Waiting: app registration, relay deploy, `api.notion.com` host, unverified vendor facts, steps-list destination wiring |
| 2 | Asana | a task exists | OAuth2 PKCE | **ready, waiting for owner** (2026-10-15): [doc](connectors/asana.md); built and tested against a mock; DRAFT PR #156 (stacked on #138); switches `asanaReadBack`, `asanaOAuth` off. Waiting: app registration, relay deploy, `app.asana.com` host, unverified vendor facts, steps-list destination wiring |
| 3 | Jira | an issue exists | OAuth2 3LO + secret (relay) | **ready, waiting for owner** (2026-10-18): [doc](connectors/jira.md); built and tested against a mock; DRAFT PR #168 (stacked on #156); switches `jiraReadBack`, `jiraOAuth` off. Waiting: Atlassian app registration, relay deploy, `api.atlassian.com` host, unverified vendor facts, steps-list destination wiring |
| 4 | Linear | an issue exists | OAuth2 | **ready, waiting for owner** (2026-10-19): [doc](connectors/linear.md); built and tested against a mock; DRAFT PR #172 (stacked on #168); switches `linearReadBack`, `linearOAuth` off. Waiting: Linear OAuth app registration, relay deploy, `api.linear.app` host, unverified vendor facts (above all the client-supplied issue id), steps-list destination wiring |
| 5 | DocuSign | the envelope is signed | OAuth2 + secret (relay); vendor go-live review | not started |
| 6 | Dropbox | the file is saved | OAuth2 PKCE | not started |
| 7 | Zoom | the meeting link exists | OAuth2 + secret (relay); marketplace review | not started |
| 8 | Microsoft Teams via Graph | the answer arrived in the chat | same Entra app as Outlook, no secret | not started |
| 9 | Slack via its official API | the answer arrived in the DM | OAuth2 + secret (relay); app review for distribution | not started |
| 10 | Stripe (PayPal after it) | the payment arrived | OAuth + secret (relay) | not started |
| 11 | Trello | a card exists | API key + token flow, not OAuth2 | not started |
| 12 | Monday | an item exists | OAuth2 | not started |
| 13 | ClickUp | a task exists | OAuth2 | not started |
| 14 | Box | the file is saved | OAuth2 + secret (relay) | not started |
| 15 | Calendly | the meeting is booked | OAuth2 | not started |
| 16 | Adobe Sign | the agreement is signed | OAuth2 + secret (relay) | not started |
| 17 | Google Meet link | the link is on the event | inside the existing Calendar scope, if possible | not started |
| 18 | HubSpot | the record is updated | decide Glance or Flow with the owner first | blocked on a decision |
| 19 | Salesforce | the record is updated | decide Glance or Flow with the owner first | blocked on a decision |
| 20 | Open banking (Israeli providers) | the money arrived | research only, no build without the owner | not started |

HOLD (owner «מאשר» only): Morning (invoices).

## Learning hook every connector must emit (summary; the full plan is `docs/glance-ai/learning-from-use.md`)

One outcome event per decision, with NO text, address or title: `{connector, closeType, proposed, approved|edited|ignored, handled (fetchedBack), undone, latencyMs, destinationSystem, lang, at}`. It feeds `core/outcome-labels.js`, `core/execution-memory.js`, `core/person-model.js` and `core/learning-ledger.js`. Conclusions to draw, each a pure function with a corpus test: destination preference (offer Asana first if that is where this person approves tasks), close-type trust (undone often = offered less or not at all), timing per tool and person, per-vendor failure memory (a failed read-back is never "Handled"), profile signals for `docs/glance-ai/user-context-v0.md` (relevance only; never the intent floor or the hard quiets). On device, with the model off it still works.

**Acceptance (every connector):** the event is emitted on offer, approve, edit, undo, handled and read-back failure; a corpus proves each conclusion moves the next offer in the expected direction; a test proves the event carries no text, address or title; with the connector off nothing is emitted; nothing leaves the device (levels 2 and 3 of the older plan are now paths D and the dormant aggregate counts in `learning-from-use.md`).

## The token relay (design; build once in run 1, reuse for every connector)

- **Why.** Google and Microsoft run as public clients with PKCE and no secret. Most other vendors need a client secret to exchange the authorization code and to refresh. A secret can never ship in the extension.
- **What.** One serverless function under `flow-landing/netlify/functions/`, in the style of the existing ones. `POST /token-relay` with `{vendor, grant: "code" | "refresh", code_verifier?, code?, redirect_uri, refresh_token?}`. It adds the vendor's client id and secret from ENVIRONMENT VARIABLES (never from the repo; the owner sets them in Netlify), forwards the single token request to that vendor's token endpoint, returns the response and forgets it.
- **Hard rules.** It never stores tokens, never logs request or response bodies, never sees mail, message text or task content, and accepts only a fixed allow-list of vendors and each vendor's own token URL (no open proxy: any other host is rejected). Rate limit per install id. CORS only for the extension's own origin. Tested against a mock vendor: allow-list enforced, secret never echoed, bad vendor rejected, no body logged.
- **Where tokens live.** On the device, exactly like the Google and Microsoft tokens. The only new thing that leaves the device is the one-time code or the refresh token on its way to the vendor through the relay. The privacy-copy draft must say so in one plain sentence.
- **Not deployed** until the owner says «מאשר». Document the env var names in `docs/glance-ai/connectors/token-relay.md`.

## The consent catalogue (design; build once in run 1)

A pure, portable `core/` module (listed in `core/README.md`, no UI). A catalogue of services: id, label, one-line honest description, group (google, microsoft, chat, tasks, files, sign, meetings, payments), the permission steps it needs (OAuth scopes, optional browser host permissions, relay vendor), and its state (built / experimental / coming). One function: from the ids the person ticked, return exactly the permission steps to run and nothing else. "Select all" means every service that is built or experimental, never one marked coming. The owner designs the screen separately. Each connector adds one catalogue entry. Unit-tested. The contribution checkbox of path D belongs here too, off by default.

## The owner pack (one per connector, in `docs/glance-ai/connectors/<name>.md`)

1. The exact vendor developer console URL, the app type to create, the redirect URI to paste, the minimal scopes to tick.
2. The env var names to set in Netlify for the relay.
3. The vendor review the app needs before public use, what the vendor asks for (screenshots, a privacy URL, a demo video, a scope justification), and a ready-to-paste justification text per scope.
4. The Chrome Web Store permission justification and the privacy-page paragraph, as DRAFTS.
5. The live Gate script: what to click, what the vendor shows, what Undo must do.

Verify every vendor fact (scopes, endpoints, review rules) from the vendor's official documentation and cite the page; never from memory.
