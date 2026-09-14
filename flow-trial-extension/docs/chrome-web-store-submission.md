# Chrome Web Store submission — Glance

Everything below is drafted from the actual `manifest.json`, `README.md`, and
source (`src/background.js`, `src/privacyShield.js`, `src/sidebar.js`,
`src/content-gmail.js`) as of this doc's writing — nothing is invented.
Copy/paste text fields directly into the Developer Dashboard; the checklist
at the bottom tracks what still needs a human (screenshots, the dashboard
form itself, and the four connector `CLIENT_ID` placeholders).

## Store listing text

### Extension name
`Glance` (already set in `manifest.json`)

### Short description (max 132 characters)

```
When an email actually decides something, Glance writes the record for you — one click, five destinations, judgment on your device.
```

131 characters.

### Detailed description

```
Glance watches the Gmail message you already have open. It doesn't scan
your whole mailbox, doesn't need rules or triggers, and doesn't chat. When
a message actually decides something — a price is agreed, a deadline is
set, a deal closes — one Do It button appears next to it. Click it, and
Glance writes the record straight into Notion, HubSpot, Salesforce, Slack,
or Monday.com: the amount, the date, the sender, and the exact sentence
that decided it. Every write comes with an Undo.

Most emails produce nothing. That's the product working, not a bug —
Glance is built to stay quiet on price lists, newsletters, and automated
mail, and to speak up only when something real happened.

HOW JUDGMENT WORKS
The scoring that decides whether to show the Do It button runs entirely on
your device. It's a transparent, weighted scorer — not a black box, not a
language model — looking for a currency figure, a commitment verb, a dated
obligation, a direct request, a stated loss, and staying quiet on
automated-sender and mailing-list signals. No email text leaves your
machine to reach that decision. The threshold that decides "is this
confident enough to speak up" adjusts automatically as you click or
dismiss suggestions — no configuration screen, no rules to write.

FIVE WRITE PATHS, ALL UNDOABLE
Connect the one system your team actually uses:
• Notion — a page in the database you choose, columns matched by name and type
• HubSpot — a Note on the matching Contact
• Salesforce — a Task on the matching Contact
• Slack — one message to a channel you name
• Monday.com — one item on a board you name

Every write is additive only — nothing existing is ever edited or deleted
— and every write can be undone from the extension popup.

LOCAL PRIVACY SHIELD
Before any text reaches a write path or an AI-assisted feature (see below),
Glance's on-device Privacy Shield finds every name, company, monetary
amount, date, email address, and phone number in the message and replaces
each with a placeholder token.
A visible badge in the sidebar confirms this is active — it isn't a policy
promise, it's what the code does before anything is sent anywhere.

DRAFT-IT (opt-in)
Click Draft-It in the sidebar and Glance drafts a reply to the open thread,
matched to whether the thread is in English or Hebrew. Only masked
placeholder text — never a real name, company, amount, date, email
address, or phone number — is sent to generate the draft; the real values are substituted back in on your
device before you see it. Insert it directly into Gmail's reply box, or
ask for a redraft.

ATTACHMENT SUMMARY (opt-in)
Hover a .docx attachment on an open message and a card appears with a
one-line summary and the key facts (counterparty, effective date,
financial value, governing law). The file is read entirely on-device;
again, only masked placeholder text is sent to generate the summary. PDF
attachments aren't supported yet.

WHAT GLANCE NEVER DOES
Glance doesn't read your mailbox in bulk, doesn't send full email content
anywhere to decide whether to act, doesn't sell data, and doesn't use your
data to train any AI model. The only things that ever leave your device
are: (1) the exact fields you approve when you click Do It, sent directly
to the system you connected, and (2) for the two opt-in AI features above,
masked placeholder text only. Full detail: theflow-ai.com/privacy.html

Glance is free and general-purpose. It's a separate product from Flow
(theflow-ai.com), our enterprise workflow platform for organizations with
regulated or sensitive data — Glance carries none of Flow's compliance
guarantees and isn't intended for that kind of material.

Setup takes under a minute: connect where Glance should write, say what
kind of work you do, and open an email.
```

### Category
`Productivity`

### Single purpose description (required field, plain text, no formatting)

```
Glance's single purpose is to detect, on the user's device, when the
currently open Gmail message reflects a real decision (a commitment, a
price, a deadline, a stated loss) and, only when the user clicks an
on-screen button, write a short structured record of that decision into a
destination the user has explicitly connected (Notion, HubSpot,
Salesforce, Slack, or Monday.com). It does not do anything else: it does
not scan the mailbox in bulk, does not act automatically, and does not
serve any purpose unrelated to turning one open, user-selected email into
one user-approved record.
```

## Permission justifications (Privacy practices tab)

Chrome Web Store asks for a plain-language justification per permission.
Use these verbatim — each is traceable to the exact code that uses it.

| Permission | Justification |
|---|---|
| `storage` | Stores the user's chosen connector, line-of-work profile, sensitivity calibration, and the local activity log — entirely in `chrome.storage.local` on the user's own device (`src/storage.js`). Never synced to a Glance-owned server. |
| `identity` | Used only for `chrome.identity.launchWebAuthFlow()` to run the standard OAuth authorization-code flow for HubSpot, Salesforce, Slack, and Monday.com (`src/background.js`). The extension never sees the user's Google identity — this is OAuth for the *destination* system the user is connecting, not for Gmail access. |
| `host_permissions: https://mail.google.com/*` | The content script (`src/content-gmail.js`) runs only on Gmail to read the open message's visible text, subject, and sender, and to inject the Do It button / sidebar UI. |
| `host_permissions: https://api.hubapi.com/*` | Direct API calls to write a Note to HubSpot after the user clicks Do It, and to refresh the OAuth token. |
| `host_permissions: https://api.notion.com/*` | Direct API calls to create a page in the user's chosen Notion database after the user clicks Do It. |
| `host_permissions: https://*.salesforce.com/*` | Direct API calls to write a Task to Salesforce after the user clicks Do It (wildcarded because each Salesforce org has its own instance subdomain). |
| `host_permissions: https://slack.com/*` | Direct API call to post one message to the user's chosen Slack channel after the user clicks Do It. |
| `host_permissions: https://api.monday.com/*` | Direct API call to create one item on the user's chosen Monday.com board after the user clicks Do It. |
| `host_permissions: https://theflow-ai.com/*` | Calls Glance's own Netlify Functions for the OAuth token exchange/refresh step (which requires an application secret that cannot ship inside the extension) and for the two opt-in AI features (Draft-It, attachment summary), which only ever receive masked placeholder text. |

## Data usage disclosure (Privacy practices tab — data types collected)

Chrome Web Store requires checking which data categories the extension
handles and confirming each is disclosed in the privacy policy. Answer
based on what the code actually does:

| Category | Collected? | Notes |
|---|---|---|
| Personally identifiable information | **Yes** | Only the fields the user explicitly approves via Do It (sender name/email, extracted amount/date, one quoted sentence) — sent directly to the destination *they* connected, not to Glance. Draft-It / attachment summary send masked placeholder tokens only, never real PII. |
| Health information | No | — |
| Financial and payment information | **Yes** (narrow) | A monetary amount extracted from the open email, only when the user clicks Do It, sent only to their chosen connector. Masked before reaching Draft-It/attachment summary. |
| Authentication information | **Yes** | OAuth tokens for connected destinations, stored only in `chrome.storage.local` on the user's device; never transmitted to or stored by Glance. |
| Personal communications | **Yes** (narrow) | The open Gmail message's text is read locally to score it; only the fields above (never the full message) ever leave the device, and only on explicit click. |
| Location | No | — |
| Web history | No | — |
| User activity | **Yes** (aggregate only) | Anonymous product-usage events (a suggestion appeared/was clicked/dismissed, a write completed) tagged with a random per-install ID, no message content. |
| Website content | **Yes** (narrow, as above) | Same as Personal communications — the open message only, never bulk-scanned. |

Certification checkboxes this data supports:
- Not sold to third parties. ✅ (true — see privacy.html "what we do not do")
- Not used for purposes unrelated to the extension's single purpose. ✅
- Not used to determine creditworthiness or for lending purposes. ✅

Link the **Privacy policy URL** field to: `https://theflow-ai.com/privacy.html`

## Screenshots — what's needed and why this doc can't produce them

Chrome Web Store requires 1–5 screenshots, 1280×800 or 640×400 PNG/JPEG (no
alpha). These need a **real, signed-in Gmail account with the extension
actually loaded** — faking or mocking one would misrepresent the product,
which is both against Store policy and against this project's own
promise-must-match-reality standard. So this is the one piece of the
submission that has to happen outside this session. Recommended shots, in
priority order:

1. **The Do It chip on a real decided email** — open any email that states
   a price, deadline, or agreement; the chip should be visible next to the
   message. This is the single most important screenshot — it's the whole
   product in one frame.
2. **The extension popup, Setup tab** — showing the connector list and
   "what kind of work you do" picker (this one *can* be captured without
   Gmail, since it's just the popup UI — see note below).
3. **The written record** — a Notion page or Slack message right after a
   Do It click, showing the real fields that landed (amount, date, sender,
   quoted sentence).
4. **The Draft-It sidebar** — the drafted reply with Insert/Redraft buttons.
5. **The attachment X-ray hover card** — the summary + entity table over a
   `.docx` attachment.

**#2 is done.** `docs/screenshots/popup-setup-tab.png` is a real capture —
the extension was actually loaded unpacked into Chromium (via
`--load-extension`) and its live popup was screenshotted, so `chrome.storage`
and `chrome.runtime` are real, not stubbed; the extension ID that came back
(`dnjhplgmnkabbjogfpbhofjedlkehkai`) matches the one pinned in
`manifest.json` and baked into every connector's OAuth redirect URL in the
README, confirming that setup is still correct. It's 380×620 — Chrome Web
Store screenshots must be exactly 1280×800 or 640×400, so this is source
material to composite onto a listing-sized canvas (centered, with your own
background/framing), not something to upload as-is.

## Manifest notes confirmed correct (no action needed)

- **`manifest.json`'s pinned `key` field is intentional and correct** — it
  keeps the extension ID (`dnjhplgmnkabbjogfpbhofjedlkehkai`) stable across
  reloads and across the eventual Store listing, because that exact ID is
  baked into the OAuth redirect URLs already registered with HubSpot,
  Salesforce, Slack, and Monday.com (see `README.md`'s per-connector setup
  sections). **Do not remove this key before submitting** — removing it
  would let Chrome Web Store assign a different ID and break every
  connector's OAuth redirect.
- `chrome.tabs.create()` in `background.js` does not require the `"tabs"`
  permission (only reading cross-tab data would) — no permission gap there.
- Icons (16/48/128) are present and correctly sized.

## Still open — not something this doc can close alone

- [x] Screenshot #2 (popup Setup tab) — `docs/screenshots/popup-setup-tab.png`.
- [ ] Composite that screenshot onto a proper 1280×800 or 640×400 canvas.
- [ ] Capture the other 4 real screenshots above (need a live Gmail account).
- [ ] Fill in the Developer Dashboard form itself using the text above.
- [ ] The four connector `CLIENT_ID` placeholders in `src/background.js`
      (`HUBSPOT_CLIENT_ID`, `SALESFORCE_CLIENT_ID`, `SLACK_CLIENT_ID`,
      `MONDAY_CLIENT_ID`) are still unset — not a Store-submission blocker
      (Notion works with zero setup, and each OAuth connector degrades to
      a clear "Needs setup" state rather than failing silently), but worth
      finishing before the listing goes live so first-run users on those
      four connectors aren't stuck.
- [ ] Decide the release strategy: this project's earlier recommendation
      was a dual track — submit to the Web Store for the public listing,
      and keep documenting Load-unpacked in the README for anyone who
      wants an update before the next Store review completes (Store
      reviews apply to every version, not just the first).
