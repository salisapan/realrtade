# Glance card inside Gmail

**Glance closes open loops. Gmail is where it starts today.**

## Product definition (vision-locked)

Glance is a system for unfinished intentions: what you asked someone for, what you promised, what someone asked of you. Its loop is detect → carry → execute → true close. It stays silent when it is uncertain, never sends on your behalf, and counts a loop closed only on real completion or a deliberate release.

## Current implementation status

This folder is a Workspace card host for the open Gmail message, on the web and in the Gmail apps on iOS and Android. It is not the Chrome extension in `flow-trial-extension/`. On the open message the card offers the same close the shared classifier plans, when this host can write it: one Google Task, one calendar hold, or a scheduled event plus its reminder. Each of those cards has one **Do it** button.

Do it creates that task, that event, or both, then reads each write back. The card shows the read. If a read does not match, the card says **Couldn't confirm** and does not say the write succeeded. A calendar hold that was just created is removed again when the reminder task cannot be confirmed. Undo deletes only when the read still matches. A task must still have the same title, due, etag, and updated time. An event must still have the same content hash (title, time, description, location, guests). No stored hash means Undo will not delete the event. If you edited it, Undo says **The task was edited, so I won't undo it** or **The event was edited, so I won't undo it**, and leaves the edit. A scheduled event and its reminder are undone together, or not at all.

Nothing in this host sends mail. There is no draft. The event has no guests.

The card language follows the Gmail locale (`he` / `iw` → Hebrew, anything else → English). Hebrew lines carry right-to-left marks because Card Service has no direction setting. The event title and the reminder title come from the mail. A Hebrew meeting is titled in Hebrew, for example `פגישה 22/10 14:00`. An English meeting keeps the short English label. Do it calls `ScriptApp.requireScopes` for the scopes that write needs and does not catch that exception, so Apps Script shows its own authorization prompt. Nothing is written until `calendar.events` and Tasks are granted. A timed event is a local time with no `Z`, plus the user's time zone, so 14:00 stays 14:00. With `useLocaleFromApp`, the card event's time zone is an object `{id, offset}`. That object is normalized to `id` before anything else. Then `userTimezone.id`, then the default calendar's zone, then the script zone. The value written is always a string. A failure to read the default calendar is logged and skipped; it does not add the full `calendar` scope. `appsscript.json` sets the script zone to `Asia/Jerusalem` only as that last fallback. An all-day event uses a date, and the end date is the next day. A task due is the same zone, as an RFC 3339 time. The read-back treats a local time and the same instant in that zone as one time.

## What the card will say

It speaks only for:

- an explicit ask: `please remember to`, `don't forget`, `תזכיר לי`, or `אל תשכח` at the start of the message (a short greeting in front is fine)
- or the shared classifier already in this repo (`flow-trial-extension/core/intent.js`, bundled into `CoreBundle.js`), when that plan is one Google Task, one calendar hold, or a schedule (one event plus one reminder task)

A reply or a file ask stays quiet. A calendar step is not rewritten into a task.

The bundled classifier runs in Apps Script, in the Google account that installed the card. `src/remote.js` is the stub for the repo's `glance-assist` `classify` action. v1 does not call it: that endpoint expects masked text and a Pro licence, and this host does not mask or send the message there.

## Homepage and auto-surface

On the web, the contextual card runs when a message is open. If the side panel is already open, the next message shows the card without another install. On iOS and Android the person taps the card icon under the message. This host has no API that opens itself, and this commit was not installed on a phone.

The homepage shows the next pending action when a prefetch cache returns one. Set the script property `GLANCE_PREFETCH_URL` to an `https` address that returns `{ "next": { "title": "...", "due": "YYYY-MM-DD" } }`. Unset, the homepage says to open a message and makes no call. Watching the mailbox (`users.watch`) is not in v1: that scope is restricted, and this host does not ask for it.

## Scopes

- `https://www.googleapis.com/auth/gmail.addons.current.message.readonly`
- `https://www.googleapis.com/auth/gmail.addons.execute`
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/script.external_request` (only if a script property URL is set)
- `https://www.googleapis.com/auth/script.locale` (the card language follows the Gmail locale)

No `gmail.readonly`, `gmail.modify`, `gmail.compose`, or `gmail.send`. No full `calendar` scope. If the Apps Script editor adds `https://www.googleapis.com/auth/calendar` when the Calendar service is enabled, delete that line and keep `calendar.events`.

## Tests

```sh
node glance-gmail-addon/scripts/build-bundle.js
node glance-gmail-addon/scripts/check-core-bundle.cjs
node glance-gmail-addon/test/v1.test.cjs
node glance-gmail-addon/test/build-stamp.test.cjs
```

Re-run the bundle script after changing `src/` or the classifier. `CoreBundle.js` is generated. Do not edit it.

### BuildSha (`dev` in git, real SHA only at deploy)

`BuildSha.js` and the trailing `// GLANCE_BUILD_SHA=…` line in `CoreBundle.js` stay **`dev`** in every commit. The homepage shows that value locally. A normal `node scripts/build-bundle.js` (or `npm run build`) syncs the bundle and keeps **`dev`**.

Right before `clasp push`, stamp the current git short SHA, verify, then push:

```sh
cd glance-gmail-addon
node scripts/build-bundle.js --deploy    # or: npm run deploy:stamp
node scripts/check-core-bundle.cjs --deploy
npx clasp push
```

`npm run predeploy` runs the deploy check (`check-core-bundle.cjs --deploy`) and fails if `BuildSha` is still `dev` or does not match `git rev-parse --short HEAD`. Do not commit the stamped files; run `node scripts/build-bundle.js` again after push to restore **`dev`** for the next change.

`check-core-bundle.cjs` (without `--deploy`) compares bundle sources and ignores the stamp line; it does not rewrite `BuildSha.js`.

## Deploy as a test deployment

Do not publish to the Workspace Marketplace. A test deployment can be installed by up to 100 test users of an unverified OAuth app. Those people see Google's unverified-app warning.

1. In Google Cloud Console, use the GCP project this account already uses for Glance (the October host used `oceanic-spider-509610-c1`). Enable the Gmail API, the Google Tasks API, the Google Calendar API, and the Apps Script API.
2. OAuth consent screen: **External**, and leave it in **Testing**. Do not submit it for verification in this pass. Add the Google accounts that will install the card, up to 100. Add only the scopes listed above.
3. On the machine that will push, turn on the Apps Script API for that Google account at [script.google.com/home/usersettings](https://script.google.com/home/usersettings). Then `npm install -g @google/clasp` (or use `npx @google/clasp`) and `clasp login`.
4. From this folder:

```sh
cp .clasp.json.example .clasp.json
npx clasp create --type standalone --title "Glance" --rootDir .
```

Copy `.clasp.json.example` to `.clasp.json` locally (gitignored); never commit a live `scriptId`.

5. `npx clasp open`. **Project Settings → Google Cloud Platform (GCP) Project → Change project.** Paste the project **number** (not the id string).
6. Sync and stamp, then push (see **BuildSha** above): `node scripts/build-bundle.js`, then `node scripts/build-bundle.js --deploy`, `node scripts/check-core-bundle.cjs --deploy`, then `npx clasp push`. The push sends `appsscript.json`, `CoreBundle.js`, `BuildSha.js`, and `Code.js`.
7. In the Apps Script editor: **Deploy → Test deployments**. Install from that dialog. Do not use **Deploy → New deployment** for the Marketplace, and do not open the Workspace Marketplace SDK.
8. Share the Apps Script project with each test account (editor is enough), and have each account open the test-deployment install link while logged into that account.

### Update an existing test deployment

A test deployment keeps the manifest it was installed with. `npx clasp push` updates the script project. An already installed card does not ask for a new scope until that deployment is updated and the account installs it again.

1. `appsscript.json` lists the Calendar advanced service under `dependencies.enabledAdvancedServices`: `userSymbol` `Calendar`, `serviceId` `calendar`, `version` `v3`. `oauthScopes` includes `https://www.googleapis.com/auth/calendar.events`. It does not include `https://www.googleapis.com/auth/calendar`.
2. `node scripts/build-bundle.js --deploy`, `node scripts/check-core-bundle.cjs --deploy`, then `npx clasp push`.
3. In the Apps Script editor, open **Project Settings** and confirm the Calendar advanced service is on (identifier `Calendar`, version `v3`). If the editor added the full calendar scope, delete `https://www.googleapis.com/auth/calendar` from `appsscript.json` and keep `calendar.events`, then push again.
4. **Deploy → Test deployments**. Update that test deployment, or delete it and create the test deployment again. Copy the new install link. An old link keeps the old manifest, so Gmail does not show a consent screen for `calendar.events`.
5. Each test account opens that link and accepts the consent screen. If no consent screen appears, that account is still on the previous deployment.
6. Open a message. **Executions** for `onGmailMessageOpen` shows one log line with `messageId`, `tokenCalled`, `tokenOk`, `subject`, `plainBodyLength`, `from`, `isSelf`, `speak`, `reason`, `planId`, and `calendarService`. `calendarService` false means the Calendar advanced service was missing in the project that ran; the card still offers, and Do it cannot create the event until the service is on. The log includes the subject and the plain-body length. It does not include the body.
7. A card that says **Couldn't read this message.** includes a short `diag` code: `no-event`, `no-token`, `bad-id`, `token`, `message`, `body`, `judge`, or `open`. **Nothing to close.** means the message was read and there was nothing to close. A mail you sent to yourself is still offered when there is something to close. A Gmail message id looks like `msg-f:` followed by digits.

The unverified-app screen says Google has not verified the app. The test user chooses **Advanced**, then **Go to Glance (unsafe)**. That is expected while the consent screen stays in Testing. Do not click through it on an account that is not one of the 100 test users: Google will block it.

### Gmail on the web

Open a message. Open the side panel and choose Glance. The card is either one Do it, or nothing to close. Leave the panel open: the next message runs the same card. Do it on `Please remember to send the contract by Friday.` Confirm the task in Google Tasks matches the id, title, and due on the card, then Undo and confirm it is gone. Edit a task in Google Tasks and Undo again: the card must refuse, and the edited task must still be there. On a mail whose subject is `פגישה ביום חמישי 22/10`, the card offers the scheduled event and its reminder, not "Nothing to close." Do it creates the all-day event and the task, and both ids on the card match what Google stored. Edit the event and Undo: the card refuses, and both the event and the task remain. On `Could we meet Thursday at 3pm?` the card says Calendar hold. Do it creates one 30-minute event and no task.

### Gmail on iOS and Android

Same Google account. Open a message and tap the Glance icon under the message. The card does not open by itself. There is no separate mobile build. The same Do it, proof, and Undo are the whole UI.

## What not to do

- Do not publish, and do not create a Marketplace listing.
- Do not add a send call (`GmailApp.sendEmail`, `MailApp`, `Drafts.send`).
- Do not add `gmail.compose`, `gmail.modify`, `gmail.readonly`, or the full `calendar` scope. The only calendar scope is `calendar.events`.
- Do not put a client secret in the repo. The card uses the person's Apps Script grant.
