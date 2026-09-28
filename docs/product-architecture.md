# Flow — full product specification

> Established by the product owner, 2026-09-06 through 2026-09-06 (this
> session). This is a hard constraint on future copy/pricing/feature work,
> not a style note. If a change would blur the boundary between the two
> products below — most of all, make Flow Trial look like it carries
> Flow's security/compliance guarantees, or make Flow look like a
> self-serve download — stop and ask before shipping it.

## 0a. Current shipping scope (read this before trusting anything below)

> Added after an audit found this document describing a product the code no
> longer matches — and, because this file is the hard constraint, watched
> that error propagate into `trial.html`, `pricing.html` and `terms.html`.
> Where this section and the detail below disagree, **this section wins**;
> the rest describes the intended full shape, not what ships today.

Verified in code (`flow-trial-extension/core/connectors.js`, `flow-trial-extension/popup/popup.js`, `flow-trial-extension/manifest.json`, `flow-trial-extension/src/background.js`) against Glance **0.7.0** on `main`. Ranking and the live-loop map: `docs/glance-value-audit.md`.

| | Described below | Actually ships today |
|---|---|---|
| Connectors reachable in setup | five (Notion, HubSpot, Salesforce, Slack, Monday.com) | **one** — Google. `connectors.js` marks exactly one entry `mvp: true`; `popup.js` renders only `mvp` connectors. Notion is catalog `live` (token) and is not shown. HubSpot, Salesforce, Slack, and Monday.com are `building`. Writer functions for those five remain in `background.js`; the Gmail chip does not call them, and their API hosts are not in `host_permissions`, so those fetches cannot succeed in this build. |
| Where a Do It lands | the one connector the user chose | **Google Calendar (Calendar API), Google Tasks, or a Gmail draft** — the user does not pick among them: `actions.js`'s process model does. One `chrome.identity` grant covers `tasks`, `calendar.events`, `gmail.compose`, and `drive.readonly`. |
| Setup questions | two ("where may it write", "what work do you do") | **one** — sign in with Google. `popup.js` deliberately leaves `domainId` unset; `judgment.js` falls back to the sales vocabulary. |
| Sensitivity | — | not a setup input. It self-adjusts from clicks and dismissals; the popup only displays where it landed. |
| Notion | "works today" | catalog status `live`, auth `token`. Unreachable from onboarding and from the chip. `api.notion.com` is not a host permission. |

Three consequences that bind future work:

1. **`manifest.json`'s `host_permissions` match the reachable set, not the
   code.** Re-enabling any dormant connector in onboarding means restoring
   its API host in the same change, or its writes fail on a permission error.
2. **Any Glance copy naming a destination must name the Google three**, until
   that changes here first. Flow (the enterprise product) keeps its own
   connector and compliance language; do not copy it onto Glance.
3. **Google Calendar on this build is `googleCalendarWrite`**, a POST to
   `https://www.googleapis.com/calendar/v3/calendars/primary/events`, with
   undo via DELETE. A `calendar.google.com/calendar/render?action=TEMPLATE`
   link is not a stand-in for that writer and must not be described as the
   product having no Calendar.

---

## 0. One engine, two products, three offerings

Every offering runs the same underlying idea: **watch a moment, recognize
it, act on it, always reversibly.** What changes across the three
offerings is who it's for, where it runs, and how much configuration
surface it exposes — never the core mechanic.

| | Flow Trial — Free | Flow Trial — Pro | Flow (core) |
|---|---|---|---|
| Audience | Individual, non-sensitive data | Small team (2-10), non-sensitive data | Regulated orgs: legal, security, insurance |
| Deployment | Public cloud SaaS | Public cloud SaaS | Masked cloud tenant, or Flow-Edge on customer infra |
| Installed by | The user, from a Chrome download | The user, from a Chrome download | Implemented by Flow for the customer |
| Setup | 2 questions | 2 questions, once, shared across the team | A scoped project: discovery, security review, deployment |
| Security posture | Local scoring; no security review offered or needed | Same as Free | SSO, audit log, DPA, compliance review |
| Price | $0 | ~$14/user/mo ($11 annual) | $80/user/mo + scoped setup fee |
| Sold via | Self-serve download | Self-serve checkout (not yet built) | Quote request → proposal |

---

## 1. Flow Trial — Free

### 1.1 Who it's for

One person, in a role where email is where decisions get made but the
system of record is somewhere else — a solo salesperson, an ops
generalist, a recruiter, someone doing customer success without a big
team behind them. Crucially: **not** handling data that requires a
security review to touch (health records, legal privilege, regulated
financial data, background-check material). If that describes the
person, they're the audience for offering #3, not this one.

### 1.2 How it technically works, step by step

1. **Install.** A Chrome extension (`flow-trial-extension/`), loaded
   unpacked today (not yet on the Chrome Web Store). A content script
   attaches only to `mail.google.com`.
2. **Read.** The content script reads the single email currently open in
   Gmail's reading pane — not the inbox list, not older messages, not
   attachments. Nothing is read in the background; there is no polling
   loop scanning the mailbox.
3. **Score, locally, in the page.** The open message is scored against a
   set of weighted signals — a currency figure, a commitment verb, a
   dated obligation, a direct request, a stated loss — offset by
   negative signals like an automated sender or mailing-list boilerplate.
   This scoring runs entirely client-side in the browser tab. No email
   text is sent anywhere to make this decision.
4. **Speak, above a threshold.** If the score clears a confidence
   threshold, Flow renders one small `Do It` chip next to the message.
   Below the threshold — most emails, most days — nothing happens. No
   popup, no notification, no badge count.
5. **Adapt, silently.** Every click and every dismissal nudges the
   threshold slightly: clicking makes Flow a little more willing to speak
   up again on similar signals; dismissing makes it more conservative.
   The user never sets a number — the popup's "sensitivity" read-out just
   shows where it has landed.
6. **Act, on click, reversibly.** Clicking `Do It` sends exactly one
   outbound request: to the connected destination (Notion, HubSpot,
   Salesforce, Slack, or Monday.com), using a credential the user
   supplied themselves (their own Notion integration token, or their own
   OAuth login to the others). This is the only network call Flow's
   client code makes to anything other than Flow's own signup/OAuth
   infrastructure. The chip becomes a receipt with **View** and **Undo**;
   Undo removes the record it just created.

### 1.3 The six domain profiles

Setup step two asks "what kind of work do you do" — not to hard-code a
trigger, but to steer which signal words matter most for that reader.
Exact mapping (from `flow-trial-extension` / `trial.html`):

| Domain | What it watches for |
|---|---|
| Sales & business development | a price agreed, a renewal lost, a date set |
| Legal & deal coordination | an agreement executed, a filing deadline, a consideration agreed |
| Finance & billing | an invoice due, a payment confirmed, a discrepancy raised |
| Operations & admin | an approval given, a delivery date, a follow-up promised |
| Customer success & support | a renewal due, a cancellation risk, a refund agreed |
| Recruiting & hiring | an offer made, a start date set, a candidate lost |

### 1.4 The five connectors, and what actually lands

- **Notion** — works today. Connects with a token the user creates
  themselves (~30 seconds, no app review). Flow fills the page title,
  then matches the rest of the fields by column name and type (a number
  column called Amount, a date column called Due, an email column, a URL
  column). Anything it can't map still goes into the page body — nothing
  extracted is silently dropped.
- **HubSpot, Salesforce, Slack, Monday.com** — OAuth-based, each with a
  real, working server-side token exchange (Netlify functions). Writes a
  Note on the matching Contact (HubSpot), a Task via `sobjects/Task`
  (Salesforce), a channel message via `chat.postMessage` (Slack), or an
  item update via `create_update` (Monday.com).

### 1.5 Worked examples

**Example already shown on the product page (Sales domain, Notion):**

> Email: *"Re: Office Lease — Meridian Tower, 14th Floor"* — Dana Cole,
> 9:41 AM: *"We're good at $3,900/mo for the 14th floor, signing Monday."*
>
> Chip: `Do It: Log $3,900 confirmed, Sep 7 · Notion`
>
> What lands in Notion:
> | Field | Value |
> |---|---|
> | Title | Log $3,900 confirmed, Sep 7 |
> | Amount | $3,900 |
> | Date | Sep 7 (2026-09-07) |
> | From | Dana Cole \<dana@meridian.com\> |
> | Quote | "We're good at $3,900/mo for the 14th floor, signing Monday." |
> | Source | link back to the original email in Gmail |

**A second example (Customer success domain, Slack):**

> Email: *"Re: Renewal — Q4 contract"* — a customer ops lead writes:
> *"We've decided not to renew past March; the team's moving to a
> different vendor."*
>
> Chip: `Do It: Log renewal risk, Mar cutoff · Slack #accounts`
>
> What lands in Slack (`#accounts` channel): a message with the account
> name, the stated cutoff date, the quoted sentence, and a link back to
> the thread — so the team sees the risk the moment it was written, not
> at the next pipeline review.

**A third example (Recruiting domain, HubSpot as a stand-in ATS-adjacent
CRM):**

> Email: *"Re: Offer — Senior Backend Engineer"* — a candidate writes:
> *"I'm going to accept, can start June 2nd."*
>
> Chip: `Do It: Log accepted, start Jun 2 · HubSpot`
>
> What lands: a Note on the matching Contact with the start date, the
> quoted acceptance, and the source link — so the hiring pipeline stage
> updates without the recruiter re-typing anything.

### 1.6 Trust and security model (this is what Free actually offers instead of a security review)

- The scoring model never leaves the browser tab.
- The only outbound call from the client is the one the user explicitly
  triggers by clicking `Do It`, to the one destination they connected.
- Flow's own backend (Supabase + Netlify functions) only ever handles:
  waitlist signup, double opt-in email confirmation, and OAuth token
  exchange for the connectors. It never stores or transits the content
  of a user's email.
- Every write is reversible with one click.

This is meaningful, real privacy engineering — but it is **not** a
substitute for the audit trail, access controls, and contractual
guarantees a regulated organization needs. That gap is exactly what
offering #3 exists to close.

### 1.7 What it deliberately is not

- **Not a chatbot** — nothing to ask it, no conversation.
- **Not a rule builder** — no "when X happens, do Y" screen. That absence
  is the product, not a missing feature.
- **Not a notifier** — going quiet for days is the system working
  correctly.
- **Not a mailbox scanner** — it only ever reads the one email open in
  front of you.

---

## 2. Flow Trial — Pro

### 2.1 Who it's for

The exact same audience as Free — general business use, no sensitive
data — just a small team (2-10) that has outgrown "everyone configures
their own popup" and wants shared setup and visibility. **Pro is a scale
and visibility upgrade, not a security upgrade.** It must never carry a
security or compliance claim; those live only in offering #3.

### 2.2 What it adds, in concrete terms

- **Shared connector setup.** A team admin connects Notion/Slack/etc.
  once; every teammate's extension uses that shared configuration
  instead of each person creating their own token. This is the actual
  justification for per-seat pricing — it removes N-times setup
  friction, not just N times the free feature set.
- **Multiple connectors at once.** The same "moment" can write to Notion
  *and* post to Slack in the same click, instead of picking one
  destination at setup.
- **A weekly digest email.** A concrete mock of what it would say:
  > *Subject: Your team's Flow digest — 14 moments, 11 logged*
  > *This week Flow caught 14 moments across your team. 11 were logged
  > (view them), 3 were dismissed. Top contributor: Dana (5 logged).*
  This is what turns a silent background tool into something a manager
  feels is actively working, without opening the popup.
- **A history dashboard**, not just the popup's local log — trend
  visibility over weeks/months, useful for a manager who wants "what did
  we catch this quarter," not just "what happened five minutes ago."
- **More direct sensitivity control** — a visible slider alongside the
  existing auto-adjusting threshold, for a team that wants to
  deliberately dial confidence up or down rather than wait for it to
  drift from clicks/dismissals.
- **Priority support.**

### 2.3 What it still deliberately does not add

No SSO, no audit log, no data isolation guarantee, no compliance review,
no on-prem/Flow-Edge option. A regulated customer asking for Pro should
be redirected to offering #3, not sold Pro with an asterisk.

### 2.4 Status

Not yet built. `pricing.html`'s `Notify Me` button is a real double
opt-in waitlist form (Supabase + `send-confirmation`), not a checkout —
there is no Stripe integration yet, and the specific
feature set above is a proposal, not a committed spec, pending the
product owner's sign-off on which of these ship first.

---

## 3. Flow — for organizations with sensitive data

### 3.1 Who it's for, with concrete scenarios

Regulated or high-trust organizations where the underlying data itself
carries legal, safety, or compliance weight — matching the site's
existing dedicated solution pages (`solutions/legal.html`,
`solutions/healthcare.html`, `solutions/financial-services.html`).
Illustrative personas:

- **A mid-size law firm** doing transactional/M&A work. A partner's
  inbox contains a client email: *"We're prepared to settle at $2.4M,
  contingent on the release language in section 4."* Flow (deployed
  inside the firm's own security boundary) recognizes a settlement
  figure and a contingency, and offers to log it to the firm's matter
  management system with the quoted language preserved for privilege
  review — without that email content ever leaving infrastructure the
  firm controls.
- **A security company** managing investigative case files. An
  investigator's inbox contains: *"Client confirms authorization to
  proceed with the background check, effective immediately."* Flow logs
  the authorization event, with a timestamp and the quoted consent
  language, into the case management system — creating exactly the kind
  of contemporaneous record a compliance audit would ask for.
- **An insurance agency** processing claims correspondence. An adjuster's
  inbox contains: *"We accept the revised estimate of $18,400 for the
  water damage claim."* Flow logs the accepted estimate and claim number
  into the agency's claims system, with the quoted acceptance as the
  audit trail.

In all three cases, the mechanic is identical to Flow Trial's (watch,
score, offer, act, allow undo) — what's different is where it runs and
what surrounds it.

### 3.2 How the deployment is technically different

Flow Trial is a download; Flow (core) is a **project**:

1. **Discovery.** What systems does the customer actually use (often not
   one of the five pre-built connectors — a law firm's matter management
   system, a proprietary claims platform, an internal case tool)?
2. **Security review.** What controls does the environment require —
   data residency, encryption at rest, access logging, a signed DPA?
3. **Deployment model chosen** — either:
   - **Masked secure cloud tenant** — an isolated instance of Flow's
     cloud infrastructure, logically separated from other customers, with
     additional access controls; or
   - **Flow-Edge** — a fully local installation on the customer's own
     infrastructure (on-prem hardware or a dedicated server the customer
     controls). In this mode, the customer's own compute runs the engine;
     Flow licenses the software and never sees the customer's traffic or
     data at all. This is the strongest guarantee available and the one
     regulated customers with the tightest requirements choose.
4. **Custom connector work**, if the target system isn't one of the five
   already built — scoped and quoted as its own line item, not folded
   silently into the seat price.
5. **Rollout** with an admin console (one shared, org-wide configuration
   — not each employee setting up their own popup), SSO for the
   organization's identity provider, and an audit log covering every
   write Flow made across the org (who, what record, when, reversed or
   not) — the artifact a compliance officer would actually ask for.

### 3.3 What "admin console," "SSO," and "audit log" mean here, concretely

- **Admin console** — one place where the firm's IT/compliance owner sets
  which systems Flow may write to and which domain profile applies,
  applied org-wide. Individual employees don't each make this choice.
- **SSO** — employees authenticate into Flow via the firm's existing
  identity provider (Okta, Azure AD, etc.), not a separate Flow login —
  so access is provisioned/deprovisioned the same way as every other
  firm system.
- **Audit log** — a durable, exportable record of every `Do It` action
  taken org-wide: which employee, which email (reference, not full
  content, depending on the agreed data-handling terms), which
  destination record was created, and whether it was later undone.

### 3.4 How the price is actually built (illustrative, not a real quote)

$80/user/month is the fixed, published seat price. The setup fee is
scoped per engagement. An illustrative example for a 40-person firm
needing one custom connector and a compliance review:

| Line item | Basis |
|---|---|
| 40 seats × $80/mo, billed annually | $38,400/yr |
| One custom connector (firm's internal matter system) | scoped separately, e.g. comparable to a typical professional-services integration project |
| Compliance review / DPA | scoped separately, based on the firm's specific regulatory requirements |
| Deployment model | masked cloud tenant assumed unless Flow-Edge is requested, which shifts compute cost to the customer |

The actual numbers in any real quote depend entirely on the discovery
call — this table exists only to show *how* the number is built, not to
publish real figures (that's why `pricing.html` still says "request
pricing," not a fixed setup-fee number).

### 3.5 Why the setup fee is scoped, not flat

Flow Trial's entire pitch is "no configuration burden" — no rule builder,
no field mapping, no trigger screen. A blanket, heavy implementation fee
(the way some revenue-intelligence platforms charge five-figure
onboarding fees justified by weeks of rule configuration) would directly
contradict that promise, and a sophisticated regulated buyer evaluating
both products side by side would notice the inconsistency immediately.
So the Enterprise setup fee only ever reflects genuinely scoped work — a
new connector, a compliance review, a Flow-Edge deployment — never a
charge for "using the product" in the abstract.

### 3.6 Sales motion

Quote request (`Request Pricing` → `/contact.html`) → discovery/scoping
call → written proposal with the assumptions stated → implementation.
Not self-serve, by design — this audience needs a security conversation
before a credit card, not instead of one.

---

## 4. The one rule that falls out of all of this

**Flow Trial (Free/Pro) and Flow (core) must always read as two
different products on any page that mentions both** — most of all
`pricing.html`. A visitor evaluating Flow for a law firm should never
look at a `$14/mo` Pro price and conclude that is what they are buying.
Never let Trial/Pro copy imply security or compliance guarantees it
doesn't have; never let Flow (core) read as "the same download, just
bigger."

---

## 5. Playing Field Definition

> Added by the product owner, 2026-09-18. Version 1.0. This section is the
> strategic frame everything above sits inside: §§0-4 describe *what* the
> three offerings are and how they're priced and deployed; this section
> defines *why* — the specific, narrow game being played, and the hard
> boundaries that keep the product from drifting into a different one. Like
> §4's rule, this is a hard constraint on future feature and copy work, not
> a style note. Its own internal numbering (5.1-5.9) is scoped to this
> section only and does not renumber §§1-4 above, which other documents
> (`CLAUDE.md`) reference directly by number.

### 5.1 The Game We Are Playing

We are not building:
- Another AI email assistant
- Another chatbot
- Another general-purpose agent
- Another legal research tool
- Another productivity dashboard

We are building:

> **The most reliable system in the world at turning human intention into closed execution — silently, precisely, and with almost zero user effort.**

Core principle (non-negotiable):

**"You intend — we execute."**

The user should feel that important things simply get closed, not that they received helpful suggestions.

### 5.2 What "Winning" Looks Like

We win when users experience the following:

- They stop worrying about things falling through the cracks.
- They develop a daily habit of trusting the system to surface and close open loops.
- The system becomes more useful the longer they use it (personal Execution Memory).
- They feel the product is private, precise, and respectful of their attention.
- Clicking "Do It" feels like resolution, not like creating more work.

We lose when:
- The product becomes noisy.
- The product requires management.
- The product makes confident mistakes.
- The product feels like "just another AI helper".

### 5.3 Hard Boundaries (What We Explicitly Reject)

**We will NOT compete on:**
- General intelligence or frontier model performance
- Legal research depth or case law analysis
- Writing quality or long-form generation
- Broad computer-use / full desktop control
- Building a new email client
- Heavy configuration or rule builders
- Chat interfaces as the primary interaction

**We will NOT prioritize:**
- High recall at the expense of precision
- Features that require the user to prompt or manage the system
- Expanding to many platforms before mastering one deeply
- Network effects that compromise privacy

### 5.4 The Core Playing Field (Where We Must Be Best-in-Class)

We must be the clear leader in the following combination:

| Dimension                    | Our Standard                                      | Why It Matters |
|-----------------------------|---------------------------------------------------|----------------|
| **Precision**               | Prefer silence over a wrong action                | Trust is everything |
| **Zero-Prompt UX**          | Silent by default. Appears only when relevant     | Attention is sacred |
| **Process-level execution** | Closes short, meaningful loops — not single tasks | Real value |
| **Local-first judgment**    | Core decisioning happens on-device when possible  | Privacy + speed + trust |
| **Personal Execution Memory** | Learns how *this* user closes things             | Compounding advantage |
| **Reversibility**           | Every action is undoable                          | Reduces fear of automation |
| **Proactive closing**       | Surfaces unclosed intentions (Morning Brief etc.) | Creates habit & stickiness |

This combination is our moat.
No single feature is the moat — the tight integration of all of them is.

### 5.5 Strategic Positioning

**Against big labs (OpenAI, Anthropic, Google):**
They win on general capability and research.
We win on reliable, narrow, high-stakes execution of professional intentions with extreme respect for the user's attention and privacy.

**Against email assistants (Superhuman, Shortwave, alfred_, Lindy, etc.):**
Most of them help the user process email faster or draft better.
We aim to make large parts of the follow-through disappear.

**Against RPA / traditional automation:**
They are brittle and require setup.
We aim for intention-driven, adaptive, low-setup execution.

### 5.6 Product North Star Metrics

We measure success by:

1. **Closure Rate** — % of detected intentions that reach a closed state
2. **Trust Rate** — % of Do It actions that are not undone
3. **Return Habit** — How often users engage with proactive surfaces (Morning Brief etc.)
4. **Silence Quality** — How rarely we show something the user dismisses
5. **Learning Usefulness** — Whether Execution Memory improves future suggestions

Vanity metrics (raw number of actions suggested, model size, number of integrations) are secondary.

### 5.7 Expansion Rules

We expand only when the core is strong:

1. First: Become excellent at closing intentions inside Gmail + Google ecosystem.
2. Then: Add sticky proactive layers (Morning Brief + habit loops).
3. Then: Make Execution Memory visible and valuable.
4. Then: Expand to Outlook (critical for enterprise verticals).
5. Only later: Deeper vertical intelligence or team-level network effects.

Never expand horizontally before the core loop is clearly winning on precision + stickiness.

### 5.8 Decision Filter (Use on Every Feature)

Before building anything, ask:

1. Does this move us closer to "You intend — we execute"?
2. Does it increase the user's feeling that things get closed?
3. Does it protect or improve precision and silence?
4. Does it respect Zero-Prompt principles?
5. Does it create compounding value over time (memory, habit, trust)?

For the detailed, code-grounded version of this same filter — useful when
an answer above is genuinely ambiguous, or a "no" needs explaining rather
than just asserting — see `docs/decision-filter.md`.

If the answer to most of these is "no" — do not build it.

### 5.9 Final Statement

We are not trying to be the smartest AI.
We are trying to be the most trustworthy system at turning intention into reality with almost no friction.

That is a hard, narrow, and valuable game.
If we become the best in the world at this specific game, we have a path to a category-defining company.

Everything else is noise.
