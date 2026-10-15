# Glance signup consent

Glance closes open loops. It runs across Microsoft, Google, and Meta.

This is the contract for the website gate at `/glance`. The edge function is not deployed. The page uses a mock until the CTO turns it off. Terms and privacy at `/glance/terms.html` and `/glance/privacy.html` are drafts, version `2026-10-15`, pending legal review.

## Where it lives

| Piece | Path |
|---|---|
| Gate | `flow-landing/glance/index.html` |
| Client | `flow-landing/glance/gate.js` |
| Config | `flow-landing/assets/site-config.js` (`glanceSignupConsentUrl`, `glanceStoreUrl`, `glanceSignupMock`) |
| First-run placeholder | `flow-landing/glance/welcome.html` (reads the cookie; does not link a device) |
| Unsubscribe confirmation | `flow-landing/glance/unsubscribed.html` |
| Marketing confirm copy | `docs/glance/emails/marketing-confirm.md` |

The home page keeps its top Glance section and links that section to `/glance`. It does not contain a signup form. A plain Glance nav link points at `/glance` on the flow-landing pages.

## Request

`POST` `https://zjquktirlrhbqcnkfaok.supabase.co/functions/v1/glance-signup-consent`

The browser sends only this JSON:

| Field | Value |
|---|---|
| `email` | The address the person typed, trimmed |
| `terms_version` | `2026-10-15` |
| `privacy_version` | `2026-10-15` |
| `terms_accepted_at` | ISO time of the submit, set in the browser |
| `marketing_opt_in` | `true` only if the optional box is checked |
| `locale` | `en` or `he` |
| `ua` | `navigator.userAgent`, cut at 400 characters |
| `referrer` | `document.referrer`, cut at 500 characters |
| `source` | Text. Placement is `home`, `nav`, or `glance`. When a `utm_*` query is present, the same value also includes `utm` and those pairs. The home Open Glance link sends `home`. A Glance nav link sends `nav`. A direct visit sends `glance`. |

The client does not send `ts` or `ip`. The server sets `created_at` and `ip_hash`.

`source` is kept. It is a text column on `glance_signups`, stored next to `referrer`.

## Response

`200` with `{ "signup_token": "...", "store_url": "https://..." }`.

The page sets `glance_signup=<token>` (`Max-Age=2592000`, `Path=/`, `SameSite=Lax`, `Secure`), shows the closed line, and then assigns `store_url`. If `store_url` is missing or not `https`, it uses `glanceStoreUrl` from site-config, then `chromeStoreUrl` if that one is an `https` URL. The store URL is not written into the page. `chromeStoreUrl` stays empty so the older zip path is unchanged.

Any other status shows one error line and does not redirect.

## Table `glance_signups`

Inserts go through the edge function only. There is no public read.

| Column | Who sets it |
|---|---|
| `id` | database |
| `email` | client |
| `terms_version` | client |
| `privacy_version` | client |
| `terms_accepted_at` | client |
| `marketing_opt_in` | client |
| `marketing_confirmed_at` | server, only after the person clicks the confirm link in the marketing email |
| `locale` | client |
| `ip_hash` | server |
| `ua` | client |
| `referrer` | client |
| `source` | client. Text: `home`, `nav`, `glance`, and `utm` when a campaign query is present. Stored next to `referrer`. |
| `signup_token` | server, returned to the browser |
| `created_at` | server |

`marketing_opt_in` starts false. Checking the box does not put the person on the list. The confirm click sets `marketing_confirmed_at`. Unsubscribe clears the list and leaves the terms row. Delete-my-data removes the row. Both are endpoints on the same function family, not pages that write with the anon key. Every marketing email carries `{{unsubscribe_url}}`.

## What this does not reuse

`flow-landing/netlify/functions/confirm-signup/confirm-signup.js` is a Netlify function. It checks an HMAC link and patches `waitlist` with `SUPABASE_SERVICE_ROLE_KEY`. It does not write from the browser, and it does not write `glance_signups`. Do not point the Glance marketing confirm at it.

`flow-landing/trial.html` posts `/rest/v1/waitlist` with the anon key, then calls `/.netlify/functions/send-confirmation`. That is a different table and a different consent. Do not reuse that write for this gate.

The Glance edge function owns insert, the marketing confirm (sets `marketing_confirmed_at`), unsubscribe, and delete-my-data.

## Mock

`glanceSignupMock` is `true`. While it is true the page does not call the network. A success payload is `{ signup_token, store_url }` using `glanceStoreUrl`. The address `fail@flow.dev` behaves as HTTP 400, and so does `?fail=1`. `?hold=1` shows the success lines and skips the redirect. `?load=1` stays on the spinner so that state can be screenshotted. The CTO sets `glanceSignupMock` to `false` when the function returns 200.

The cookie stays `Secure`. On `http` the page uses the mock even if the flag is later turned off, and it `console.log`s the token, because a Secure cookie will not stick.
