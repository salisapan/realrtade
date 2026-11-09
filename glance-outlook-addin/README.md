# Glance Outlook add-in

Glance closes open loops. Gmail is where it starts today. This folder is the Outlook add-in for the web and for Outlook on iOS and Android. It is a local bundle. This change does not host it and does not deploy it.

## Build

```sh
node glance-outlook-addin/scripts/build-bundle.js
node glance-outlook-addin/scripts/pack.js
node glance-outlook-addin/test/addin.test.cjs
node glance-outlook-addin/test/behavior.test.cjs
```

`scripts/build-bundle.js` writes `dist/core-bundle.js` from `flow-trial-extension/core/`. `scripts/pack.js` lays the same files out under `dist/site/glance-outlook-addin/`, which is the path the manifest names. Nothing is uploaded.

The manifest id is `87851e39-e51b-439a-bbf5-459ab69b3615`. Command buttons for Outlook on the web are in VersionOverrides 1.0 and again in 1.1. The mobile read button is only in VersionOverrides 1.1, under `MobileFormFactor` / `MobileMessageReadCommandSurface`, with the 25, 32, and 48 pixel icons at scales 1, 2, and 3. There is no mobile compose surface.

## What the pane does

The pane reads the whole conversation through Microsoft Graph (`GET /me/messages`, `Mail.Read` only) or it shows no card. A failed page, a missing open message, a body it cannot read, or no sign-in is not replaced with the latest message.

On a message you are reading, including Outlook mobile, the card does not write. In a reply you are composing, **Insert draft** writes only after that click, then reads the body back. The receipt says it was read back. It does not say the loop is closed. Undo puts the previous body back and leaves the reply alone if you changed it. You press Send yourself. Nothing in this add-in sends.
