# Glance Gmail Add-on

One Do It on the open Gmail message: a Calendar event, a Google Task, or a
Gmail draft. If the message is not one clear close, the card says nothing
to close. Undo removes what that click wrote. The draft is never sent.

This is the same judgment as the Chrome extension (`flow-trial-extension/core/`).
Apps Script cannot import that folder, so `CoreBundle.js` is those files
plus a thin adapter, concatenated in one scope. The bundle runs in Google
Apps Script, not on the device, and it does not send the message to Flow.

Install and the GCP project checklist are in `DEPLOY.md`.

```sh
node glance-gmail-addon/scripts/build-bundle.js
node glance-gmail-addon/test/decide-corpus.cjs
```
