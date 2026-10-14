# Own-computer proof of close — CoS gate (Glance 0.9.32)

Glance closes open loops. Gmail is where it starts today.

## Product definition (vision-locked)

Glance stays a floating extension that follows the person across platforms. An own-computer close finishes something that extension already sees. It does not replace the extension, and it is not a new site.

## Current implementation status (this tip)

Scaffold. Version **0.9.32**. One allowlisted web UI close. The live page driver is not wired; corpus tests inject a DOM reader. High-frequency writes stay on the API (Google Tasks and Microsoft To Do, already shipped). This stream is for an ask that needs a page.

`computer/local/<app>` — a close against a local file — is a **second gate, later**. It is not this tip. The shape may be named (`system: "computer/local/<app>"`, `fetchedBack: false`, deferred). It is not Handled.

## Checklist

Run this when the page driver is wired. Steps the corpus already locks are marked. Nothing is sent.

1. **Seed mail.** Load unpacked Glance 0.9.32. Open a mail whose close is the allowlisted page, not a new site shell.
2. **Do It drives that UI.** Host `example.com`, path `/fixture/glance-close`, action `mark-done`. *Live driver: not wired in 0.9.32. The corpus drives an injected reader.*
3. **DOM re-read.** After the action, read the page again. The URL matches, and `[data-glance-close="done"]` is present. A visible id (`[data-glance-close-id]`) becomes `externalId`. With no id, Activity stores `example.com:/fixture/glance-close:<actionDigest>`. *Corpus locks this.*
4. **Handled only if `fetchedBack === true`.** The receipt says Handled, or טופל. `system` is `computer/example.com`. A click alone is not Handled. A screenshot hash is audit only, not the gate. A verify miss is `verify_failed` or `proof_pending`, and it is not a trusted close. *Corpus locks this.*
5. **Reload remounts.** Leave the thread and come back. The Handled banner returns from Activity by message id or thread id. A hash of the message text is not the match. *Corpus locks this. The Gmail scan uses the same remount as Tasks.*
6. **Undo.** Prefer the inverse page action (`mark-open`), confirmed by reading that selector again. If the action has no inverse, the line is **Undo unavailable**. Either way Activity is rewritten and does not stay HANDLED. *Corpus locks the rewrite. The live click that changes the page waits on the driver. Until that re-read, the line is "Undone — Activity no longer says Handled." and does not claim the page moved.*
7. **Login wall pauses.** A password field, Sign in, or מאשר pauses as `proof_pending`. Escalate to CoS. Do not ask Sali. *Corpus locks this.*

## Out of this tip

- Local-file closes (`computer/local/<app>`).
- Morning invoice, Netlify, Mail.Send, new API writers.
- Driving arbitrary sites. The allowlist is one host and one action.
- A screenshot hash used as the close.
