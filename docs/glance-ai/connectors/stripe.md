# Connector: Stripe — the payment arrived, read back (read-only, never moves money)

**Glance closes open loops. Gmail is where it starts today.** Status: **built and tested against a mock of the Stripe API. Not verified live. Not deployed.** The switches (`config/connectors.public.js`: `stripeReadBack`, `stripeOAuth`) and the recognition switch `STRIPE_PAYMENT` (`core/stripe-pay.js`) are **off**. Date: 2026-11-04. Queue row 10 (`connectors-queue.md`), claimed in `integrations/QUEUE.md` (PR #259). PayPal, named in the queue as the one after Stripe, is **not** built. Built on the foundation from the Notion run (token relay, `core/consent-catalog.js`, `core/connector-outcome.js`); quality bar: `integrations/QUALITY-BAR.md`.

## 1. Contract (written before the code)

- **READ-ONLY AND NEVER MOVES MONEY.** This connector **never creates, finalizes, sends, pays, voids or refunds** an invoice, a payment intent or a charge, and **never creates a payment link or a customer**. Asking someone for money is a message to another person and Glance never sends on the person's behalf. Every request the engine makes is a `GET` of the one linked object (asserted in the tests and the wiring test). The Stripe grant is the Connect scope **`read_only`**, and any other scope is refused at sign-in and never stored.
- **The close it makes real.** The person is waiting on a payment and has linked ONE invoice (`in_…`) or ONE payment (`pi_…`) to the loop. The loop closes (`ok`, `closed`, a proof) **only when Stripe reads that same object back as paid for real**: an invoice with status `paid`, nothing remaining and a positive amount paid; a payment intent with status `succeeded` and a positive amount received, with a readable charge. `ProofOfClose = {system:"stripe/payment", externalId: the invoice or payment id, fetchedBack:true, verifiedAt}` (`SYSTEM_STRIPE_PAYMENT`). The single GET of the object is the read-back.
- **What never closes it.** Draft, open, uncollectible, processing, requires-action and requires-payment-method are **waiting**. `void` and `canceled` are shown as such. A charge that is **refunded, partly refunded, disputed or failed** never closes it (`heldOpen: refunded | disputed | failed`). A payment intent whose charge cannot be read (not expanded, missing) is `verify_failed`: the refund state must be known. A changed or empty answer (another id, another object type, no `livemode`, a string where a number belongs, nothing paid, something remaining, no currency) is `verify_failed`.
- **The expected amount.** The person may give `expect: {amount (minor units), currency}`. A payment of **less**, or in another currency, never closes the loop (`heldOpen: amount-mismatch`). It is kept in the on-device ledger so that a reload checks the same thing.
- **Test mode never closes a live loop** (and a live object never closes a test-mode connection): `mode-mismatch`. The owner's Gate uses test mode on purpose (`stripeAuth.testMode`, set from Stripe's `livemode`).
- **One object per loop.** A loop key is bound to the first object linked to it; another is refused (`another-object-linked`) until the person releases the first. An invoice is never guessed from a name, an amount or "the latest invoice"; the engine only takes an `in_…` / `pi_…` id or a `dashboard.stripe.com` link that carries one.
- **Idempotent.** Nothing is written, so a second check only re-reads. The ledger keeps one record per loop.
- **Release.** The person's deliberate release: the loop is no longer watched. Nothing in Stripe changes.
- **No customer data is kept.** No customer name, email, description or paid amount is returned, stored in the ledger, put in a proof, or put in a learning event.

## 2. Capability matrix (quality bar §1)

| Capability | Endpoint | Minimum scope | Undo | Read-back | Built |
|---|---|---|---|---|---|
| Read one invoice, with its payment's charge | `GET /v1/invoices/{id}?expand[]=payment_intent.latest_charge` | Connect `read_only` | - | the proof | **yes** |
| Read one payment, with its charge | `GET /v1/payment_intents/{id}?expand[]=latest_charge` | Connect `read_only` | - | the proof | **yes** |
| Create / finalize / send / pay / void an invoice; create a charge, refund, customer, payment link or checkout session | `POST …` | write scopes | - | - | **no, and asserted unused** (a non-GET fails the corpus) |
| List invoices, customers, charges, balance, payouts | `GET …` lists | - | - | - | **no** (only the one linked object is read) |

## 3. Auth

**Stripe Connect OAuth (standard accounts), scope `read_only`.** Stripe has a platform client secret (the platform's secret key), so the code exchange and refresh go through the **token relay** (`token-relay.md`, vendor `stripe`: `STRIPE_CLIENT_ID` = the platform's `ca_…` id, `STRIPE_CLIENT_SECRET` = the platform secret key, in a form body). **The platform secret key can do far more than read: it lives only in Netlify env vars, never in the extension, and is withheld from any relay response.** There is no PKCE at Stripe (unverified). `state` round-trips through `runOAuthFlow`. The answer must say `scope: "read_only"` and carry a boolean `livemode`, or nothing is stored; a refresh that is not `read_only` is refused and the old token is kept. Tokens live on the device (`stripeAuth`). **Disconnect** removes `stripeAuth` and `stripeLedger`; Stripe's own deauthorize needs the platform secret, so the person also removes the app in Stripe → Settings → Apps (stated in the privacy draft).

**Manifest:** the calls need `https://api.stripe.com/*`. **Not added** (this PR changes no permission). Going live needs it: owner «מאשר» + store re-review.

## 4. Switches (all default off)

| Switch | With it off |
|---|---|
| `stripeReadBack` | `flow:payment-check` / `flow:payment-release` answer `connector-not-live` and call nothing; nothing is emitted or stored; no writer is registered. |
| `stripeOAuth` | `connectStripeOAuth` refuses and calls nothing. Also needs `OAUTH_PUBLIC.stripeClientId`, the deployed relay and the two env vars. |
| `STRIPE_PAYMENT` (recognition, `core/stripe-pay.js`) | `plan()` answers `off`; nothing is offered. |

## 5. Recognition and the plan

`core/stripe-pay.js` (portable, no network): a message the person **sent** that waits on money owed to them and names **exactly one Stripe id** ("please pay invoice in_…", "payment is due on …", "let me know when it is paid: <dashboard link>", «מחכה לתשלום על …», «תעדכן אותי כשהתשלום עבר») becomes one **watch-only** Do It. The direction (`theirs` = the person sent it) comes from **where the text came from**, passed in by the host, never from its words; text the person **received** asking them to pay is silence (`you-owe`): Glance never pays. Silent, each with a reason: no Stripe id (an invoice is never guessed from a name or an amount), a charge / customer / key id (`not-an-invoice`), two ids, already paid / receipt / refund, negation, hedge, FYI, "ask Dana to pay", no ask, no direction. The plan's steps are `watch` (read that one invoice or payment, read only, proof `stripe/payment`) and a note that Glance never charges, refunds or sends a payment request. Hard quiets and every precision gate are unchanged. **Appears in the steps list / Loops: NOT YET** (the recognizer and message API are ready and tested; the card, and a way for the person to pick or paste the id, are open-tasks row 80).

## 6. Learning hook

`core/connector-outcome.js` events with `connector:"stripe"`, `closeType:"payment"`, `destinationSystem:"stripe/payment"`: `handled`, `readback_failed`, `undone` (release). `offered`, `approved`, `edited`, `ignored` have no emitter yet. **No id, amount, customer or token in an event** (asserted). Off with the switch.

## 7. Tests (against a mock; no real account, key or mail)

| File | Proves |
|---|---|
| `test/stripe-close-corpus.cjs` (21) | success for an invoice and for a payment; **GET-only on the one object, no list, no POST**; waiting states; void / canceled; **refunded, partly refunded, disputed, failed charges never close** (invoice and intent); an **unreadable charge never closes**; expected amount equal / more / less / other currency; bad expectations refused before any call; **test mode vs live mode**; idempotent and reload with the same expectation; refunded or deleted afterwards → not closed; release and **one object per loop**; id and link validation (**a charge, customer, secret key, traversal, another host refused before any call**); not connected, 401 → one refresh → saved, refresh failure; 403, 404; 429 + Retry-After and forever; 5xx, timeout, offline; **12 empty or changed shapes never close**; **injection in descriptions, emails, memos**; no customer, email, description, amount or token in the ledger or proof |
| `test/stripe-wiring-corpus.cjs` (36) | switches off call nothing, store nothing, register nothing; on: waiting, paid closes with a proof, **all calls are GETs of one invoice**, event has no id or amount, ledger has no customer, foreign sender refused, **refunded afterwards is not closed again**, release, Disconnect, bad input and not connected before any call, **test-mode invoice never closes a live connection**, changed shape; OAuth: authorize URL has only `scope=read_only`, relay body exact, token on device only, **a `read_write` grant, a missing scope or a missing `livemode` is refused and not stored**, test-mode grant, relay refusal, forged state, no client id; **refresh** keeps only a `read_only` token |
| `test/stripe-pay-corpus.cjs` (33, recognition) | 8 positive asks (en/he), 16 silent cases with reasons incl. `you-owe`, `already-paid`, `not-an-invoice`, no-id ignored, off by default, plan (watch-only, no charge/refund/send step), Hebrew plan, a received ask has no plan |
| `test/consent-catalog-corpus.cjs` (+1) | `stripe` is `experimental` (in select all); tick = relay sign-in + `https://api.stripe.com/*` only |
| `flow-landing/netlify/functions/token-relay/token-relay.test.cjs` (+1) | `stripe`: client id and platform secret in a form body, refresh, **a response that echoes the secret key is withheld** |

## 8. Security checks (named)

Narrowest grant (Connect `read_only`; any other scope refused and not stored; a non-`read_only` refresh refused) · GET-only, asserted; no write endpoint exists in this file · only the one linked object is read; no listing · ids strictly shaped (`in_…`, `pi_…`), a link must be on `dashboard.stripe.com`; a charge, customer or **secret key** is never accepted as an id · an invoice is never guessed · one object per loop · the refund / dispute state must be readable before anything closes · test mode never closes a live loop · **no customer data, amount or description leaves the engine** (not in a result, ledger, proof or event) · injection in a description, memo or email cannot change a URL or what is written (nothing is written) · **the platform secret key lives only in Netlify env vars and is withheld from any response** · `state` checked before the code leaves · the token stays on the device · nothing private leaves the device.

## 9. Vendor facts I could not verify (no live Stripe account; vendor docs were not fetched)

That a Connect `read_only` token can `GET` invoices and payment intents (and their expanded charges) of the connected account; the OAuth endpoints (`connect.stripe.com/oauth/authorize` and `/oauth/token`), that the token call takes `client_secret` = the platform secret key in a form body, and the answer fields (`access_token`, `refresh_token`, `livemode`, `scope`, `stripe_user_id`); whether Connect access tokens expire and how refresh behaves; that there is no PKCE; the API version `2024-06-20` pinned in the `Stripe-Version` header and the field names used (`status`, `amount_paid`, `amount_remaining`, `amount_received`, `currency`, `livemode`, `payment_intent.latest_charge`, charge `refunded`, `amount_refunded`, `disputed`, `paid`, `status`); nested expansion `payment_intent.latest_charge` on an invoice; that an invoice paid out of band has no payment intent (then the refund check is skipped); the 429 `Retry-After` header; Stripe Connect **platform** requirements (a platform account, an approved Connect application, review for live use by other accounts) and whether a Connect platform is the right shape for a personal tool at all (the alternative is a **restricted API key** the person creates with read-only permissions and pastes, as the Notion token path does). **The owner Gate must confirm each before go-live, and the owner must choose the shape (§12 a).**

## 10. Known limits

- Reads one object. Partial payments of an invoice show as waiting until it is fully paid. A **later** refund or dispute is seen only on the next check (there is no webhook).
- For an invoice paid out of band (marked paid manually), there is no charge to inspect and the refund check is skipped.
- Subscriptions, checkout sessions, payment links, balance transfers and PayPal are not covered.
- The steps-list card and a way for the person to pick or paste the id are not built (row 80). The id must be in the text or supplied by the person.
- Only the money in the person's own Stripe account is read. A bank transfer or cash payment outside Stripe is not seen.

## 11. OWNER PACK

1. **Choose the shape (needs the owner).** Either (A) a **Stripe Connect platform** (this PR's design): Dashboard → Connect → Settings → enable OAuth for standard accounts, copy the platform's `ca_…` client id into `OAUTH_PUBLIC.stripeClientId`; add the redirect URI `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` (and the Chrome Web Store id's URL). Or (B) a **restricted key** the person creates in their own Stripe (Developers → API keys → restricted, read on Invoices and PaymentIntents and Charges only) and pastes: no platform, no relay; a small change to the sign-in step. This PR builds (A).
2. **Netlify env vars (relay):** `STRIPE_CLIENT_ID` (`ca_…`), `STRIPE_CLIENT_SECRET` (the platform secret key). **Treat the secret key as the most sensitive value in the project.** Deploy the relay only with the owner's «מאשר».
3. **Review.** Stripe may review a Connect application before live use by other accounts (verify the current requirements: business details, use case, privacy policy URL). Scope justification: *read_only*: "to read the one invoice or payment the person linked to a request and confirm it was paid; Glance never creates a charge, invoice or refund."
4. **Chrome Web Store permission justification (DRAFT):** "Host permission for api.stripe.com: lets Glance read the one Stripe invoice or payment the person links to a request, to confirm it was paid. Read only. Requested only when the person ticks Stripe."
5. **Privacy-page paragraph (DRAFT, not applied):** "If you connect Stripe, Glance can read the one invoice or payment you link to a request, to see whether it has been paid. It only reads: it never creates a charge, invoice, payment link or refund and never moves money. It counts the request closed only when Stripe shows the payment as received, and keeps no customer name, email or amount from Stripe. Your Stripe access token stays on your device; the one-time sign-in code passes through Glance's sign-in relay, which holds the app secret and keeps nothing. To fully remove access, also remove the app in Stripe → Settings → Apps."
6. **Live Gate script** (owner, own Stripe account in **test mode**, switches on for the chosen build):
   1. Connect Stripe. Expect Stripe's consent to say it can **read** the account and nothing that writes; the extension stores it as test mode.
   2. In test mode create a draft invoice, finalize and send it to a test customer (in Stripe, not through Glance). In the extension console send `flow:payment-check` with `{key, objectId: <in_…>, expect: {amount, currency}}`. Expect `waiting`, not closed.
   3. Pay it with test card 4242…. Check again: expect `closed`, a proof, `externalId` = the invoice id. Check after a reload: still closed.
   4. Refund the payment in Stripe and check: expect not closed (`heldOpen: refunded`).
   5. Create a second invoice for a larger amount than `expect`, pay it partly or a smaller one: expect `amount-mismatch` / waiting.
   6. Link a live-mode invoice (or use a live connection with a test invoice): expect `mode-mismatch`.
   7. Try a `ch_…` id: expect `bad-params`, no request. Release: nothing changes in Stripe.
   8. Disconnect: expect the local token gone; remove the app in Stripe → Settings → Apps.
   9. Pass = 2–8 as written. Anything else: do not turn the switch on for anyone.

## 12. Blockers to going live

(a) **the owner chooses the shape** (Connect platform vs restricted key) and, for a platform, the Stripe Connect application and review; (b) `STRIPE_CLIENT_ID` / `STRIPE_CLIENT_SECRET` in Netlify and `OAUTH_PUBLIC.stripeClientId`; (c) owner «מאשר» to deploy the relay; (d) `api.stripe.com` host in the manifest + store re-review; (e) privacy/store drafts applied; (f) the unverified vendor facts in §9; (g) the steps-list card and the id picker (row 80); (h) the switches turned on (owner «מאשר»).
