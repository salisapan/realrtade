# CFO revenue mandate — Glance & Flow

<!-- LOCKED-IDENTITY:START -->
**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.
<!-- LOCKED-IDENTITY:END -->

> Written 2026-10-06. Evidence from `main`, branch `claude/install-uiux-pro-max-skill-a4agox`, live Supabase project `flow-ai`, `docs/open-tasks.md`, `docs/product-architecture.md`, and branch docs `docs/monetization.md` / `docs/revenue-routines.md`.  
> **No invented user counts.** Installs, conversion, and revenue are **unknown** — none exist as measurements in the repository. Waitlist row count below is live DB, not marketing.

---

## 1. Executive CFO diagnosis

**You cannot collect a dollar on `main` today.** Pricing shows "Notify me" for Glance Pro and "Get a deployment plan" for Flow. There is no Stripe checkout, webhook, licence activation, or billing portal deployed from `main`. The payment rails exist on an unmerged product branch; they are not live.

**The business is blocked by distribution and cash plumbing, not by feature poverty.** The product branch is overweight (72 `core/` modules vs 21 on `main`). Monetization, Waiting-on, Pro licence gate, and AI ladder live on that branch. `main` ships a free Chrome-extension install path (zip + Load unpacked) and a waitlist. That is not a revenue machine.

**Live infrastructure truth (2026-10-06):**

| Asset | Status |
|---|---|
| Supabase `flow-ai` | **ACTIVE_HEALTHY** (open-tasks row 2 is stale — it still says INACTIVE) |
| `waitlist` | **1 row** |
| `leads` | **0 rows** |
| `licenses` | table exists, **0 rows** (migrations applied; no paying customers) |
| `ai_usage` | table exists, **0 rows** |
| Stripe on production | **not chargeable** — no checkout functions on `main` |
| Chrome Web Store | **not published** — install is Developer-mode / Load unpacked |
| Usage / conversion / MRR | **unknown** — not measured in-repo |

**Glance money and Flow money are different machines.** Glance is self-serve freemium at $14/user/mo. Flow is quote-led enterprise at $80/user/mo + setup. One Flow deal of ~20 seats ≈ $1,600/mo — same as ~115 Glance Pro seats. Domain-cluster emails from Glance signups are the only built bridge into Flow sales. With 1 waitlist row, that bridge is idle.

**Weakest link in the revenue system today:**  
attention → **install** → activation → value → paywall → **payment** → retention  

Install (no Web Store) and payment (not on `main`) are both broken. Fix those before decorating recognition, hybrid execution, or more surfaces.

**One-sentence sell tests:**

- Glance Pro that can convert: *"Stop losing the money and replies you already asked for — chase every open loop until it closes."*
- Flow that can convert: *"Your team closes email decisions into your system of record under your security review — we deploy it; you don't download it."*

If Pro is still sold as "small team shared setup" while the only built paid surface is individual follow-through + AI, a skeptical buyer will smell packaging fiction. Resolve that in one sentence before `PRO_PUBLIC=1`.

---

## 2. Glance money plan

### Revenue truth audit (Glance)

| Question | Answer (evidence) |
|---|---|
| What can charge money **today** (`main`)? | **Nothing.** Pricing CTA is waitlist email (`pricing.html` → Supabase `waitlist` + `send-confirmation`). No Stripe. |
| What is **built but not live**? | On branch: Stripe Checkout (`create-checkout`), webhook, derived licence keys, `verify-license`, billing portal, `pro-welcome.html`, Pro panel card, Free 3-loop Waiting-on cap, Draft-It / summaries licence-gated, founding coupon, 14-day card-required trial. DB: `licenses` + `ai_usage` already exist (0 rows). |
| What is **live but not chargeable**? | Free Do It path (Gmail → Calendar / Tasks / draft / Drive). Sign-up → zip download. Inbox Scan / Almost Missed acquisition pages. Domain-cluster owner alerts in `confirm-signup`. `glance-assist` on `main` has **no licence gate** — if model keys are set, AI cost can burn with $0 revenue. |
| What would **not survive a skeptical buyer**? | "Pro = small team" (`product-architecture.md` §2) while branch monetization sells individual follow-through. Masked secure cloud / Flow-Edge language near Glance. Claiming Waiting-on / money-owed works without a real-Gmail pass. Quoting accuracy of the deeper read before eval runs. Any implied user base — waitlist is 1. |
| Where is **revenue leaking**? | (1) Load-unpacked install friction. (2) Pro not purchasable. (3) Packaging contradiction Free/Pro. (4) No lifecycle email (consent undecided). (5) Free AI endpoint ungated on `main`. (6) Branch not merged → payment code never reaches production. |

### Now (this week — gate 0)

1. Merge the product branch that contains Stripe + Waiting-on + Pro packaging into `main` and deploy (open-tasks #1 / #11). Without this, every other Glance revenue idea is theater.
2. Stripe account + prices ($14 mo / $132 yr) + portal + webhook + Netlify env — **do not** set `PRO_PUBLIC=1` until test path passes (`docs/monetization.md` §5 on the branch).
3. Real-Gmail script: Waiting-on, Draft-It, licence activate/cancel (`docs/open-loops.md` §6 on branch).
4. Chrome Web Store submission package (`flow-trial-extension/docs/chrome-web-store-submission.md`). No store = no volume.
5. Freeze new `core/` features that do not touch install → first close → paywall.

### 30 days

- `PRO_PUBLIC=1` after test-mode purchase + cancel + licence revoke proven.
- Founding coupon live (real scarcity from Stripe `max_redemptions`).
- Annual default on pricing (cash-flow lever already designed).
- In-product upgrade moment: 4th open loop + money-owed tease (built on branch).
- Measure: installs, first Do It close, trial starts, trial→paid, cancels. **Unknown until instrumented and used.**
- Founder replies to every early user personally (day-3/day-10 automation blocked on consent).

### 90 days

- Only then: lifecycle email if consent decided; team billing if ≥3 real teams ask via Contact; deeper-read server on after precision gate (`ai-ladder` eval).
- Target planning math (assumptions, not measurements): ~85 Pro @ ~$12 blended ≈ $1K MRR; ~420 ≈ $5K. Needs thousands of active free users at 2–5% conversion — **distribution problem**, not a model problem.

---

## 3. Flow money plan

### Revenue truth audit (Flow)

| Question | Answer (evidence) |
|---|---|
| What can charge money **today**? | **Nothing automatically.** Path is `/contact.html` → human quote. No Stripe for seats. `leads` table: **0 rows**. |
| What is **built but not live / not sellable as promised**? | Enterprise story: SSO, audit log, admin console, masked cloud, Flow-Edge — described; not an operational product a buyer can buy and run. Connectors beyond Google are code-present but UI-dormant (`product-architecture.md` §0a). |
| What is **live but not chargeable**? | Marketing site, playbook PDF waitlist, contact form, security/compliance narrative pages. Domain-cluster alerts from Glance signups (warm leads) — idle at 1 signup. |
| What would **not survive a skeptical buyer**? | Selling masked secure cloud or Flow-Edge as available. Claiming five connectors when onboarding exposes Google only. Implying Trial Pro shares Flow security posture. Blog/solutions volume for industries not in the wedge. |
| Revenue leak | No pipeline discipline on Contact leads. Enterprise features promised ahead of ops. Glance→Flow lead bridge unused. Sales motion requires humans and none are scheduled against a CRM of leads (0). |

### Now

1. **Sell what is operationally true in one sentence:** scoped deployment of the loop-closure engine for regulated teams, Google-surface first, with DPA/security review as the paid wedge — not a self-serve download.
2. Answer every Contact and every domain-cluster alert **same day**. Zero leads in DB means either forms are broken in production or there is zero demand signal — verify end-to-end after deploy (#9).
3. Stop writing more solutions/blog pages until Search Console shows which URLs earn impressions.

### 30 days

- One outbound list: 20 named firms in legal / insurance / security (owner network + domain clusters).
- One demo script that shows: open Gmail → Do It → reversible write → what audit/DPA engagement buys. Do not demo dormant connectors as live.
- Pricing posture: **seat ($80/user/mo annual) + scoped setup** is fine. Do not invent workflow/outcome pricing until one customer pays seats. Outcome pricing without measured closure rates is fiction.

### 90 days

- First paid pilot: even 5–10 seats + setup fee beats months of Glance freemium at current distribution.
- Only after a paying pilot: custom connector as line item; Edge only if the contract requires it.

---

## 4. Unit economics

### Glance Pro (planning model)

| Item | Value | Confidence |
|---|---|---|
| What is sold | Individual Pro: unlimited Waiting-on, money-owed view, firmer nudges, Draft-It, attachment summaries, deeper-read allowance | Branch packaging; not live |
| To whom | Prosumer / individual operator of email money & deadlines | Stated |
| List price | $14 / mo or $132 / yr (~$11 / mo) | Designed; Stripe prices not confirmed live |
| Stripe fee | ~2.9% + $0.30 / charge (**estimated**) | Standard US card |
| Deeper-read COGS | Free ~$0.15 / mo worst case; Pro ~$1.80–$2 / mo at full allowance (**estimated** provider prices) | Branch `docs/ai-ladder.md` §4 |
| Draft-It / summary COGS | Variable per call; must stay licence-gated | On branch gated; **on main ungated** |
| Contribution margin works if | (1) AI stays capped & gated, (2) most Free users stay local-only, (3) annual mix is high, (4) churn < ~8–10%/mo after trial | Model, not measured |
| Free becomes dangerous when | Deeper-read or Draft-It runs without caps/gates; daily global cap (3,000 units ≈ ~$3.6/day **estimated**) is the hard stop | Branch design |

**Do It itself is cheap** (local + user's Google APIs). **Do not finance product fantasy with unmeasured AI.** Keep Free valuable on local closes; put variable cost behind Pro + server counters.

### Flow Enterprise (planning model)

| Item | Value | Confidence |
|---|---|---|
| What is sold | Seats + scoped setup (discovery, DPA, connector, deployment model) | Published |
| To whom | Regulated orgs (legal, insurance, security) | Stated |
| Seat price | $80 / user / mo, billed annually | Published |
| Setup | Scoped — not flat | Stated |
| Delivery COGS | Human time (sales, security review, integration). Cloud tenant cost **unknown**. Edge shifts compute to customer | Honest gap |
| Contribution works if | Setup fee covers first integration + review; seats cover support load; no free "security theater" in Trial Pro | Qualitative |
| Dangerous | Promising Edge/SSO/audit before staffed delivery; discounting seats to win logos without setup | |

**Illustrative (not a quote):** 20 seats × $80 = $1,600/mo ($19.2K/yr) before setup. One such deal > ~130 Glance Pros.

---

## 5. Packaging recommendations

### Glance — change this

| Current risk | Change |
|---|---|
| Live page + architecture still imply Pro as "small team"; branch sells personal follow-through | **Lock Pro = personal depth layer** (Waiting-on + money + Draft-It + deeper read). Team = Contact / later. Close open-tasks decision. |
| Free on live pricing undersells habit (Do It only); paid reason soft ("coming soon") | After merge: Free = Do It unlimited + **3 Waiting-on**. Paid reason = **protection/closure**, not "higher limits" as the headline. Limits enforce; the story is money/deadlines. |
| Cap on Waiting-on vs "do not cap free closes" | Keep **Do It uncapped**. Cap only pursuit inventory (3). That is the conversion wedge. |
| Notify-me CTA | Replace with checkout only when `PRO_PUBLIC=1`; until then keep honesty ("Coming soon") — never fake a Buy button. |
| AI on Free | Deeper read with hard allowance OK; Draft-It Pro-only. Never open `glance-assist` without licence on production. |

**Paid reason sharp enough for a non-technical payer next month?**  
Yes — *if* Waiting-on works on their real mail: "You're tracking 3 of 3 and Pro shows what you're owed."  
No — if Pro is "shared Notion setup for a team of 5" that was never built.

### Flow — change this

| Current risk | Change |
|---|---|
| Roadmap items on pricing (masked cloud badge) next to a buy CTA | Keep badge. In sales calls, sell **engagement now**: security review + DPA + Google-path deployment. Roadmap is roadmap. |
| Seat vs workflow vs outcome | **Seat + setup now.** Workflow/outcome pricing needs measured closure rates you do not have. |
| Do not promise | Live SSO, audit export, Flow-Edge, five connectors in onboarding, compliance certification — until operationally true. |

---

## 6. P0 action list

### Code (Claude / engineering)

1. **Merge payment + Waiting-on + Pro packaging branch → `main`**, deploy Netlify. Treat missing payments on `main` as P0.
2. Gate `glance-assist` on licence **before** any production model keys are relied on (branch has this; `main` does not).
3. Pricing page: checkout when `create-checkout` returns `enabled:true`; else Notify me (already designed).
4. Instrument funnel events end-to-end: `pro_start_clicked`, `pro_activated`, `pricing_pro_checkout_click`, `pro_checkout_complete` — verify they fire in GA4 after go-live.
5. Failed-payment / cancel: webhook already mirrors `past_due` / `canceled` on branch — confirm Draft-It dies immediately; no silent grace beyond designed 7-day offline.
6. Do **not** build: hybrid execution activation, community learning, encoder experiments, more multi-platform surfaces, blog/solutions expansion — until Gate 0 cash path is live.

### Sally / humans (owner)

1. Stripe account, products, prices, Tax/VAT decision, Customer portal, webhook secret, `LICENSE_SECRET`, Netlify env. Order in branch `docs/monetization.md` §5.
2. Confirm 14-day refund promise in `terms.html` or change it.
3. Decide **Pro = individual** (recommended) vs small-team architecture fiction — one line, then docs/pricing match.
4. Real-Gmail acceptance of Waiting-on + payment path; then `PRO_PUBLIC=1`.
5. Chrome Web Store submit; set `chromeStoreUrl` when live.
6. Confirm Resend / signup path after deploy (open-tasks #3–4). Update open-tasks #2: Supabase is already healthy.
7. Founding coupon parameters (or skip).
8. Consent decision for day-3 / day-10 email — until then, personal founder replies only.

### Distribution / sales

1. **Glance:** Web Store + one acquisition loop (Inbox Scan / Almost Missed / personal network). No ads until install→activate measured.
2. **Flow:** Same-day reply to Contact + domain clusters. 20-account outbound. One demo that matches §0a shipping truth.
3. Kill vanity: do not quote hypothetical "if we had 10,000 users."

### Fastest path to cash

| Milestone | Ruthless path |
|---|---|
| First **$1** | Merge → Stripe test→live → one founding/self purchase of Glance Pro **or** one Flow setup invoice. Whichever Sally can close first. Flow invoice can beat Pro if a warm org exists. |
| First **$1K** | ~70–85 Pro (blended) **or** one ~10–15 seat Flow ACV slice / setup. Prefer Flow if network is enterprise; prefer Pro if Web Store unlocks consumer install. |
| First **$10K** | Mix: 1–2 Flow pilots (seats+setup) plus Pro base. Do not plan $10K on Glance freemium alone without Store + measured conversion. |

---

## 7. Kill list (next 30–60 days)

Work that consumes time and does **not** move cash collection:

1. Hybrid execution switch-on / 2GB model download path.
2. Community (cross-user) learning wiring.
3. Encoder / small-LM browser experiments already failed gates.
4. Additional multi-platform surfaces beyond what's needed for one real-Gmail money path (WhatsApp polish, more Outlook chrome) — until Pro can charge.
5. New blog / solutions long pages for off-wedge industries.
6. Team Pro features (shared connectors, digest, history dashboard) until individual Pro is live and selling.
7. REMOTE_CLASSIFY / whole-message remote classification.
8. Billing connector / bank-read / CRM for receipt issuance — future; does not collect SaaS revenue now.
9. Packaging debates that re-open "Pro as security upgrade."
10. Site redesign churn unrelated to Get Glance → install → pay.

Impressive ≠ payable.

---

## 8. Weekly revenue operating cadence

**One page, same day each week.** One number per stage. Fix only the weakest link.

| Stage | Metric | Source |
|---|---|---|
| Attention | Sessions to `/trial.html`, `/pricing.html` | GA4 |
| Sign-up | Confirmed waitlist / downloads | Supabase `waitlist`, Resend |
| Install | Extension active pings / Store installs | `track-event`, CWS dashboard |
| Activation | First Do It close / first Waiting-on accept per install | Extension events (anonymous) |
| Value | Closes per active user; loops hitting 3/3 | Extension |
| Paywall | Pricing checkout clicks; in-panel Pro start | GA4 + events |
| Payment | Trial starts, paid conversions, failed payments | Stripe |
| Retention | Cancels + reason; past_due recovery | Stripe portal / webhook |
| Flow | Contact leads, domain clusters, demos booked, proposals out | `leads` + inbox |
| AI COGS | Units / day; Free hitting cap; cost vs MRR | `ai_usage` + provider bills (**estimated $ until verified**) |

**Rules:** no vanity feature demos in the revenue meeting. If payment is still not on `main`, the only agenda item is Gate 0. If install conversion is the trough, the only build is Web Store / install UX. Quote no user or revenue number that is not in Stripe or the DB.

---

## Evidence index

| Claim | Where |
|---|---|
| No Stripe on `main` | `flow-landing/netlify/functions/` listing — no `create-checkout` / `stripe-webhook` |
| Payment built on branch | `origin/claude/install-uiux-pro-max-skill-a4agox` — checkout, webhook, licenses migration, `docs/monetization.md` |
| Pricing is Notify me | `flow-landing/pricing.html` |
| Supabase healthy; licenses 0; waitlist 1 | Live Supabase MCP 2026-10-06 |
| Pro packaging contradiction | `docs/product-architecture.md` §2 vs branch `docs/monetization.md` |
| Shipping scope (Google only) | `docs/product-architecture.md` §0a |
| AI cost estimates | Branch `docs/ai-ladder.md` §4 |
| Open blockers | `docs/open-tasks.md` rows 1, 7, 11, 33 |
| Domain clusters | `confirm-signup.js` thresholds 3/5/10/20/50 |
| glance-assist ungated on main | `glance-assist.js` — no licence check |
