---
tags: [process, bridge]
updated: 2026-10-05
---
# גשר Claude Code ↔ CoS

> **מה זה:** ערוץ הודעות בין Claude Code לבין CoS (Grok Bot «דוד», chief of stuff). טלגרם לא בשימוש. זמן-אמת: תגובות על draft PR. ארכיון: קבצים בגיט.
> **מה זה לא:** מקור אמת. עובדות מוצר, מחירים, מה שיוצא מהמכשיר וכלל סגירה מתעדכנים ב־`CLAUDE.md` ובקבצי `docs/` לפי [[README]] §2. פתק בגשר לא מחליף את זה.

## Realtime via GitHub PR comments — ערוץ ההשכמה

This is the primary realtime path. No webhook secret. No Telegram. Claude needs only `gh`. CoS listens to comments on one permanent **draft** pull request.

- Draft: [#77](https://github.com/salisapan/realrtade/pull/77) — title `DO NOT MERGE: Claude↔CoS live inbox`, branch `cos/bridge-live-inbox`.
- **Never merge that PR. Never close it.** The branch exists only to keep the draft open. The note on that branch is `LIVE_INBOX.md`.

**Claude → CoS.** Prefix the comment body with `from: claude`. Optional next lines: `subject:` and `reply_needed: true` (or `false`). Then a blank line and the message.

```sh
gh pr comment 77 --body $'from: claude\nsubject: one line\nreply_needed: true\n\nmessage'
```

**CoS → Claude.** Reply with `gh pr comment` on the same PR. Prefix the body with `from: cos`.

```sh
gh pr comment 77 --body $'from: cos\nsubject: one line\nreply_needed: false\n\nmessage'
```

Read the thread with `gh pr view 77 --comments`. A comment is the wake. It is not the archive.

## Durable archive — קבצים על main

**The file drop is the durable archive.** When a message must persist, write the markdown note below as well as any comment. A webhook ping is optional and only when the env vars in the webhook section are set on Sali's machine. Never commit a URL, key, token, or secret.

## Folders — תיקיות

| Folder | Direction |
|---|---|
| `to-cos/` | Claude Code → CoS |
| `to-claude/` | CoS → Claude Code |

Template: [[vault/bridge/templates/message]] (`templates/message.md`). Copy it; do not edit the template in place.

## Filename — שם קובץ

`YYYY-MM-DD-HHMM-<slug>.md`

- Clock: Asia/Jerusalem, 24-hour, zero-padded (`2026-10-05-1948-outlook-draft.md`).
- `<slug>`: short English kebab-case (`[a-z0-9-]`). One subject per file.

## Frontmatter

```yaml
---
from: claude          # claude | cos
to: cos               # cos | claude  — must match the folder
subject: one line
reply_needed: false   # true | false
status: open          # open | processed
---
```

Body: free text. Short. Hebrew is fine. No secrets, no raw mail, no private eval sentences, no tokens.

`status: open` means unread. `status: processed` means the recipient acted (did the thing, or answered). Do not delete notes; history stays in git. Do not mark `processed` before acting. If `reply_needed: true` and you cannot finish, leave `open` and write why in a reply note in the other folder.

## Claude Code — required

**Start of a session.** Pull, then read every `to-claude/*.md` with `status: open` (skip `.gitkeep`). Act. Then set `status: processed` and commit that edit with the session's other work.

**End of a session,** when CoS must know something (a handoff, a blocker, a question only CoS can answer). For an urgent wake, comment on draft PR #77 (prefix `from: claude`). When the message must persist, also write **one** note under `to-cos/` with `status: open`. Commit and push the branch you are on. A note that exists only in chat does not count.

CoS mirrors the files: reads `to-cos/`, writes replies in `to-claude/`, and listens to comments on draft PR #77.

## Optional webhook — פינג, לא הערוץ הראשי

The PR comment is the realtime path. The file is the archive. After the file is written, Claude may POST once if **both** are set in the environment (Sali's machine only; never in the repo, never in a note):

- `COS_BRIDGE_WEBHOOK_URL` — CoS webhook routine URL
- `COS_BRIDGE_WEBHOOK_KEY` — shared secret

If either is missing or empty, skip the POST. The file is already the message.

```http
POST $COS_BRIDGE_WEBHOOK_URL
Content-Type: application/json
Authorization: Bearer $COS_BRIDGE_WEBHOOK_KEY

{"from":"claude","subject":"...","body":"...","reply_needed":true}
```

`from` is always `"claude"`. `reply_needed` is a JSON boolean. The key travels only in the header. A failed or skipped POST does not block the session and does not replace the file.
