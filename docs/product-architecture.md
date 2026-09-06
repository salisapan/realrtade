# Product architecture: two separate products, two separate audiences

> Established by the product owner on 2026-09-06. This is a hard constraint,
> not a style preference — never blend these two lines in messaging, pricing
> presentation, or feature planning. If a change would make one product's
> page imply it has the other product's guarantees (security/compliance vs.
> plain cloud SaaS), stop and ask before shipping it.

## The two products

### 1. Flow Trial (Free + Pro)

- **Audience:** individuals and small teams who do **not** handle sensitive
  or regulated data. General business use — sales, ops, customer success,
  recruiting, etc.
- **What it is:** the Chrome extension. Reads the single open Gmail message,
  scores it locally for "moment" signals (price agreed, deadline set, deal
  lost), and offers a one-click `Do It` that writes a record into Notion,
  HubSpot, Salesforce, Slack, or Monday.com. Every write ships with Undo.
- **Deployment:** 100% public cloud SaaS. No isolation, no dedicated
  infrastructure, no on-prem option. The user's own OAuth/token connects
  their own destination system; Flow's own backend (Netlify functions +
  Supabase) never touches the customer's business data — it only handles
  signup/confirmation and OAuth token exchange.
- **Setup:** two questions, no rule builder, no field mapping.
- **Pricing:**
  - **Free** — $0 forever. One connector active, unlimited moments, Undo,
    email support.
  - **Pro** — self-serve, ~$14/user/mo ($11/mo billed annually), for teams
    of 2-10. Adds: multiple connectors active at once, one shared team
    setup/invoice instead of per-person configuration, a weekly digest,
    history/dashboard visibility, more direct sensitivity control, and
    similar scale/visibility features — **never** security or compliance
    claims. Pro is still the same non-sensitive-data audience as Free, just
    more seats and more visibility. (Not yet built — currently a "Notify Me"
    mailto placeholder on pricing.html.)
- **What Trial/Pro must never claim:** SSO, audit log, a security review,
  data isolation, on-prem/dedicated deployment, or anything implying it is
  fit for regulated data. Those are the other product.

### 2. Flow (core product) — for organizations with sensitive data

- **Audience:** law firms, security companies, insurance agencies, and
  similar regulated or high-trust organizations — matches the dedicated
  solution pages already on the site (`solutions/legal.html`,
  `solutions/healthcare.html`, `solutions/financial-services.html`).
- **What it is:** the same underlying engine ("watch, recognize, act,
  always reversible"), implemented and deployed specifically for the
  customer rather than self-installed.
- **Deployment:** either a masked/isolated secure cloud tenant, or
  **Flow-Edge** — a fully local installation on the customer's own
  infrastructure (on-prem or a dedicated server). The customer carries the
  compute; Flow licenses the engine.
- **Includes:** an admin console (org-wide setup, not per-person), SSO, an
  audit log, a security review / DPA, custom connector development for the
  customer's own (often legacy/internal) systems, and a dedicated
  onboarding contact.
- **Pricing:** $80/user/month (annual) + a one-time setup fee. The seat
  price is fixed and published; the setup fee is scoped per deployment
  against: deployment model (masked cloud vs. Flow-Edge), whether new
  connectors must be built, seat count, and compliance requirements. Sold
  by quote (`Request Pricing` → `/contact.html`), not self-serve checkout.
- **Why the setup fee is scoped, not flat:** Trial's whole pitch is "no
  configuration burden" (no rule builder, no field mapping, no trigger
  screen) — a flat, heavy, Clari-style implementation fee would directly
  contradict that promise. The Enterprise setup fee only reflects real,
  scoped work: a new connector, a compliance review, or a Flow-Edge
  deployment — never a blanket charge for "using the product."

## The one rule that falls out of this

**Trial/Pro and Flow (core) must read as two different products on every
page that mentions both** (most notably `pricing.html`). A visitor
evaluating Flow for a law firm should never look at a `$14/mo` Pro price
and conclude that is what they are buying — the two need to be visually and
textually separated, not presented as one continuous pricing ladder.
