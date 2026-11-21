# WhatsApp Cloud API setup (Flow inquiry bot)

Draft only. The bot is behind `WHATSAPP_BOT_ENABLED` (default off). Nothing here should be turned on, registered, or deployed until Sali approves a deploy. This document lists exactly what he must do or provide. Nobody else should create the Meta app, register the number, or paste tokens into chat.

## What Sali must do or provide

1. **Meta Business account, verified.** A Meta Business Manager account for Flow, with business verification completed. The WhatsApp Business Account (WABA) will live under this business.

2. **A Meta app with the WhatsApp product.** In Meta for Developers, a Flow app that has the WhatsApp product added. This is the app whose App Secret becomes `WHATSAPP_APP_SECRET`.

3. **The 019 number.** The dedicated Flow eSIM number (019), which:
   - is **not** registered on any WhatsApp or WhatsApp Business app;
   - can receive an SMS or voice OTP for Meta’s number registration;
   - will be registered as the WABA phone number once Sali starts that step (not before an approved deploy is actually needed).

4. **Display name "Flow".** The WhatsApp display name submitted for that number must be `Flow`.

5. **A payment method on the WABA.** Meta requires a payment method on the WhatsApp Business Account even though this bot does not send template or marketing messages. Session replies inside the 24-hour customer-service window are the only sends the code will make.

6. **A permanent System User token, stored as a secret.** Create a System User in Business Manager, grant it access to the WABA, and generate a permanent token with:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`

   Enter that token as the Netlify (or host) secret `WHATSAPP_ACCESS_TOKEN`. Also set:
   - `WHATSAPP_PHONE_NUMBER_ID` — the phone-number id Meta shows for the 019 number (not the digits themselves);
   - `WHATSAPP_APP_SECRET` — the Meta app secret, used only to check `X-Hub-Signature-256`;
   - `WHATSAPP_VERIFY_TOKEN` — a random string Sali chooses; the same value is entered in the Meta webhook verify-token field;
   - optional handoff: `HANDOFF_WEBHOOK_URL` or `HANDOFF_EMAIL_ENDPOINT`. Leave both unset to keep the default log-redacted no-op adapter (nothing is sent to an inbox).

   Do not commit any of these values, paste them into a pull request, or put them in chat. The repo only has placeholders in `.env.example`.

7. **Webhook subscription, only after a deploy Sali approves.** Once a deploy of this function is approved and live, subscribe the app’s WhatsApp webhook to:

   `https://theflow-ai.com/.netlify/functions/whatsapp-webhook`

   (or the approved deploy’s equivalent URL) with the verify token from step 6, field `messages`. Then, and only then, set `WHATSAPP_BOT_ENABLED=true` on that same approved environment. Until both the flag and the four required secrets are present, the function returns 200 and sends nothing.

## What this repo already does (so it is not re-done)

- GET verify handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- POST `X-Hub-Signature-256` check; a bad signature is rejected.
- Session replies only, via Graph `/{phone-number-id}/messages`, pinned to `v27.0`.
- No template, marketing, or outbound sends.
- Inquiry script, handoff summary, and a site button that stays hidden while `whatsappNumber` in `flow-landing/assets/site-config.js` is empty. Put the public digits there (country code, no `+`) only when the number is registered and a deploy is approved. The live r3 homepage folder is not part of this change.

## Storage, before going live

Conversation state and message-id idempotency use an in-memory store, which is enough for tests and will not survive a Netlify cold start. Before enabling the flag in production, swap in Netlify Blobs or a Supabase table behind the same `store.js` interface. Do not provision either until that follow-up.
