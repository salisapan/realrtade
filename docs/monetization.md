# Glance — how it earns money

> Written 2026-10-01. Everything marked **built** exists in the repository and
> is tested. Everything marked **owner** needs an account, a key or a decision
> that only the owner can supply. Nothing on the public site claims Pro is
> live until the last switch (`PRO_PUBLIC=1`) is set.

## 1. The honest starting point

Glance has the shape of a good freemium product, but the numbers decide
everything:

| Subscribers | Monthly revenue (at about $12 average) |
|---|---|
| 10 | $120 |
| 85 | $1,000 |
| 420 | $5,000 |

Freemium utilities typically convert 2–5% of *active* free users to paid.
Those are planning assumptions, not measurements of this product. At those
rates $1,000 a month needs roughly 1,700–4,200 active free users. So there are
two separate problems, and only one of them is code:

1. **A paid tier people can buy.** Built (below).
2. **Enough active free users.** That is distribution, and the paid tier does
   not create it. Section 5 lists what moves it.

The fastest cash is not Pro. One Flow deployment (about $80 per user per
month plus a setup fee) for 20 people is $1,600 a month, the same as roughly
130 Pro subscribers. Glance is the volume engine and the lead engine for Flow:
`trial-signup` already emails the owner when 3, 5, 10, 20 or 50 Glance
sign-ups share a company domain. Those emails are warm Flow leads. Answer them
the same day.

## 2. What is sold, and why this boundary

**Free (unchanged):** judging email on the device, the Do It chip, writing to
Google Calendar, Tasks and Gmail drafts, Undo. Nothing is capped.

**Pro:** Draft-It (an AI-drafted reply to the open email) and attachment
summaries.

Why that line:

- **It is the only line that can be enforced.** A limit on a local feature can
  be removed by editing the extension. A feature that calls a paid model
  through our server cannot be unlocked from the client. `glance-assist`
  checks the licence on every call and fails closed.
- **It follows our cost.** Free costs us almost nothing to run. Pro is what
  costs money per use, so it is what the subscription pays for. Before this
  change `glance-assist` was open to anyone who found the URL.
- **It keeps the free promise true.** The free product never sends email text
  anywhere. The automatic "remote classification" fallback that did send masked
  text is now switched off for everyone (`REMOTE_CLASSIFY = false`). Pro's AI
  runs only when the person asks for a draft or a summary, and the policy says
  so.
- **It does not gate the thing that earns trust.** The first closed item is
  free, always.

The risk to say out loud: Gmail's own AI drafts replies for free. Pro's case
is masked-before-sending (names, amounts, dates, emails and phone numbers are
replaced on the device), plus Draft-It living next to the close that was just
made. If Pro does not convert, test $9 before changing the boundary. The
price is read from Stripe, so changing it needs no code change.

> Product-architecture note: `docs/product-architecture.md` §2 describes Pro as
> a small-team plan (shared setup, digest, dashboard). None of that exists. This
> document redefines Pro as the individual AI tier, which is what can be built
> and verified now. Team features remain a later tier (sold through Contact).
> This is a boundary change in that document's sense, so it is recorded in
> `docs/open-tasks.md` as a decision waiting for the owner.

## 3. The offer

| | |
|---|---|
| Price | $14 per month, or $132 per year ($11 per month), per person. Set in Stripe. |
| Default | Yearly is pre-selected on the pricing page. Annual prepay is the cash-flow lever. |
| Trial | 14 days, card required, handled by Stripe (`PRO_TRIAL_DAYS`, 0 turns it off). Card-up-front trials start fewer people and convert far more of them. |
| Founding offer | Optional Stripe coupon (`FOUNDING_COUPON_ID`) with a redemption limit. The page shows "N spots left" straight from Stripe, so the scarcity is real. When the limit is reached the banner disappears. |
| Cancel | Self-serve from the Glance panel ("Manage billing", Stripe's portal). Easy cancellation is what makes the trial feel safe. |
| Refund | Terms promise a refund of the most recent charge within 14 days. **Owner: confirm or change.** |

## 4. What was built

- `create-checkout` — Stripe Checkout session; the pricing page reads prices
  from it, so the number shown is the number charged.
- `stripe-webhook` — signature-verified; creates the licence, emails the key,
  tells the owner about every new subscriber, mirrors renewals, trials turning
  into paid, failed payments and cancellations. Idempotent.
- `verify-license`, `billing-portal` — key check, "send my key again", manage
  billing.
- `glance-assist` — now refuses every action without a live licence.
- Licence keys are derived (HMAC of the subscription id), never stored. The
  database keeps only a hash.
- Extension: the Glance Pro card in the panel (activate key, manage billing,
  one quiet nudge after 5 closes), Draft-It and attachment summaries only for
  licensed accounts, 7-day offline grace, immediate stop when the server says
  the key is no longer valid.
- Pages: Pricing (checkout when live, "Notify me" until then), `/pro-welcome.html`
  (shows the key right after paying), privacy and terms updated.
- Tests: `verify-license/license.test.cjs` (57 checks) and
  `flow-trial-extension/test/pro-corpus.cjs`.

## 5. Owner: the order that gets the first dollar (about an hour)

1. **Stripe.** Create the account. Product "Glance Pro" with two recurring USD
   prices (monthly 14.00, yearly 132.00). Copy the two price IDs. Optional:
   coupon 35% off, duration forever, max redemptions 100.
2. **Customer portal.** Stripe → Settings → Billing → Customer portal: allow
   cancel and payment-method update.
3. **Webhook.** Add endpoint `https://theflow-ai.com/.netlify/functions/stripe-webhook`
   for `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret.
4. **Netlify environment variables:**
   `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`,
   `STRIPE_WEBHOOK_SECRET`, `LICENSE_SECRET` (a long random string; never
   change it afterwards), and the existing `SUPABASE_SERVICE_ROLE_KEY` and
   `RESEND_API_KEY`. Optional: `PRO_TRIAL_DAYS`, `FOUNDING_COUPON_ID`.
   `glance-assist` also needs its model keys (`ANTHROPIC_API_KEY`,
   `XAI_API_KEY`, `GEMINI_API_KEY`).
   **Do not set `PRO_PUBLIC=1` yet.**
5. **Supabase.** Restore the `flow-ai` project (it is paused), then apply
   `supabase/migrations/20261001000000_glance_pro_licenses.sql` (and
   `20260928170000_landing_lead_schema.sql` if it was not applied).
6. **Test with your own key.** `LICENSE_SECRET=... node scripts/issue-comp-license.js you@x.com`
   prints a key and one SQL line to run. Paste the key in the Glance panel.
   Open a real Gmail thread: confirm Draft-It and an attachment summary work.
   These two were switched off earlier because the backend was "not reliably
   configured"; this is the check that matters most.
7. **Test the money path in Stripe test mode** on a Netlify deploy preview with
   `PRO_PUBLIC=1` set only there: card 4242 4242 4242 4242, see the welcome page,
   receive the key email, activate, then cancel in the portal and confirm
   Draft-It stops.
8. **Go live.** Swap to live Stripe keys and set `PRO_PUBLIC=1` on production.
   The pricing page and the panel switch from "Notify me" to "Start free trial"
   by themselves.
9. **Tax.** Decide on Stripe Tax / VAT before the first live charge.
10. Publish the extension on the Chrome Web Store, then set `chromeStoreUrl`
    in `flow-landing/assets/site-config.js`. Developer-mode install is the
    biggest drop-off between "signed up" and "using it", and nobody pays who
    never installs.

## 6. Growth levers, ranked by what they are worth

| Lever | Status |
|---|---|
| Answer every company-domain cluster email the same day (Flow leads) | running; owner action |
| Chrome Web Store listing (removes Developer-mode install) | owner |
| In-product nudge after 5 closes (panel only, once a month, dismissible) | built |
| Founding-member offer for the first N | built, optional |
| Annual pre-selected | built |
| Inbox Scan page (`missed-deadline.html`) and the referral link as free acquisition | built; needs traffic |
| A day-3 and day-10 email after sign-up with one real tip, and the trial offer | not built: needs a consent decision for marketing email |
| Team plan for 2–10 people (shared billing) | not built: sell through Contact until 3 teams ask |

## 7. What not to do

- Do not cap the free tier. Nobody is paying yet, and the free closes are the
  product's proof.
- Do not turn automatic classification back on to "improve free". It breaks the
  one sentence the product page rests on.
- Do not announce Pro anywhere before step 6 passes in real Gmail.
- Do not describe Pro as secure or compliant. It carries the same
  non-sensitive-data boundary as Free.

## 8. What to watch

Weekly, in this order: new company-domain clusters, installs, Do It closes per
active user, Pro trial starts, trial-to-paid rate, cancellations. The funnel
events are `pro_start_clicked`, `pro_activated` (extension, anonymous) and
`pricing_pro_checkout_click`, `pro_checkout_complete` (site, GA4). Revenue
itself is in Stripe.
