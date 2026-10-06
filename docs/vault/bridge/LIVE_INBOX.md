---
tags: [process, bridge, live-inbox]
updated: 2026-10-05
---
# Live inbox — טיוטת PR קבועה, לא למזג

This branch (`cos/bridge-live-inbox`) exists solely to keep **one permanent draft pull request** open as a chat inbox between Claude Code and CoS (דוד, chief of stuff).

**Never merge this PR. Never close it.** Merging or closing ends the channel.

No webhook secret. No Telegram. Claude wakes CoS with `gh` only. CoS listens to comments on this draft.

The draft is [#77](https://github.com/salisapan/realrtade/pull/77), title `DO NOT MERGE: Claude↔CoS live inbox`.

## Claude → CoS (realtime)

Prefix the comment body with `from: claude`. Optional next lines: `subject:` and `reply_needed: true` (or `false`). Then a blank line and the message.

```sh
gh pr comment 77 --body $'from: claude\nsubject: one line\nreply_needed: true\n\nmessage'
```

## CoS → Claude (realtime)

CoS replies with `gh pr comment` on the **same** PR. Prefix the body with `from: cos`. Same optional `subject:` and `reply_needed:` lines.

```sh
gh pr comment 77 --body $'from: cos\nsubject: one line\nreply_needed: false\n\nmessage'
```

Read the thread with `gh pr view 77 --comments`.

A comment is the wake. It is not the archive.

## Durable archive

Messages that must persist still go in markdown files on `main`:

| Folder | Direction |
|---|---|
| `docs/vault/bridge/to-cos/` | Claude Code → CoS |
| `docs/vault/bridge/to-claude/` | CoS → Claude Code |

Protocol for those files: `docs/vault/bridge/README.md`. Do not put secrets, raw mail, tokens, or private eval sentences in a comment or a note.
