# Ecosystem runs

Glance closes open loops. Gmail is where it starts today.

One short report per run of the ecosystems builder. Newest last. Status only; a Live Gate stays "not run" until the owner records one.

## 2026-10-20 (Ecosystems builder A) — Google Meet link on a hold

- **Capability shipped (logic, switch off):** a mail that proposes a video call with one day and one clock ("Can we do a video call tomorrow at 15:00?", "נעשה שיחת וידאו מחר ב-15:00") gets one Do It that creates a Google Calendar event with a real Meet link. No guest is added and `sendUpdates=none`, so nothing is sent. Handled only when the read-back by id shows the same title, both instants and a created `meet.google.com` link; otherwise the event is withdrawn. Undo deletes it and refuses after the person edited it. Module `flow-trial-extension/core/meet-link.js`, switch `MEET_LINK`. No new scope (`calendar.events` allows `conferenceData`).
- **Not user-visible yet:** the module is not wired into `src/` and its card is requested for the Grok bot (`card-requests-2026-10-20.md`, M1). So this run ships tested logic, not a card a person can click. Counted honestly as a partial run against the "user-facing capability" bar.
- **Tests:** `test/meet-link-corpus.cjs` (recognition 8 clear, 16 silent, plan, write, pending link, failed link, wrong title or time, guest, wrong account, auth, Undo untouched, edited, deleted). Whole regression of every `test/*corpus.cjs`: green after the docs map row.
- **Open:** wire to the Gmail card behind the switch once the card exists; add a Meet link to an existing event; live Gate; Outlook equivalent (Teams meeting link) is the next gap.

## 2026-10-20 (Ecosystems builder B) — Teams meeting link on a hold

- **Capability shipped (logic, switch off):** an Outlook mail that proposes a call (generic "video call" or a named Teams call, one day, one clock; English and Hebrew) gets one Do It that creates an Outlook calendar event with a Teams join link. No guest, so nothing is sent. Handled only when the read-back by id shows the same subject, the same wall clock and a `teams.microsoft.com` or `teams.live.com` join link; otherwise the event is withdrawn. Undo deletes it and refuses when the person edited, moved or invited someone. Module `flow-trial-extension/core/teams-meeting.js`, switch `TEAMS_MEETING`, proof system `microsoft/calendar`. No new scope (`Calendars.ReadWrite` is the existing Calendar box).
- **Not user-visible yet:** like builder A's Meet link, the module is not wired into `src/content-outlook.js`, and its card is requested for the Grok bot (`card-requests-2026-10-20.md`, T1). Tested logic, not a card a person can click: a partial run against the user-facing bar.
- **Tests:** `test/teams-meeting-corpus.cjs` (8 clear lines, 15 silent with reasons, plan, write, late link, no link, bad link, wrong subject or time, guest, wrong account, missing scope, auth, Undo untouched, edited, moved, guest, deleted). Whole regression of every `test/*corpus.cjs`: see commit.
- **Open:** wire to the Outlook card behind the switch once T1 exists; live Gate; personal Microsoft accounts may return no join link (then withdrawn); next gaps: Word or Excel from a request with no attachment (row 76), SharePoint, Planner, WhatsApp follow-ups.
