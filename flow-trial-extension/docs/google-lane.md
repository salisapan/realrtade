# Google lane (full flavor)

Glance closes open loops. Gmail is where it starts today.

This lane is the Google execution path: a calendar hold, a task, one Drive file, a Doc, one spreadsheet row, a contact lookup, and a compose window the person sends themselves. Preparation is not completion. A loop closes only when the write is read back, or when the person lets it go. Glance never presses Send.

## What Chrome loads today

Chrome loads `manifest.json`. That file is open on another change (0.9.56) and this lane does not edit it. The full flavor lives in `manifest.full.json`:

- `key` is the Chrome Web Store public key, so an unpacked load gets the extension id `lbihckfmoffgjjlnneoeaehbhoonfenh`.
- `oauth2.client_id` is `93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com`.
- Scopes are `openid`, `email`, `profile`, `drive.file`, `calendar.events`, `tasks`, and `contacts.readonly`. Docs and Sheets run on a file Glance created or the person picked. There is no `gmail.*` scope, no `drive.readonly`, and no documents or spreadsheets scope.
- The service worker entry is `src/google-lane-sw.js`, which imports the current worker and then the lane. `background.js` is not edited here.
- Compose is filled from `src/google-compose-page.js` on the Gmail page. The Gmail API is not used to draft or send.

Copying `manifest.full.json` over `manifest.json` waits until that other change has landed. Until then the unpacked id, the client, and the scope list in `manifest.json` stay as they are.

## Writes

Each write posts, reads the same id back, and only then builds a proof with `fetchedBack: true`. Undo deletes that id, trashes the file this lane created, or clears the one row. A miss stays unconfirmed. A filled compose carries `preview: true` and `closes: false`. It is not Handled.
