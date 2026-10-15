# Glance card inside Gmail

**Glance closes open loops. Gmail is where it starts today.**

## Product definition (vision-locked)

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect → carry → execute → true close. It stays silent when it is uncertain, never sends on your behalf, and counts a loop closed only on real completion or a deliberate release.

## Current implementation status

This folder is a Workspace card host for the open Gmail message, on the web and in the Gmail apps on iOS and Android. It is not the Chrome extension in `flow-trial-extension/`. v1 does one thing: when the open message is one clear task, the card shows the title, the due date if there is one, and one **Do it** button.

Do it creates one Google Task, then reads that task back. The card shows the id, title, and due from that read. If the read does not match, the card says **Couldn't confirm** and does not say the task was created. Undo deletes the task only when its title, due, etag, and updated time are still the values from that read. If you edited it, Undo says **The task was edited, so I won't undo it** and leaves the task alone.

Nothing in this host sends mail. There is no draft and no calendar write.

The card language follows the Gmail locale (`he` / `iw` → Hebrew, anything else → English). Hebrew lines carry right-to-left marks because Card Service has no direction setting.

## What the card will say

It speaks only for:

- an explicit ask: `please remember to`, `don't forget`, `תזכיר לי`, or `אל תשכח` at the start of the message (a short greeting in front is fine)
- or the shared classifier already in this repo (`flow-trial-extension/core/intent.js`, bundled into `CoreBundle.js`), and only when that plan is exactly one Google Task

A meeting, a reply, or a file ask stays quiet. This host will not turn those into a task.

The bundled classifier runs in Apps Script, in the Google account that installed the card. `src/remote.js` is the stub for the repo's `glance-assist` `classify` action. v1 does not call it: that endpoint expects masked text and a Pro licence, and this host does not mask or send the message there.

## Homepage and auto-surface

On the web, the contextual card runs when a message is open. If the side panel is already open, the next message shows the card without another install. On iOS and Android the person taps the card icon under the message. This host has no API that opens itself, and this commit was not installed on a phone.

The homepage shows the next pending action when a prefetch cache returns one. Set the script property `GLANCE_PREFETCH_URL` to an `https` address that returns `{ "next": { "title": "...", "due": "YYYY-MM-DD" } }`. Unset, the homepage says to open a message and makes no call. Watching the mailbox (`users.watch`) is not in v1: that scope is restricted, and this host does not ask for it.

## Scopes

- `https://www.googleapis.com/auth/gmail.addons.current.message.readonly`
- `https://www.googleapis.com/auth/gmail.addons.execute`
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/script.external_request` (only if a script property URL is set)
- `https://www.googleapis.com/auth/script.locale` (the card language follows the Gmail locale)

No `gmail.readonly`, `gmail.modify`, `gmail.compose`, or `gmail.send`.

## Tests

```sh
node glance-gmail-addon/scripts/build-bundle.js
node glance-gmail-addon/test/v1.test.cjs
```

Re-run the bundle script after changing `src/` or the classifier. `CoreBundle.js` is generated. Do not edit it.

## Deploy as a test deployment

Do not publish to the Workspace Marketplace. A test deployment can be installed by up to 100 test users of an unverified OAuth app. Those people see Google's unverified-app warning.

1. In Google Cloud Console, use the GCP project this account already uses for Glance (the October host used `oceanic-spider-509610-c1`). Enable the Gmail API, the Google Tasks API, and the Apps Script API.
2. OAuth consent screen: **External**, and leave it in **Testing**. Do not submit it for verification in this pass. Add the Google accounts that will install the card, up to 100. Add only the scopes listed above.
3. On the machine that will push, turn on the Apps Script API for that Google account at [script.google.com/home/usersettings](https://script.google.com/home/usersettings). Then `npm install -g @google/clasp` (or use `npx @google/clasp`) and `clasp login`.
4. From this folder:

```sh
cp .clasp.json.example .clasp.json
npx clasp create --type standalone --title "Glance" --rootDir .
```

`.clasp.json` holds the script id and stays uncommitted.

5. `npx clasp open`. **Project Settings → Google Cloud Platform (GCP) Project → Change project.** Paste the project **number** (not the id string).
6. `node scripts/build-bundle.js` if `src/` is newer than `CoreBundle.js`, then `npx clasp push`. The push sends `appsscript.json`, `CoreBundle.js`, and `Code.js`.
7. In the Apps Script editor: **Deploy → Test deployments**. Install from that dialog. Do not use **Deploy → New deployment** for the Marketplace, and do not open the Workspace Marketplace SDK.
8. Share the Apps Script project with each test account (editor is enough), and have each account open the test-deployment install link while logged into that account.

The unverified-app screen says Google has not verified the app. The test user chooses **Advanced**, then **Go to Glance (unsafe)**. That is expected while the consent screen stays in Testing. Do not click through it on an account that is not one of the 100 test users: Google will block it.

### Gmail on the web

Open a message. Open the side panel and choose Glance. The card is either one Do it, or nothing to close. Leave the panel open: the next message runs the same card. Do it on `Please remember to send the contract by Friday.` Confirm the task in Google Tasks matches the id, title, and due on the card, then Undo and confirm it is gone. Edit a task in Google Tasks and Undo again: the card must refuse, and the edited task must still be there.

### Gmail on iOS and Android

Same Google account. Open a message and tap the Glance icon under the message. The card does not open by itself. There is no separate mobile build. The same Do it, proof, and Undo are the whole UI.

## What not to do

- Do not publish, and do not create a Marketplace listing.
- Do not add a send call (`GmailApp.sendEmail`, `MailApp`, `Drafts.send`).
- Do not add `gmail.compose`, `gmail.modify`, `gmail.readonly`, or calendar scopes.
- Do not put a client secret in the repo. The card uses the person's Apps Script grant.
