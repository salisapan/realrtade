---
tags: [locked]
updated: 2026-10-16
source: docs/vault/shared-rules.md
---
# Glance product locks

Glance closes open loops. Gmail is where it starts today.

This is the short list. The dated rules, including Flow, sales, and bot operations, are in [[shared-rules]] (`docs/vault/shared-rules.md`). If this page and that file disagree, that file wins.

- **On by default, one consent per ecosystem.** Every integrated product is on. There is no off-by-default toggle. (2026-10-15 23:01)
- **Intent detection on every site.** A permanent Chrome extension detects intent on every site. (2026-10-15 23:01)
- **Native embeds are part of done.** Every integrated system's own apps (official add-on, add-in, or app), on every device type: iPhone, Android, iPad, Mac, Windows, and web. Install once from signup and it appears on all devices. An integration is done only when this works. (2026-10-16 00:45 / 00:47)
- **The Do It card pops up in native apps.** It appears on its own, not only on an icon tap. The Gmail add-on and the Outlook add-in start immediately, in parallel with the urgent ecosystems work. Where a platform forbids an automatic surface, use the closest official route: a prefetched card, push notifications with Do It, and event-based activation. (2026-10-16 00:50)
- **Every ecosystem.** That auto-pop card and those native embeds apply to every ecosystem, across all apps and devices. Meta: WhatsApp, Messenger, Instagram. Google: Gmail, Calendar, Drive, Docs, Sheets. Microsoft: Outlook, Teams, Word, Excel, OneDrive, To Do. (2026-10-16 00:51)
- **iPhone: add-ins first, then Safari.** Official add-ins are the first iPhone surface. Safari is the every-site intent surface after that. (2026-10-15 23:01 and 2026-10-16, read together)
- **Signup gate, only on the Glance page.** Download goes through the gate, then the store: email, required Terms and Privacy, a separate mailing-list opt-in that is not pre-checked, and double opt-in. The gate lives only on `flow-landing/trial.html`. The main Flow site keeps the top Glance intro and a nav link. The bottom "Get Glance" card is not on the main site. Glance UI follows Dana's design system. (2026-10-15 23:02 / 23:10)
- **Public release.** A polished, complete product, not a friends-only build. (2026-10-15 22:48)
- **Always ProofOfClose and Undo. No auto-send. Never clobber a user edit.** A close still needs ProofOfClose, including fetchedBack. Undo is part of the bar, and Undo refuses rather than overwriting an edit. Send is never automatic, and Send never gets an "always" grant. Anything Glance created stays editable in the native app: never lock, overlay, re-fill, or overwrite after the user edits it. (2026-10-07, 2026-10-15 00:21, 00:26, 00:43)
