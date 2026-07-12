# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout — two unrelated projects in one repo

This repo hosts **two separate, unrelated deployables**. Don't assume a change in one affects the other.

1. **Root app (`src/`, `public/`, `supabase/`)** — "realrtade", a Vite + React + TypeScript real-estate investment platform, backed by Supabase. This is the primary codebase (see below).
2. **`flow-landing/`** — a single self-contained static HTML file (`index.html`, no build step) for an unrelated product ("Flow — Cognitive Workflow Engine"). Deployed to Netlify directly from this folder (see `flow-landing/netlify.toml`: base directory `flow-landing`, publish `.`, no build command). It shares the Supabase project only via the `waitlist` table/edge function described below. Edit `flow-landing/index.html` directly; there is nothing to build or lint for it.

This project was created with **Lovable** (lovable.dev) and can also be edited there — pushes to this repo sync both ways. The `lovable-tagger` Vite plugin runs only in dev mode to tag components for Lovable's editor; it has no effect on production builds.

## Commands (root app)

```bash
npm i              # install deps
npm run dev        # start Vite dev server at http://127.0.0.1:8080
npm run build      # production build
npm run build:dev  # build in development mode (unminified, for debugging a build-only issue)
npm run preview    # preview a production build locally
npm run lint       # eslint over the whole repo
```

There is no test runner configured (`@playwright/test` is a devDependency but no config or spec files exist yet, and no `test` script is defined). Verify changes via `npm run lint`, `npm run build`, and manual exercise through `npm run dev`.

## Architecture (root app)

### Routing and auth model
Everything routes through `src/App.tsx`, a single flat `<Routes>` tree (no nested layout routes). There are three gate components defined inline in `App.tsx`, not real auth:
- `ProtectedRoute` — redirects to `/auth` unless `localStorage.getItem("investorProfile")` is set.
- `AccreditedRoute` — additionally requires `is_accredited`/`isAccredited` on that stored profile, else redirects to `/verified-deals`.
- `AdminRoute` — currently a no-op passthrough (admin routes are unprotected placeholders).

Real Supabase auth state (`supabase.auth.getSession()` / `onAuthStateChange`) is only used to populate/clear the `investorProfile` localStorage blob by reading the `profiles` table — the localStorage flag, not the Supabase session, is what routes actually check. When adding new gated routes or changing auth, keep this dual bookkeeping in mind (session vs. localStorage profile can drift).

### Supabase integration
- Client: `src/integrations/supabase/client.ts` — hardcoded project URL + anon key (this is the public anon key, not a secret; the file is Lovable-generated, marked "do not edit directly").
- Types: `src/integrations/supabase/types.ts` — generated `Database` type. Tables currently modeled here: `developers`, `investments`, `profiles`, `properties`. Regenerate with the Supabase CLI rather than hand-editing after schema changes.
- The `waitlist` table (used only by `flow-landing`) is defined in `supabase/migrations/` but is **not** in `types.ts` — it's a separate concern from the main app's data model.
- `supabase/functions/send-waitlist-welcome/` is a Deno Edge Function triggered by a Database Webhook on `waitlist` inserts; see its `README.md` for the manual Resend/webhook setup steps (secrets can't be set from this sandbox).

### Domain areas (`src/pages` + matching `src/components/<area>`)
The app is organized by investor/business role rather than by generic feature layer:
- **investor** — registration (`InvestorRegistrationPage`/`InvestorRegistration`, `schemas/investorSchema.ts` for Zod validation), dashboard, wallet, performance, reports, recommendations.
- **entrepreneur** — separate registration/portal/due-diligence/reports flow (`EntrepreneurPortal`, `EntrepreneurRegistration`, `DueDiligencePortal`, `TransactionReports`).
- **property** — the largest component tree (`src/components/property/**`), covering property detail pages, developer profiles (tabbed sub-views under `property/developer/`), investment calculator, letter-of-intent and investment forms (`property/form/**`), and AI/market-insight display panels.
- **admin** — `/admin/*` workspace (`WorkspaceLayout` + per-page content components under `components/admin/**`); routes are currently unauthenticated placeholders.
- **forum**, **wallet**, **performance**, **recommendations**, **landing** — one components folder each, matching a page of the same name.
- `src/components/ui/` — shadcn-ui primitives (Radix-based). Treat these as generated/vendored; extend via composition in feature components rather than editing primitives, and use the shadcn CLI conventions in `components.json` (aliases `@/components`, `@/lib`, `@/hooks`, `@/components/ui`) when adding new shadcn components.

### Mock/demo external integrations
`src/utils/FirecrawlService.ts` and `src/utils/CherreDataService.ts` are **mock implementations** — they store API keys in localStorage but return hardcoded fake data rather than calling Firecrawl/Cherre. Don't assume property market data or web-crawl results are ever real; if wiring up genuine API calls, replace these mocks rather than layering on top of them.

### Static data
`src/data/**` holds hand-written fixture data (developer profiles, property listings, forum posts, entrepreneur/non-accredited deal data) used in place of live Supabase queries in several UI areas. `src/data/developers/` splits per-developer fixtures (`extellData.ts`, `pinnacleData.ts`, `urbanHorizonData.ts`) behind a shared `types.ts` and re-exported through `index.ts`.

### Styling conventions
- Tailwind config (`tailwind.config.ts`) defines most brand colors (`primary`, `secondary`, `card`, `muted`, `background`, `foreground`) as **hardcoded hex values**, not all routed through CSS variables — only `border`/`input`/`ring` use the `hsl(var(--x))` pattern set up in `src/index.css`. Keep this split in mind when theming: changing `--radius`/`--border` etc. in `index.css` affects only the variable-backed tokens.
- Path alias `@/*` → `src/*` is defined in both `tsconfig.app.json` and `vite.config.ts` — keep them in sync if it ever changes.
- TypeScript strictness is intentionally relaxed repo-wide (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`, `noUnusedLocals`/`noUnusedParameters: false` in `tsconfig.app.json`; `@typescript-eslint/no-unused-vars` is off in `eslint.config.js`). Don't add stricter local overrides that fight this baseline.
