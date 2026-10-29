# Chrome Web Store — owner handoff (2026-10-06)

Glance closes open loops. Gmail is where it starts today.

**Status:** packaging is ready on branch `cursor/ceo-launch-execute-5a1c`. Publishing still needs the owner's Chrome Web Store developer account. `chromeStoreUrl` stays empty until the listing URL exists.

## Build the upload zip (do this on the launch branch)

```sh
python3 scripts/build_cws_zip.py
# → flow-trial-extension/dist/glance-cws.zip  (~970 KB, lite profile, no hybrid WASM)
```

The zip strips the unpacked `key`, swaps `oauth2.client_id` to the **store** client
(`…slt92iid…`), and sets the store short description. Expected store extension id:
`lbihckfmoffgjjlnneoeaehbhoonfenh`.

## Listing text

Copy from `flow-trial-extension/docs/chrome-web-store-submission.md` (name, short description, detailed description, permissions justifications, privacy practices).

## Screenshot ready in-repo

- `flow-trial-extension/docs/screenshots/cws-popup-setup-1280x800.png` — Setup popup composited to **1280×800** (Store-legal size).
- Still needed from a real Gmail session (owner): Do It chip, post-write receipt, optionally Draft-It / attachment card. Without those the listing is weak but can be submitted with the popup shot + privacy link.

## After Google approves the listing

1. Copy the public URL (`https://chromewebstore.google.com/detail/...`).
2. Set it in `flow-landing/assets/site-config.js`:

```js
window.FLOW_CONFIG = { chromeStoreUrl: 'https://chromewebstore.google.com/detail/…' };
```

3. Merge + **only then** Netlify-deploy (owner must approve deploy separately). Every "Get Glance" path becomes one-click Add to Chrome.

## What this agent cannot do

- Log into the Chrome Web Store Developer Dashboard.
- Capture real Gmail screenshots.
- Invent a `chromeStoreUrl` before the listing exists.
