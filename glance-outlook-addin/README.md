# Glance Outlook add-in

Glance closes open loops. Gmail is where it starts today. This folder is the Outlook add-in for the web and for Outlook on iOS and Android. It is a local bundle. This change does not host it and does not deploy it.

## Build

```sh
node glance-outlook-addin/scripts/build-bundle.js
node glance-outlook-addin/scripts/pack.js
node glance-outlook-addin/test/addin.test.cjs
node glance-outlook-addin/test/behavior.test.cjs
node glance-outlook-addin/test/item.test.cjs
```

`scripts/build-bundle.js` writes `dist/core-bundle.js` from `flow-trial-extension/core/`. `scripts/pack.js` lays the same files out under `dist/site/glance-outlook-addin/`, which is the path the manifest names. Nothing is uploaded.

The manifest id is `87851e39-e51b-439a-bbf5-459ab69b3615`. Command buttons for Outlook on the web are in VersionOverrides 1.0 and again in 1.1. The mobile read button is only in VersionOverrides 1.1, under `MobileFormFactor` / `MobileMessageReadCommandSurface`, with the 25, 32, and 48 pixel icons at scales 1, 2, and 3. There is no mobile compose surface.

## What the pane does

`GlanceOutlookAuth` is not in this bundle. A sideloaded pane reads the open message with Office.js (`item.body.getAsync`, subject, from, to, cc, conversationId). HTML from Outlook on the web is read as text before it is judged. A self-sent ask is still judged. An FYI stays quiet. That uses the manifest's existing `ReadWriteItem` permission. It does not call Microsoft Graph. The task pane is pinnable (`SupportsPinning` on the VersionOverrides 1.1 task pane action, not in 1.1's parent 1.0 block) and re-reads when the selected message changes. The compose ribbon button is the `MessageComposeCommandSurface` already declared in VersionOverrides 1.0 and 1.1. Outlook on the web supports that surface. A sideload can still place the button under Apps rather than on the visible ribbon. The manifest has no further element that forces the ribbon slot.

When a page does provide `GlanceOutlookAuth.getToken`, the pane still reads the whole conversation through Microsoft Graph (`GET /me/messages`, `Mail.Read` only) or it shows no card. A failed page, a missing open message, or a body it cannot read is not replaced with the latest message.

On the open message, **Insert draft** opens a reply form (`displayReplyForm`, or `displayReplyAllForm` when the message has Cc) and never sends. The form's body is the draft, and the card names the ask. Outlook replaces the default quoted body when that HTML is set. The message you were reading stays as it was. Undo leaves that message as it was. Close the reply to discard the draft. In a reply you are composing, the original is the quoted block Outlook on the web inserts (`appendonsend` / `divRplyFwdMsg`, or the From/Sent/To/Subject lines in English or Hebrew). If that block cannot be read, the pane uses the message it already read for the same conversation. **Insert draft** writes only after that click, then reads the body back. The receipt says it was read back. It does not say the loop is closed. Undo puts the previous body back and leaves the reply alone if you changed it. You press Send yourself. Nothing in this add-in sends.

The packed pane footer shows `Build` and the 12-character git SHA from the moment `pack.js` ran. The source file keeps the placeholder `Build dev`.

## Sideload from a temporary HTTPS address

The committed `manifest.xml` stays on `https://theflow-ai.com`. This script does not edit `manifest.xml`, upload it, host it, or register an app.

```sh
node glance-outlook-addin/scripts/build-bundle.js
node glance-outlook-addin/scripts/pack.js
node glance-outlook-addin/scripts/test-manifest.js https://YOUR-TUNNEL.example
```

`build-bundle.js` writes `dist/core-bundle.js`. `pack.js` writes `dist/site/`, which is the directory to serve. The footer in that copy is `Build` plus `git rev-parse --short=12 HEAD` (or `GLANCE_BUILD_SHA` when that variable is a 7 to 40 character hex string).

The test-manifest script writes `glance-outlook-addin/dist/test-manifest.xml`. Every `SourceLocation`, task pane URL, icon URL, and `AppDomain` in that copy uses the origin you passed. `SupportUrl` stays on `https://theflow-ai.com/privacy`. It also copies `flow-landing/apple-touch-icon.png` to `glance-outlook-addin/dist/site/apple-touch-icon.png`.

A Cloudflare quick tunnel is enough. It is a temporary HTTPS address for the files on this machine. It is not a deploy.

```sh
python3 -m http.server 8080 --directory glance-outlook-addin/dist/site
cloudflared tunnel --url http://127.0.0.1:8080
node glance-outlook-addin/scripts/test-manifest.js https://YOUR-NAME.trycloudflare.com
```

Serve `glance-outlook-addin/dist/site` as the site root of that HTTPS address. These two addresses have to answer before Outlook will load the pane:

- `https://YOUR-NAME.trycloudflare.com/glance-outlook-addin/src/taskpane.html`
- `https://YOUR-NAME.trycloudflare.com/apple-touch-icon.png`

Sideload `dist/test-manifest.xml`. The copy at `dist/site/glance-outlook-addin/manifest.xml` is still the production manifest.

The pane loads `office.js` from Microsoft. With no Mail.Read token in the bundle, the card reads the open message through Office.js. Insert draft opens a reply form, or writes into a reply you are composing, and reads that reply back. You press Send.

### Outlook on the web

A sideload of the previous manifest was tried on Outlook.com and rejected: each `DesktopSettings` had only `SourceLocation`, and Outlook reported that `RequestedHeight` was missing. This manifest puts `RequestedHeight` on the read form only. A successful sideload of this file has not been run.

1. Use a Microsoft 365 or Outlook.com account that can add a custom add-in. On-premises Exchange is a different path and was not tried.
2. On a consumer Outlook.com account, open https://outlook.live.com/mail/0/inclientstore and use My add-ins, then Custom, then Add from File. https://aka.ms/olksideload opens outlook.cloud.microsoft, which asks for a work or school sign-in. On a Microsoft 365 work or school account, https://aka.ms/olksideload opens the Add-ins for Outlook dialog.
3. Choose the generated `dist/test-manifest.xml`. Accept the prompts.
4. Open a message. Glance is on the message command surface. The pane loads from the tunnel. The footer shows the build SHA. The card reads that message. Insert draft opens a reply. You press Send.

### Outlook on iOS

Unverified from this commit. These steps follow Microsoft's [Test your Outlook add-in on mobile devices](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/test-mobile-add-ins). They were not run on a phone from this commit. Microsoft says an add-in is not sideloaded inside Outlook on iOS. Sideload it on the web for the same mailbox first.

1. The tunnel has to be reachable from the phone.
2. Sign in to Outlook for iOS with the same Microsoft 365 or Outlook.com account.
3. Open a message in read mode. Choose More options (three dots), then Glance.
4. The mobile command is read-only. There is no mobile compose surface.

A Microsoft 365 admin deploy and a Microsoft app registration are not part of this script and were not done.
