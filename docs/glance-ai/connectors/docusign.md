# Connector: DocuSign — the envelope is signed, read back (read-only)

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the DocuSign eSignature API. Not verified live. Not deployed.** The three switches (`config/connectors.public.js`: `docusignReadBack`, `docusignOAuth`, `docusignDemo`) are **off**. Date: 2026-10-20. Queue row 5 (`connectors-queue.md`), claimed in `integrations/QUEUE.md`. Built on the foundation from the Notion run (`token-relay.md`, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 0. Why this connector is different, and what it deliberately does not do

The other connectors **create** an object (a task, an issue) and read it back. DocuSign is where a loop like "get the contract signed" really finishes, and that finish happens **in another person's hands**. So this connector **only reads**. It never creates, sends, corrects, voids or downloads an envelope: a signature request is a message to someone else, and Glance never sends on the person's behalf (the identity block, `CLAUDE.md`). **Sending an envelope for signature (a preview and one click) is NOT built; it needs its own owner decision**, like Mail.Send. Because nothing is written, there is no "Undo of a write"; the person's deliberate **release** (stop watching the loop) is the Undo, and it changes nothing in DocuSign.

## 1. Contract (written before the code)

- **The close it makes real.** The person links **one envelope they already sent** to **one loop** (an envelope id, or a DocuSign link that carries it). Glance reads that envelope. **The loop is closed only when the read returns the same envelope with status `completed`.**
- **The read-back.** `GET {baseUri}/restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}`. `ProofOfClose = {system:"docusign/envelope", externalId: envelopeId, fetchedBack:true, verifiedAt}` (`SYSTEM_DOCUSIGN` in `core/proof-of-close.js`). Here the read **is** the proof: there is no earlier write to confirm.
- **Not a close:** `created`, `sent`, `delivered`, `signed` are **waiting** (no proof). `declined` and `voided` are shown as such and **never close** the loop (a refusal is not a signature; only the person can deliberately release the loop). An unknown status is not closed. An answer that cannot be used (empty, unreadable, no status, another envelope's id) is `verify_failed`: not closed.
- **One envelope per loop.** A loop key is bound to the first envelope linked to it; another envelope for the same loop is refused (`already-linked`) until the person releases the first.
- **Idempotent and re-read.** Checking twice gives the same answer. After a reload, `verify` re-reads: a cached "completed" is **never** trusted without the read, and an envelope that has since left `completed` is not closed.
- **Release (the Undo).** Stops watching the loop; no call is made; DocuSign is unchanged.
- **Never read:** recipients, documents, audit events, the envelope subject or anything beyond status and id (asserted: every call is a GET of exactly one envelope).

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Read one envelope's status | `GET /envelopes/{id}` | `signature` | release (local) | itself | **yes** |
| Find the account and its API host | `GET account(-d).docusign.com/oauth/userinfo` | (the token) | - | - | **yes** (connect only) |
| Send an envelope for signature | `POST /envelopes` | `signature` | void (`PUT status=voided`) | `GET /envelopes/{id}` | **no, by decision (a message to a person)** |
| List envelopes / search by subject | `GET /envelopes?...` | `signature` | - | - | no (reads more than one job needs) |
| Download the signed documents | `GET /envelopes/{id}/documents/...` | `signature` | - | - | no (a later slice, to save the signed copy to Drive/OneDrive, with the person's click) |
| Recipients, audit events, templates, users | various | - | - | - | **no, and asserted unused** |

DocuSign's `signature` scope is broad (it also allows sending); **the narrowing is done in code**: this build can only issue the one GET above, and a test asserts it.

## 3. Auth

OAuth 2.0 authorization code grant. Authorize URL `https://account.docusign.com/oauth/auth?response_type=code&scope=signature&client_id=<integration key>&redirect_uri=…&state=…` (the developer servers use `account-d.docusign.com`); `state` round-trips through `runOAuthFlow`. The code goes to the **token relay** (vendors `docusign` and `docusign-demo`: HTTP Basic client auth with the integration key and secret, form body). The account and its **region-specific API host** are read from `userinfo`: the default account is used, and only an account id that is a UUID and a `base_uri` that is exactly `https://<name>.docusign.net` are accepted (tested). Stored on the device (`docusignAuth`: token, refresh token, account id, base uri, account name, demo flag). A 401 triggers one refresh through the relay; if that fails nothing is closed. Disconnect removes `docusignAuth` and `docusignLedger`. PKCE: not used (unverified whether DocuSign accepts it for this grant).

**Manifest:** the API host varies by account, so the calls need `https://*.docusign.net/*` plus `https://account.docusign.com/*` (the demo needs `https://account-d.docusign.com/*`, `https://demo.docusign.net/*`). **Not added** (this PR changes no permission). Going live needs them: owner «מאשר» + store re-review. A wildcard host is a bigger store-review ask than the other connectors' single hosts: say so in the justification (§11).

## 4. Switches (all default off)

| Switch | With it off |
|---|---|
| `docusignReadBack` | The messages `flow:signature-check` / `flow:signature-release` answer `connector-not-live` and call nothing; nothing is emitted. |
| `docusignOAuth` | `connectDocusignOAuth` refuses and calls nothing. Also needs the relay deployed and `OAUTH_PUBLIC.docusignClientId` set. |
| `docusignDemo` | Production hosts and the production relay vendor. On = the developer (demo) servers and the demo vendor, for the Gate before the vendor's go-live review. |

## 5. Recognition and the plan

- **No new recognition.** The loops this closes are already recognised (an ask to sign, a promise to get a document signed: the "signed copy" class in `docs/resolution-paths.md`). Hebrew/English recognition, precision gates and hard quiets are untouched; no new loop type, so no new intent examples (quality bar §7: **not applicable**; no weights or gates changed).
- **Appears in the steps list / Loops: NOT YET.** DocuSign is **evidence that finishes a resolution step**, not a destination a step writes to. Wiring it means: when a loop is of the signed-copy class and the mail carries a DocuSign link (or the person pastes one), offer "Watch this envelope" (the person's click), call `flow:signature-check` when the loop is opened or on Check now, and let `core/resolution.js` accept the proof as the step's close. Not built (`open-tasks.md` row 77); the message API and tests are ready.
- **Silent when:** not connected, switch off, no envelope linked.

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"docusign"`, `closeType:"signature"`, `destinationSystem:"docusign/envelope"`: `handled` when an envelope is read as completed, `readback_failed` when the read cannot be used, `undone` on release. `offered`, `approved`, `edited`, `ignored` have no emitter yet (they belong to the "Watch this envelope" offer, not built). No envelope id, subject, name or address in an event (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/docusign-close-corpus.cjs` (28) | completed closes with a proof; created/sent/delivered/signed wait; **declined and voided never close**; unknown status; status compared exactly; idempotent; **one envelope per loop**; reload re-read, **a cached completed is not trusted without the read**, left-completed not closed; release makes no call; 401 refresh / refresh fails; 403 (not closed); 404 and the vendor does-not-exist code; rejected; 429 with Retry-After and with only a reset time (and forever); 5xx retried (and forever); timeout; network; **unusable answers** (empty, unreadable, no status, no id, another envelope, non-string status, non-object); envelope input parsing (bare id, links on docusign hosts, everything else refused incl. look-alike hosts and path tricks); **malformed stored auth incl. a non-DocuSign API host never called**; other region hosts; **only a GET of one envelope, ever**; ledger/proof hold no token, subject or recipient; not connected |
| `test/docusign-wiring-corpus.cjs` (26) | switches off call nothing; on: completed closes with a proof, exactly one GET on the right host, waiting does not close, one learning event with no ids, second envelope refused, release, bad input refused before any call, foreign sender refused, Disconnect, declined, unusable answer → readback_failed; OAuth: authorize URL, relay body, account and host resolved, demo hosts and vendor, malformed accounts ignored, forged state, no integration key, relay refusal |
| `token-relay.test.cjs` (+1) | DocuSign Basic + form body, demo vendor and its own secret, secret never returned or echoed |
| `test/consent-catalog-corpus.cjs` (+1) | `docusign` tick = relay sign-in + its two hosts; Select all includes it |

## 8. Security checks (named)

Read-only by construction and asserted (every call is a GET of one envelope; no body); **API host pinned to `https://<name>.docusign.net`** and account id to a UUID before any call; envelope id UUID-checked before it enters a path; only status and id read (no subject, recipients, documents); no token, subject or address in ledger, proof or events; `state` checked before the code leaves; relay is not an open proxy and never returns or logs the secret (including the demo secret); only the one-time code or refresh token leaves the device (through the relay); nothing is sent to a person.

## 9. Vendor facts I could not verify (the docs host `developers.docusign.com` was blocked from the build sandbox)

Authorize/token URLs for production and demo; HTTP Basic client auth with a form body; whether a refresh token is issued for the `signature` scope alone (the `extended` scope may be needed) and its lifetime; PKCE; `userinfo` shape (`accounts[].account_id`, `is_default`, `base_uri`, `account_name`); the `/restapi/v2.1/accounts/{id}/envelopes/{id}` path and the fields `status`, `envelopeId`, `completedDateTime`; the status vocabulary (`created`, `sent`, `delivered`, `signed`, `completed`, `declined`, `voided`); the error codes `USER_AUTHENTICATION_FAILED`, `ENVELOPE_DOES_NOT_EXIST` and their HTTP statuses; rate-limit headers (`X-RateLimit-Reset`, `Retry-After`) and the hourly limit; the go-live review requirements. **The owner Gate must confirm each on the vendor page before go-live.**

## 10. Known limits

- The person has to link the envelope (paste its id or link). Finding it automatically from a DocuSign notification mail is a later slice: it needs the mail's link, which Glance already sees, and the person's click.
- A "completed" envelope is one DocuSign says every recipient has finished; Glance does not check who signed.
- A corrected or voided envelope after completion is re-read as not closed on the next `verify`; the Activity row that already said Handled is not rewritten by this module.
- Polling cadence and rate limits (an hourly limit per account) are the caller's concern; the engine waits and retries a 429 up to three times.
- Saving the signed copy to Drive/OneDrive is a later slice (a write, with a preview and a click).

## 11. OWNER PACK

1. **Console.** `https://developers.docusign.com/` → create a developer (demo) account → Apps and Keys → Add app and integration key. Authentication: **Authorization Code Grant**, with a secret key. Redirect URI: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL). Keep the key in the demo environment until the go-live review passes (step 3), then promote it to production.
2. **Netlify env vars** (relay): `DOCUSIGN_CLIENT_ID` (the integration key; the same value for demo and production), `DOCUSIGN_CLIENT_SECRET` (production), `DOCUSIGN_DEMO_CLIENT_SECRET` (demo). Public: the integration key into `OAUTH_PUBLIC.docusignClientId`.
3. **Vendor review ("Go-Live").** DocuSign requires the integration key to make a number of successful API calls in the demo environment, then a go-live review before it can be promoted to production (verify the current requirements and the call count on their page). **Do the Gate on `docusignDemo: true` first.** Scope justification for `signature`: "to read the status of one envelope the person already sent, so Glance can tell them it was signed. Glance never sends, changes or voids an envelope."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for *.docusign.net and account.docusign.com: lets Glance read the status of one DocuSign envelope the person chose and tell them when it is completed. DocuSign serves each account from a regional host (na1, na2, eu and others), so a wildcard on docusign.net is needed. Requested only when the person ticks DocuSign. Glance never sends or changes an envelope."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect DocuSign, Glance reads the status of the envelope you link to a task, only to tell you when it is completed. Glance never sends, changes or voids an envelope and does not read its documents or recipients. The DocuSign access token stays on your device. When you sign in with DocuSign, the one-time sign-in code and, later, the refresh token pass through our server once, only to be exchanged with DocuSign; we do not store or log them, and we never see your envelopes."
6. **Live Gate script** (owner, a DocuSign **demo** account, switches on with `docusignDemo: true` for the chosen build):
   1. In the demo account send yourself a test envelope (two recipients: you and a second address you control).
   2. Connect DocuSign in the popup. Expect "Connected: <account name>".
   3. Link the envelope (its id or link) to a test loop. Expect "Waiting" while it is `sent`.
   4. Sign as the first recipient: expect still waiting (`signed`/`delivered`). Sign as the second: expect the loop to close with a proof (Handled) within one check.
   5. Send a second test envelope and **decline** it: expect "Declined", never Handled. Send a third and **void** it: expect "Voided", never Handled.
   6. Link a second envelope to the same loop: expect it refused until you release the first. Release: expect no change in DocuSign.
   7. Let the token expire (or revoke it), check again: expect a silent refresh, or "not connected" with no Handled.
   8. Pass = 3–7 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) owner creates the DocuSign developer account, integration key and secrets and sets the env vars; (b) the vendor **go-live review** (the long pole: demo calls, then promotion); (c) owner «מאשר» to deploy the relay; (d) the `*.docusign.net` and `account.docusign.com` hosts + store re-review (wildcard host); (e) privacy/store drafts applied; (f) the unverified vendor facts in §9; (g) the "Watch this envelope" offer and the resolution wiring (row 77); (h) an owner decision before any "send for signature" is considered.
