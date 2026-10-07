---
tags: [locked]
source: docs/product-identity.md, docs/product-architecture.md, CLAUDE.md
---
# Forbidden claims

Summary only. The rules live in [[product-identity]] and [[product-architecture]]; `test/identity-copy-corpus.cjs` enforces the copy list. If this note and those docs disagree, the docs win.

## Never as the product definition
- "Chrome extension for Gmail", "Gmail add-on", "AI email assistant", "smart inbox".
- Tracking, a reminder or a prepared draft described as completion (preparation is not completion; true close only on real completion or a deliberate release).

## Never on a Glance surface (trial, pro-welcome, extension, store listing)
"AI-powered", "AI assistant", "AI inbox", "AI email", "smart inbox/email/assistant/replies", "understands your inbox/email", "copilot", "chatbot".

## Never stated without proof in the repo
- Any usage, conversion or revenue number (none exists in the repo: [[open-tasks]] row 33).
- A switch that is off described as live (deeper read server, hybrid, community learning, `REMOTE_CLASSIFY`).
- Glance sending anything on the person's behalf (it never sends; Outlook = reply **draft** only, on Do It).
- Compliance / regulated-industry wording for Glance or Pro (that is Flow's lane, and Flow claims only what is built).
- Pro as a team or enterprise tier (Pro = personal depth layer).

## Process rules that look like claims
- No Netlify deploy, no merge to `main`, without Sali.
- "Done" for a feature that was only tested against a fake (fake Microsoft, mock WhatsApp page, Gmail-shaped page) is written as "built and tested against a fake", not "works".
