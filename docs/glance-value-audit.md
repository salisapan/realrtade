# Glance value audit

Audited on `main` at `46dfdc8` (2026-09-16), “Guard all .innerText reads with optional chaining.” No product code changed in this branch. Scores below were measured by running `flow-trial-extension/src/judgment.js` (with `domains.js` and `extract.js`) the same way `test/judgment-corpus.cjs` loads them. Corpus on this commit: 0 failures. Threshold with a fresh install: **50**.

Glance is the self-serve product. Flow is the separate enterprise product. This audit does not blur that line. It asks whether a person who installs Glance in one sitting gets a credible first taste of “watch a moment, recognize it, act on it, always reversibly” — the mechanic in `docs/product-architecture.md` — or only a log of a sentence they already read.

## Do this tomorrow

Ordered by felt relief per unit of install friction. Items 1–3 are the product. Items 4–5 stop the site from arguing with the extension. Do not reopen work already in a draft PR (table at the end).

1. **Change what Do It does.** The click should create the next object (a calendar hold or an open task) from facts already extracted. Today it files a receipt whose title starts with “Log”.
2. **Make the first session prove the extension is alive.** Put one reason sentence on the chip. The scorer already names it; the chip and the Activity tab both hide it.
3. **Cut the install gauntlet to one Google account.** Chrome Web Store, one destination that needs no owner-configured OAuth app, and hide HubSpot / Salesforce / Slack / Monday until a real client id exists. Notion stays optional, not the front door.
4. **Land the scoring fixes already measured in PR #24**, then regenerate the public engine (PR #23). On this commit, two examples written in `docs/product-architecture.md` score 8 and 25 and produce no chip, and a question about a price scores 79 and would be written as a confirmed amount.
5. **Rewrite the sentences that name behavior the extension does not have** (list in section 4). Leave Draft-It unmounted until `glance-assist` is actually configured.

---

## 1. Exact map of what Glance does today

### The only live loop

Gmail reading pane → on-device score → one chip, or silence → one new record in one destination → a receipt with View and Undo.

| Step | What actually happens | Where |
|---|---|---|
| Install | Not the Chrome Web Store. Confirm an email, download a zip, unzip, turn on Developer mode, Load unpacked. | `flow-landing/trial.html` install wizard; `flow-trial-extension/README.md` “Not on the Chrome Web Store.” Zip on this commit: `flow-landing/netlify/functions/download-trial-zip/flow-trial-extension.zip` (99,758 bytes). |
| Attach | Content script on `https://mail.google.com/*` only. No inbox crawl, no polling. A mutation observer debounces 400ms and judges the newest message in the open thread that is not the user’s own. | `manifest.json` content_scripts; `content-gmail.js` `scanReadingPane` |
| Gate | Nothing runs until the popup has a connected destination and the user has clicked Save & start (`onboarded: true`). Disconnecting tears the observer down. | `content-gmail.js` `init`; `popup.js` `wireSave` |
| Read | Visible text of that one message, quotes stripped at “On … wrote:”. Subject is used only to detect `Re:`. Attachments are not read on this path. | `judgment.js` `newContent`; `extract.js` |
| Score | Weighted signals, entirely in the tab. Chip only if score ≥ threshold (base 50, floor 38, cap 72). Clicks lower it by 4; dismissals raise it by 6 and decay over 7 days. | `judgment.js` |
| Speak | One chip inserted at the top of the message. Hebrew sentence, English **Do It** button, dismiss ×. | `content-gmail.js` `injectChip`, `heLead`; `chip.css` |
| Act | `flow:execute-action` → one writer. Success replaces the button with `Logged to {where} · {target}`, plus View (if a URL came back) and Undo. | `content-gmail.js` `showReceipt`; `background.js` `WRITERS` |
| Stay quiet | Below threshold, `evaluate` returns null. No badge, no popup, no “we looked.” The popup’s empty state says silence is normal. | `judgment.js`; `popup.html` |

Manifest description, version **0.6.0**: “puts one Do It button next to it that writes the record for you.”

There is no Calendar host permission, no Tasks host permission, and no writer that creates an event or an open task. `identity` is used only for the four OAuth connectors’ redirect (`chrome.identity.launchWebAuthFlow`).

### What one click writes

Every live title is a log line. Domain phrasing is “Log …”. The neutral fallback is also “Log …”. The Hebrew lead is always “Flow זיהה: לתעד …”.

| Destination | Catalog status | Can a user connect this build? | What the click creates | Undo |
|---|---|---|---|---|
| Notion | `live`, auth `token` | Yes, if they paste an internal integration token and a database that has been shared with that integration. Popup verifies the token before saving. | A new page. Title is the English label. Amount / date / email / URL columns are filled when names and types match; the rest goes in the body. Receipt: `Logged to Notion · {database title}`. | Archives the page (Notion has no hard delete). |
| HubSpot | `building` | No. `HUBSPOT_CLIENT_ID` is the literal `YOUR_HUBSPOT_CLIENT_ID`. Popup badge: **Needs setup**. Connect throws before any redirect. | Would create a Note on the Contact whose email matches the sender. | Deletes the note. |
| Salesforce | `building` | Same placeholder pattern. | Would create a Task on the matching Contact with `Status: 'Completed'` and `Subject` set to the log label. That is a closed activity, not an open task. | Deletes the Task. |
| Slack | `building` | Same, plus a channel id the user would paste after OAuth. | Would `chat.postMessage` one message. View link is null. | Deletes the message. |
| Monday.com | `building` | Same, plus a board id. | Would create an item and attach an update. | Deletes the item. |
| Pipedrive | `planned` | No button. | Nothing. | — |

Writers: `background.js` `WRITERS`. Placeholder guard: `connectHubspot` and the three siblings. Badge: `popup.js` `connectorCard` — anything not `planned`, not connected, and not `status: 'live'` renders **Needs setup**.

If HubSpot or Salesforce is someday connected and the sender is not already a Contact, the chip stops at `No matching contact for {email}.` There is no create-contact and no “copy the note” fallback (`content-gmail.js` `onDoIt`).

### The chip the user actually sees

For the lease sentence in `docs/product-architecture.md` §1.5 (“We're good at $3,900/mo for the 14th floor, signing Monday.”), sales domain, fresh threshold:

- Score **59**. Signals: too-short −25, money +34, commitment +30, date +12, reply +8.
- Body has no sales noun (`deal`, `contract`, `proposal`, …), so the domain title is **not** used.
- Record title: **`Log $3,900, Sep 7`** (`neutralTitle`).
- Chip sentence, every inbox, `dir=rtl`: **`Flow זיהה: לתעד $3,900, Sep 7 ב-Notion?`**
- Button label: **`Do It`**.
- After a successful Notion write: **`Logged to Notion · {database}`** with View and Undo.

The spec’s illustrated chip (`Do It: Log $3,900 confirmed, Sep 7 · Notion`) is not what this code renders. “Confirmed” is the sales title, and that title runs only when `entityWords` matches the **body**. The subject is not scored for domain. A countersigned contract that never says “contract” in the body is titled **`Log agreement executed`** even when the amount and date were extracted (corpus case “signed contract with value and date”, score 110). The Hebrew lead would still mention the amount, so the sentence next to the button and the page title disagree.

`chip.css` documents Hebrew-on-every-email as intentional, and English “Do It” as the one untranslated word. That is a product choice sitting on top of an English-first scorer (below).

### Why the popup cannot explain a chip

`judgment.js` says every signal has a user-facing `why` “so the popup can show you exactly why Flow spoke.” `content-gmail.js` stores `signals` only on the `shown` log entry. `popup.js` `renderLog` drops every `shown` row (“noise once the outcome is known”) and never reads `signals`. Activity shows the log label (`Log $3,900, Sep 7`), the kind (`clicked` / `written`), and a timestamp. Sensitivity is a readout of the learned threshold, not a control. Storage defaults say the user never sets that number (`storage.js`).

### Built, loaded, and not on the live path

These files ship inside the extension and the Gmail content-script list. `init()` does not call them.

| Surface | State on this commit |
|---|---|
| Sidebar, Local Privacy Shield badge, Draft-It, attachment hover card, “Log & Generate Next Step Document”, local `.docx` writer | `mountSidebar()` and `wireAttachmentHoverCards()` are commented out in `content-gmail.js`. Commit `c65523b` cut the sidebar and kept the chip. The comment says glance-assist is not reliably configured. |
| `glance-assist` | `MODEL = 'claude-opus-5'` with `TODO(owner): pick the model`. Missing `ANTHROPIC_API_KEY` returns HTTP 500: “This feature is not configured yet.” |
| Privacy Shield | Implemented in `privacyShield.js`. Nothing on the chip path calls it, because the chip path does not call a model. |
| Domain picker | Real, and it does change weights (+14 when a body noun matches) and the English title. It does not change what the click does. |
| `.glance` recipe export | Real. Carries domain id and connector id only. The marketing page’s “who else will use it” control does not call it. |
| Adaptive threshold | Real, including time-based dismissal decay. Corpus checks that three dismissals (threshold 68) fall back toward baseline after two quiet weeks (54.5). |

### Signup and the marketing “setup”

`trial.html` tells the visitor that four choices are **Required before signup** (connector, work type, starting caution, team) and that the picker “is the real extension popup.” The stylesheet comment at the picker calls it a mock stand-in. Submit posts only:

```text
{ email, lang: 'en', kind: 'trial' }
```

(`trial.html`, the `send-confirmation` fetch). Connector, domain, caution, and team size are not in the body. The extension’s real popup asks two questions (where to write, what work) and refuses Save until something is connected. There is no starting-caution control in the extension; calibration starts at zero clicks and zero dismissals. “Connect HubSpot” in install step 5 is the same **Needs setup** button as the other three OAuth connectors.

Inbox Scan (`missed-deadline.html`) is the only page that loads `assets/glance-engine.js`. That file’s header says it was last synced **2026-09-14** and that “the live demo on trial.html runs the real product.” `trial.html` does not load it. The mirror has no `COMMIT_HE` and no Hebrew letters. The extension’s `judgment.js` has seven Hebrew signal pairs, and `domains.js` has Hebrew nouns on **sales only**. So the public paste-box and the extension disagree on Hebrew mail, and the header points at the wrong page.

### Measured scores (fresh threshold 50)

| Mail | Domain | Score | Chip? | Title if it fired |
|---|---|---|---|---|
| Lease example in the product spec (“$3,900/mo … signing Monday”) | sales | 59 | Yes | `Log $3,900, Sep 7` |
| “Approved. Go ahead…” in a `Re:` thread | ops | 50 | Yes, on the line | `Log this decision` |
| Spec example: “We've decided not to renew past March…” | support | **8** (reply only) | No | — |
| Spec example: “I'm going to accept, can start June 2nd.” | hr | **25** | No | facts did extract June 2nd |
| “Can we meet Thursday… send a calendar invite” | ops | **26** | No | no date parsed from “Thursday at 2pm” |
| “Can you meet Monday to review the proposal?” | sales | **40** | No | “Monday” was not parsed. A weekday counts only after a scheduling word (`by`, `on`, `signing`, …). “signing Monday” in the lease example does parse. |
| “Can you confirm whether the proposal at $3,900 still works?” | sales | **79** | Yes | would title it as a confirmed amount. `confirm` is a commitment verb. |
| `ההסכם נחתם. עותק חתום מצורף.` | legal | **9** | No | executed signal is real; the too-short penalty eats it |
| `סוכם על 3900 ש״ח עד יום שני.` | sales | **25** | No | weekday parsed; **`ש״ח` is not a currency marker** (`₪`, `NIS`, `שקל` are) |
| `מאושר. אפשר להתקדם.` | ops | **25** | No | strong Hebrew approval, then the short-text penalty |

Corpus noise cases (cold pitch, newsletter, “thanks” over a quoted contract) stay silent. That part of the scorer is doing the job the comments describe.

---

## 2. Why it feels weak next to the Flow mechanic

The shared mechanic is watch → recognize → **act** → undo. Flow’s own pages describe the act as updating the systems of record: Salesforce, the matter file, a closing statement, a drafted email (`index.html` hero and the legal walkthrough). Glance’s act is a paste of the email into a notebook.

Three consequences a first-week user hits in order:

1. **Getting in is a developer install plus a Notion ritual.** Confirm email, unzip, `chrome://extensions`, Developer mode, Load unpacked, create an internal integration, share the database, paste token and URL, pick a domain, Save. The page calls this “a few clicks” and “set up in a minute.” The README’s Notion section is four steps before the extension will write, and a missed “Connections → Connect to” is a 404. Four of the five logos on the hero cannot be connected.
2. **Most real mail produces nothing, including mail the spec uses as the demo.** Renewal lost: score 8. Offer accepted: score 25. A meeting ask: 26 or 40. The popup then says staying quiet is the product working. Silence is the right behavior for newsletters. It is the wrong explanation when the worked examples never speak. The user cannot tell a calm inbox from a dead extension, which is the failure mode `judgment.js` already wrote down for a stuck threshold.
3. **When it does speak, the click does not move the work.** The decision is already in the sentence they are reading. Do It stores a copy. The Salesforce path, if it were connected, would file that copy as a **Completed** Task. Nothing is put on a calendar, assigned, staged, or sent. Undo proves the write happened; it does not prove the write was worth doing. The Hebrew lead makes an English inbox feel unfinished on top of that, because the only localized sentence is “shall I log this?”

Draft-It would have been a second action (a reply). It is unmounted because the model call is not safe to ship. Turning it back on while the function returns “not configured” and names `claude-opus-5` would make the product feel more broken, not stronger.

Glance can still be the one-minute taste of the mechanic. The taste has to be an action the user was about to do by hand. Logging is bookkeeping. A hold on Thursday, or a task that is still open, is the next minute of their job.

---

## 3. Ranked upgrades

Each one is scoped so it can ship without an enterprise install, a new OAuth app review, or remounting the sidebar. Rank is felt pain first, then how little new setup it adds.

### 1. Do It creates the next object

**Pain:** the click ends in `Logged to …`. **Friction:** a prefilled Google Calendar template needs no new permission and no client id. The extension already has a date, a subject, a quote, and a Gmail URL.

First slice: when the facts include a date (or a weekday the extractor already resolves), the chip’s primary action opens `https://calendar.google.com/calendar/render?action=TEMPLATE&…` with title, date, and the quote plus thread link in the details. The user confirms inside Google’s own page. View is that event. Undo is “don’t keep it” only after we have an event id; until then the chip should say the hold was opened, not pretend we wrote a record we cannot delete.

Second slice, still one Google account: an open task (Google Tasks), not a Salesforce Task marked Completed. That one needs OAuth. Do not block the calendar slice on it.

Keep Notion as a second destination for people who already connected it. Do not lead the install with it.

**Do not do in this slice:** meeting detection as a new ML model. The extractor already pulls weekdays (`עד יום שני` → a real ISO date in the probe) and English month names. “Thursday at 2pm” did **not** parse; teaching clock times is part of this slice, not a new product.

### 2. Show one reason, and show it on the first real mail

**Pain:** a chip that says “log this?” with no why, and days of silence that look like a crash. **Friction:** zero. The signal strings already exist.

- On the chip, under the action, one sentence from the top positive signal (`Someone authorised something outright`, `States a figure: $3,900`). Not the whole vector.
- In Activity, stop dropping the only row that carries `signals`, or copy `signals` onto the `clicked` / `written` row. The comment in `renderLog` and the comment in `judgment.js` currently contradict each other.
- First-run: if the user has been onboarded and the log has no `shown` entry, the popup should say “open a message that decides something” and include one canned example that scores above 50 (the lease sentence does). Do not invent a fake chip inside Gmail.

### 3. One-minute install, one destination

**Pain:** Developer mode plus four dead connectors. **Friction:** this is the friction.

- Chrome Web Store is the path that matches “download bar for every user.” `flow-trial-extension/docs/chrome-web-store-submission.md` already records that the store listing is not done. Until it is, the site should describe Load unpacked as what it is.
- Hide HubSpot, Salesforce, Slack, and Monday in the popup while `configured === false`. The write code can stay. A **Needs setup** button that throws “isn’t configured on this build yet” is a dead end the hero logos promised was a destination.
- Signup stores an email. Stop calling the mock picker required, and stop calling it the real popup. Either persist domain into the recipe the confirmation email already could point at, or delete questions 3–5.

PR #21 already moves the zip to a build artifact and the client ids to a config file. Land that; don’t fork it.

### 4. Chip copy follows the message; the title matches the chip

**Pain:** English mail, Hebrew “לתעד”, and a Notion title that dropped the amount the chip just announced. **Friction:** copy and title order, no new network.

- If the decisive sentence is Hebrew, keep the Hebrew lead. If it is English, the lead should be English. “Do It” can stay the button word; `chip.css` is right that the button is the brand mark.
- `neutralTitle` returns `Log agreement executed` before it considers money and date, so a signed contract loses the figure in the title. Put the amount and the date in the title whenever they were extracted. The Hebrew lead already does this.
- Sales / legal / finance titles should run when the **subject or the body** matches, not the body alone. The spec’s lease example fails the sales noun list, which is why it never became `Log $3,900 confirmed, Sep 7`.

### 5. Make the public sentences true

**Pain:** principle 2 in `docs/design-principles.md` — a named behavior has to be the behavior. **Friction:** copy. Do this in one pass across the pages in section 4, not one page per review.

Specific bar: “automatically” is false for Glance (Terms already say every write is a click). “Five destinations” is false on this build. “Draft-It” is false while the sidebar is unmounted. The two spec examples that score 8 and 25 should not be shown as chips until PR #24 has landed and the corpus covers them.

### 6. Hebrew mail has to clear the same bar the chip assumes

The chip speaks Hebrew to everyone. The scorer speaks Hebrew only partway.

- Commitment / obligation / handoff patterns exist (`COMMIT_HE` and six siblings). They are not in `glance-engine.js`. PR #23 regenerates that file; land it with the extension, not before the extension’s Hebrew behavior is the one you want public.
- Entity nouns are Hebrew on sales only (`עסקה`, `חוזה`, …). Legal, finance, ops, support, and HR are English-only, so a Hebrew contract does not get the +14 domain weight.
- Month names are English. Hebrew weekdays work (`עד יום …` / `ביום …`). Clock times do not.
- `ש״ח` (and the ASCII-quote variant `ש"ח`) is not in `MONEY_RE`. The probe `3900 ש״ח` extracted no money and stayed at 25. `₪` and `שקל` already work. This is a one-pattern gap; add it with a corpus row so a bare number still is not money.
- Short Hebrew approvals die on the −25 too-short penalty (`מאושר. אפשר להתקדם.` = 25; `ההסכם נחתם` = 9). PR #24 already measures this and changes the weights. Land that PR instead of a second scorer edit.
- `test/judgment-corpus.cjs` on this commit has no Hebrew cases. The public mirror cannot be checked against an inbox the chip is localized for.

### 7. A missing CRM contact should not end the click

Only after a connector is actually configured. Today the warn string is the end of the path. Offer two exits: create the contact and attach the note, or copy a ready-to-paste note. Do not add a third click of configuration to get there.

### 8. Leave the sidebar off

Draft-It, attachment X-ray, and the local `.docx` are a second product living in unmounted functions. Remounting them before `ANTHROPIC_API_KEY` is set shows the user “This feature is not configured yet.” That is a worse first week than a single honest chip. Revisit only after the model id is a real model and one masked round-trip has been exercised against production.

---

## 4. Bugs, missing value, messaging

### Bugs (the path runs, the result is wrong)

| What | Evidence on this commit | Already owned? |
|---|---|---|
| A question is written as a confirmed price. “Can you confirm whether the proposal at $3,900 still works?” scores **79** and takes the sales money title. `confirm` is in `COMMIT`. | Probe in this audit. | PR #24 |
| Worked examples in `docs/product-architecture.md` §1.5 do not clear 50. Churn example score **8**. “I'm going to accept, can start June 2nd.” score **25**. | Probe. The spec still draws chips for both. | PR #24 |
| Hebrew “signed” and Hebrew “approved, go ahead” stay under 50 because −25 too-short outweighs a real signal (scores 9 and 25). | Probe. | PR #24 |
| `ש״ח` is invisible to `parseMoney`, so a normal Israeli amount does not earn the +34 money weight. | `extract.js` `MONEY_RE` lists `₪`, `NIS`, `שקל`, not `ש״ח`. Probe score 25. | No. Smallest scoring fix not already in a PR. Add a corpus case; don’t sneak it into the engine mirror by hand. |
| Inbox Scan is a stale engine. Header claims a trial.html demo and a 2026-09-14 sync. No Hebrew. Sales nouns are English-only. | `glance-engine.js` header; `COMMIT_HE` absent. | PR #23 |
| Chip sentence and record title diverge on executed mail that also has money. Title becomes `Log agreement executed` and drops the figure the lead just showed. | `neutralTitle` checks `executed` before money. Corpus case score 110. | No. Title order, not a new signal. |
| Domain match ignores the subject, so the spec’s own lease sentence never receives the sales title. | `entityWords.test(text)` after `newContent`. Probe title `Log $3,900, Sep 7`. | No. Same title pass as the row above. |

Not bugs: the zip matches this tree’s chip (rebuilt in `4b17811`). OAuth client ids are placeholders, not leaked secrets. The sidebar being unmounted is deliberate.

### Missing value (the path is honest, and the outcome is thin)

| Gap | Why it makes Glance feel small |
|---|---|
| The successful click is a receipt. Notion page, HubSpot note, Slack message, Monday update, Salesforce **Completed** Task. | Nothing the user would have done next gets done. |
| No calendar, no open task. Meeting mail scores 26–40 and would still only log if it ever fired. | The cross-app taste never happens. |
| “Why” is computed and then hidden. | Trust was the reason the signals were named. |
| First session can be entirely silent, with copy that calls that success. | Reads as a broken install. |
| Four connectors are visible and unwired. Pipedrive is an honest “Planned”; the other four look half-built. | The user did the hard install and then hits Needs setup. |
| No-matching-contact is a dead end. | Matters the day OAuth is real. |
| Hebrew nouns on five of six domains, Hebrew months, and clock times are absent. The corpus does not lock any of this. | The localized chip over-promises a Hebrew inbox. |
| Signup choices are discarded. Caution cannot be set. Team size does nothing. | The “setup” on the site is not setup. |
| Draft-It / X-ray / docx orchestrator | Real code, not a user-facing action. Shipping them early adds a failure, not a capability. |

### Messaging mismatch (the site names a behavior the code does not have)

Principle 2. Same pattern on more than one page; fix the set together.

| Sentence | Where | What the code does |
|---|---|---|
| “records in Notion, HubSpot, Salesforce or Slack — automatically, with no data entry” | `trial.html` meta description, Open Graph, Twitter | A click, not automatic. Monday is in the hero and missing from the meta. HubSpot, Salesforce, and Slack cannot be connected. |
| “writes it straight into Notion, HubSpot, Salesforce, Slack, or Monday.com” | `trial.html` hero | Same. |
| “Catch these automatically” | `missed-deadline.html` closing CTA | Terms: “Glance never writes anything automatically.” |
| “get Glance so it happens automatically” | `almost-missed.html` | Same contradiction. |
| “This is the real extension popup.” | `trial.html` setup section | CSS comment: mock stand-in. Real popup is `popup/popup.html`, and it has no caution control and no team-size control. |
| “Required before signup” for connector, work, caution, team | same section | POST body is `{email, lang:'en', kind:'trial'}`. |
| “Set up in a minute… no field mapping” and install step 5 “connect Notion (or HubSpot)” | `trial.html` steps | Notion needs a token and a shared database. HubSpot shows Needs setup. |
| FAQ: Draft-It and the attachment summary are outbound calls | `trial.html` FAQ “Is my email sent to a server?” | Both UI entry points are unmounted. The function returns “not configured.” |
| Draft-It and attachment summary as live processors | `privacy.html` (Anthropic bullet and the Draft-It bullet) | Same. Privacy copy that describes an inactive path will be false in a review and confusing if a reviewer loads the extension. |
| “One connector active (Notion, HubSpot, Salesforce, Slack, or Monday.com)” | `pricing.html` Free tier | One connector can be active, and today that connector is Notion. |
| “Notion, HubSpot, Salesforce, Slack and Monday.com are included.” | `pricing.html` connector FAQ | The OAuth four are included as code and excluded as a working connect button. |
| Spec chips for the churn email and the “I accept, June 2nd” email | `docs/product-architecture.md` §1.5 | Scores 8 and 25. No chip. |
| Spec chip format `Do It: Log $3,900 confirmed, Sep 7 · Notion` | same file, lease example | Live chip is a Hebrew question plus an English Do It button. Title omits “confirmed”. |
| Engine header: the trial page runs this file | `assets/glance-engine.js` | Only `missed-deadline.html` loads it, and the file is behind `judgment.js`. |

`terms.html` is the accurate description: local read, one click, one authorized destination, nothing automatic. Point the other pages at that standard rather than at the homepage’s Flow sentences. Flow’s “updates Salesforce and your files automatically” is a different product and should stay on Flow pages.

---

## 5. Glance vNext — first-week success

A new user, non-sensitive work, Gmail already open in Chrome. Success is all of the following in the first week. If any one fails, the week failed even if the others held.

1. **Install without Developer mode.** They add Glance from the Chrome Web Store with the Google account already in the browser. No zip, no “Load unpacked,” no token pasted from a Notion developer page.
2. **One destination, connected in that same minute.** The destination does something they already do by hand (a calendar hold, or an open task). Notion is available, not required. They never see a connector whose button cannot succeed.
3. **The first real decision shows a chip in the language of that email.** Not a newsletter, not their own reply, not a question about a price. The chip states the next action and one reason (`States a figure`, `Someone authorised something`). Dismiss works and does not mute the extension forever (the 7-day decay already does this; don’t regress it).
4. **One click finishes a job outside Gmail.** A dated commitment becomes a calendar event they can see before they archive the thread, or an open task with the quote and the thread link. View opens that object. Undo removes it, or the chip does not say Undo until removal is real.
5. **The quiet days are explained.** The popup’s Activity line distinguishes “watched, nothing decided” from “not running.” A week with zero chips and zero explanation is a failure, even though most mail should stay quiet.
6. **The site they came from describes this loop and no other.** No Draft-It, no five live destinations, no “automatically,” no setup questions that are thrown away.

Explicitly out of this definition: shared team connectors, a weekly digest, SSO, an audit log, a sidebar model, Hebrew marketing parity beyond “the chip matches the message,” and any security or compliance claim. Those belong to Flow, or to Glance Pro after the product owner picks a Pro list (`docs/product-architecture.md` §2.4: Pro is not built).

---

## Related drafts (do not rebuild)

| PR | What it already covers |
|---|---|
| [#24](https://github.com/salisapan/realrtade/pull/24) | Scoring gaps this audit remeasured: silent spec examples, Hebrew approvals under the short-text penalty, a question logged as a confirmed price. |
| [#23](https://github.com/salisapan/realrtade/pull/23) | Regenerates `glance-engine.js` from the extension and points the header at Inbox Scan. |
| [#21](https://github.com/salisapan/realrtade/pull/21) | Install zip as a build artifact; OAuth ids moved out of the illusion that they are configured. |
| [#22](https://github.com/salisapan/realrtade/pull/22) | Env var documentation and a CI gate. Not a user-facing value change. |
| [#20](https://github.com/salisapan/realrtade/pull/20) | Engineering audit. Different document. |

This file is the value and pain ranking. It does not replace those diffs.
