# Integration builder (Cursor routine) run log

Runs Sundays 07:47 Israel time (`47 4 * * 0` UTC). Queue and ownership: `docs/glance-ai/integrations/QUEUE.md`. Bar: `docs/glance-ai/integrations/QUALITY-BAR.md`. Glance closes open loops. Gmail is where it starts today; a connector is a place where a close really happens, and it counts only with a read-back.

## 2026-10-18 · ClickUp

- **Claim.** Row ClickUp, owner `cursor`, branch `cursor/routine-integration-builder-clickup`, draft PR #167. Stacked on the Asana branch (#156 -> #138) because the token relay, consent catalogue and learning hook are not on the base branch yet; the PR says so.
- **Built.** `core/clickup-close.js` (write, GET read-back, Undo with a 404 read-back, ledger idempotency and adoption), relay vendor `clickup` (code-only JSON body, no PKCE, no refresh), consent catalogue entry, `ProofOfClose` system `clickup/task`, background wiring behind `clickupReadBack` and `clickupOAuth` (both off), settings disconnect, connector status. Doc: `docs/glance-ai/connectors/clickup.md`; matrix: `docs/glance-ai/integrations/clickup.md`.
- **Tests.** `clickup-close-corpus` (40), `clickup-wiring-corpus`, `clickup-intent-data-corpus` (7), relay tests (+2), consent catalogue (+1), headless `e2e/clickup-connector.spec.js` (4 scenarios, service-worker mocks). A headless run through the Gmail chip is not possible yet: the steps list cannot choose ClickUp (open-tasks row 70).
- **Model learning.** 39 synthetic and 14 held-out ClickUp sentences. No weights changed. Existing four sets unchanged. Held-out ASK precision 1.00, PROMISE precision 1.00 / recall 0.50; one notification sentence on the candidates is read as an ASK (flagged in the doc).
- **Red on base too (not caused here).** `test/outlook-calendar-corpus.cjs` ("one Drive file is a file-on-hold calendar step"); e2e `gate-0945.spec.js` two undone-row tests.
- **Cross-review.** Newest open Claude connector PR #156 (Asana) reviewed against the quality bar; comments posted on the PR. No commit onto the Claude branch.
- **For the CoS / owner.** A ClickUp Workspace owner or admin registers the OAuth app (redirect `https://<extension-id>.chromiumapp.org/`); set `CLICKUP_CLIENT_ID` and `CLICKUP_CLIENT_SECRET` in Netlify; deploy the relay; add `https://api.clickup.com/*` as an optional host permission; confirm the unverified vendor facts (`connectors/clickup.md` §10); steps-list destination wiring. Status stays `built`; only the owner marks `live`.
