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

The thread read asks for a Mail.Read token from `GlanceOutlookAuth`. That sign-in is not in this bundle, so the pane says it cannot read the whole thread yet.

## Sideload from a temporary HTTPS address

The committed `manifest.xml` stays on `https://theflow-ai.com`. This script does not edit `manifest.xml`, upload it, host it, or register an app.

```sh
node glance-outlook-addin/scripts/build-bundle.js
node glance-outlook-addin/scripts/pack.js
node glance-outlook-addin/scripts/test-manifest.js https://YOUR-TUNNEL.example
```

The script writes `glance-outlook-addin/dist/test-manifest.xml`. Every `SourceLocation`, task pane URL, icon URL, and `AppDomain` in that copy uses the origin you passed. `SupportUrl` stays on `https://theflow-ai.com/privacy`. It also copies `flow-landing/apple-touch-icon.png` to `glance-outlook-addin/dist/site/apple-touch-icon.png`.

Serve `glance-outlook-addin/dist/site` as the site root of that HTTPS address. These two addresses have to answer before Outlook will load the pane:

- `https://YOUR-TUNNEL.example/glance-outlook-addin/src/taskpane.html`
- `https://YOUR-TUNNEL.example/apple-touch-icon.png`

Sideload `dist/test-manifest.xml`. The copy at `dist/site/glance-outlook-addin/manifest.xml` is still the production manifest.

The pane loads `office.js` from Microsoft. With no Mail.Read token wired, the card says Glance cannot read the whole thread yet. Insert draft still runs only after a click in a reply you are composing, then reads the body back. You press Send.

### Outlook on the web

Unverified from this commit. These steps follow Microsoft's [Sideload Outlook add-ins for testing](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/sideload-outlook-add-ins-for-testing) for an add-in only manifest. They were not run on this commit.

1. Use a Microsoft 365 or Outlook.com account that can add a custom add-in. On-premises Exchange is a different path and was not tried.
2. Open https://aka.ms/olksideload. Outlook on the web opens the Add-ins for Outlook dialog.
3. Choose My add-ins. Under Custom Addins, choose Add a custom add-in, then Add from File, and select `dist/test-manifest.xml`. Microsoft documents Add from File for this dialog. Accept the prompts.
4. Open a message. Glance is on the message command surface. The pane can load from the tunnel. The card stays quiet until a Mail.Read sign-in exists.

### Outlook on iOS

Unverified from this commit. These steps follow Microsoft's [Test your Outlook add-in on mobile devices](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/test-mobile-add-ins). They were not run on a phone from this commit. Microsoft says an add-in is not sideloaded inside Outlook on iOS. Sideload it on the web for the same mailbox first.

1. The tunnel has to be reachable from the phone.
2. Sign in to Outlook for iOS with the same Microsoft 365 or Outlook.com account.
3. Open a message in read mode. Choose More options (three dots), then Glance.
4. The mobile command is read-only. There is no mobile compose surface.

A Microsoft 365 admin deploy and a Microsoft app registration are not part of this script and were not done.
