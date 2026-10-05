# Flow / Glance

This repository holds two related products built on one shared idea — watch
a moment, recognize it, act on it, always reversibly — and the site that
sells both of them. See `docs/product-architecture.md` for the full split
and `CLAUDE.md` for standing rules on pricing/positioning copy.

## Layout

```
flow-trial-extension/   Glance — the Chrome extension (Flow Trial's Free/Pro tier).
                         Judgment runs on the device in this extension, plus
                         real write paths (Google Calendar/Tasks/Gmail,
                         Notion, HubSpot, Salesforce, Slack, Monday.com).
                         See its own README for setup, architecture, and how
                         to load it locally.

glance-gmail-addon/     Glance for Gmail on the web and in the Gmail iOS and
                         Android apps. Same judgment, executed in Google
                         Apps Script — not on the device. One Do It writes a
                         Calendar event, a Task, or a Gmail draft, and never
                         sends. See glance-gmail-addon/DEPLOY.md.

flow-landing/            The marketing site (theflow-ai.com) — homepage,
                         pricing, solutions pages, blog, and the Netlify
                         functions backing signup/waitlist/analytics.

docs/                    Cross-cutting product and design decisions that
                         apply to both of the above:
                           - product-architecture.md — the Flow Trial vs.
                             Flow (core) split; what each tier may and may
                             not claim.
                           - design-principles.md — standing UI/UX review
                             criteria for any change to the site or extension.

action-graph-video/      A Remotion project — the source for the Action
                         Graph promo video embedded on the homepage. Not
                         part of the live site's build; render it separately
                         and self-host the output when it needs updating.

scripts/                 Repo-level tooling (e.g. build-glance-engine.sh,
                         which syncs the extension's judgment engine into
                         flow-landing's live in-page demo).

supabase/                Migrations for the Glance/Flow landing Supabase
                         project zjquktirlrhbqcnkfaok (waitlist, enterprise
                         contact leads, the "Almost Missed" catches gallery).
                         Backs flow-landing. Not the RealTrade project
                         nlvljclvoguvrnntwufu. See supabase/README.md.
```

## Working on this repo

There is no single root build — `flow-landing/` and `flow-trial-extension/`
are independent projects with their own dependencies and their own READMEs.
Start in whichever one you're actually changing:

```sh
cd flow-landing && cat README.md          # marketing site
cd flow-trial-extension && cat README.md  # the Glance extension
```

## History note

This repo was originally scaffolded by Lovable for an unrelated project. That
scaffold (a generic Vite/React/shadcn starter with no connection to Flow or
Glance) has been removed — everything under `flow-landing/` and
`flow-trial-extension/` was built independently of it.
