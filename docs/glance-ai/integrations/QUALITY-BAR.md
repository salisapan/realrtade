# Connector quality bar (Claude routine + Cursor routine)

One checklist. A connector PR from either routine is `built` only when every box below is ticked or explicitly marked "not yet" with the reason and the owner of the gap. Reviewers (the other routine) check the PR against this file. Reference implementation: PR #138 (Notion), `docs/glance-ai/connectors/notion.md`.

## 1. Capability matrix (full)
- [ ] `docs/glance-ai/connectors/<tool>.md` lists EVERY read/write capability a user loop could need (tasks, comments, messages, files, calendar, contacts, deals...), not only the one built.
- [ ] Per row: capability, endpoint, minimum scope, Undo path, ProofOfClose fetchBack method, built yes/no.

## 2. Least-privilege scopes
- [ ] Only the scopes the built capabilities need; every unused endpoint family (e.g. search, users) is asserted unused in a test.
- [ ] Client id from config; no secret in the extension; secrets only via the token relay env vars. Never a send scope that auto-sends.

## 3. Every write: preview → approve → execute → fetchBack ProofOfClose → Undo
- [ ] Preview card; nothing written before the user approves. Messages stay draft + approve, never auto-send.
- [ ] Handled ONLY when a GET reads the written object back (`ProofOfClose = {system, externalId, fetchedBack:true, verifiedAt, url}`). A failed read-back is never Handled.
- [ ] Undo on every write, and the Undo is read back too. One object per loop (retry never duplicates).

## 4. Contract test corpus (mock vendor API)
- [ ] success · 401 → refresh (and refresh fails) · 403 · 404 · 409 · 429 with Retry-After · 5xx (did / did not create) · timeout · created-but-read-back-fails → not Handled · idempotency (2nd click / retry) · injection (hostile title cannot change parent, endpoint or fields) · no token stored (ledger, proof, events, logs).
- [ ] Covers every built capability in the matrix, plus Undo.

## 5. Nothing else breaks
- [ ] All existing `test/*-corpus.cjs` and Playwright e2e stay green, or each red one is **proven red on the base** without the change (named in the PR).
- [ ] Headless e2e for at least 2 real user scenarios on a mock page, or "not applicable yet" with the reason.

## 6. Integration checklist (i)–(viii)
- [ ] (i) connector registry + **consent catalogue** entry (`core/consent-catalog.js`).
- [ ] (ii) **steps list** and Loops / suggest **cards** can choose this destination and read `FlowConnectorOutcome`.
- [ ] (iii) **popup setup** row (off) and **settings disconnect** (token removed, nothing emitted after).
- [ ] (iv) identity graph / follow loop where relevant.
- [ ] (v) docs map, `core/README.md`, connector doc, open-tasks row, decisions line.
- [ ] (vi) privacy and store text **drafted**, not applied.
- [ ] (vii) headless e2e rehearsal on a mock page.
- [ ] (viii) docs-consistency and identity-copy corpora pass.
- [ ] Also: works with intent detection on any site, memory, Undo, ProofOfClose; learning hook (`core/connector-outcome.js`) emitted on offer/approve/edit/undo/handled/read-back failure with no text, address or title.

## 7. Model learning
- [ ] ≥30 labeled **synthetic** intent/entity examples per new loop type (marked synthetic; never `ownerVerified`).
- [ ] Held-out eval cases added to the harness; eval run before and after; **precision/recall delta recorded** in the PR and run log. No weight changes.

## 8. Security checks (named in the PR)
- [ ] Scopes minimal; no token in ledger/proof/events/logs; injection cannot redirect writes; OAuth `state` (and PKCE where supported) checked before the code reaches the relay; relay is not an open proxy and never returns or logs the secret; only the one-time code / refresh token leaves the device.

## 9. Switches default off
- [ ] Every new path behind switches in `flow-trial-extension/config/connectors.public.js`, default **off**; off = identical behaviour, nothing emitted (tested).

## 10. Vendor facts
- [ ] Every scope, endpoint, token/refresh/revoke rule and review requirement verified from the vendor's official docs with a cite, **or** listed under "Vendor facts I could not verify" for the live Gate.

## PR shape
Draft PR against `claude/install-uiux-pro-max-skill-a4agox`; never merge; never touch `main`; never lower gates. Sections: What it makes real · Switches · Proof (table of runs) · Security checks · Integration checklist (i)–(viii) · Model learning delta · Why draft / owner actions · Vendor facts not verified.
