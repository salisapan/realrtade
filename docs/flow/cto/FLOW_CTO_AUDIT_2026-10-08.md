# Flow CTO audit — 2026-10-08

Repo-only review of **Flow**, the enterprise product. Commit reviewed: `a0e6b6b` on `main`. Live Netlify, Supabase, Stripe, and any system outside this git tree were not inspected. If a tenant, contract, or price exists only in a dashboard or a spreadsheet, it is UNKNOWN here.

**Product definition (the offer).** Flow turns organizational intention into closed execution, with control, governance, and reliability for sensitive environments. Target buyers: organizations that handle sensitive data (CPAs and accountants, law firms, insurance agents and brokers, healthcare clinics and labs, investment houses), roughly 10 to a few hundred employees.

**Implementation status (this commit).** Flow has no application runtime in this repository. The shippable application is Glance, a separate personal product. Glance capabilities are not counted as Flow capabilities. Shared code and shared infrastructure are called out as coupling.

Glance closes open loops. Gmail is where it starts today. That product is out of scope for this roadmap except where the tree forces the two products to share a database, a site, or a library.

---

## 1. CTO diagnosis

Flow cannot be deployed from this repository. There is no Flow service, installer, tenant, admin console, seat ledger, credit ledger, audit log, queue, or customer runtime. A buyer who signs today would receive a conversation and a row in a marketing database.

What the tree actually contains for Flow is a sales surface: static HTML under `flow-landing/`, an enterprise enquiry handler (`flow-landing/netlify/functions/submit-lead/submit-lead.js`), and a `public.leads` table (`supabase/migrations/20260928170000_landing_lead_schema.sql`). `docs/product-architecture.md` §3 describes the intended enterprise shape (masked tenant or Flow-Edge, SSO, audit log, admin console, scoped implementation). That section is a specification. The same file's shipping-scope note (§0a) and `docs/engineering-audit.md` already say the enterprise names are not implemented. Re-checked on this commit: still true.

The only application is Glance (`flow-trial-extension/`). `flow-trial-extension/core/README.md` states that `core/` is a portable brain rehearsed so a future Flow host could load it. That host does not exist. Loading the Chrome extension into a law firm, clinic, or investment house would put sensitive material on a personal browser product whose own pages say it is not for regulated data (`flow-landing/privacy.html`, `flow-landing/pricing.html`).

The internal claim that Flow Edge and a masked cloud are both available today, and that the customer chooses between them, does not survive the tree. There is no Edge package (no container, compose file, Kubernetes manifest, installer, or on-prem process) and no masked-cloud control plane (no org id, no tenant database, no per-org masking service). The public site mostly labels both as roadmap or "closed in the engagement" (`flow-landing/security.html`, `flow-landing/pricing.html`, `flow-landing/solutions/on-prem-ai-regulated-work.html`). `flow-landing/about.html` says Flow "runs in a masked secure cloud today," and `flow-landing/llms.txt` states masking as a present-tense product fact. Those sentences are copy, and they contradict the pages that are more careful. Copy is not a deployment.

Pricing v4.2, as sales states it (per employee with Flow installed, credit pool = 130 × installed employees, minimum 10 staff, example ILS 2,500/month for 20 staff), does not appear in code, migrations, or the published price. The price in the repo is $80/user/month, billed annually, plus a scoped setup fee (`docs/product-architecture.md` §3.4, `flow-landing/pricing.html`). Metering that does exist is Glance's personal "second reading" allowance: 120 units/month on Free, 1,500 on Pro (`flow-trial-extension/core/ai-ladder.js`), counted per hashed person in `public.ai_usage` (`supabase/migrations/20261004000000_glance_ai_usage.sql`). Stripe checkout hardcodes quantity `1` for an individual Pro licence (`flow-landing/netlify/functions/create-checkout/create-checkout.js`). That is not an org credit pool.

"Implementation + retainer" matches the written sales motion (quote, discovery, proposal, implementation: `docs/product-architecture.md` §3.6) and the contact form. It does not match a billing or delivery system. There is no retainer SKU, no project record, no installed-seat counter, and no invoice path for Flow. Ongoing money in the spec is a seat subscription, not a services retainer.

First revenue should buy one boring deployment: one customer, one data plane that is not the Glance database, one system of record, a named human on every write, an append-only record of what was proposed and what actually happened, a deletion procedure, and an operator who can see a failed write. A platform, a second deployment model, and a credit economy wait until that one path has closed real work without inventing a completion.

---

## 2. Current technical reality vs enterprise promise

Status key: **BUILT** = code exists and is wired for Flow. **PARTIAL** = Flow code exists and is incomplete, untested, or demo-only. **DESCRIBED ONLY** = docs or marketing, no Flow code. **UNKNOWN** = cannot be determined from this repo.

Glance files in the evidence column are coupling or contrast. They are not Flow capabilities.

| Capability | Promised / described | Actual status | Evidence paths | Gap |
|---|---|---|---|---|
| Flow application runtime (org execution) | Org product that watches work, proposes updates, writes on approval | DESCRIBED ONLY | `docs/product-architecture.md` §3; `flow-landing/llms.txt`; `flow-landing/index.html` (`#organization`) | No Flow server, worker, desktop agent, or org client. Homepage "legal demo" is a scripted 6-step modal in `flow-landing/index.html`, not a runtime. |
| Flow-Edge (customer servers) | Fully local install; customer compute; Flow never sees traffic. Sales: available today | DESCRIBED ONLY | `docs/product-architecture.md` §3.2; `flow-landing/security.html` §1; `flow-landing/pricing.html`; `flow-landing/solutions/on-prem-ai-regulated-work.html`; `flow-landing/hybrid-automation-playbook.md` | No Dockerfile, compose, Kubernetes, Helm, Terraform, installer, or Edge process anywhere in the tree. Public pages that are careful call it roadmap, not a live toggle. |
| Masked cloud tenant | Isolated Flow cloud; fields masked before processing. Sales: available today, customer chooses | DESCRIBED ONLY | Same security and pricing pages; `flow-landing/about.html` (claims "today"); `flow-landing/privacy.html` | No tenant provisioner, no org boundary, no Flow masking service. `about.html` and `llms.txt` overclaim relative to `security.html`. |
| Customer chooses Edge vs masked cloud | A real deployment choice | DESCRIBED ONLY | `flow-landing/contact.html` (select values `masked-cloud`, `flow-edge`, `not-sure`); `supabase/migrations/20260928170000_landing_lead_schema.sql` (`leads_deployment_check`) | The choice is a form field stored on a lead row. It does not select infrastructure. |
| Per-employee licence / installed-seat count | Price per employee with Flow installed; min org 10 | DESCRIBED ONLY | `flow-landing/pricing.html` ("how many people have Flow working alongside them"); lead `seats` enum includes `1-10` | No seat table, no heartbeat, no "installed" bit, no minimum-10 check. The form accepts `1-10`. |
| Credit pool 130 × installed employees | Pricing v4.2 | DESCRIBED ONLY (sales). Absent from the repo | Search of docs, SQL, and functions finds no 130× pool and no ILS 2,500 figure | Nothing to bill, enforce, or explain to a customer. |
| ILS 2,500 / month for 20 staff | Pricing v4.2 example | DESCRIBED ONLY (sales). Absent from the repo | Published figure is `$80` / user / month in `flow-landing/pricing.html` and `docs/product-architecture.md` §3.4 | Two prices. Only the dollar seat price is in git, and it is not metered. |
| Implementation engagement | Discovery, security review, scoped connectors, rollout | PARTIAL | `docs/product-architecture.md` §3.2, §3.6; `submit-lead.js`; `public.leads` | The intake path is built. There is no project record, SOW object, task system, or deployment checklist in code. |
| Retainer (ongoing services contract) | Business model is implementation + retainer | DESCRIBED ONLY | §3.4–§3.6 describe a seat subscription plus a one-time setup fee | No retainer product, hours ledger, or recurring services invoice. Stripe in this repo sells Glance Pro only. |
| Glance Pro / individual billing | Not a Flow claim; included because it is the only money path | BUILT for Glance, absent for Flow | `create-checkout.js` (quantity `1`); `stripe-webhook.js` (`plan: 'pro'`); `supabase/migrations/20261001000000_glance_pro_licenses.sql` (`plan in ('pro')`); `flow-trial-extension/core/entitlements.js` | A leaked reading of "we have billing" is a personal licence, keyed `GLNC-…`, one seat. |
| Personal model allowance | Easy to confuse with the 130× pool | BUILT for Glance, absent for Flow | `core/ai-ladder.js` (`free: 120`, `pro: 1500`); `glance_ai_charge` in `20261004000000_glance_ai_usage.sql`; migration header says NOT APPLIED until the owner restores the paused project | Per hashed person and per IP, not per org. Not an enterprise credit pool. |
| Org admin console | One place sets destinations and domain for the org | DESCRIBED ONLY | `docs/product-architecture.md` §3.3; `flow-landing/pricing.html` | No admin UI, no org policy object. Glance setup is per browser (`flow-trial-extension/popup/`). |
| SSO / SAML / OIDC | Employees use the firm's IdP | DESCRIBED ONLY | §3.3; `pricing.html` ("on the roadmap… not live today"); solutions pages repeat the roadmap label | No SAML, OIDC, WorkOS, Auth0, or session code for an org. |
| Roles and least privilege | Compliance owner vs employee vs operator | DESCRIBED ONLY | §3.3 | No role table. Database roles in migrations are Postgres `anon` / `authenticated` / `service_role` for the marketing project, not firm roles. |
| Immutable audit log | Who approved, what was proposed, what executed, whether undone | DESCRIBED ONLY | `flow-landing/security.html` §4; solution pages; §3.3 | `supabase/README.md` and the lead migration state these tables are not an audit log. No append-only action table. |
| Human approval before a sensitive write | High-risk actions wait for a person | DESCRIBED ONLY for Flow. The behavior exists only inside Glance | `security.html` §5; Glance click-to-act in `flow-trial-extension/src/background.js` and `core/actions.js` | There is no Flow action to approve. Glance's click is a personal gesture, not an org approval record. |
| True close (preparation is not completion) | A loop closes on real completion or a controlled release | Principle in Glance docs; not a Flow system | `docs/true-close.md`; `flow-trial-extension/core/follow-up.js`; `core/resolution.js` | No org case, matter, or claim object with a close state. |
| Data masking before a model sees content | Structure-preserving placeholders; mapping stays with the customer | DESCRIBED ONLY for Flow. Regex masking is built for Glance | `core/privacyShield.js`, `core/mask-ids.js`, `core/exec-router.js`; known miss cases documented in `docs/hybrid-execution-architecture.md` §0c | Device-side patterns for a personal extension. Not a tenant masking service. Documented gaps: a bare first name and an unlabelled number can pass. |
| Zero-retention processing | Content not kept for training and not kept past the task | DESCRIBED ONLY | `security.html` §3; blog essays under `flow-landing/blog/` | No Flow processor to retain or not retain. Lead `message` is stored up to 4,000 characters (`leads_message_len`). |
| Deterministic execution runtime | Strict runtime, not free-form model output | DESCRIBED ONLY | `security.html` §6 | No workflow engine, state machine, or job runner for Flow. |
| Connectors for the org (Google, Notion "live"; others scoped) | `pricing.html` says Google and Notion are live today, in the Flow setup section | DESCRIBED ONLY as Flow. PARTIAL inside Glance | `core/connectors.js`: Google `mvp: true`, `status: 'live'`; Notion `status: 'live'` but not `mvp`; HubSpot, Salesforce, Slack, Monday `status: 'building'`; Pipedrive `planned`. Writes live in `src/background.js`. `manifest.json` host permissions match the reachable set | Those writers are the personal extension. They are not an org integration with an approval record. Pricing copy attributes Glance liveness to Flow. |
| Custom connector framework | Scoped per engagement | DESCRIBED ONLY | §3.2, §3.5 | Adding a destination means editing Glance's catalog and `background.js`. There is no customer-specific adapter boundary for Flow. |
| Multi-tenant isolation | "Isolated instance… logically separated" | DESCRIBED ONLY | §3.2 | No `org_id` / `tenant_id` on product tables. |
| Single-tenant isolation | One customer per deployment | DESCRIBED ONLY | §3.2 Flow-Edge paragraph | No single-tenant artifact either. The marketing database is one shared project. |
| Row-level security as tenant control | Implied by "isolated tenant" | PARTIAL, and it is not tenant RLS | `20260705000000_create_waitlist.sql` (anon INSERT); `20260928170000_landing_lead_schema.sql` (leads: RLS on, privileges revoked from `anon` and `authenticated`, granted to `service_role`); `20261001000000_glance_pro_licenses.sql`; `20261004000000_glance_ai_usage.sql` | RLS here means "the browser cannot read the table." The service role bypasses it. Policies are not per organization. |
| Identity of the signed-in employee | SSO user on each action | DESCRIBED ONLY | §3.3 | Glance Google sign-in is `chrome.identity` for one browser (`core/connectors.js` auth `google`). Outlook is a personal Graph session (`core/graph-mail.js`, `core/outlook-auth.js`). |
| Secrets handling | Customer and vendor secrets stay out of git and out of logs | PARTIAL for the marketing functions | `.env.example` (names only); `submit-lead.js` `scrub()` redacts two env values from logs; `.gitignore` | No vault, no rotation, no per-customer secret store. Functions hardcode the Supabase URL. See §5 for what is and is not in git. |
| Retention and deletion | Contractual deletion, including backups | DESCRIBED ONLY for Flow | `security.html` §3 | No delete-my-org API. `ai_usage` has a commented manual delete for old day rows. `leads` and `waitlist` have no retention job. |
| Failure handling, retries, idempotency | A regulated write must be retryable without double execution | DESCRIBED ONLY for Flow | Glance: one 401 retry on token fetch in `src/background.js`; `UNDOERS` map in the same file; Stripe webhook returns 500 so Stripe retries (`stripe-webhook.js`) | No idempotency key on external side effects for an org workflow. Lead insert has no dedupe. In-memory rate limit in `submit-lead.js` is per container and resets when the container dies. |
| Job / queue / worker | Durable execution | DESCRIBED ONLY | `security.html` §6 | No queue library, no worker process, no cron for Flow execution. Netlify functions are request/response. |
| Observability of execution | Reconstruct a decision | DESCRIBED ONLY | `security.html` §4; blog posts | Marketing analytics is GA4 on the site (`flow-landing/_headers` connect-src, gtag in pages). `track-event.js` states closure metrics stay on the device. No trace store for org actions. |
| Environment separation (pilot vs prod) | A pilot cannot write prod, and prod data is not the marketing DB | UNKNOWN as operated; absent in repo | `flow-landing/netlify.toml` has no context split; functions hardcode `https://zjquktirlrhbqcnkfaok.supabase.co` | A deploy preview that has the same env vars hits the same database as production. No pilot flag. |
| Website transport hardening | HTTPS, HSTS, CSP, frame denial | BUILT for the marketing site | `flow-landing/_headers`; `flow-landing/.well-known/security.txt` | This hardens `theflow-ai.com`. It is not a control on customer data processing. CSP allows `'unsafe-inline'` scripts. |
| Enterprise lead intake | Quote request becomes a stored, notified enquiry | BUILT | `contact.html`; `submit-lead.js`; `submit-lead.test.cjs`; `public.leads` | Works as a form. If the database write fails, the handler still emails the full submission and tells the visitor success (`submit-lead.js` header comment). That email is a second, unstructured copy of the lead. |
| Compliance certifications (HIPAA, SOC 2, GDPR, 21 CFR Part 11, NERC CIP, CJIS, FedRAMP) | Architecture "designed to support" them; status given in writing on request | DESCRIBED ONLY | `security.html` §9 | No control matrix, no audit report, no BAA template, no evidence binder in the repo. |
| Action Graph, Malpractice Shield | Named on solutions pages | DESCRIBED ONLY | Solutions pages ("roadmap, not live"); `action-graph-video/` is a Remotion promo, not a product | Video package is not an institutional-memory system. |
| On-device / loopback model | Sometimes implied by "local" | BUILT for Glance, off or propose-only; not Flow-Edge | `config/hybrid.public.js` (`enabled: false`); `core/local-lm-server.js` (loopback only; proposes, never closes or writes); `docs/hybrid-execution-architecture.md` | A person's Ollama is not a customer-server product. Hybrid execute has no feature caller. |
| Dormant cross-user learning | Must not be turned on for firms | BUILT and dormant for Glance | `docs/community-learning.md`; `core/community.js`; `netlify/functions/community-learn/` | Out of scope for Flow. Leaving it in the same deployable site is a coupling risk if an env flag is ever set. |

### Where execution would have to happen, and what the tree actually does

There is no Flow execution path. Glance execution, which must not be resold as Flow, works like this: a content script reads the open Gmail message (Outlook is a separate opt-in path), pure modules in `core/` classify and plan, and `src/background.js` writes only after a click, to Google Tasks, Calendar, a Gmail draft, or a Drive file the extension creates. The click is the approval. Undo deletes or archives that object when the connector supports it. A model, when used, is a proposal. `core/local-lm.js` and the hybrid router say the model does not close or write by itself. That discipline is the right product rule. It is implemented for one person in a browser, not for an organization.

### Trust zones that exist today

1. **Browser profile (Glance).** Message text, tokens, and local metrics live in extension storage on one machine. This zone is the person's, not the firm's.
2. **Marketing site and functions (`theflow-ai.com`, Netlify).** Serves HTML, exchanges OAuth for dormant connectors, checks Glance licences, and can call model providers for Glance when switches and keys exist. Enterprise lead bodies are stored and emailed from here.
3. **One Supabase project, `zjquktirlrhbqcnkfaok`.** Waitlist emails, enterprise leads, Glance licence hashes, and Glance usage counters share it (`supabase/config.toml`, `supabase/README.md`). A second project id, `nlvljclvoguvrnntwufu`, is RealTrade and is explicitly out of bounds.
4. **Model providers.** Used by Glance assist (`flow-landing/netlify/functions/glance-assist/`), not by a Flow tenant. Whether a provider retains anything is UNKNOWN from this repo for any future Flow call, because no Flow call exists.
5. **Owner inbox.** `submit-lead.js` sends the enquiry to a personal Gmail address hardcoded in that file. Prospect text, including anything a buyer pastes into the message box, leaves the database for a consumer mailbox.

There is no sixth zone called "the customer's network" or "the Flow tenant."

### What breaks at 10, 100, and 1,000 org users

**10.** The blocker is product existence, not capacity. Ten employees cannot be enrolled, deprovisioned, or given one policy. Installing Glance ten times creates ten unrelated browsers. Seat price cannot be checked against installs. A single shared matter would have no source of truth. The lead form's `1-10` band shows the sales form was not built around a minimum of 10.

**100.** Still no SSO, so joiners and leavers are a spreadsheet. Still no audit export for a client or a regulator. Glance's Chrome storage and per-browser Google tokens do not fan out to a department. The Glance allowance (120 or 1,500) is the wrong unit and the wrong database. Netlify functions can accept the contact form at this size; they cannot be the execution engine. In-memory rate limits do not coordinate across instances.

**1,000.** There is no queue, no backpressure, no per-tenant encryption key, no shard, and no operator console. The first failure is governance (who approved the write, and can we delete them), which already fails at 10. Throughput is the second failure, and it is irrelevant until the first is fixed. Putting 1,000 users of sensitive mail into `zjquktirlrhbqcnkfaok` next to consumer waitlist rows would be an incident by design.

---

## 3. P0 engineering plan for first deployable Flow

Goal of the first paid deployment: one design-partner organization, one named system of record, loops that close only when that system shows the completed fact, and an operator who can explain every write. Optimize for a small team that also has to keep Glance from absorbing Flow's promises.

### Must-have before the first paid deployment

1. **A written deployment contract that names one placement.** Either a single VM or network the customer controls, or one isolated cloud environment operated for that customer. Not both in the same contract. Not "available today" language. The repo cannot support a choice until one path has shipped once.
2. **A data plane that is not Glance's.** New database, new keys, new host. No firm messages, files, or action records in `zjquktirlrhbqcnkfaok`. No reuse of `submit-lead` storage for matter content. Lead intake may stay on the marketing site; execution data may not.
3. **Named humans and revocation.** For the first firm, OIDC against the IdP they already run (Google Workspace or Microsoft Entra), with an allowlist. Store the stable subject id. Revocation is a group removal that Flow honors on the next request. A home-grown password directory is the wrong build. SAML can wait for the buyer that cannot do OIDC.
4. **Two roles only.** Operator (configure the one connector, export audit, run deletion) and member (see proposals for their work, approve or reject). No RBAC matrix.
5. **An approval gate on every external write.** The system may prepare a task, a draft, or a file. It may not send mail, move money, file a claim, or write the system of record until a member approves that specific proposal. Record the approver's subject id, the proposal id, and the time.
6. **Append-only audit, content-light by default.** Fields: proposal id, actor, action type, target system, target id, outcome (`prepared`, `approved`, `executed`, `failed`, `released`, `undone`), idempotency key, error class. Store a hash of the payload. Store raw text only when the contract says so, in the customer's placement, with a retention clock.
7. **Idempotent writes.** Every side effect carries an idempotency key the connector stores. Retries replay the same key. A second success returns the first target id. There is no silent retry of a send, because Flow does not send.
8. **Explicit failure.** A failed write stays open, shows the error class to the member, and pages the operator. It never becomes "Handled." Dead-letter the attempt after a small, fixed retry budget (timeouts and 429s only). Do not retry 4xx authorization or validation errors.
9. **Deletion and export.** One procedure: delete or export a person's proposals and audit payload (not the hash chain's existence), and one procedure for the whole org offboarding. Document backup lag in the contract. Until this procedure has been rehearsed on the pilot, do not call the deployment production.
10. **Secrets.** Runtime secrets only in the host's secret store. Nothing in git, nothing in the marketing site's Netlify env, nothing in the lead notification email. Customer connector credentials live in the customer's placement. Log scrubbing is mandatory and tested with a fake secret, the way `submit-lead.js` already scrubs two keys for the marketing function.
11. **Operator visibility without matter text.** Health of the worker, count of open proposals, failed writes by error class, last successful close. Alerts on a stuck approval and on a connector auth failure. No product analytics that copies client content to GA4.
12. **Pilot and production are different placements.** Separate database, separate keys, separate connector app registration. A preview deploy of the marketing site must be unable to reach the pilot database.
13. **One close definition, written down before code.** Example: "the task in the customer's system of record exists with the agreed fields" or "the person marked the loop released." A prepared draft is not that definition. Copy the rule from `docs/true-close.md` into the Flow host; do not import Glance's Gmail UI and call it the same thing.
14. **Sales language freeze.** Until items 1–13 are true for the pilot, the live sentences in `about.html` and `llms.txt` that say masked cloud runs today are unsafe to leave in market. This audit does not edit them; engineering should not ship a customer while those sentences are the public story. Owner action, not a silent copy change in a product PR.

### Can follow after the first paying deployment

- Second connector. Only after the first has a month of real closes and a written failure log.
- SAML, SCIM, and more than two roles. Trigger: a signed buyer's IdP cannot do OIDC or cannot revoke via group membership.
- Immutable audit export to the customer's SIEM. The table already exists; the sink can wait.
- Seat counting against the contract. A nightly count of distinct subjects who approved or were provisioned. Needed before the second invoice, not before the first close.
- Credit metering. Build it only when a Flow action spends a metered resource. Do not invent a 130× pool in advance.
- A second deployment placement (the one the first customer did not choose).
- Self-serve org admin beyond the two roles.
- Any reuse of selected `core/` modules inside the Flow host. Allowed only after a separate review that the module's tests cover the firm's language and that the host, not the Chrome extension, is the process. `core/README.md` describes that possibility. It is not permission to ship the extension.

---

## 4. Architecture principles for Flow

These are constraints on the host that does not exist yet. They are not a claim that the host is underway.

1. **One org, one execution path.** A loop has one source of truth in the customer's system of record. Flow stores the proposal and the audit. It does not become a second CRM, DMS, EHR, or portfolio system.
2. **Preparation is not completion.** A draft, a filled form, a summary, or a queued task is a proposal. State `prepared` is not state `closed`.
3. **True close is real completion or a controlled release.** Closed means the system of record shows the completed fact, or a named person released the loop and the audit says so. Silence is the correct output when the close cannot be shown.
4. **Multi-step work degrades safely.** If step two cannot be verified (the payment, the signature, the attachment), the loop stays open on the failed precondition. It does not skip ahead and it does not mark itself done. Glance's resolution classes in `core/resolution.js` are a personal-product design; Flow re-specifies the steps per engagement rather than inheriting Gmail behavior.
5. **Idempotency is part of the write API.** Connectors are at-least-once. The key makes them effectively once.
6. **Retries are narrow.** Retry transport failures and explicit rate limits. Do not retry a write whose outcome is unknown without consulting the idempotency key. Do not retry a human rejection.
7. **Sensitive actions require a recorded human approval.** "Sensitive" includes any create or update in the system of record, any file placed where a client could see it, and any message prepared for sending. Sending stays outside Flow until a later product decision. The default is: Flow never sends.
8. **No silent side effects.** A timer, a model, or a retry must not write, delete, or notify a client. Models return proposals in a fixed schema. A proposal that fails validation is dropped and the loop stays open.
9. **Local judgment first, model last.** If a model is in the deployment at all, it runs only on text the contract allows, after deterministic rules have declined, and it cannot close. Masking is a mitigation inside a placement, not a reason to send raw matter to a shared multi-tenant API.
10. **The marketing site is not the control plane.** `theflow-ai.com` collects leads. It does not hold connector tokens for a firm and it does not execute closes.
11. **Glance `core/` is a library candidate, not the product.** Sharing a pure function is allowed only behind a Flow host that supplies storage, identity, and audit. Sharing a Chrome extension, a Netlify function, or the Glance database is a boundary break.
12. **Operate what you sell.** If the small team cannot deploy, watch, revoke, and delete it for one customer, it is not a feature.

---

## 5. Security / trust checklist

### Claims Flow can make today

- Flow is a separate offer from Glance, sold as a scoped engagement, not as a self-serve download (`docs/product-architecture.md` §4, `flow-landing/pricing.html`).
- The public website is served with HSTS, a CSP, `X-Frame-Options: DENY`, and nosniff (`flow-landing/_headers`).
- Enterprise enquiries can be stored in `public.leads` with a constrained seat band and deployment label, and the browser role cannot read that table **if the migration has been applied**. Whether it is applied in the live project is UNKNOWN.
- Vulnerability reports have a published contact (`flow-landing/.well-known/security.txt`, `security.html` §10).
- Engineering can say, truthfully: we will not put your matter data in the Glance extension or in the marketing database.

### Claims forbidden until proven on a real deployment

- "Flow Edge is available today."
- "Masked cloud is available today" or "Flow runs in a masked secure cloud today" (`about.html` already says this; it is not backed by code).
- The customer can choose between Edge and masked cloud as live options.
- SSO, immutable audit, admin console, or zero-retention are live.
- Any certification or attestation: HIPAA, SOC 2, ISO 27001, GDPR "compliance," 21 CFR Part 11, NERC CIP, CJIS, FedRAMP, PCI. `security.html` §9 invites the reader to ask for status. The honest status from this repo is: no evidence.
- Google and Notion are live **for Flow**. They are live or coded for Glance.
- A credit pool, per-installed-employee enforcement, or the ILS 2,500 example, until a ledger exists and the price is the one in the contract.
- "The model never sees sensitive data." Glance's masker is heuristic and documents misses. Flow has no masker of its own.
- "We never store the content." The lead form stores `message`. A future audit log must not be described as content-free unless the schema enforces it.
- Any sentence that makes Glance sound like a trial of Flow.

### Threat model (intention data, messages, files, actions)

| Asset | What goes wrong | What the repo does now | What the first deployment must do |
|---|---|---|---|
| Intention / matter text | A prospect pastes client facts into the contact form; they land in `leads` and in a personal Gmail | `submit-lead.js` stores and emails the message | Intake form warns against client content. Execution store is a different system. Notification emails carry ids, not bodies. |
| Messages | A browser extension reads mail on a managed desktop and keeps it in a profile | Glance content scripts and extension storage | Flow does not ship as that extension. Mail access is a connector in the customer's placement, scoped to the mailboxes the contract names. |
| Files | A write creates a client-visible document by mistake | Glance can create Drive files on Do It (`core/connectors.js` note) | File creates are proposals. Approval names the destination. Undo is tested for that connector before go-live. |
| Actions | A retry double-creates a task; a model writes on its own; a departure leaves access in place | No org action path | Idempotency key, human approval, revocation via IdP, audit of outcome. |
| Tokens | Connector refresh tokens in a shared Netlify env or in git | OAuth client secrets are env names in `.env.example`, not values. Glance Google client id is in `manifest.json` (public by extension design) | Per-customer app registration in the customer's tenant. Tokens in the customer's secret store. |
| Cross-tenant | Another customer's row is readable, or Glance consumer data sits beside firm data | One Supabase project; service role bypasses RLS | One placement per customer until a real tenant key exists. |
| Prompt injection | Untrusted email text becomes an instruction to exfiltrate or to write | Blog essay only (`flow-landing/blog/prompt-injection-ai-threat-modeling.html`). Glance router ignores client-supplied instructions (`glance-assist.js`) | Flow tools are a fixed schema. Untrusted text is data. No tool can send, and no tool runs without approval. |
| Operator abuse | The implementer can read every matter | No technical barrier, because there is no product | Access to payload content is break-glass, audited, and off by default. The retainer does not require standing access to client files. |

### How to sell into regulated-ish environments without fake certifications

Sell a scoped implementation with a security appendix the code can meet: where the process runs, who can log in, what is stored, how long, how deletion works, which writes require approval, and what you refuse to certify. Offer a DPA only when the placement and the subprocessors are real. For a clinic or a firm, the first honest sentence is: "We do not have a HIPAA attestation or a SOC 2 report. Here is the architecture of this engagement, and here is what we will not do." Point assessors at `security.html` §9's "ask us for status," and make the written answer match this audit until a deployment proves more.

Do not use the blog library as evidence of controls. Those pages are essays. They are not runbooks and they are not test results.

### Secrets and critical issues found (paths only)

No production service-role key, Stripe live secret, provider API key, or private key was found in git. `.env.example` lists names and empty values. Test files under `flow-landing/netlify/functions/` assign obvious dummy strings, not live credentials.

Issues that matter, without copying values:

- `flow-landing/trial.html` and `flow-landing/almost-missed.html` embed the Supabase **anon** key for project `zjquktirlrhbqcnkfaok`. That key is meant to be public. It is dangerous only if RLS is missing or weaker than the migrations. Live RLS was not verified.
- `flow-trial-extension/manifest.json` contains a Google OAuth client id. Chrome extensions publish this. No client secret was found next to it.
- `flow-landing/netlify/functions/submit-lead/submit-lead.js` hardcodes a personal Gmail destination and will email the full enquiry, including when the database write fails.
- Service-role access to the shared project bypasses RLS. One Netlify env mistake exposes waitlist emails, leads, licence rows, and usage counters together.
- `flow-landing/_headers` CSP allows inline scripts.
- `supabase/migrations/20261004000000_glance_ai_usage.sql` says the usage migration is NOT APPLIED and the project was paused. If that is still true, Glance metering and any assumption that "the database is ready" are UNKNOWN against production.
- `about.html` states a masked cloud is running today. That is a trust defect even though it is not a credential leak.

---

## 6. Integration order

Connector doctrine: **one system of record per engagement, productized, with a kill criteria.** Flow is not a connector marketplace and not a custom-services agency that happens to have a logo.

### First, for the buyers named in this audit

Pick the system the firm already treats as the place work is done, not the system that is easiest to demo.

| Buyer | First connector to design | Why | Do not lead with |
|---|---|---|---|
| Law firm | The matter or document system they name in discovery, or Microsoft 365 mail + files if that is actually where the work sits | Privilege and the file are the close. A Gmail chip is the wrong story | A five-CRM catalog, legal research, a chatbot |
| CPA / accountant | The work-management or document binder they use for the engagement | The close is a filed document or a completed checklist item | Generic "Notion is live" |
| Insurance agency / broker | The agency management or claims system they already pay for | The close is a record in that system | A Slack message as proof of close |
| Clinic / lab | The system the administrator already updates, scoped to non-clinical admin work first | Clinical writes are a different risk and a different contract | EHR write access in the first deployment |
| Investment house | The CRM or portfolio-ops tracker they name | The close is an entry there, with a human approval | Market-data platforms, trading systems |

If discovery does not yield one system, do not invent five. Decline or sell a paid discovery that ends in a written "one system" decision.

Google and Notion exist as Glance writers. They are a possible **second** step for a firm that truly lives there, after the Flow host exists. They are not evidence Flow is integrated.

### Never promise early

- Sending email, filing with a regulator, moving money, or writing an EHR as an automatic outcome.
- SSO, SIEM, DLP, and "works with everything you have" in the same proposal as the first connector.
- Flow-Edge and masked cloud as simultaneous options.
- Certifications.
- A custom connector inside the seat price. `docs/product-architecture.md` §3.5 already says custom work is scoped. Hold that line.
- Any Glance surface (Chrome Web Store install, Pro licence, second-reading allowance) as the enterprise onboarding path.

### How not to become a custom-services agency

- Every engagement implements the same host: identity, audit, approval, one connector interface, deletion.
- The connector is an adapter with a fixed contract: `propose`, `commit(idempotencyKey)`, `readStatus`, `undo` where undo is possible. Customer-specific field mapping sits in adapter config, not in a fork of the host.
- Custom adapters are a scoped line item with a written done-condition. If the adapter cannot `readStatus`, it cannot close loops, so it is not sold as execution.
- A third custom adapter in a quarter is a signal to productize or to refuse, not to hire a parallel services practice.
- The retainer, once it exists, pays for operation of this host (upgrades, failed-write review, access changes), not for unbounded workflow design.

### One open loop, one source of truth

A loop id is born in Flow's audit store and points at one external record id. Updates from mail, a file, or a person are evidence attached to that loop. They do not create a second loop because a second system saw the same fact. If two systems must be updated, the contract names a primary. The secondary write is another approved step. It does not get its own "closed" bit. When the primary says the work is done, the loop can close. When the person releases it, the audit says released, and the primary is left as it is.

---

## 7. Kill / defer list

Anything below that adds surface without making a close more reliable waits. Build / buy-partner / postpone is chosen for speed to the first reliable deployment, margin, and a small team.

| Capability | Decision | Why |
|---|---|---|
| Flow host (one placement, one connector, approval, audit, delete) | **Build** | This is the product. Nothing else creates revenue that can be operated. |
| OIDC login against the customer's IdP | **Buy-partner** (their IdP) | Do not build an identity provider. |
| SAML, SCIM, full admin suite | **Postpone** | OIDC plus an allowlist covers the first firms. |
| Audit log | **Build** | Buy a log vendor later if a customer requires SIEM. The record itself is ours. |
| Secrets store | **Buy-partner** | The customer's vault or a hosted secret manager. Do not invent one. |
| Masking service | **Postpone** as a product feature | First deployment should avoid sending matter text to a third-party model. If a model is required, reuse the idea of `privacyShield.js` only behind tests on that firm's documents, and still do not call it certified de-identification. |
| Flow-Edge appliance | **Postpone** | No package exists. Offer it only after one hosted single-tenant pilot has operated, and only as a second placement of the same host. |
| Masked multi-tenant cloud | **Postpone** | Multi-tenant is how you hurt a second customer with the first customer's bug. One tenant per customer is enough. |
| Credit pool and pricing v4.2 enforcement | **Postpone** | No meter, and the price is not in the repo. Bill the first customer on a contract PDF. |
| Retainer billing system | **Postpone** | Invoice in the tool the company already uses. Build product metering only after the second customer. |
| Stripe org subscriptions | **Postpone** | Current Stripe path is Glance Pro, quantity 1. Do not overload it. |
| Connector marketplace / five CRMs | **Kill** for Flow | HubSpot, Salesforce, Slack, Monday are Glance code in `status: 'building'` and are not an enterprise suite. |
| Homepage legal demo presented as the product | **Kill** as evidence | It is a modal state machine in `index.html`. |
| Action Graph, Malpractice Shield | **Kill** until a definition exists in code | Names on a solutions page. |
| Chatbot or prompt box as the Flow UI | **Kill** | Violates the decision filter in `docs/product-architecture.md` §5.3. Firms do not need another chat window over client data. |
| Using Glance as the Flow client "for now" | **Kill** | Mixes products, trust zones, and data. |
| Community learning, hybrid on-device 2 GB model | **Kill** for Flow | Glance switches, dormant or off (`config/hybrid.public.js`). Wrong product, wrong data. |
| Certifications program | **Postpone** | Cost and theater before a single operated deployment. |
| Blog-driven verticals (FedRAMP, NERC CIP, 21 CFR, CJIS) | **Kill** as roadmap | Essays. The buyers in this audit are 10–a few hundred people, not federal authorization. |
| New recognition models | **Postpone** | `core/` already prefers silence. Flow's first risk is the write and the audit, not a smarter classifier. |
| WhatsApp, capture, multi-platform expansion | **Kill** for Flow | `docs/multi-platform.md` is Glance. |

---

## 8. 90-day technical roadmap: Now / Next / Later

Sequenced for a small team. No new product surface beyond the first host.

### Now

- Treat this audit as the engineering source of truth for what sales may say. Reconcile `about.html` and `llms.txt` with `security.html` before the next enterprise conversation. That is an owner copy decision.
- Freeze any work that presents itself as Flow-Edge, masked cloud, SSO, or an org credit pool.
- Write the pilot contract's technical appendix: one placement, one system of record, close definition, stored fields, retention, who may approve, Flow never sends.
- Stand up an empty Flow host repository boundary (even inside this repo under a new directory) that does **not** import `src/`, `chrome.*`, or the marketing Supabase URL. Do not port the extension.
- Schema for the pilot: org, person (OIDC subject), connector credential reference, proposal, approval, attempt, audit event, idempotency key. No message body column until the contract requires it.
- Threat-model the contact form so buyers stop pasting matter text into `public.leads`.

### Next

- Implement the host against one design partner's IdP and one connector, in a pilot placement with its own keys.
- Rehearse failure: connector timeout, duplicate retry, rejected approval, revoked user, deletion export.
- Operator page: open proposals, failed attempts, last close. No content.
- One real loop closed in the customer's system of record, with the audit showing approval then execution. That is the first proof. A demo modal is not.
- Only then, price the second invoice from facts (seats provisioned, or a retainer for operating this host), and record the price in the repo so code and sales stop diverging.

### Later

- Second customer on a **new** placement, same host build.
- Second connector, only if the first customer's failure log says the close is blocked without it.
- The other deployment placement (Edge or cloud), as a packaging of the same host, after the first placement has been operated.
- Seat ledger and, if a model is actually in the path, a credit ledger designed from measured cost. Not 130× by default.
- Certification evidence, only if a buyer is paying for the audit and the controls already exist.

---

## 9. What engineering will not do

- Will not represent Glance as Flow, or ship the Chrome extension into a sensitive-data org as the enterprise product.
- Will not claim Flow-Edge or masked cloud is available while this tree has neither.
- Will not implement pricing v4.2, a 130× credit pool, or an ILS price that is not written down as the source of truth.
- Will not store matter content, files, or connector tokens in `zjquktirlrhbqcnkfaok` or in the marketing Netlify environment.
- Will not send email, messages, or filings on a customer's behalf.
- Will not let a model close a loop, write the system of record, or approve its own proposal.
- Will not mark a draft, a task, or a reminder as completion.
- Will not pursue SOC 2, HIPAA, FedRAMP, or sector badges as a substitute for an operated pilot.
- Will not build a connector marketplace, a chatbot, an inbox client, or a workflow designer.
- Will not turn on Glance hybrid execution, community learning, or a non-loopback model endpoint for a firm.
- Will not fork the host per customer. Configuration and one adapter, not a services branch.
- Will not add a second execution path "temporarily."
- Will not copy secret values into docs, tickets, or lead-notification templates.

---

## Appendix A: repo map (Flow vs Glance vs shared)

| Path | Class | What it is |
|---|---|---|
| `flow-landing/` HTML, especially `pricing.html`, `security.html`, `contact.html`, `about.html`, `privacy.html`, `terms.html`, `solutions/`, `blog/`, `llms.txt`, `index.html` | Shared site, Flow **and** Glance copy | Static marketing. Flow's enterprise claims live here and are mostly labeled roadmap, with the contradictions noted in §2. |
| `flow-landing/_headers`, `flow-landing/.well-known/security.txt`, `flow-landing/netlify.toml` | Shared | Site headers, disclosure pointer, Netlify build that also packages the Glance zip. |
| `flow-landing/netlify/functions/submit-lead/` | Flow sales intake | Enterprise enquiry API. |
| `flow-landing/netlify/functions/submit-waitlist/`, `confirm-signup/`, `send-confirmation/`, `send-playbook/` | Shared | Waitlist and mail. Playbook PDF is a Flow-oriented attachment on a shared signup path. |
| `flow-landing/netlify/functions/create-checkout/`, `stripe-webhook/`, `billing-portal/`, `verify-license/` | Glance | Individual Pro billing and licence check. |
| `flow-landing/netlify/functions/glance-assist/` | Glance | Model router, masking checks, personal allowance. |
| `flow-landing/netlify/functions/*-oauth-*` | Glance | HubSpot, Salesforce, Slack, Monday token exchange for the extension. |
| `flow-landing/netlify/functions/download-trial-zip/`, `trial-signup/`, `send-trial-access/` | Glance | Extension delivery. |
| `flow-landing/netlify/functions/community-learn/`, `community-delta/` | Glance, dormant | Cross-user learning. Not a Flow feature. |
| `flow-landing/netlify/functions/track-event/`, `submit-catch/` | Shared / Glance | Site and "Almost Missed" analytics. |
| `flow-trial-extension/` | Glance | The only application. Manifest V3 Chrome extension. |
| `flow-trial-extension/core/` | Glance code, **intended** future library | Pure modules (intent, resolution, masking, connectors catalog). No Flow host loads them. Coupling risk if someone treats the directory as the enterprise product. |
| `flow-trial-extension/src/` | Glance | Browser integration, service worker, Gmail/Outlook UI. `chrome.*` lives here. |
| `flow-trial-extension/config/hybrid.public.js`, `config/ladder.public.js` | Glance | Hybrid execute off; second-reading switch on in the extension. Server-side ladder still depends on env and a migration marked not applied. |
| `supabase/migrations/`, `supabase/config.toml`, `supabase/README.md` | Shared database project | `zjquktirlrhbqcnkfaok`: waitlist, leads, catches, Glance licences, Glance usage. Not a Flow tenant database. |
| `supabase/functions/send-waitlist-welcome/` | Shared, unused by the pages | Alternate mail path. Not the live signup flow (`supabase/README.md`). |
| `docs/product-architecture.md` | Shared spec | §3 is the Flow intention. §0a and §2 are Glance shipping reality. Where they disagree, §0a wins for what ships. |
| `docs/engineering-audit.md` | Shared, partly stale | 2026-09-27 conclusion that Flow has no admin/SSO/Edge code still holds. Its "no Stripe" and "no CI" lines are stale: Stripe and `.github/workflows/` exist for Glance. |
| `docs/true-close.md`, `docs/resolution-paths.md`, `docs/ai-ladder.md`, `docs/monetization.md`, `docs/multi-platform.md`, `docs/hybrid-execution-architecture.md` | Glance | Personal-product rules. Useful as doctrine. Not Flow features. |
| `docs/system-audit-2026-09.md` | Glance | Stabilization notes for the extension. |
| `.github/workflows/` | Glance | Install-zip verify and model experiments. No Flow deploy pipeline. |
| `.env.example` | Shared | Env names for Glance and the site. No Flow tenant variables. |
| `action-graph-video/` | Marketing asset | Remotion promo. Not a runtime. |
| `scripts/` | Mostly Glance | Packaging, intent training, evals. |
| `docs/flow/cto/` | Flow | This audit. |

No directory in this repo is a Flow runtime.

---

## Appendix B: open questions only the founder or team can answer

UNKNOWN from the repo. Do not let engineering guess these in a proposal.

1. Does any Flow runtime, Edge install, or masked tenant exist outside this git repository (another repo, a laptop, a customer network)?
2. Has any organization paid, and if so under which price: $80/user/month, pricing v4.2 (ILS, 130× credits, minimum 10), or a custom retainer?
3. Where is pricing v4.2 written (spreadsheet, ClickUp, contract), and which number is allowed in front of a buyer?
4. Is Supabase project `zjquktirlrhbqcnkfaok` paused, and which migrations are actually applied? The usage migration says it was not applied.
5. Are production Netlify env vars set, and do deploy previews share them with production?
6. Is the personal Gmail destination in `submit-lead.js` still the mailbox that receives enterprise enquiries, and who else can read it?
7. Has a buyer already been told that Edge and masked cloud are both available today? Which sentence should survive: `security.html` or `about.html`?
8. Who is the first design partner, and what is the one system of record they will let us write, with approval?
9. For that partner, is the acceptable placement a VM they run, or a single tenant we run? Pick one.
10. What may be stored: hashes only, or payload text, and for how many days?
11. Is "retainer" a services fee for operating the host, a seat subscription, or both? The repo only documents the seat-plus-setup model.
12. Should Flow ever send on the organization's behalf? Default in this audit: no.
13. Is reuse of specific `core/` modules a goal for the first host, or is the first host deliberately independent until the pilot is closed?
14. Who is the operator on call when a write fails for the first customer?
