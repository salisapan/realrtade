# Agents

Cursor and Codex read this file. The rest of the standing rules are in `CLAUDE.md`. The section below is the same text as `CLAUDE.md` → "Product locks — read first".

Glance closes open loops. Gmail is where it starts today.

## Product locks — read first

Read these two notes before changing Glance scope, the site, or a bot rule.

- Full dated rules (Product, Flow/Sales, Bot operations): `docs/vault/shared-rules.md`
- Glance locks, short form: `docs/vault/product-locks.md`

Every new rule or setting saved to the bots' shared memory must be added to `docs/vault/shared-rules.md` via PR by the bot that saved it.

- **On by default, one consent per ecosystem.** Every integrated product is on. There is no off-by-default toggle.
- **Intent detection on every site.**
- **Native embeds are part of done.** Every integrated system's own apps, on every device type (iPhone, Android, iPad, Mac, Windows, web). Install once from signup and it appears on all devices.
- **The Do It card pops up in native apps.** It appears on its own, not only on an icon tap. The Gmail add-on and the Outlook add-in start immediately, in parallel with the urgent ecosystems work. Where a platform forbids an automatic surface, use the closest official route: a prefetched card, push notifications with Do It, and event-based activation.
- **Every ecosystem.** That auto-pop card and those native embeds apply to every ecosystem, across all apps and devices: Meta (WhatsApp, Messenger, Instagram); Google (Gmail, Calendar, Drive, Docs, Sheets); Microsoft (Outlook, Teams, Word, Excel, OneDrive, To Do).
- **iPhone:** add-ins first, then Safari.
- **Signup gate.** It lives only on the Glance page, `flow-landing/trial.html`: email, required Terms and Privacy, a mailing-list opt-in that is not pre-checked, double opt-in, then the store. The main Flow site keeps the top Glance intro and a nav link. The bottom Get Glance card stays off the main site.
- **Public release.** A polished, complete product, not a friends-only build.
- **Always ProofOfClose and Undo.** No auto-send. Never clobber a user edit. Undo refuses rather than overwriting one.

## Graphify — every agent, to save tokens

Run `scripts/graphify-setup.sh` once per checkout, then `graphify query "<question>"`, `graphify path`, `graphify explain` before reading or grepping code. Work that a routine or agent finishes and verifies goes to git on the working branch so every agent sees it. Rules: `docs/glance-ai/graphify.md`.

## Surfaces — every Gmail change ships everywhere

Standing rule (Sali, 22/10/2026 01:31): every feature, fix or behavior built for Gmail is automatically built for all surfaces too — Outlook, the Google/Microsoft tools, WhatsApp/Messenger/Instagram, the Chrome extension, the Gmail add-on (iPhone) and Safari iOS (once it exists) — without a separate ask. Every PR includes a surface table (done, n/a with reason, or follow-up). Gate and parity-check every surface. Full text: `docs/vault/shared-rules.md` (same block as Graphify).

## What changed in the code — read this before saying nothing shipped

`docs/glance-ai/shipped-in-code.md` is generated from git (`scripts/what-changed.sh`): every commit that changed `core/`, `src/`, `manifest.json` or the Gmail add-on, with its files. The working branch is far ahead of `main` and the manifest on it is 0.9.56; the paragraph above that says 0.9.55 is the last package written up, not the last code. How detection is shared across Gmail, Outlook, the phone card and chat: `docs/glance-ai/one-algorithm.md`.
