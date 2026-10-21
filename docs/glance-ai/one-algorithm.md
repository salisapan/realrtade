# One algorithm on every surface

Glance closes open loops. Gmail is where it starts today.

Owner, 2026-10-21: detection on mobile or on a computer, in Gmail or in WhatsApp, must be at the same level and by the same algorithm.

**The rule.** "Did someone ask something of you, and what is the close?" is decided by one function, `FlowIncomingJudge.judge` (`flow-trial-extension/core/incoming-judge.js`): normalise, `FlowIntent.classify`, quiets and veto, the file gate, `FlowActions.planFor`. A surface never has its own recogniser. A surface differs only in two things: how it hands its text to the judge (`surface: 'gmail' | 'outlook' | 'chat'`) and what it can write after the judge has seen the ask (a reply draft, a Google or Microsoft task, a calendar hold, a note in a chat composer).

**Where each surface stands (status, 2026-10-21)**

| Surface | Detection | What it can write | Gap |
|---|---|---|---|
| Gmail in Chrome | `FlowIntent.classify` then the same chain (`planOpenMail`), covered by `test/gmail-outlook-parity-corpus.cjs` | draft, task, hold, file save | none known |
| Outlook on the web | `FlowIncomingJudge.judge` | draft (Graph), To Do, hold, OneDrive | none known |
| Gmail app on iPhone and Android (Workspace card, `glance-gmail-addon/`) | `FlowIncomingJudge.judge`, bundled into `CoreBundle.js` since 2026-10-21 (it used `classify` plus its own filter before, which is why a reply ask said "Nothing to close") | task, hold. No draft: the card has no compose scope, so a plan with a draft and a task offers the task | rebuild and redeploy the test deployment; not seen on a phone |
| WhatsApp Web, Messenger, Instagram | the chat lane runs the same judge (`src/chat-draft.js` `runIncoming`) and adds place and fact detection | a draft in the composer for a place or a fact ask only | an inbound ask that is a task or a hold has no card on a chat page yet |

**Proof.** `test/surface-parity-corpus.cjs` runs one set of English and Hebrew lines through Gmail, Outlook, the chat entry and the Workspace card bundle and fails when the intent type differs or when the card decides differently from Gmail. A change to the judge must pass it, and `glance-gmail-addon/scripts/build-bundle.js` must be re-run so the card ships the same core.

**What stays honest.** The card on a phone can write less than the extension can; it never detects less. Nothing here is verified live on a phone or on WhatsApp: Gate not run.
