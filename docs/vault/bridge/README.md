---
tags: [process, bridge]
updated: 2026-10-05
---
# גשר Claude Code ↔ CoS

> **מה זה:** ערוץ הודעות בין Claude Code לבין CoS (Grok Bot «דוד», chief of stuff). טלגרם לא זמין ב־Grok Bot, אז הערוץ הוא קבצים בגיט.
> **מה זה לא:** מקור אמת. עובדות מוצר, מחירים, מה שיוצא מהמכשיר וכלל סגירה מתעדכנים ב־`CLAUDE.md` ובקבצי `docs/` לפי [[README]] §2. פתק בגשר לא מחליף את זה.

**The file drop is required.** A webhook ping is optional and only when the env vars below are set on Sali's machine. Never commit a URL, key, token, or secret.

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

**End of a session,** when CoS must know something (a handoff, a blocker, a question only CoS can answer). Write **one** note under `to-cos/` with `status: open`. Commit and push the branch you are on. A note that exists only in chat does not count.

CoS mirrors this: reads `to-cos/`, writes replies in `to-claude/`.

## Optional webhook — פינג, לא תחליף לקובץ

After the file is written, Claude may POST once if **both** are set in the environment (Sali's machine only; never in the repo, never in a note):

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
