# Official Messenger and Instagram

Glance closes open loops. Gmail is where it starts today.

This page is the owner setup for one lane: Facebook Messenger and Instagram direct messages through Meta's official APIs only (Messenger Platform and Instagram Messaging on the Graph API). It is code, behind two switches that are off. It is not live. Nothing in this change creates a Meta app, registers a webhook, buys anything, opens an account, or deploys.

The page lanes that read messenger.com and instagram.com are a different path. This lane does not use them, and it does not revive the frozen unofficial drafts (PRs #225 and #218).

## What the code does today

With stubs and unit fixtures, all of this runs. With a real Meta app, none of it runs until the steps below are done.

- A webhook POST is accepted only when `X-Hub-Signature-256` matches the raw body and `META_APP_SECRET`. A wrong or missing signature is refused. The response does not contain the message text.
- A webhook GET answers Meta's challenge only when `GLANCE_META_OFFICIAL` is exactly `1` and `META_VERIFY_TOKEN` matches. Otherwise the endpoint is 404, so a handshake cannot finish by accident.
- An inbound text ask (Messenger `object: page`, Instagram `object: instagram`) can become one card. Echoes, delivery receipts, and text that is not an ask stay quiet.
- The card shows the reply. Do It is the one approval. The approved text is what would be sent. Nothing is sent on arrival, and nothing is sent without that click.
- Handled only when Graph returns a message id and a read-back of that id carries the same text (`fetchedBack: true`, system `meta/messenger` or `meta/instagram`).
- Undo does not call Meta. The card says a sent reply stays sent, because the Send API has no unsend.
- Sends stay inside 24 hours of the inbound message (`messaging_type: RESPONSE` on Messenger). Older than that, nothing is sent.
- The extension never holds the page token and never calls `graph.facebook.com`. The relay on `theflow-ai.com` would. The manifest is unchanged.

What does not work until a later owner approval: a live webhook does not yet keep the message. There is no durable store. The card reads `glanceMetaOfficialInbox` on the device. Tests seed that list. A live event is verified and then dropped, on purpose, until a store is approved. The extension also needs `glanceMetaOfficialRelaySecret` (16 characters or more, the same value as `GLANCE_META_READ_SECRET`) or it will not call the relay.

## Switches

| Switch | Where | Default |
|---|---|---|
| `glanceSwitches.META_OFFICIAL_MESSAGING` | extension Labs | off (missing key is off; a store install stays off) |
| `GLANCE_META_OFFICIAL` | Netlify env | empty. Only the exact value `1` turns the endpoint on |

Both are required. Turning either on, and any Netlify deploy, needs the owner's «מאשר».

## Owner steps

Each step needs an explicit «מאשר». Do them in order. Do not paste real secrets into git. Placeholders live in `.env.example`.

1. **Meta app.** In Meta for Developers, create a Business app. Add the Messenger product and the Instagram product. Use a Facebook Page, and an Instagram professional account linked to that Page. This repo does not create the app.
2. **Business verification.** In Meta Business Manager, complete business verification. Advanced Access for messaging waits on this. This repo does not start it.
3. **Permissions, then App Review.** Request Advanced Access and submit App Review for:
   - `pages_show_list` (the Pages this person manages)
   - `pages_manage_metadata` (subscribe the Page to webhooks)
   - `pages_messaging` (Messenger send and receive)
   - `instagram_basic` (the linked Instagram professional account)
   - `instagram_manage_messages` (Instagram messaging)
   Do not request permissions this lane does not use. App Review is a Meta form, not a code change.
4. **Tokens, still not in git.** Generate a Page access token for the Page. If Instagram uses a different token, keep that one separate. Put them only in the Netlify env:
   - `META_APP_SECRET` — App Secret, used only to check `X-Hub-Signature-256`
   - `META_VERIFY_TOKEN` — a long random string Meta will send back on the handshake
   - `META_PAGE_ACCESS_TOKEN` — the Page token
   - `META_INSTAGRAM_PAGE_TOKEN` — only if Instagram is not the same token
   - `GLANCE_META_READ_SECRET` — a random string of at least 16 characters; the extension must hold the same value before it may ask the relay to send
   - `META_GRAPH_VERSION` — optional, default `v21.0`
   - `GLANCE_META_OFFICIAL` — leave empty
5. **Webhook, only after «מאשר» to turn the endpoint on.** Callback URL: `https://theflow-ai.com/.netlify/functions/meta-official-messaging`. Verify token: the `META_VERIFY_TOKEN` value. Subscribe the Page to `messages`. Subscribe the Instagram account to `messages`. Echoes may arrive; the code ignores them. Registering this URL is a Meta dashboard action and a Netlify deploy. Both stay blocked until «מאשר». Until `GLANCE_META_OFFICIAL=1`, the URL answers 404 and Meta's handshake will fail, which is the safe state.
6. **A store for inbound messages.** Choose where a verified webhook is kept so the card can show it. Not built. Do not turn the lane on for a real person before this exists. The device key, once a store is writing it, is `glanceMetaOfficialInbox`.
7. **Privacy page and store text.** Not edited in this change. Proposed sentence, for a later «מאשר»: "If you turn on Messenger and Instagram through Meta's official API, Glance receives the message Meta sends to Glance and, only after you press Do It, sends the reply you approved. Glance does not send on its own. A sent reply cannot be taken back."
8. **Try it unpacked, still not live.** After the env is set, the deploy is approved, and the store from step 6 exists: in the extension's service worker, `chrome.storage.local.set({ glanceSwitches: { META_OFFICIAL_MESSAGING: true }, glanceMetaOfficialRelaySecret: '<the GLANCE_META_READ_SECRET value>' })`. Open `dev/meta-official.html` from the extension. A card means an ask is in the inbox. Do It sends. Undo will say Meta cannot take it back.

## What stays true

The locked product line is unchanged: Glance does not send on its own. This lane sends one reply only after Do It, and it stays off until the steps above are approved. Preparation is not Handled. Handled is the read-back. The page lanes remain read-only.
