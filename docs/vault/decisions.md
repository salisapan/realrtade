---
tags: [decisions]
updated: 2026-10-09
---
# Decisions log (newest first)

One line per decision: `date · decision · who · where it is written in docs/`. This is a log, not the truth: each line links to the truth file (`CLAUDE.md`, [[README]], [[open-tasks]], [[revenue-routines]]), and that file wins. Full status stays in [[open-tasks]].

- 2026-10-09 · Glance becomes an AI product, levels 2 and 3 (the model understands every mail; it plans, prepares and answers), cloud + device. Spec [[glance-ai/ai-product]] awaits owner approval; the identity sentence changes only after it.
- 2026-10-08 · Profile relevance lab: Glance offers when the email is relevant to the user and the close is feasible, and stays silent when it is not. There is no blanket "Hi all" / "היי לכולם" / DL / Cc silence. Unknown falls back to today's behavior; Instinct fills role and department on day one. Lab only, not wired into the extension · Sali · `docs/glance-ai/user-context-v0.md`, `CLAUDE.md` "Owner product locks", [[open-tasks]] row 62
- 2026-10-08 · UserContext v0: offer or quiet uses a per-user profile. Relevance is relevant, not_relevant, or unknown. No blanket quiet on group mail. Relevance can come from role, history, or work style; a k-prior-closes gate is not the rule. Cc-only, addressed-to-other, and the #118 no-To/Cc hedge stay until a contrast-pair shadow test. Not built · Sali · `CLAUDE.md` "Owner product locks", `docs/glance-ai/user-context-v0.md`, `docs/glance-ai/holistic-close-map.md`
- 2026-10-08 · Glance is broad and does everything: not a minimal loop set. Breadth slices 1–3 and Dima's queue run in parallel; each PR gets a live scenario Gate, then a squash-merge; no stream touches a file an open Dima PR is changing. E1, E2, E4, E6, C1 are the reliability track, not the product scope. Paid readiness stays the CoS bar · Sali · `CLAUDE.md` "Owner product locks", `docs/glance-ai/holistic-close-map.md`, `docs/glance-ai/CTO_PATH_TO_PAID_2026-10-08.md`
- 2026-10-08 · Paid-readiness bar for Glance: charge only when the yaml `overall` is green. Until then pause Pro, Paddle, and a paid store listing. A free store listing for dogfood can proceed · Claude · `docs/glance-ai/paid-readiness-bar.md`, [[open-tasks]] rows 7, 11, 61
- 2026-10-08 · Holistic close map for Glance (personal): loop catalog, coverage on this tip, three slices after the steps list, five scenario Gates. Analysis only; release order unchanged · Claude · `docs/glance-ai/holistic-close-map.md`, [[open-tasks]] rows 52-54
- 2026-10-08 · #108 E2E rebased on 0.9.40 · Claude · CLAUDE.md "Testing and the live Gate", [[open-tasks]] row 56
- 2026-10-08 · 0.9.40 = #106 normalize/recall + #110 rule fixes + outlookPageDiag default, on top of 0.9.39 · Claude · `CLAUDE.md` "Product facts and release order", [[open-tasks]] row 51
- 2026-10-08 · 0.9.39 Gate: Outlook commitment Do It was a reply draft and OneDrive save stayed outlook:attachments-unread; panel task-only Do It now writes Microsoft To Do after read-back, and the mailbox check reads the attachment list before it plans. Google token fallback did not change the Microsoft grant. Live Gate passed on 2026-10-08 on cd524a30. · Claude · [[open-tasks]] rows 47, 49, 50
- 2026-10-08 · 0.9.39 · Connect Google falls back to launchWebAuthFlow when Chrome sign-in is off (port of 0.7.5); Gate pending · Claude · [[open-tasks]] row 50
- 2026-10-08 · Standup 07:30 IL filed verbatim in [[sessions/2026-10-08]]. Recommends Netlify «מאשר» (not given) and closing or re-dating the August ClickUp tasks (not done) · standup · [[open-tasks]] decisions table, rows 57-59
- 2026-10-08 · 0.9.38 code: normalize once before the decision, narrow phone-signature strip, resolver sender check, truncated body preview, three display bugs, suggest-save engine with no UI and oracle parity (suggest-save spec §1–§9). UI is the 0.9.40 steps list, before Mail.Send. Gate: not run live · Claude · [[open-tasks]] row 51, [[multi-platform]], [[true-close]]
- 2026-10-08 · Netlify deploy and Morning (invoices) stay on HOLD until the owner writes «מאשר» · Sali · `CLAUDE.md` "Owner product locks", [[open-tasks]] rows 1, 43
- 2026-10-08 · Attachment save: Glance suggests saving an attached document to OneDrive (Outlook) or Drive (Gmail), even unasked; the person approves, never automatic · Sali · `CLAUDE.md` "Owner product locks", [[open-tasks]] rows 51-52
- 2026-10-08 · Release order: 0.9.38 narrow → Gate → merge → 0.9.40 steps list → Gate → merge → Mail.Send on that list · Sali · [[open-tasks]] "Glance release order", rows 50-53
- 2026-10-08 · Mail.Send approved with a preview and a one-click approve; never auto-sends; not built yet · Sali · `CLAUDE.md` "Owner product locks", [[open-tasks]] rows 21b, 53
- 2026-10-08 · Next scenario after Mail.Send: intent on any site (draft from connected sources, the person approves the send) · Sali · `CLAUDE.md` "Owner product locks", [[open-tasks]] row 54
- 2026-10-08 · Open University reply (Ziva/Uri) approved; goes out the morning of 10-08 · Sali · [[revenue-routines]] §8
- 2026-10-08 · Flow outreach: ICP (CPA, law, insurance, medicine; ≥120; verified personal emails; partial packs via דוד; no auto-send; 50 sends a weekday). Warm replies never state a meeting length; aim for a live demo; Flow as a holistic platform · Sali · [[revenue-routines]] §8
- 2026-10-08 · Glance = personal floating extension across every platform + local computer layer, not a website; own model on Glance cloud. Flow = org product on the customer's server (EDGE) or our cloud · Sali · `CLAUDE.md` "Owner product locks"
- 2026-10-08 · ProofOfClose = {system, externalId, fetchedBack, verifiedAt} + remount + Undo. One Instinct-style consent screen (Select all + per service) for Google and full Microsoft · Sali · `CLAUDE.md` "Owner product locks"
- 2026-10-07 · 0.9.37 Gate PASS (OneDrive save, Hebrew, To Do title); PR #103 merged @c6be8e1a. 0.9.31 and 0.9.30 Gates PASS · Sali · [[open-tasks]] rows 46, 47, 49, "Done (recent)"
- 2026-10-07 · CoS routines: close-fabric + computer merged (weekdays 09:48/16:48); silent exit when nothing changed; money routines unchanged · Sali · [[revenue-routines]] §9
- 2026-10-06 · Owner approved merge of CEO launch PR #91 (`cursor/ceo-launch-execute-5a1c`) to `main`; Netlify deploy still requires a separate OK · Sali · [[open-tasks]] row 1
- 2026-10-06 · Supabase flow-ai ACTIVE; licenses + ai_usage migrations applied; no Netlify deploy without owner OK · Claude · [[open-tasks]] rows 1–2, 10, 30, 34
- 2026-10-05 · Claude ↔ CoS realtime wake is comments on permanent draft PR #77 (branch `cos/bridge-live-inbox`; never merge, never close; no webhook secret, no Telegram). File drop on main stays the durable archive · Claude · [[vault/bridge/README]], [[open-tasks]] row 41
- 2026-10-05 · Claude Code ↔ CoS bridge is a file drop under `vault/bridge/` (webhook optional, no secrets in git); messaging only · Sali · [[vault/bridge/README]], [[open-tasks]] row 41
- 2026-10-05 · Obsidian vault = `docs/` (context notes in `docs/vault/`); context cache, docs stay the truth · Sali · [[README]] §5
- 2026-10-05 · Living toolbar icon handed to Claude Code (one living body, not a flipbook) · Sali · [[living-icon-handoff]]
- 2026-10-05 · Outlook Mail.ReadWrite yes, drafts only, never send, Undo deletes the draft · Sali · [[open-tasks]] row 21b, [[multi-platform]]
- 2026-10-05 · Product identity: "Glance closes open loops. Gmail is where it starts today." · Sali · [[product-identity]], [[open-tasks]] row 39
- 2026-10-04 · Deeper read: free for everyone with a monthly allowance, local first · Sali · [[ai-ladder]], [[open-tasks]] row 25
- 2026-10-03 · WhatsApp Web ships as experimental opt-in, read-only, 1:1 · Sali · [[multi-platform]] §5, [[open-tasks]] row 17
