# Flow Trial — Phase 1 skeleton

The free, lean version of Flow: a Chrome extension that watches Gmail
passively and surfaces one `Do It` chip when it recognizes something worth
syncing to a connected system. No prompts, no if-this-then-that rules.

This is Phase 1 from the spec: everything that can be built and tested
without any external credentials. **The judgment engine is a stub** — see
"What's real vs. stubbed" below.

## Load it locally

1. `chrome://extensions` → enable Developer Mode → **Load unpacked** → select
   this folder.
2. Open `chrome://extensions`, click the Flow Trial icon to open the popup.
3. Check a connector (only **יעד הדגמה מקומי** is `live` right now — HubSpot
   is `building`, the rest are `planned` and disabled on purpose so the UI
   never promises a connector that doesn't exist yet), pick a domain, save.
4. Open Gmail, open any email whose text matches one of the demo triggers
   in `src/domains.js` (e.g. an email containing "סגרנו על 12,000 ₪" for the
   sales domain) — the chip should appear above the message.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| Extension shell, manifest, injection into Gmail | Real |
| Onboarding (connector checklist + domain picker), stored via `chrome.storage.local` | Real |
| Activity log (shown/clicked/dismissed) | Real |
| Chip rendering, dismiss, "done" state | Real |
| **Judgment** (`src/judgment.js`) | **Stub** — regex table per domain in `src/domains.js`, not a model call |
| **Connector write** (clicking the chip) | **Stub** — logs the click, does not call any real API |

## What Phase 2 replaces, and what it doesn't touch

Wiring in the real pipeline touches exactly two files:

- `src/judgment.js` — `evaluate()` becomes a message to `background.js`,
  which calls the two-stage judgment endpoint (cheap filter, then the model
  call on survivors) instead of running the regex table. **The function
  signature and return shape (`{ label, confidence, domain }` or `null`)
  stay identical**, so `content-gmail.js` does not change.
- `background.js` — the `flow:execute-action` handler gains a real
  authenticated call to whichever connector is selected, instead of logging
  a warning.

Adding a new connector or domain never touches the content script or the
judgment contract — it's a new entry in `src/connectors.js` / `src/domains.js`.

## Known fragility (by design, not an oversight)

Gmail's DOM has no public contract; the selectors in `content-gmail.js`
(`div[role="main"]`, `div[role="listitem"]`) are a best-effort reading of
the current structure. If Gmail changes it, the failure mode is "the chip
stops appearing" — never a wrong action, because judgment only ever reads
`innerText`, it never simulates a click inside Gmail.

## Still needed before this can go live (see the spec, §11)

- Decision on the first real connector (HubSpot recommended)
- Anthropic API key, wired into `background.js` via a Netlify function
  (reusing the existing `netlify/functions/` pattern in the main site repo)
- OAuth app registered with the chosen connector
- Chrome Web Store developer account, before submitting for review
