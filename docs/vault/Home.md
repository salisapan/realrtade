---
tags: [home]
updated: 2026-10-05
---
# Home — Glance / Flow context vault

> **מה זה:** מטמון הקשר (context cache) בין צ׳אטים וסוכנים. קוראים כאן לפני שמתחילים זרם עבודה, כותבים כאן אחרי החלטה.
> **מה זה לא:** מקור אמת. האמת של הקוד והמוצר נשארת ב־`CLAUDE.md` + `docs/` (המפה: [[README]]). כשיש סתירה — המסמכים מנצחים, וה־vault מתוקן.

## Before you start a stream (2 minutes)
1. Skim this page and [[decisions]] (newest at the top).
2. Open the note for the stream you touch (below).
3. Then the normal reading order: `CLAUDE.md` → [[README]] → [[open-tasks]] → the topic owner doc.

## Locked and never changes in a chat
- [[glance-definition]] — the locked identity block (verbatim, checked by a test)
- [[forbidden-claims]] — what nobody writes about Glance

## Streams (one note each)
| Stream | Note | Owner doc(s) | Status source |
|---|---|---|---|
| Outlook end-to-end | [[outlook-status]] | [[multi-platform]] | [[open-tasks]] rows 21, 21b |
| Living toolbar icon | [[living-icon-handoff]] | [[product-identity]] (Visual identity) | this note |
| Open work, blockers | [[open-loops-pointer]] | [[open-tasks]] | [[open-tasks]] |

## Process
- [[when-to-write-to-vault]] — מתי כותבים ל־vault (and what goes to `docs/` in the same commit)
- New session log: Daily note → `vault/sessions/YYYY-MM-DD.md` (template [[session]])
- New decision: template [[decision]] → one line in [[decisions]] + the docs §2 files

## גשר Claude↔CoS
הודעות בין Claude Code ל־CoS (דוד, chief of stuff), בלי טלגרם. לא אמת מוצר. פרוטוקול: [[vault/bridge/README]].

## Where the repo lives
`salisapan/realrtade` · open this vault from `docs/` (Obsidian → *Open folder as vault* → `<repo>/docs`).
Never Netlify-deploy and never merge to `main` without Sali.
