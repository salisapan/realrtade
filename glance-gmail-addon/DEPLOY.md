# Deploy Glance Gmail Add-on (test only)

Do not publish to the Google Workspace Marketplace. Do not merge this to
production from a test deploy. No Netlify step belongs in this deploy.

GCP project: **Flow Extension**, id `oceanic-spider-509610-c1`.

Test accounts:

- `salisapan1@gmail.com`
- `ai.local.flow@gmail.com`

The add-on reads the open message, creates a Gmail draft, a Task, and a
Calendar event. It does not request `gmail.send`.

## 1. APIs

In [Google Cloud Console](https://console.cloud.google.com/) select project
`oceanic-spider-509610-c1`.

**APIs & Services → Library**, enable:

- Gmail API
- Google Calendar API
- Google Tasks API
- Google Apps Script API

## 2. OAuth consent screen

**APIs & Services → OAuth consent screen.**

These two accounts are consumer Gmail accounts, so the screen is
**External** and stays in **Testing**. Do not push the app to production
and do not submit it for verification in this pass.

Add both addresses as **Test users**:

- `salisapan1@gmail.com`
- `ai.local.flow@gmail.com`

Add only these scopes (the consent screen will show Google's own
description of each one):

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/gmail.addons.current.message.readonly` | Read the message that is open |
| `https://www.googleapis.com/auth/gmail.compose` | Create and delete a draft |
| `https://www.googleapis.com/auth/tasks` | Create and delete a task |
| `https://www.googleapis.com/auth/calendar.events` | Create, move, and delete an event |

Do **not** add `gmail.send`, `gmail.modify`, `gmail.readonly`,
`https://www.googleapis.com/auth/calendar` (the full calendar scope),
`drive`, or `drive.file`.

`gmail.compose` is Google's draft scope. Its consent text may mention
sending. This add-on never calls send. If a later edit adds
`GmailApp.sendEmail`, `MailApp`, or `Drafts.send`, stop.

## 3. Apps Script project, linked to that GCP project

On the machine that will push, signed in as the owner account:

1. Enable the Apps Script API for that Google account:
   [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings)
2. `npm install -g @google/clasp` (or `npx @google/clasp`).
3. `clasp login` and approve as the owner.
4. From the repo root, copy the example and create the standalone script:

```sh
cp glance-gmail-addon/.clasp.json.example glance-gmail-addon/.clasp.json
cd glance-gmail-addon
npx clasp create --type standalone --title "Glance Gmail Add-on" --rootDir .
```

`clasp create` writes `scriptId` into `.clasp.json`. That file stays
uncommitted (it is gitignored).

5. Open the script: `npx clasp open`.
6. **Project Settings → Google Cloud Platform (GCP) Project → Change project.**
   Paste the **project number** of `oceanic-spider-509610-c1`.
   The number is on the Cloud Console dashboard for that project
   (`console.cloud.google.com/home/dashboard?project=oceanic-spider-509610-c1`).
   The field wants the number, not the id string.
7. Confirm the script now shows project `oceanic-spider-509610-c1`.

## 4. Push

From `glance-gmail-addon/`, after `node ../glance-gmail-addon/scripts/build-bundle.js`
if `CoreBundle.js` is older than the core (the committed bundle is already
built):

```sh
npx clasp push
```

`.claspignore` pushes `appsscript.json`, `CoreBundle.js`, and `Code.js`.
It does not push tests or this file.

If the editor then adds `https://www.googleapis.com/auth/calendar` because
the Calendar advanced service was enabled, delete that scope from
`appsscript.json` and push again. `calendar.events` is enough for
`Calendar.Events.insert`, `patch`, `list`, and `remove`.

**Services** (if they are not already on after the push): Calendar API v3
and Tasks API v1, matching `appsscript.json`.

Logo URL in the manifest: `https://theflow-ai.com/apple-touch-icon.png`.
If the editor rejects it, replace `logoUrl` with a public square PNG at
least 128×128. Do not deploy a site to host it.

## 5. Test deploy for both accounts

Still in the Apps Script editor. Do not open **Deploy → New deployment**
for the Marketplace, and do not open the Workspace Marketplace SDK.

1. **Deploy → Test deployments.**
2. Install the Gmail add-on as the script owner.
3. Share the Apps Script project (**Share**, editor is enough) with
   `salisapan1@gmail.com` and `ai.local.flow@gmail.com` if they are not
   the owner.
4. Each test user opens the test-deployment install link while logged into
   that account, accepts the four scopes, and installs.
5. Gmail on the web: open a real message. The Glance side panel shows
   either one **Do It** or **Nothing to close.**
6. Gmail on iOS and Gmail on Android, same account: open a message and
   open the add-on. The same card is the whole UI. There is no separate
   mobile build.
7. Click **Do It** on a message that names a meeting with a day and a
   time. Confirm a Calendar event exists, then **Undo** and confirm it is
   gone. Repeat once for a task and once for a draft. The draft is in
   Drafts. It is not in Sent.

A message you sent yourself can still show Do It. The add-on does not
have a mailbox-wide scope, so it cannot see the SENT label the Chrome
extension uses to skip your own mail.

## 6. What not to do

- Do not click **Publish** or **Publish to Workspace Marketplace**.
- Do not create a Marketplace listing, store screenshot set, or review
  submission.
- Do not add a Netlify build, redirect, or function for this add-on.
- Do not put a client secret in the repo. The add-on uses the user's
  Apps Script grant, not the Chrome extension OAuth client.
