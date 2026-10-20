# Ecosystem runs

Glance closes open loops. Gmail is where it starts today.

One short report per run of the ecosystems builder. Newest last. Status only; a Live Gate stays "not run" until the owner records one.

## 2026-10-20 (Ecosystems builder A) — Google Meet link on a hold

- **Capability shipped (logic, switch off):** a mail that proposes a video call with one day and one clock ("Can we do a video call tomorrow at 15:00?", "נעשה שיחת וידאו מחר ב-15:00") gets one Do It that creates a Google Calendar event with a real Meet link. No guest is added and `sendUpdates=none`, so nothing is sent. Handled only when the read-back by id shows the same title, both instants and a created `meet.google.com` link; otherwise the event is withdrawn. Undo deletes it and refuses after the person edited it. Module `flow-trial-extension/core/meet-link.js`, switch `MEET_LINK`. No new scope (`calendar.events` allows `conferenceData`).
- **Not user-visible yet:** the module is not wired into `src/` and its card is requested for the Grok bot (`card-requests-2026-10-20.md`, M1). So this run ships tested logic, not a card a person can click. Counted honestly as a partial run against the "user-facing capability" bar.
- **Tests:** `test/meet-link-corpus.cjs` (recognition 8 clear, 16 silent, plan, write, pending link, failed link, wrong title or time, guest, wrong account, auth, Undo untouched, edited, deleted). Whole regression of every `test/*corpus.cjs`: green after the docs map row.
- **Open:** wire to the Gmail card behind the switch once the card exists; add a Meet link to an existing event; live Gate; Outlook equivalent (Teams meeting link) is the next gap.
