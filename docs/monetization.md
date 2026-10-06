# Glance — how it earns money

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

What is sold is the personal depth layer of that: more loops held until they close, the money owed, a stronger second reading, firmer nudges. Not a team plan, not Flow.

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

## 2. What is sold, and why

**The test for any paid feature: does it save the person from a specific cost?**
Writing a calendar event from an email is a convenience, and Gmail's own AI
does it for free. People do not pay $14 a month for a convenience. They pay to
stop losing money and deadlines. The expensive failure in email is not the
incoming message you forgot to log. It is the thing **you asked for that never
came back**: the invoice nobody paid, the contract nobody signed, the answer
that decides a booking. Gmail does nothing about that. Boomerang and Superhuman
charge $15–30 a month for reminders of exactly this kind, which is the price
signal for the category.

The sharpest version of the offer is **protection plus pursuit**: it stops money and replies from disappearing, and it stays on the loop until it is closed. The full model (lifecycle, what does and does not close a loop, the real-Gmail test script) is in `docs/open-loops.md`.

So Glance now does two jobs:

1. **Catches what was decided** (Do It, unchanged and free).
2. **Chases what you are owed** ("Waiting on"). When your own newest message in a
   thread asks for something, one small card offers a reminder on the day to
   chase. If you accept, Glance adds a Google Task due that day. When the person
   replies, Glance completes the Task by itself, so the loop is closed by the
   outcome and not by the click. An invoice you sent is recognised as a payment
   and its amount is kept.

| | Free | Pro |
|---|---|---|
| Do It (Calendar, Tasks, drafts, Undo) | yes, no limit | same |
| Open loops (Waiting on) | **3 at a time** | **as many as you have** |
| Loop closes by itself on a real reply, promise moves the chase day, Reopen | yes | yes |
| Money owed to you, paid this month, and the money per person | hidden | shown |
| Learns what comes around again (monthly invoice, weekly report) | one line only | shown, with a reminder |
| Meeting debrief, expiry reminders, "By person" view, aging | yes (count toward the 3 loops) | yes |
| Nudge drafts | friendly first nudge only (never sent) | friendly, firmer and last (never sent) |
| Draft-It (AI reply) and attachment summaries | no | yes (server-enforced) |
| **Second reading** of one masked sentence Glance could not place (opt-in, `docs/ai-ladder.md`) | yes, **120 a month**, fast model | yes, **1,500 a month**, plus a strong model when the fast one is torn and a wider door for hard sentences (server-counted) |
| Contract, quote, proposal, signed copy: a path to a real delivery, not a "Handled." chip (`docs/true-close.md`) | yes | same |

**Why the limit is 3.** The limit sits on the thing that grows with the value
Glance delivers. Anyone using Waiting on for a week has more than three open
asks, so the limit is met in a real situation: the card says "You are tracking 3
of 3" at the moment a fourth ask needs chasing, which is the strongest reason to
upgrade this product can ever give. The panel also tells a Free user, once a
payment is being chased, that Pro shows the total owed to them.

**The honest enforcement note.** The cap is a local rule. Someone who edits their
own copy of the extension can remove it. That is acceptable for a limit on a
convenience at this stage. What cannot be bypassed is everything that calls a
paid model: Draft-It and attachment summaries are checked by the server on every
call, and the server fails closed. The second reading's allowance is counted
on the server too (a hash of the install id or key, per month; per network
address and everyone-together per day), so editing the extension does not
raise it.

**What the money argument is, and what it is not.** One $1,000 invoice paid a
week earlier, or one signature that does not slip a deadline, is worth many
months of $14. That is the claim to test with users, not a measured result.
Do not put it on the site as a number.

**Free stays private.** Waiting on reads only your own newest message in the
thread, on the device. Nothing is sent to us, with one exception the person
switches on themselves: the "second reading", one masked sentence at a time for
what Glance's own code could not place (`docs/ai-ladder.md`, owner decision
2026-10-04: Free gets it too, with a monthly allowance). The automatic "remote
classification" of whole messages stays off for everyone (`REMOTE_CLASSIFY = false`).

> Product-architecture note: `docs/product-architecture.md` §2 describes Pro as
> a small-team plan. This document redefines Pro as the individual
> follow-through tier, which is what can be built and verified now. Team
> features remain a later tier (sold through Contact). Recorded in
> `docs/open-tasks.md` as a decision waiting for the owner.

> **Verification gap, stated plainly.** Waiting on is tested against a page that
> reproduces Gmail's structural anchors (`test/follow-gmail-harness.cjs`), not
> against live Gmail. Before this is deployed, send yourself a thread with an
> ask, a payment request and a courtesy line, and confirm the card appears only
> for the first two, that Remind me creates the Task, and that a reply closes it.

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
  the key is no longer valid. **Waiting on**: `core/follow-up.js` (what to track,
  when to chase, when a reply settles it, the money view), `src/follow.js` (the
  card), the Open tab list with nudge drafts and the Pro-only total, and the
  3-follow-up Free limit.
- Pages: Pricing (checkout when live, "Notify me" until then), `/pro-welcome.html`
  (shows the key right after paying), privacy and terms updated.
- Tests: `verify-license/license.test.cjs` (57 checks), `test/pro-corpus.cjs`,
  `test/follow-up-corpus.cjs` (what is and is not an ask, dates, money, and what a reply does: ack, promise, paid, close),
  `test/follow-write-corpus.cjs` (storage and the three Google writes) and
  `test/follow-gmail-harness.cjs` (the real content scripts in a Gmail-shaped page).

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
5. **Supabase.** The `flow-ai` project (`zjquktirlrhbqcnkfaok`) is ACTIVE
   (confirmed 2026-10-06). Apply
   `supabase/migrations/20261001000000_glance_pro_licenses.sql` and
   `20261004000000_glance_ai_usage.sql` if not already present (both applied
   2026-10-06). Also confirm `20260928170000_landing_lead_schema.sql`
   (`waitlist.ref_code`, `confirmed_at`, `leads`).
   **Do not Netlify-deploy production until the owner explicitly approves.**
6. **Test with your own key.** `LICENSE_SECRET=... node scripts/issue-comp-license.js you@x.com`
   prints a key and one SQL line to run. Paste the key in the Glance panel.
   Open a real Gmail thread: confirm Draft-It and an attachment summary work.
   These two were switched off earlier because the backend was "not reliably
   configured". Then run the Waiting on check from §2. This step matters most.
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
| The 4th follow-up as the upgrade moment, and the locked money total | built |
| Founding-member offer for the first N | built, optional |
| Annual pre-selected | built |
| Inbox Scan page (`missed-deadline.html`) and the referral link as free acquisition | built; needs traffic |
| A day-3 and day-10 email after sign-up with one real tip, and the trial offer | not built: needs a consent decision for marketing email |
| Team plan for 2–10 people (shared billing) | not built: sell through Contact until 3 teams ask |

## 7. What not to do

- Do not cap the free tier. Nobody is paying yet, and the free closes are the
  product's proof.
- Do not turn whole-message automatic classification (`REMOTE_CLASSIFY`) on to
  "improve free". The only external step is the opt-in second reading of one
  sentence (`docs/ai-ladder.md`); widening it needs its own measurement and a
  privacy-page change in the same commit.
- Do not describe the second reading as live, or give it an accuracy figure,
  before the server switch is on and `scripts/ai-ladder/eval.cjs` has run on
  real answers.
- Do not announce Pro anywhere before step 6 passes in real Gmail.
- Do not describe Pro as secure or compliant. It carries the same
  non-sensitive-data boundary as Free.

## 8. What to watch

Weekly, in this order: new company-domain clusters, installs, Do It closes per
active user, Pro trial starts, trial-to-paid rate, cancellations, and (once the
second reading is on) units used against the daily cap, how many Free people
reached the allowance and how many of them upgraded, and the share of second
readings the person kept. The funnel
events are `pro_start_clicked`, `pro_activated` (extension, anonymous) and
`pricing_pro_checkout_click`, `pro_checkout_complete` (site, GA4). Revenue
itself is in Stripe.
