# Glance store package

Glance closes open loops. Gmail is where it starts today.

This page is the package procedure for the current Chrome build. It is not a change to what Glance is. The zip is implementation status: a Manifest V3 package of `flow-trial-extension/` with the dev key and the debug hooks removed from the copy that gets zipped. The source tree is left as the unpacked load uses it.

The first friends upload is the **outlook** flavor. That package asks for Outlook on the web, Microsoft Graph, and Microsoft login. It does not ask for a Google host, and it has no `oauth2` block. `--flavor full` is the package this page described before that correction: Gmail and the Google APIs stay, and Outlook stays optional.

Unlisted Chrome Web Store item: `lbihckfmoffgjjlnneoeaehbhoonfenh`.

## Produce the zip

From the repository root, on a clean commit:

```bash
python3 scripts/build-prod.py
python3 scripts/build-prod.py --flavor full
```

The first command is the friends build. It writes `dist/glance-<version>-<sha7>-outlook-prod.zip`. The second writes `dist/glance-<version>-<sha7>-prod.zip` and does not replace the friends zip.

- `<version>` is `manifest.json`'s `version`. The script does not invent one.
- `<sha7>` is the first 7 characters of `git rev-parse HEAD`.
- The same commit and the same tree write the same bytes (fixed zip timestamps, paths sorted). A dirty worktree still uses HEAD's sha and prints a warning, because that sha does not cover the uncommitted edits. Commit first, then build the zip you will upload.
- The build runs the same checks as `scripts/check-prod.py` and exits non-zero if a store rule breaks. To re-check: `python3 scripts/check-prod.py`. With no path, that checks every `dist/glance-*-prod.zip` against the allow-list its file name names. A path checks that one zip.

CI (`.github/workflows/glance-prod-build.yml`) builds both flavors and runs the check on push and on pull request, and uploads both zips as the `glance-prod-zip` artifact. CI does not upload to the store.

The profile is the lite install set from `scripts/package_trial_extension.py`: the on-device model runtime is not in the zip while `config/hybrid.public.js` has `enabled: false`. If that switch is turned on, the store build refuses to run until the permission list is changed in the same commit.

## Upload

Upload is manual, by the owner, and only after the owner approves that zip.

1. Build the zip from the commit you intend to ship. For the friends install, that is the outlook zip.
2. Open the Chrome Web Store developer dashboard for the Unlisted item `lbihckfmoffgjjlnneoeaehbhoonfenh`.
3. Upload `dist/glance-<version>-<sha7>-outlook-prod.zip` as a new package on that item. Do not create a second item. Do not upload from CI, and do not upload a zip this check has rejected.
4. Submit that package only after the owner has approved it.

The source `manifest.json` keeps its `key` so an unpacked reload stays on `dnjhplgmnkabbjogfpbhofjedlkehkai`. The store zip omits `key`. The item id already exists, so the installed id is `lbihckfmoffgjjlnneoeaehbhoonfenh`. Putting `key` back into the zip fails `scripts/check-prod.py`.

## OAuth

The friends zip has no Google `oauth2` block, so it does not request Gmail, Drive, Tasks, or Calendar scopes. Microsoft sign-in still uses `chrome.identity.launchWebAuthFlow` and `chrome.identity.getRedirectURL()`.

- **Microsoft.** The Entra app registration must list the store extension redirect `https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/`. The unpacked redirect `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` is the other id. The extension asks for `chrome.identity.getRedirectURL()`, which follows whichever id is installed.
- **Google, full flavor only.** Two clients, and the store build does not swap client ids. The Chrome-extension client (`manifest.json` `oauth2.client_id`, used by `chrome.identity.getAuthToken`) must be bound to the store item id `lbihckfmoffgjjlnneoeaehbhoonfenh`. Binding it only to the unpacked id makes sign-in fail for people who installed that flavor from the store. Do not put the Web client id into `oauth2.client_id`. The Web client (`WEB_OAUTH_CLIENT_ID` in `config/oauth.public.js`) keeps both redirect URIs: `https://dnjhplgmnkabbjogfpbhofjedlkehkai.chromiumapp.org/` and `https://lbihckfmoffgjjlnneoeaehbhoonfenh.chromiumapp.org/`.

## Outlook flavor (the friends zip)

`scripts/check-prod.py` fails this zip unless `permissions`, `host_permissions`, and `optional_host_permissions` are exactly these lists, and unless `oauth2` is absent.

### permissions

| Permission | Why it stays |
|---|---|
| `storage` | Loops, the Microsoft grant, and on-device learning live in `chrome.storage.local`. |
| `identity` | `launchWebAuthFlow` for Microsoft sign-in. |
| `sidePanel` | The Glance panel is the side panel (`popup/popup.html`). |
| `alarms` | The morning still-open alarm, the follow-up alarm, and the Outlook session keep-alive. |
| `notifications` | The morning still-open notification. Clicking it opens the panel. |
| `scripting` | Outlook on the web is registered from the service worker. WhatsApp Web, Slack, and Telegram Web register only after the person turns that one site on. |
| `contextMenus` | Right-click "Glance: stay on this" on a selection. |

`offscreen` is not in the store manifest. Hybrid execution is off, the lite zip has no offscreen page, and `src/hybrid-sw.js` does not create one while `enabled` is false.

The friends manifest does not declare a Gmail content script. A content-script match is a host grant. Outlook's page script is registered from `SURFACES` when Outlook is on. The packaged worker carries the shared engine list for that registration, because the manifest no longer has `content_scripts`.

### host_permissions

| Host | Why it stays |
|---|---|
| `https://outlook.live.com/*`, `https://outlook.office.com/*`, `https://outlook.office365.com/*` | The Do It card on the open Outlook message. Required on this flavor. |
| `https://graph.microsoft.com/*` | Outlook sync and the draft, task, calendar, and file writes the person asked for. Never `Mail.Send`. |
| `https://login.microsoftonline.com/*` | Microsoft sign-in and token refresh. |
| `https://theflow-ai.com/*` | Glance's own functions: a draft or an attachment summary the person asked for, the optional second reading of one masked sentence, and anonymous aggregate counts. This is not a Google host. |

No `mail.google.com`, `googleapis.com`, or `gmail.googleapis.com` host. No `oauth2` block, so no Tasks, Calendar, Gmail, or Drive scope.

### optional_host_permissions

Granted only after the person turns that surface on, and removed when they turn it off.

| Host | Why it stays |
|---|---|
| `https://web.whatsapp.com/*` | Opt-in, read-only, one-to-one chat. |
| `https://app.slack.com/*` | Opt-in, read-only, one-to-one direct message. This is not the Slack OAuth writer. That writer is removed from this flavor. |
| `https://web.telegram.org/*` | Opt-in, read-only, one chat with a person. |
| `http://127.0.0.1/*`, `http://localhost/*` | A model the person runs on this computer (Ollama or LM Studio), loopback only, and only after the precision test in the panel. |

## Full flavor

`python3 scripts/build-prod.py --flavor full` keeps the previous allow-list. `oauth2` stays, with these scopes and no others: `tasks`, `calendar.events`, `gmail.compose`, `drive.readonly`, `drive.file`.

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
| `https://theflow-ai.com/*` | Glance's own functions, as in the outlook flavor. |

### optional_host_permissions

WhatsApp, Slack, and Telegram, as above, plus `https://graph.microsoft.com/*`, `https://login.microsoftonline.com/*`, the three Outlook web hosts, and `http://127.0.0.1/*` with `http://localhost/*`. On this flavor those Microsoft hosts are optional. On the friends flavor they are required, and they are not repeated here as optional.

`permissions` are the same seven as the outlook flavor. The store description is the manifest description. It must be 132 characters or fewer. The check fails the build when it is longer.

## What the store zip strips

The strip is applied to the packaged copy. `src/content-outlook.js`, `src/background.js`, `config/oauth.public.js`, and the source `manifest.json` are not edited by the build.

Both flavors:

- `manifest.json` `key`.
- `offscreen` permission.
- HubSpot and Salesforce public client ids in the packaged `config/oauth.public.js`.
- HubSpot and Salesforce constants, connect/write/undo functions, status rows, and connect handlers in the packaged `src/background.js`. A connect message for those ids falls through to `connector-not-live`.
- `globalThis.__flowDiag` in the packaged Outlook page.
- `globalThis.__glanceE2e` in the packaged service worker. Headless tests inject that hook into the unpacked worker; the store copy calls `chrome.identity` only.
- The `glanceDebug`, `glance-debug`, `glanceOutlookFileTrace`, and `glance-outlook-file-trace` arms in the packaged Gmail and Outlook pages. The Outlook file-trace helper returns false, so a store install cannot arm it from storage.
- The page's reads and writes of `outlookPageDiag`. The panel and the worker still hold that log. The page cannot reach it.

Outlook flavor only:

- The `oauth2` block, every Google host, and the Gmail content-script match.
- Slack and Monday public client ids, and their OAuth connect/write/undo functions. `runOAuthFlow` goes with them. Outlook does not use that handshake.
- The Notion token writer (`NOTION_API`, connect, write, undo).

`scripts/check-prod.py` greps the zip for the dev hooks, the HubSpot and Salesforce hosts and scopes, and the client-id keys. On the outlook flavor it also greps for the Slack, Monday, and Notion writer strings above, and it rejects a Google host, a Google content-script match, or an `oauth2` block. It checks the description length, the permission lists, and that `outlookPageDiag` is absent from `src/content-outlook.js` while `__glanceOutlookPage` is still there. `python3 scripts/check-prod.py --self-test` rejects a deliberately broken in-memory zip, including a full package named as the outlook zip.

## Left in the zip on purpose

These are not HubSpot or Salesforce hosts. The check does not treat them as forbidden.

- **`__glanceOutlookPage`.** The service worker calls it to rescan Outlook after an update. It is the reinjection handshake, not a diagnostic dump.
- **`src/hybrid-sw.js`.** The offscreen calls stay in the file, behind `enabled: false`. The permission is absent and the page is not in the zip, so `createDocument` cannot run.
- **HubSpot and Salesforce rows in `core/connectors.js`.** Catalog text only. The store worker has no writer and no host for them. The setup screen does not show them (`mvp` is only Google).
- **Comments** in the packaged `src/background.js` and `src/content-gmail.js` that still say the names HubSpot and Salesforce. They are not hosts, scopes, client ids, or calls. The live functions those comments used to sit above are gone from the store copy.
- **The `Glance: file-trace` logger** in the Outlook page. The arms that turn it on are gone from the store copy, and `localFileTrace()` returns false.
- **Google writer functions, outlook flavor.** Tasks, Calendar, Gmail draft, and Drive code stay in the packaged worker. They have no host permission and no `oauth2` grant, so a fetch to those hosts cannot succeed. Removing them would cut helpers the Outlook path still calls. The allow-list is what makes them unreachable.
- **Slack and Monday OAuth, and the Notion writer, full flavor only.** They are not on the setup screen. An empty placeholder client id refuses to start a Slack or Monday handshake. The friends zip removes them. The full zip keeps them, because that flavor is today's package.
- **`outlookPageDiag` in `src/storage.js` and `src/outlook.js`.** The panel still reads the log. The packaged Outlook page does not get or set that key.
