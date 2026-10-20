# WhatsApp Business Cloud API (phase 2)

Glance closes open loops. Gmail is where it starts today.

This page is a plan. Nothing in it is built, and nothing in it sends a message. The browser lane beside it reads a one-to-one chat the person already has open and can place a draft in the box. The person sends that draft. Phase 2 is a later path, through WhatsApp's business API, for a business number the person owns. It is not a way to drive the person's personal WhatsApp.

## What has to exist before any message can move

1. A Meta developer app, type Business, with the WhatsApp product added. The app is reviewed by Meta. The extension does not embed an app secret.
2. A Meta Business Manager that has passed business verification. An unverified business cannot send the template messages a business starts.
3. A phone number on the WhatsApp Business Cloud API. That number is not the person's personal WhatsApp. It has a display name Meta approves. Personal chats on web.whatsapp.com stay on the browser lane.
4. Message templates, submitted and approved, for anything the business sends first. A reply inside the 24-hour customer-care window can be a session message. Outside that window, only an approved template can start the conversation.
5. A webhook on Supabase, as an Edge Function, at a public HTTPS address. Meta calls it with a verify token on setup, and with `X-Hub-Signature-256` on each notice. The function checks that signature, stores the notice once (the same delivery can arrive twice), and does not put the token in the extension.

## What the webhook is allowed to do

The webhook receives a notice. It does not decide that a loop is closed, and it does not send a reply by itself. A draft, here as on the browser lane, is not a close. If a later build stores message content in Supabase, the privacy page changes in that same commit. Until then, message text stays on the device.

The access token for the Cloud API lives in the Supabase function's environment, never in the extension and never in this repository.

## What this plan does not include

- No webhook, no Meta app, and no template is created by this change.
- No automatic send, on the browser lane or on the Cloud API.
- The browser lane's hosts are optional permissions. Messenger and Instagram are the same kind of draft, still with no send.

## Disclosure still owed

The browser lane reads a calendar event's location (not its title) so it can draft a maps link, and it writes that draft into the chat box. The privacy page and the store listing still say that other apps never type, and that calendar reads return ids and times only. Those documents are open in other pull requests, so this change does not rewrite them. They have to say this plainly before the lane is offered outside review.
