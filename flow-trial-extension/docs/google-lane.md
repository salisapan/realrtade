# Google lane (full flavor)

Glance closes open loops. Gmail is where it starts today.

This lane is the Google execution path: a calendar hold, a task, one Drive file, a Doc, one spreadsheet row, a contact lookup, and a compose window the person sends themselves. Preparation is not completion. A loop closes only when the write is read back, or when the person lets it go. Glance never presses Send.

## What Chrome loads today

Chrome loads `manifest.json`. That file is the only manifest. `options_ui` opens `lane-chat/enable.html`. The service worker is `src/background.js`. There is no second copy. The Gmail content script loads the compose files (`core/draft-reply.js`, `core/google-config.js`, `core/google-compose.js`, and `src/google-compose-page.js`) so a card can tell an open reply from none. They are Gmail-only, so Outlook does not load them. The receipt says the compose was filled only after to, subject, and body are read back from the page. On a Reply that already has To, Subject, a signature, and quoted text, Glance inserts the draft above that signature and leaves the rest in place. The first keystroke stops a later fill. If that read-back is missing, the line is that the window is still empty. Undo of a file this lane created trashes it only when version and modifiedTime both still match, and headRevisionId matches when either side has it. The verify read waits 8 seconds and then aborts. A late response after that wait cannot trash the file. A changed version says it was edited and was left alone. A modifiedTime match with no version, a failed read, a timeout, or no snapshot says it could not be confirmed and was left alone. A sheet row is cleared only when the stored row still matches exactly. The lane's allowed client and scopes live in `core/google-config.js`:

- The store id the lane expects is `lbihckfmoffgjjlnneoeaehbhoonfenh`.
- `oauth2.client_id` is `93977330357-aup7do27a71h8sfhq4h35pogslt92iid.apps.googleusercontent.com`.
- Scopes are `openid`, `email`, `profile`, `drive.file`, `calendar.events`, `tasks`, `gmail.compose` (reply drafts only, never send) and `drive.readonly`. There is no contacts scope. Docs and Sheets run on a file Glance created or the person picked, and there is no documents or spreadsheets scope.
- `src/google-lane-sw.js` imports `src/background.js` and then the lane. Chrome's service worker entry is `src/background.js`. That worker imports `src/google-lane-host.js` once so the cards can reach the lane. The corpus loader drops that import before it evaluates the worker as a classic script.
- With a reply open, compose is filled in the Gmail page DOM; the person edits it and presses Send. With no reply open, the draft is created in the thread through the Gmail drafts API (`core/google-drafts.js`), read back by its id, and Undo deletes it. Glance never sends. Glance does not refill the window after the person types, and it does not watch the DOM to put its text back.

## Writes

Each write posts, reads the same id back, and only then builds a proof with `fetchedBack: true`. Undo deletes that id, trashes the file this lane created, or clears the one row. A miss stays unconfirmed. A filled compose carries `preview: true` and `closes: false`. It is not Handled.

## Account, list, reopen, build stamp (PR #165 live gate)

- **Account.** The account the person consented to is recorded at Connect (`googleConnectedAccount`). Each candidate token's address is read from the Gmail profile (`core/google-account.js`). A Chrome token of another account is never used and never stored over the Connect token. A readable address that is not the recorded one refuses the write and the card names both addresses. An unreadable profile alone does not block a write.
- **List.** One list is ever made, titled `Glance`. `ensureGlanceList` in `src/google-lane-host.js` looks it up by title, makes it once when the account has none, and never creates on a failed read. A stored list id Google no longer knows is replaced by that lookup.
- **Rows come from Google.** The receipt rows and titles are built from the read-back response of the created event or task, not from what Glance sent.
- **A read-back that fails leaves nothing.** The event or task is deleted again; if the delete also fails, the ref is kept and the card offers Undo for it.
- **Reopen.** A receipt repainted from `glanceLaneUndo` is checked first: each stored id is read from Google with the connected account's token. A checkmark shows only when every id is returned. A missing id gives an honest "removed" row; no network or an unverified token gives "Can't verify" and no checkmark. Undo clears the stored record at once, and a partial receipt stays partial.
- **Build stamp.** `scripts/stamp_build.py` writes `version_name` (`<version>+<sha7>`) into the manifest and the sha7 into `core/build-stamp.js` when a build is cut (the install zip, or `--root DIR`). The committed tree stays unstamped. The service worker and every content script log `Glance build <sha7>`; the popup (Hebrew label, so the Hebrew-chrome lint holds) and the Why panel show it.
