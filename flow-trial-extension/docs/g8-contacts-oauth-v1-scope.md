# G8 — Google Contacts + OAuth v1 scope cut (PR #195)

**Branch:** `cursor/g8-contacts-4978`  
**Status:** **PAUSED** until the CTO allows G8 to resume. This file is the queued implementation scope; do **not** open a separate PR — land everything in the G8 Contacts PR.

**Product:** Contacts resolve + compose fill stays behind `GOOGLE_CONTACTS` (existing G8 feature work on this branch).  
**This queue item:** OAuth v1 — exactly **seven** Google scopes, `contacts.readonly`, and `sheet-row` on `drive.file` only.

## Final seven OAuth scopes (no `gmail.*`, no `drive` / `drive.readonly`)

The extension must request **exactly** these seven (same strings everywhere):

1. `openid`
2. `https://www.googleapis.com/auth/userinfo.profile`
3. `https://www.googleapis.com/auth/userinfo.email`
4. `https://www.googleapis.com/auth/drive.file`
5. `https://www.googleapis.com/auth/calendar.events`
6. `https://www.googleapis.com/auth/tasks`
7. `https://www.googleapis.com/auth/contacts.readonly`

**Corpus row (add when implementing):** the manifest / `google-config` allowlist / Connect flow requests **exactly** this set — no `gmail.*`, no `https://www.googleapis.com/auth/drive`, no `drive.readonly`, no `spreadsheets`.

## Out of G8 — Google Picker (G1–G6)

Opening an existing Doc/Sheet/Slides file under **`drive.file`** via **Google Picker** is **G1–G6** scope work, **not** part of G8. Do not bundle Picker into this PR.

## Code changes (when CTO unpauses)

### `contacts.readonly` — identical everywhere

Add `https://www.googleapis.com/auth/contacts.readonly` in lockstep:

| Location | Notes |
|----------|--------|
| `manifest.json` (~line 171) | `oauth2.scopes` array |
| `core/google-config.js` | constant, `ALLOWED` / scopes list, and `people.googleapis.com` host allowlist |
| `src/google-web-auth.js` (~line 36) | sign-in scope list |
| `scripts/cws_prod.py` (~line 95) | CWS scope list |
| `src/google-lane-host.js` (~lines 289–291) | lane host scope list |

Log each touch as: `file:line/before/after/ruling 'CTO OAuth v1 scopes 23/10'`.

### `core/sheet-row.js` (~line 42)

- **Before:** `https://www.googleapis.com/auth/spreadsheets`
- **After:** `https://www.googleapis.com/auth/drive.file` (append via picker-created or Glance-created files only; align with `google-sheets.js` / close map D4)

### `core/README.md` (~line 157)

Fix stale text: `google-config.js` row must describe **`contacts.readonly` on the allowlist** and **seven** scopes; `sheet-row` must say **`drive.file`**, not `spreadsheets`.

### Tests that pin six scopes today — update to seven

| File | Lines (approx.) |
|------|------------------|
| `e2e/support/launch.js` | 911–916 |
| Four e2e specs that import or assert the launch scope list | (same PR: grep `launch.js` scope fixtures) |
| `test/google-web-auth-corpus.cjs` | 16–23 |
| `test/background-write-corpus.cjs` | 48–55 |

Each expectation edit: `file:line/before/after/ruling 'CTO OAuth v1 scopes 23/10'`.

## Verification gate (same commit as implementation)

`manifest.json` and `background.js` change → run in **both** `TZ=UTC` and `TZ=Asia/Jerusalem`:

- All **19** load-background wiring corpora (see `run-184-corpora.sh` load-background list)
- `test/google-web-auth-corpus.cjs`
- `test/background-write-corpus.cjs`
- `test/surface-parity-corpus.cjs`

Rebuild **`glance-gmail-addon/CoreBundle.js`** via `glance-gmail-addon/scripts/build-bundle.js` (any `core/` change).

## Bite logging pattern

Mirror `gmail-outlook-parity-corpus.cjs` / gate-run4 `26ee0527` style when adding rows:

```text
G8 OAuth bite: <file>:<line> [<row name>] | before: <old> | after: <new> | ruling: CTO OAuth v1 scopes 23/10
```
