# Glance CWS lean release candidate (2026-10-08)

Glance closes open loops. Gmail is where it starts today.

## Product definition (vision-locked)

**Glance closes open loops. Gmail is where it starts today.** Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is **detect → carry → execute → true close**. It starts in Gmail, the current primary entry surface, and executes through the places a close really happens (Google Tasks, Gmail drafts and Drive today; more surfaces later, only ever in service of closure). It stays silent when it is uncertain, never sends on your behalf, treats preparation as not completion, and counts a loop closed only on real completion or a deliberate release. Flow, the enterprise product, is separate.

This note does not change that definition. Pro and the paid store stay frozen (open-tasks rows 11 and 61). Nothing here was uploaded, merged, or deployed.

## Current implementation status (code reality)

This candidate packages the entry surface as it exists on this branch: a Chrome extension whose current primary surface is Gmail, built `--lean` for a free store listing. It is not a merge and not a store upload.

| | |
|---|---|
| Claude tip | `d34d5d79ff2e964779dde7a917b3c9a56537149b` (`d34d5d7`, "docs(glance): owner lock 2026-10-08 — broad, does everything (#117)", 2026-10-08). Branch `claude/install-uiux-pro-max-skill-a4agox`. This tip already contains the Google web-auth fallback that passed the live Gate in 0.9.39. Patch D was not applied. |
| Packaging commit | `997e541b998dddaeaebcaab319dbf346f7ea06ed` (`997e541`) on `cursor/cws-rc-lean-claude-tip` |
| Manifest version | 0.9.40 |
| Zip | `glance-0.9.40-997e541-cws-lean.zip` |
| Path | `/opt/cursor/artifacts/glance-0.9.40-997e541-cws-lean.zip` |
| Size | 1,030,485 bytes, 109 files |
| sha256 | `dffed33a1b9de6114b4df14e9622a3481b2e92e49c36e8908823edf7105bfb5a` |
| How | `python3 scripts/build_cws_zip.py --lean` (same entry as `flow-trial-extension/scripts/build-cws.sh --lean`). Lite profile. Unpacked `key` removed. `oauth2.client_id` swapped to the store Chrome-extension client. `picker/picker.js` replaced with a stub that loads nothing remote. `offscreen` and `'wasm-unsafe-eval'` dropped from the zip only. |
| Store description kept | 130 characters (limit 132): "Glance stays on what you are waiting on until it is closed, and closes what is asked of you in one click. Judgment on your device." Not rewritten to the 0.7.5 or 0.9.18 blurbs. |
| Prices | none in this package. `$14`, `$132`, and "14 a month" do not appear. |

The earlier 2026-10-08 RC (0.9.18 vs 0.9.33) and its section 9 (0.9.37 lean zip `glance-0.9.37-00cde2f-cws-lean.zip`) describe other trees. This file is the report for the zip above.

The repo `manifest.json` still declares `offscreen` and `'wasm-unsafe-eval'`. `test/hybrid-copy-corpus.cjs` requires that on the source manifest. Only the zip drops them. `config/hybrid.public.js` stays `enabled: false`.

## Patch C

`patch-C-pro-source.patch` applied with `git apply`. Every hunk matched. Nothing in the patch was rewritten.

What it changes:

- `flow-landing/netlify/functions/create-checkout/create-checkout.js`: checkout `source` metadata is one of `pricing-pro`, `pricing-pro-glance`, `pricing-pro-cap`. Anything else is stored as `other`. Default remains `pricing-pro`.
- `flow-landing/netlify/functions/verify-license/license.test.cjs`: covers glance, cap, and an unknown source stored as `other`.
- `flow-landing/pricing.html`: `?from=glance` and `?from=cap` select those sources.
- `flow-trial-extension/core/entitlements.js`: `PRICING_URL` is `https://theflow-ai.com/pricing.html?from=glance#glance-pro`.
- `flow-trial-extension/src/follow.js`: the cap card, when it offers Pro, opens that URL with `from=glance` swapped to `from=cap`.

This build then sets `FlowEntitlements.PRO_PUBLIC = false` on top of that URL. While that flag is false the cap card does not open it. The server function was not deployed. Netlify was not touched.

## Free-only check (`PRO_PUBLIC` off)

`core/entitlements.js` sets `PRO_PUBLIC = false`. The panel, the side panel (same `popup/popup.html`), the Gmail cap card, and the ladder draw no Pro card, no price, and no checkout or pricing link. There is no options page and no separate onboarding HTML in the zip. HTML pages in the zip: `popup/popup.html`, `picker/picker.html`.

Grep of the built zip: no `$14`, no `$132`, no "14 a month", no "132 a year". No remote `script.src`, `import()`, or `importScripts()`.

What was hidden for this build only, behind `PRO_PUBLIC === true`:

| Spot | What a person would have seen | What this build does |
|---|---|---|
| `popup/popup.html` `#proBlock` | "Glance Pro", the pitch, "Start free trial" / "Get Glance Pro", "I have a key", the GLNC key field | `hidden` on the block, plus `.pro-block[hidden]{display:none !important}`. `wirePro()` returns immediately and never unhides it, never fetches checkout, never calls `renderPro()`. |
| `popup/popup.js` cap lines (Stay on it, the active question, reopen) | "…or see Glance Pro." | Ends at "Close one first." |
| Waiting upsells (payments, 3 of 3) | Glance Pro pitch | Not written unless `proPublic()`. |
| Nudge and copy-nudge | Label "· Pro" and a "See Glance Pro" link | Label stays the free wording. Note: "The firmer follow-ups stay off. The friendly first nudge stays free." No link. |
| Ladder row | "See Pro" and "Pro has about N times…" / "Pro: about N a month…" | Button omitted. `ladderDetail()` strips those sentences before paint. `core/ai-ladder.js` `copy()` still returns them so the corpus stays honest; only the panel paints the stripped text. |
| Recurrence block when the account is not Pro | "Glance Pro shows what and when." | The block stays hidden. |
| Debrief when the free cap stops the rest | "The rest need Glance Pro…" | "The rest stay off until one of these closes (the free limit is 3 open loops)." |
| `src/follow.js` `capCard` | "See Glance Pro" opening `pricing.html?from=cap`, plus the Pro sentence | Title and the close-one-first line, and "Not now". No Pro sentence and no button. |
| `src/content-gmail.js` `aiErrorMessage` | `PRO_REQUIRED_MESSAGE` ("…part of Glance Pro. Open the Glance panel to start a free trial…") | "Draft-It and attachment summaries are not in this version." |
| `src/background.js` `proRequiredError` | "This is part of Glance Pro." | "This is not in this version." |

Strings that remain in the package and do not render while the flag is false:

- `OFFER_URL` (`https://theflow-ai.com/.netlify/functions/create-checkout`) is still a constant in `popup/popup.js`. `wirePro()` returns before any fetch.
- `PRICING_URL` is still in `core/entitlements.js`. It is opened only inside the `proPublic()` branches above.
- The Pro card markup is still in `popup/popup.html`, inside the hidden block.
- `describe()` still returns "Pro ended", "Pro trial", and "Pro". Those labels are used only by `renderPro()`, which this build does not call.
- A direct `flow:pro-activate` message can still answer "That does not look like a Glance Pro key…" or "No Pro key is activated on this device." No control in this build sends that message.
- `core/outside-signals.js` lists `paypal.com`, `stripe.com`, and `paddle.com` as payment-mail domains. They are not checkout links.
- The word "upgrade" in this zip is about a newer build replacing an older one, not a paid plan.

Paid model calls stay licence-gated on the server. Flipping the flag is the owner's switch when the paid store turns on (`docs/monetization.md`, open-tasks row 11).

`test/follow-gmail-harness.cjs` now expects a free account at 3 follow-ups to see "3 of 3 open loops" and not "Glance Pro" or "Stay on it". The harness was not executed here: Playwright is not installed (`SKIPPED: playwright not available`).

## Permissions against the published 0.7.5 zip

Baseline: the attached `glance-0.7.5-5173f11-cws.zip` (`manifest.json` inside that zip, version 0.7.5). OAuth scopes are identical: tasks, calendar.events, gmail.compose, drive.readonly, drive.file.

| Field | 0.7.5 zip | This lean zip | Difference |
|---|---|---|---|
| permissions | storage, identity, sidePanel, alarms, notifications | those, plus scripting, contextMenus | `offscreen` is not in this zip |
| host_permissions | mail.google.com, tasks.googleapis.com, www.googleapis.com/calendar/*, /drive/*, /upload/drive/*, gmail.googleapis.com, theflow-ai.com | those, plus `https://www.googleapis.com/oauth2/*` | one more path on `www.googleapis.com`, which 0.7.5 already has |
| optional_host_permissions | none | web.whatsapp.com, graph.microsoft.com, login.microsoftonline.com, `http://127.0.0.1/*`, `http://localhost/*`, outlook.live.com, outlook.office.com, outlook.office365.com | 8, granted only when a surface is turned on |
| content_scripts.matches | `https://mail.google.com/*` | the same | none |
| CSP `extension_pages` | `script-src 'self'; object-src 'self'` | the same | none (`'wasm-unsafe-eval'` is not in this zip) |
| oauth2.client_id | store client `…aup7do27a71h8sfhq4h35pogslt92iid…` | the same store client | the unpacked client is not in the zip |
| `key` | absent | absent | none |

### Warning diff

This machine could not measure warnings with `chrome.management.getPermissionWarningsByManifest`. Google Chrome 148.0.7778.96 logs `--load-extension is not allowed in Google Chrome, ignoring.` A headless dump of the extension page returned `ERR_BLOCKED_BY_CLIENT`. No Chromium or Chrome-for-Testing binary that accepts `--load-extension` was available. The list below is the rule-based prediction, not an API result from this run.

Chrome's published warning rules, which the 2026-10-08 RC measured on Chrome 154 as the same two strings for 0.7.5 and for a lean manifest with these same additions:

1. Read and change your data on a number of websites
2. Display notifications

Predicted difference versus 0.7.5: none.

- `scripting` and `contextMenus` have no "Warning displayed" entry.
- `https://www.googleapis.com/oauth2/*` is another path on a host 0.7.5 already declares. Host-permission paths are required and ignored for the warning.
- `optional_host_permissions` are granted at runtime, not at install or update.
- A CSP change would not be a permission warning. This zip's CSP matches 0.7.5 anyway.
- `offscreen` is absent here, so it cannot add a warning. It has no warning entry even when declared.

An update from the live 0.7.5 is not predicted to disable the extension for a new warning. Before any upload, the owner can still drag 0.7.5 and then this zip through Google's Extension Update Testing Tool. That check was not run here.

## OneDrive

The OneDrive checkbox asks Microsoft for delegated `Files.ReadWrite`, and only when that box is checked. `Files.Read` cannot write the one file. `Files.ReadWrite.All` is not requested. A mail does not search OneDrive. The Entra app must list delegated `Files.ReadWrite` or consent for that box fails.

This is a Microsoft consent scope, not a new Chrome host. `graph.microsoft.com` is already one of the optional hosts above. Default mail sign-in does not include this scope.

## What this zip contains that 0.9.37's lean zip did not

`src/google-web-auth.js` and `config/oauth.public.js` are in the package. The Web OAuth client `…gstvm1m1h1iet49uhgq212jfjqu11s8n…` is still the web client. The lean builder does not swap it. `launchWebAuthFlow` is the fallback when `getAuthToken` fails because browser sign-in is off, and the person did not cancel. Patch D was not needed on this tip.

`picker/picker.js` is the stub. It does not load `https://apis.google.com/js/api.js`. `src/offscreen.js` and `src/offscreen.html` are not in the zip.

## Corpora

All `flow-trial-extension/test/*-corpus.cjs` files, node, no network. 90 files.

| TZ | Result |
|---|---|
| `TZ=UTC` | pass=90 fail=0 |
| `TZ=Asia/Jerusalem` | pass=90 fail=0 |

`flow-landing/netlify/functions/verify-license/license.test.cjs` passed, including the patch C source checks (default `pricing-pro`, glance, cap, and an unknown value stored as `other`).

`test/follow-gmail-harness.cjs`: skipped, Playwright not available. The free-only assertion is in the source; it was not driven in a browser.
