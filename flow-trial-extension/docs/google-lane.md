# Google lane (full flavor)

Glance closes open loops. Gmail is where it starts today.

This lane is the Google execution path: a calendar hold, a task, one Drive file, a Doc, one spreadsheet row, a contact lookup, and a compose window the person sends themselves. Preparation is not completion. A loop closes only when the write is read back, or when the person lets it go. Glance never presses Send.

## What Chrome loads today

Chrome loads `manifest.json`. The full flavor lives in `manifest.full.json`. The live manifest now loads the compose filler on `mail.google.com` (`core/draft-reply.js`, `core/google-config.js`, `core/google-compose.js`, and `src/google-compose-page.js` before `src/content-gmail.js`). Those four files are Gmail-only, so Outlook does not load them a second time. The receipt says the compose was filled only after to, subject, and body are read back from the page. On a Reply that already has To, Subject, a signature, and quoted text, Glance inserts the draft above that signature and leaves the rest in place. The first keystroke stops a later fill. If that read-back is missing, the line is that the window is still empty. Undo of a file this lane created trashes it only when version and modifiedTime both still match, and headRevisionId matches when either side has it. The verify read waits 8 seconds and then aborts. A late response after that wait cannot trash the file. A changed version says it was edited and was left alone. A modifiedTime match with no version, a failed read, a timeout, or no snapshot says it could not be confirmed and was left alone. A sheet row is cleared only when the stored row still matches exactly. OAuth, the extension key, and the service-worker entry stay on the full flavor:

- `key` is the Chrome Web Store public key, so an unpacked load gets the extension id `lbihckfmoffgjjlnneoeaehbhoonfenh`.
- `oauth2.client_id` is `93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com`.
- Scopes are `openid`, `email`, `profile`, `drive.file`, `calendar.events`, `tasks`, and `contacts.readonly`. Docs and Sheets run on a file Glance created or the person picked. There is no `gmail.*` scope, no `drive.readonly`, and no documents or spreadsheets scope.
- The service worker entry is `src/google-lane-sw.js`, which imports the current worker and then the lane. The live worker imports `src/google-lane-host.js` once so the cards can reach the lane. The corpus loader drops that import before it evaluates the worker as a classic script.
- Compose is filled in the Gmail page DOM. The person edits it and presses Send. The Gmail API is not used to draft or send. Glance does not refill the window after the person types, and it does not watch the DOM to put its text back.

Copying `manifest.full.json` over `manifest.json` waits until that other change has landed. Until then the unpacked id, the client, and the scope list in `manifest.json` stay as they are.

## Writes

Each write posts, reads the same id back, and only then builds a proof with `fetchedBack: true`. Undo deletes that id, trashes the file this lane created, or clears the one row. A miss stays unconfirmed. A filled compose carries `preview: true` and `closes: false`. It is not Handled.
