# Glance store package

Glance closes open loops. Gmail is where it starts today.

This page is the package procedure for the current Chrome build. It is not a change to what Glance is. The zip is implementation status: a Manifest V3 package of `flow-trial-extension/` with the dev key, the HubSpot and Salesforce OAuth paths, and the debug hooks removed from the copy that gets zipped. The source tree is left as the unpacked load uses it.

Unlisted Chrome Web Store item: `lbihckfmoffgjjlnneoeaehbhoonfenh`.

## Produce the zip

From the repository root, on a clean commit:

```bash
python3 scripts/build-prod.py
```

That writes `dist/glance-<version>-<sha7>-prod.zip`.

- `<version>` is `manifest.json`'s `version`. The script does not invent one.
- `<sha7>` is the first 7 characters of `git rev-parse HEAD`.
- The same commit and the same tree write the same bytes (fixed zip timestamps, paths sorted). A dirty worktree still uses HEAD's sha and prints a warning, because that sha does not cover the uncommitted edits. Commit first, then build the zip you will upload.
- The build runs the same checks as `scripts/check-prod.py` and exits non-zero if a store rule breaks. To re-check an existing zip: `python3 scripts/check-prod.py dist/glance-<version>-<sha7>-prod.zip`.

CI (`.github/workflows/glance-prod-build.yml`) runs the same two commands on push and on pull request, and uploads the zip as the `glance-prod-zip` artifact. CI does not upload to the store.

The profile is the lite install set from `scripts/package_trial_extension.py`: the on-device model runtime is not in the zip while `config/hybrid.public.js` has `enabled: false`. If that switch is turned on, the store build refuses to run until the permission list is changed in the same commit.

## Upload

Upload is manual, by the owner, and only after the owner approves that zip.

1. Build the zip from the commit you intend to ship.
2. Open the Chrome Web Store developer dashboard for the Unlisted item `lbihckfmoffgjjlnneoeaehbhoonfenh`.
3. Upload `dist/glance-<version>-<sha7>-prod.zip` as a new package on that item. Do not create a second item. Do not upload from CI, and do not upload a zip this check has rejected.
4. Submit that package only after the owner has approved it.

The source `manifest.json` keeps its `key` so an unpacked reload stays on `dnjhplgmnkabbjogfpbhofjedlkehkai`. The store zip omits `key`. The item id already exists, so the installed id is `lbihckfmoffgjjlnneoeaehbhoonfenh`. Putting `key` back into the zip fails `scripts/check-prod.py`.

## OAuth

Two Google clients, and one Microsoft app registration. The store build does not swap client ids.

- **Google, Chrome-extension client** (`manifest.json` `oauth2.client_id`, used by `chrome.identity.getAuthToken`). This client must be bound to the store item id `lbihckfmoffgjjlnneoeaehbhoonfenh`. Binding it only to the unpacked id `dnjhplgmnkabbjogfpbhofjedlkehkai` makes sign-in fail for people who installed from the store. Do not put the Web client id into `oauth2.client_id`.
- **Google, Web client** (`WEB_OAUTH_CLIENT_ID` in `config/oauth.public.js`, used by `chrome.identity.launchWebAuthFlow` when browser sign-in is off). Both redirect URIs stay on that client: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` and `https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/`.
- **Microsoft.** The Entra app registration must list the store extension redirect `https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/`. The unpacked redirect `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` is the other id. The extension asks for `chrome.identity.getRedirectURL()`, which follows whichever id is installed.

## What the store zip keeps

`scripts/check-prod.py` fails the build if `permissions`, `host_permissions`, `optional_host_permissions`, or `oauth2.scopes` are not exactly these lists.

### permissions

| Permission | Why it stays |
|---|---|
| `storage` | Loops, the Google and Microsoft grants, and on-device learning live in `chrome.storage.local`. |
| `identity` | `chrome.identity.getAuthToken` for Google, and `launchWebAuthFlow` for the Google fallback and for Microsoft. |
| `sidePanel` | The Glance panel is the side panel (`popup/popup.html`). |
| `alarms` | The morning still-open alarm, and the follow-up alarm. |
| `notifications` | The morning still-open notification. Clicking it opens the panel. |
| `scripting` | Opt-in surfaces (WhatsApp Web, Slack, Telegram Web, Outlook on the web) are registered when the person turns that one site on, and removed when they turn it off. |
| `contextMenus` | Right-click "Glance: stay on this" on a selection. |

`offscreen` is not in the store manifest. Hybrid execution is off, the lite zip has no offscreen page, and `src/hybrid-sw.js` does not create one while `enabled` is false.

### host_permissions

| Host | Why it stays |
|---|---|
| `https://mail.google.com/*` | The Gmail content script reads the open message and draws the Do It card. |
| `https://tasks.googleapis.com/*` | Create and undo a Google Task after Do It. |
| `https://www.googleapis.com/calendar/*` | Create and undo a Calendar event after Do It, and the one read of events with a person on the invite when a loop is "pick a time". |
| `https://www.googleapis.com/drive/*` | `drive.readonly`. Do It searches that account's Drive for one high-confidence file. More than one match stays silent. |
| `https://www.googleapis.com/oauth2/*` | One call to tokeninfo reads the scopes already on the token, so a silence can say whether Drive read is granted. The access token is not stored. No new OAuth scope. |
| `https://www.googleapis.com/upload/drive/*` | `drive.file` only. Do It uploads a new file made from one company template, or creates a Doc, Sheet, or saved file. Undo deletes that new file. |
| `https://gmail.googleapis.com/*` | Create and undo a Gmail draft. Nothing is sent. |
| `https://theflow-ai.com/*` | Glance's own functions: a draft or an attachment summary the person asked for, the optional second reading of one masked sentence, and anonymous aggregate counts. |

### optional_host_permissions

Granted only after the person turns that surface on, and removed when they turn it off.

| Host | Why it stays |
|---|---|
| `https://web.whatsapp.com/*` | Opt-in, read-only, one-to-one chat. |
| `https://app.slack.com/*` | Opt-in, read-only, one-to-one direct message. |
| `https://web.telegram.org/*` | Opt-in, read-only, one chat with a person. |
| `https://graph.microsoft.com/*` | Outlook sync and the draft, task, calendar, and file writes the person asked for. Never `Mail.Send`. |
| `https://login.microsoftonline.com/*` | Microsoft sign-in and token refresh. |
| `https://outlook.live.com/*`, `https://outlook.office.com/*`, `https://outlook.office365.com/*` | The Do It card on the open Outlook message. |
| `http://127.0.0.1/*`, `http://localhost/*` | A model the person runs on this computer (Ollama or LM Studio), loopback only, and only after the precision test in the panel. |

### oauth2.scopes

One Google consent covers these, and no others:

| Scope | Why it stays |
|---|---|
| `https://www.googleapis.com/auth/tasks` | The Google Task a Do It creates. |
| `https://www.googleapis.com/auth/calendar.events` | The Calendar event a Do It creates. |
| `https://www.googleapis.com/auth/gmail.compose` | The Gmail draft a Do It creates. Glance does not send. |
| `https://www.googleapis.com/auth/drive.readonly` | The Drive search for one file. |
| `https://www.googleapis.com/auth/drive.file` | The new Drive file Glance itself creates. |

The store description is the manifest description. It must be 132 characters or fewer. The check fails the build when it is longer.

## What the store zip strips

The strip is applied to the packaged copy. `src/content-outlook.js`, `src/background.js`, `config/oauth.public.js`, and the source `manifest.json` are not edited by the build.

- `manifest.json` `key`.
- `offscreen` permission.
- HubSpot and Salesforce public client ids in the packaged `config/oauth.public.js`.
- HubSpot and Salesforce constants, connect/write/undo functions, status rows, and connect handlers in the packaged `src/background.js`. A connect message for those ids falls through to `connector-not-live`.
- `globalThis.__flowDiag` in the packaged Outlook page.
- `globalThis.__glanceE2e` in the packaged service worker. Headless tests inject that hook into the unpacked worker; the store copy calls `chrome.identity` only.
- The `glanceDebug`, `glance-debug`, `glanceOutlookFileTrace`, and `glance-outlook-file-trace` arms in the packaged Gmail and Outlook pages. The Outlook file-trace helper returns false, so a store install cannot arm it from storage.

`scripts/check-prod.py` greps the zip for those hooks, the HubSpot and Salesforce hosts and scopes, the client-id keys, and a `key` field. It also checks the description length and the permission lists above. `python3 scripts/check-prod.py --self-test` rejects a deliberately broken in-memory zip.

## Left in the zip on purpose

These are not HubSpot or Salesforce hosts, and removing them would change a path the product still runs. The check does not treat them as forbidden.

- **Slack and Monday.com OAuth code** in `src/background.js`, and their placeholder client ids in `config/oauth.public.js`. They are not on the setup screen (`mvp` is only Google), they have no `host_permissions` entry, and an empty placeholder client id refuses to start a handshake. The request for this package named HubSpot and Salesforce. `runOAuthFlow` is shared with Slack and Monday, so deleting only those two would have been a different edit than the HubSpot and Salesforce cut.
- **Notion.** A person can still hold a token they pasted. That writer is not an unused OAuth client.
- **`__glanceOutlookPage`.** The service worker calls it to rescan Outlook after an update. It is the reinjection handshake, not a diagnostic dump.
- **`outlookPageDiag`.** The silence log the panel already reads ("why not shown"). It is not a global hook.
- **`src/hybrid-sw.js`.** The offscreen calls stay in the file, behind `enabled: false`. The permission is absent and the page is not in the zip, so `createDocument` cannot run.
- **HubSpot and Salesforce rows in `core/connectors.js`.** Catalog text only. The store worker has no writer and no host for them. The setup screen does not show them (`mvp` is only Google).
- **Comments** in the packaged `src/background.js` and `src/content-gmail.js` that still say the names HubSpot and Salesforce. They are not hosts, scopes, client ids, or calls. The live functions those comments used to sit above are gone from the store copy.
- **The `Glance: file-trace` logger** in the Outlook page. The arms that turn it on are gone from the store copy, and `localFileTrace()` returns false.
