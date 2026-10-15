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
- **iPhone:** add-ins first, then Safari.
- **Signup gate.** It lives only on the Glance page, `flow-landing/trial.html`: email, required Terms and Privacy, a mailing-list opt-in that is not pre-checked, double opt-in, then the store. The main Flow site keeps the top Glance intro and a nav link. The bottom Get Glance card stays off the main site.
- **Public release.** A polished, complete product, not a friends-only build.
- **Always ProofOfClose and Undo.** No auto-send. Never clobber a user edit. Undo refuses rather than overwriting one.
