---
tags: [locked, rules]
updated: 2026-10-20
source: bots' shared memory, export 2026-10-16
---
# Shared rules & product locks (Sali) — read first

**Standing rule.** Every new rule or setting saved to the bots' shared memory must be added to this file via PR by the bot that saved it.

This file is that compilation. When two lines conflict, the newer date wins. The short Glance list is [[product-locks]]. `CLAUDE.md` and `AGENTS.md` carry the same short "Product locks — read first" section and point here.

This file never contains secrets, passwords, paths to secrets, or contact details.

Glance closes open loops. Gmail is where it starts today. A line below is a lock. What the code does in a given commit is status, and status does not relax a lock.

## Product (Glance)

### Naming and the Flow split

- **2026-10-05.** Never describe Glance as a "Chrome extension for Gmail", an "AI email assistant", or a "smart inbox". A report keeps the product definition apart from the implementation state.
- **2026-10-08.** Keep Flow and Glance separate. Flow is the org product: the customer chooses EDGE on their own servers, or our cloud, and both are available. Glance is personal. Its model runs on Glance's cloud and does not need a strong user machine. The own-model work is for Glance.

### How wide it is

- **2026-10-08.** Glance must be broad and do everything across the user's world. It is never narrowed to a few loops.
- **2026-10-14.** The goal is the highest-level AI product in the world. Each new integration drives continuous learning on that connection's data, and is verified against every capability of the connected system (a weekly Cursor routine, and a CTO review before merge).
- **2026-10-14 21:26.** Do not put schedule dates on this work. The full Microsoft, Google, WhatsApp, and Meta ecosystems must work completely, as soon as possible, built in parallel.
- **2026-10-15 22:48.** The target is a polished, complete product for public release, not a friends-only build.

### On by default, every site, every device

- **2026-10-15 23:01.** Every integrated product is on by default, with one consent per ecosystem. There is no off-by-default toggle. Glance must work on iPhone. A permanent Chrome extension detects intent on every site.
- **2026-10-16 00:45 / 00:47.** Native embeds in every integrated system's own apps (the official add-on, add-in, or app), on every device type: iPhone, Android, iPad, Mac, Windows, and web. Install once from signup, and it appears on all devices. An integration is done only when this works.
- **iPhone order, read from 2026-10-15 23:01 and 2026-10-16 together.** Add-ins first, then Safari. The official add-ins are the first iPhone surface and part of done. Safari is the every-site intent surface after that.
- **2026-10-16 00:50.** The Do It card must pop up automatically in native apps too, not only on an icon tap. Native embeds (the Gmail add-on and the Outlook add-in) start immediately, in parallel with the urgent ecosystems work. Where a platform forbids an automatic surface, use the closest official route: a prefetched card, push notifications with Do It, and event-based activation.
- **2026-10-16 00:51.** The auto-pop card and the native embeds apply to every ecosystem, across all of that ecosystem's apps and devices. Meta: WhatsApp, Messenger, Instagram. Google: Gmail, Calendar, Drive, Docs, Sheets. Microsoft: Outlook, Teams, Word, Excel, OneDrive, To Do.

### The close bar

Later lines add to this bar. None of them relax it.

- **2026-10-07.** After Microsoft To Do ProofOfClose, the next slice is Glance's own computer: a browser and desktop agent that closes loops and asks for approval, or for a password, when it needs one. High-frequency writes stay on API integrations, under the same ProofOfClose and fetchedBack bar.
- **2026-10-15 00:21.** The user can add or edit closing steps in free text. The model must understand those steps and really execute them, under ProofOfClose, fetchedBack, Undo, and no auto-send, and it says clearly when a step cannot be done.
- **2026-10-15 00:26.** When a step lacks a scope, the card asks: once, or always. Use incremental OAuth for the missing scope only, then resume. "Always" is revocable in Settings and is logged. Send never gets "always".
- **2026-10-15 00:43.** Never block the user's own use of a thing. Anything Glance created stays fully editable in the native app. Never lock, overlay, re-fill, or overwrite after a user edit. Undo refuses rather than clobbering that edit.

### What goes in the queue

- **2026-10-15 00:31.** All eight of these go into the Glance queue at a fully working bar: recurring reminders and watchers; editable memory; learn-from-demonstration; one draft card before any send; a human handoff at login, a second factor, or payment, then auto-resume; long tasks in the background with short updates; one-question quick-choice widgets; specialist sub-agents.

### The site

- **2026-10-15 23:02 / 23:10.** A download from the website goes through a signup gate, then the store. The gate asks for an email, requires Terms and Privacy, and offers a separate mailing-list opt-in that is not pre-checked, with double opt-in. The main Flow site keeps its top Glance intro and a nav link. The gate lives only on the Glance page, `flow-landing/trial.html`. The bottom "Get Glance" card is removed from the main site. All Glance UI follows Dana's design system.

## Flow / Sales

These four lines had no date in the 2026-10-16 export.

- Flow demos must not look like generic generated filler: realistic artifacts, and precise Hebrew. Glance Design checks them against an anti-slop checklist before the Gate.
- Outreach is email only. No LinkedIn sends until the company page has posts. The organizations are 100 or more employees and handle sensitive data. Verified personal emails only, never a role inbox such as info@ or office@. About 50 a day, widening into new sectors. Every outreach draft goes to Sali with screenshots before it is sent, and each send needs his approval.
- Every Flow email or document that talks about clicking the button uses the small inline Do It image (`doit-70x27.png`, shown at about 35×13). It is never an attachment.
- Pricing v4.2: count employees, not computers, and never more than the priced headcount.

## Bot operations

These lines had no date in the 2026-10-16 export. The standing rule at the top of this file is how a new one is recorded.

- No agent asks Sali directly for an approval, a password, or other input. Escalate to CoS, who batches. Each topic has one owner bot. Check shared memory before messaging Sali. Never re-ask, and never re-remind.
- Credentials Sali gives are stored as shared secrets and reused by the bots. Never echo a secret. Check the secrets store before saying one is missing. Never put a secret, or a path to a secret, in git or in this file.
- Long Git work goes to Cursor Cloud Agents. Chat keeps coordination, decisions, and live browser tests.
- Token use: one live Gate at a time, and only after CTO parity is a pass. No interim updates to Sali. The only messages to him are a live pass, or a decision only he can make. No acknowledgement replies to bots. The 07:30 standup is the only digest. Few screenshots.
- A draft Sali approved is sent exactly as approved. Never close a ClickUp task on an assumption. Verify it from evidence.
- Deploy to Netlify only when Sali writes the explicit approval «מאשר».
- **2026-10-20.** Designs belong to the Grok bot. A coding agent does not design cards or wait on a mock: it builds the logic behind an off switch and writes what the card must show (example: `docs/glance-ai/card-requests-2026-10-20.md`), and the Grok bot designs it.
- **2026-10-20.** All code an agent writes lives on git (pushed branches and PRs into the working branch), so every agent can see it. Nothing stays only in one session.
- **2026-10-20.** Every agent uses Graphify (`scripts/graphify-setup.sh`, then `graphify query/path/explain` before reading code) to cut token use: `docs/glance-ai/graphify.md`. Whatever a routine builds and verifies lands in git and is part of the working code; a run that pushed nothing is not done, so every agent can see it and stay in sync.
- **2026-10-21.** Wiring a new close into an existing card is the agent's job, not the Grok bot's: use the canonical Do It card, its existing text slots and the existing step list, behind the off switch. Only a card that has no existing equivalent is requested from the Grok bot. A run that ships logic nobody can click is partial; the next run wires it.
