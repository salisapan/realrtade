# Claude/Grok context parity — what a fresh clone does and doesn't give you

> **Update 2026-10-04.** The shared, in-repo reading order for any assistant is now `docs/README.md` (topic -> owning document -> code -> test, and "when X changes update Y").
> `CLAUDE.md` points to it first. The section lists below are a dated snapshot of 2026-09-27 and are not kept current; `docs/README.md` and `docs/open-tasks.md` are.
> **Update 2026-10-05.** The session-local context this document describes (decisions and why, stream state, the owner's own words) now has an in-repo home: the Obsidian vault at `docs/` (notes in `docs/vault/`, `docs/README.md` §5). It is a cache; the documents stay the truth.

**Identity (locked 2026-10-05):** Glance closes open loops. Gmail is where it starts today. Do not describe Glance as "a Chrome extension for Gmail": that is today's entry surface, not the product (`docs/product-identity.md`).

## Why this document exists

The `realrtade` product (Flow + Glance) is being worked on from two AI
assistants in parallel: Claude Code (this session, running against
`/home/user/realrtade`) and a Grok-based bot working from the same GitHub
repository (`github.com/salisapan/realrtade`). Both read the same commit
history and the same files once cloned — but an AI assistant's actual
working context is bigger than the repo it's pointed at. This document
draws an exact, verified line between:

- **What's already shared** — content that lives in this git repository, so
  any assistant that clones it and reads it has the same information Claude
  does. Nothing here is secret or Claude-exclusive.
- **What's structurally exclusive to a given assistant's own environment** —
  configuration that lives on the machine/account running that assistant,
  outside any repository. For Claude Code specifically, this is a stable,
  reusable rules layer (Section 1) that is *not* product-specific and could
  reasonably be checked into this repo so both assistants converge on it.
- **What's inherently session-local and cannot be "given" to another
  assistant by pointing it at a URL** — the accumulated back-and-forth of
  actually doing the work: decisions made and why, a running task log, and
  scratch planning files. Section 2 explains this category and gives a dated
  snapshot of this specific session's instances of it, so you have something
  concrete to hand to Grok today, but the category itself is the durable
  fact worth documenting, not today's specific contents (those will be
  stale the moment either assistant's session ends).

Every claim below was verified against the actual filesystem and `git
ls-files` output during this session (dated 2026-09-27), not asserted from
memory. Where a claim is a snapshot rather than a structural fact, it's
labeled as such.

---

# Section 1 — Environment-level configuration (stable; a durable, non-secret rules layer)

## 1.0 What is already in this git repository (so both assistants already have it)

Verified via `git ls-files` in `/home/user/realrtade`:

- `CLAUDE.md` — project-root instructions, including an "ECC Agent Routing
  Protocol" section that explicitly tells any assistant working in this repo
  to read `.claude/ecc-agents/INDEX.md` and `.claude/ecc-agents/full/<name>.md`
  before starting a task.
- `docs/product-architecture.md`, `docs/design-principles.md`,
  `docs/decision-filter.md`, `docs/magic-moment.md`, `docs/system-audit-2026-09.md`
  — the standing product/architecture/design constraints.
- `.claude/settings.json` — registers the `ecc@ecc`, `ui-ux-pro-max@ui-ux-pro-max-skill`,
  and `21st@21st` plugin marketplaces/enablement.
- `.claude/ecc-agents/INDEX.md` and `.claude/ecc-agents/full/*.md` (68 files)
  — a full library of role-specific engineering checklists (code-reviewer,
  security-reviewer, architect, python-reviewer, react-reviewer, tdd-guide,
  planner, and 60 more). **Verified byte-for-byte identical** (via `diff`,
  zero output) to the machine-global copy this Claude Code environment also
  has at `/root/.claude/rules/ecc/agents-index/full/`. This means Grok
  already has this content the moment it clones the repo — it is not
  something exclusive to Claude in any way.

The one small, verified difference: the machine-global copy of the *index*
file (`/root/.claude/rules/ecc/agents-index/README.md`) carries 21 extra
lines the git-committed `.claude/ecc-agents/INDEX.md` doesn't — see 1.2
below for the exact diff. Everything else in that pairing is identical.

## 1.1 What is NOT in this repository — the ECC `common/` and `web/` rule sets

This is the actual, structural gap: 17 files living at
`/root/.claude/rules/ecc/common/` (10 files) and
`/root/.claude/rules/ecc/web/` (7 files) on the machine running this Claude
Code session. They are:

- Not product-specific — generic engineering-quality rules (coding style,
  git workflow, testing, performance, security, code review process, hooks
  conventions, web-specific extensions of all of the above).
- Not secret — nothing in them is confidential, proprietary, or specific to
  this codebase.
- Genuinely absent from `git ls-files` output for this repo — confirmed,
  not assumed.

Because they're non-secret and generically useful, they're reproduced here
in full. If this document is committed to the repo, this becomes a
one-time fix for the gap: any assistant (Grok included) that reads this
file going forward starts from the same generic engineering baseline
Claude does.

### 1.1.1 `/root/.claude/rules/ecc/common/*.md` — 10 קבצים


### common/agents.md
```markdown
# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| rust-reviewer | Rust code review | Rust projects |
| harmonyos-app-resolver | HarmonyOS app development | HarmonyOS/ArkTS projects |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Delegation Completion Contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** Never end your turn with "waiting for background agents" — a spawned task is not a completed task. Ending your turn while children are running orphans their results (completed children cannot notify a parent whose turn has ended).
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent — depth is an outcome, not a plan.

> Rationale: observed failure mode — research agents followed "Parallel Task Execution" above, spawned children, and returned "waiting" as their final answer. All children completed successfully but their results were orphaned. The parallel rule without a completion contract produces zombie tasks.

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
```

### common/code-review.md
```markdown
# Code Review Standards

## Purpose

Code review ensures quality, security, and maintainability before code is merged. This rule defines when and how to conduct code reviews.

## When to Review

**MANDATORY review triggers:**

- After writing or modifying code
- Before any commit to shared branches
- When security-sensitive code is changed (auth, payments, user data)
- When architectural changes are made
- Before merging pull requests

**Pre-Review Requirements:**

Before requesting review, ensure:

- All automated checks (CI/CD) are passing
- Merge conflicts are resolved
- Branch is up to date with target branch

## Review Checklist

Before marking code complete:

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines)
- [ ] Source files are cohesive (under the 800-line soft maintainability ceiling, or include a reason for a deliberate exception)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No console.log or debug statements
- [ ] Tests exist for new functionality
- [ ] Test coverage meets 80% minimum

## Security Review Triggers

**STOP and use security-reviewer agent when:**

- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- External API calls
- Cryptographic operations
- Payment or financial code

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern, including an unexplained source file over the soft 800-line ceiling | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Agent Usage

Use these agents for code review:

| Agent | Purpose |
|-------|---------|
| **code-reviewer** | General code quality, patterns, best practices |
| **security-reviewer** | Security vulnerabilities, OWASP Top 10 |
| **typescript-reviewer** | TypeScript/JavaScript specific issues |
| **python-reviewer** | Python specific issues |
| **go-reviewer** | Go specific issues |
| **rust-reviewer** | Rust specific issues |

## Review Workflow

```
1. Run git diff to understand changes
2. Check security checklist first
3. Review code quality checklist
4. Run relevant tests
5. Verify coverage >= 80%
6. Use appropriate agent for detailed review
```

## Common Issues to Catch

### Security

- Hardcoded credentials (API keys, passwords, tokens)
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input)
- Path traversal (unsanitized file paths)
- CSRF protection missing
- Authentication bypasses

### Code Quality

- Large functions (>50 lines) - split into smaller
- Large files (>800 lines) - extract modules
- Deep nesting (>4 levels) - use early returns
- Missing error handling - handle explicitly
- Mutation patterns - prefer immutable operations
- Missing tests - add test coverage

### Performance

- N+1 queries - use JOINs or batching
- Missing pagination - add LIMIT to queries
- Unbounded queries - add constraints
- Missing caching - cache expensive operations

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: Only HIGH issues (merge with caution)
- **Block**: CRITICAL issues found

## Integration with Other Rules

This rule works with:

- [testing.md](testing.md) - Test coverage requirements
- [security.md](security.md) - Security checklist
- [git-workflow.md](git-workflow.md) - Commit standards
- [agents.md](agents.md) - Agent delegation
```

### common/coding-style.md
```markdown
# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) → changes original in-place
CORRECT: update(original, field, value) → returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency.

## Core Principles

### KISS (Keep It Simple)

- Prefer the simplest solution that actually works
- Avoid premature optimization
- Optimize for clarity over cleverness

### DRY (Don't Repeat Yourself)

- Extract repeated logic into shared functions or utilities
- Avoid copy-paste implementation drift
- Introduce abstractions when repetition is real, not speculative

### YAGNI (You Aren't Gonna Need It)

- Do not build features or abstractions before they are needed
- Avoid speculative generality
- Start simple, then refactor when the pressure is real

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, with 800 lines as a soft maintainability ceiling for source files
- Test, generated, and vendored files may exceed the ceiling when their size is justified by their role
- Extract utilities from large modules
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:
- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

## Input Validation

ALWAYS validate at system boundaries:
- Validate all user input before processing
- Use schema-based validation where available
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)

## Naming Conventions

- Variables and functions: `camelCase` with descriptive names
- Booleans: prefer `is`, `has`, `should`, or `can` prefixes
- Interfaces, types, and components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Custom hooks: `camelCase` with a `use` prefix

## Code Smells to Avoid

### Deep Nesting

Prefer early returns over nested conditionals once the logic starts stacking.

### Magic Numbers

Use named constants for meaningful thresholds, delays, and limits.

### Long Functions

Split large functions into focused pieces with clear responsibilities.

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)
```

### common/development-workflow.md
```markdown
# Development Workflow

> This file extends [common/git-workflow.md](./git-workflow.md) with the full feature development process that happens before git operations.

The Feature Implementation Workflow describes the development pipeline: research, planning, TDD, code review, and then committing to git.

## Feature Implementation Workflow

0. **Research & Reuse** _(mandatory before any new implementation)_
   - **GitHub code search first:** Run `gh search repos` and `gh search code` to find existing implementations, templates, and patterns before writing anything new.
   - **Library docs second:** Use Context7 or primary vendor docs to confirm API behavior, package usage, and version-specific details before implementing.
   - **Exa only when the first two are insufficient:** Use Exa for broader web research or discovery after GitHub search and primary docs.
   - **Check package registries:** Search npm, PyPI, crates.io, and other registries before writing utility code. Prefer battle-tested libraries over hand-rolled solutions.
   - **Search for adaptable implementations:** Look for open-source projects that solve 80%+ of the problem and can be forked, ported, or wrapped.
   - Prefer adopting or porting a proven approach over writing net-new code when it meets the requirement.

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Generate planning docs before coding: PRD, architecture, system_design, tech_doc, task_list
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format
   - See [git-workflow.md](./git-workflow.md) for commit message format and PR process

5. **Pre-Review Checks**
   - Verify all automated checks (CI/CD) are passing
   - Resolve any merge conflicts
   - Ensure branch is up to date with target branch
   - Only request review after these checks pass
```

### common/git-workflow.md
```markdown
# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: ECC-managed installs set `"includeCoAuthoredBy": false` in `~/.claude/settings.json`, so commits carry no `Co-Authored-By` trailer by default. To keep Claude attribution, set `"includeCoAuthoredBy": true` or configure `attribution`; ECC never overwrites an explicit choice.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
```

### common/hooks.md
```markdown
# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use dangerously-skip-permissions flag
- Configure `allowedTools` in `~/.claude.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements
```

### common/patterns.md
```markdown
# Common Patterns

## Skeleton Projects

When implementing new functionality:
1. Search for battle-tested skeleton projects
2. Use parallel agents to evaluate options:
   - Security assessment
   - Extensibility analysis
   - Relevance scoring
   - Implementation planning
3. Clone best match as foundation
4. Iterate within proven structure

## Design Patterns

### Repository Pattern

Encapsulate data access behind a consistent interface:
- Define standard operations: findAll, findById, create, update, delete
- Concrete implementations handle storage details (database, API, file, etc.)
- Business logic depends on the abstract interface, not the storage mechanism
- Enables easy swapping of data sources and simplifies testing with mocks

### API Response Format

Use a consistent envelope for all API responses:
- Include a success/status indicator
- Include the data payload (nullable on error)
- Include an error message field (nullable on success)
- Include metadata for paginated responses (total, page, limit)
```

### common/performance.md
```markdown
# Performance Optimization

## Model Selection Strategy

**Haiku** (90% of Sonnet capability, 3x cost savings):
- Lightweight agents with frequent invocation
- Pair programming and code generation
- Worker agents in multi-agent systems

**Sonnet** (Best coding model):
- Main development work
- Orchestrating multi-agent workflows
- Complex coding tasks

**Opus** (Deepest reasoning):
- Complex architectural decisions
- Maximum reasoning requirements
- Research and analysis tasks

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Extended Thinking + Plan Mode

Extended thinking is enabled by default, reserving up to 31,999 tokens for internal reasoning.

Control extended thinking via:
- **Toggle**: Option+T (macOS) / Alt+T (Windows/Linux)
- **Config**: Set `alwaysThinkingEnabled` in `~/.claude/settings.json`
- **Budget cap**: `export MAX_THINKING_TOKENS=10000` (bash) or `$env:MAX_THINKING_TOKENS = "10000"` (PowerShell)
- **Verbose mode**: Ctrl+O to see thinking output

For complex tasks requiring deep reasoning:
1. Ensure extended thinking is enabled (on by default)
2. Enable **Plan Mode** for structured approach
3. Use multiple critique rounds for thorough analysis
4. Use split role sub-agents for diverse perspectives

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
```

### common/security.md
```markdown
# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues
```

### common/testing.md
```markdown
# Testing Requirements

## Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (framework chosen per language)

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test('returns empty array when no markets match query', () => {})
test('throws error when API key is missing', () => {})
test('falls back to substring search when Redis is unavailable', () => {})
```
```

---

### 1.1.2 `/root/.claude/rules/ecc/web/*.md` — 7 קבצים

### web/coding-style.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/coding-style.md](../common/coding-style.md) with web-specific frontend content.

# Web Coding Style

## File Organization

Organize by feature or surface area, not by file type:

```text
src/
├── components/
│   ├── hero/
│   │   ├── Hero.tsx
│   │   ├── HeroVisual.tsx
│   │   └── hero.css
│   ├── scrolly-section/
│   │   ├── ScrollySection.tsx
│   │   ├── StickyVisual.tsx
│   │   └── scrolly.css
│   └── ui/
│       ├── Button.tsx
│       ├── SurfaceCard.tsx
│       └── AnimatedText.tsx
├── hooks/
│   ├── useReducedMotion.ts
│   └── useScrollProgress.ts
├── lib/
│   ├── animation.ts
│   └── color.ts
└── styles/
    ├── tokens.css
    ├── typography.css
    └── global.css
```

## CSS Custom Properties

Define design tokens as variables. Do not hardcode palette, typography, or spacing repeatedly:

```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-text: oklch(18% 0 0);
  --color-accent: oklch(68% 0.21 250);

  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --text-hero: clamp(3rem, 1rem + 7vw, 8rem);

  --space-section: clamp(4rem, 3rem + 5vw, 10rem);

  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## Animation-Only Properties

Prefer compositor-friendly motion:
- `transform`
- `opacity`
- `clip-path`
- `filter` (sparingly)

Avoid animating layout-bound properties:
- `width`
- `height`
- `top`
- `left`
- `margin`
- `padding`
- `border`
- `font-size`

## Semantic HTML First

```html
<header>
  <nav aria-label="Main navigation">...</nav>
</header>
<main>
  <section aria-labelledby="hero-heading">
    <h1 id="hero-heading">...</h1>
  </section>
</main>
<footer>...</footer>
```

Do not reach for generic wrapper `div` stacks when a semantic element exists.

## Naming

- Components: PascalCase (`ScrollySection`, `SurfaceCard`)
- Hooks: `use` prefix (`useReducedMotion`)
- CSS classes: kebab-case or utility classes
- Animation timelines: camelCase with intent (`heroRevealTl`)
```

### web/design-quality.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/patterns.md](../common/patterns.md) with web-specific design-quality guidance.

# Web Design Quality Standards

## Anti-Template Policy

Do not ship generic template-looking UI. Frontend output should look intentional, opinionated, and specific to the product.

### Banned Patterns

- Default card grids with uniform spacing and no hierarchy
- Stock hero section with centered headline, gradient blob, and generic CTA
- Unmodified library defaults passed off as finished design
- Flat layouts with no layering, depth, or motion
- Uniform radius, spacing, and shadows across every component
- Safe gray-on-white styling with one decorative accent color
- Dashboard-by-numbers layouts with sidebar + cards + charts and no point of view
- Default font stacks used without a deliberate reason

### Required Qualities

Every meaningful frontend surface should demonstrate at least four of these:

1. Clear hierarchy through scale contrast
2. Intentional rhythm in spacing, not uniform padding everywhere
3. Depth or layering through overlap, shadows, surfaces, or motion
4. Typography with character and a real pairing strategy
5. Color used semantically, not just decoratively
6. Hover, focus, and active states that feel designed
7. Grid-breaking editorial or bento composition where appropriate
8. Texture, grain, or atmosphere when it fits the visual direction
9. Motion that clarifies flow instead of distracting from it
10. Data visualization treated as part of the design system, not an afterthought

## Before Writing Frontend Code

1. Pick a specific style direction. Avoid vague defaults like "clean minimal".
2. Define a palette intentionally.
3. Choose typography deliberately.
4. Gather at least a small set of real references.
5. Use ECC design/frontend skills where relevant.

## Worthwhile Style Directions

- Editorial / magazine
- Neo-brutalism
- Glassmorphism with real depth
- Dark luxury or light luxury with disciplined contrast
- Bento layouts
- Scrollytelling
- 3D integration
- Swiss / International
- Retro-futurism

Do not default to dark mode automatically. Choose the visual direction the product actually wants.

## Component Checklist

- [ ] Does it avoid looking like a default Tailwind or shadcn template?
- [ ] Does it have intentional hover/focus/active states?
- [ ] Does it use hierarchy rather than uniform emphasis?
- [ ] Would this look believable in a real product screenshot?
- [ ] If it supports both themes, do both light and dark feel intentional?
```

### web/hooks.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/hooks.md](../common/hooks.md) with web-specific hook recommendations.

# Web Hooks

## Recommended PostToolUse Hooks

Prefer project-local tooling. Do not wire hooks to remote one-off package execution.

### Format on Save

Use the project's existing formatter entrypoint after edits:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "pnpm prettier --write \"$FILE_PATH\"",
        "description": "Format edited frontend files"
      }
    ]
  }
}
```

Equivalent local commands via `yarn prettier` or `npm exec prettier --` are fine when they use repo-owned dependencies.

### Lint Check

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "pnpm eslint --fix \"$FILE_PATH\"",
        "description": "Run ESLint on edited frontend files"
      }
    ]
  }
}
```

### Type Check

Use `--incremental` so re-runs reuse the previous `.tsbuildinfo` (1-3s on unchanged code instead of 30-60s every time). Wrap in `timeout` so a stuck tsc gets reaped by the OS instead of accumulating across edits — this prevents the multi-process buildup that happens when edits fire faster than tsc finishes.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "timeout 60 pnpm tsc --noEmit --pretty false --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo",
        "description": "Type-check after frontend edits (incremental + timeout-capped)"
      }
    ]
  }
}
```

**Why both flags matter:**
- Without `--incremental`, every edit re-checks the entire program from scratch. On a real Next.js project this stacks fast: edits at 5-10s intervals + 30-60s tsc runs = N concurrent tsc processes.
- Without `timeout`, a tsc that hangs (transitive dep change, type-checker stuck on a recursive type) never exits and orphans when the parent shell does.
- `--tsBuildInfoFile` is required because `--noEmit` normally suppresses the buildinfo write; specifying the path explicitly keeps incremental working.

If you're on Windows without GNU coreutils, swap `timeout 60` for a PowerShell wrapper or rely on a Stop/SessionEnd hook to sweep stale tsc processes.

### CSS Lint

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "pnpm stylelint --fix \"$FILE_PATH\"",
        "description": "Lint edited stylesheets"
      }
    ]
  }
}
```

## PreToolUse Hooks

### Guard File Size

Block oversized writes from tool input content, not from a file that may not exist yet:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const c=i.tool_input?.content||'';const lines=c.split('\\n').length;if(lines>800){console.error('[Hook] BLOCKED: File exceeds 800 lines ('+lines+' lines)');console.error('[Hook] Split into smaller modules');process.exit(2)}console.log(d)})\"",
        "description": "Block writes that exceed 800 lines"
      }
    ]
  }
}
```

## Stop Hooks

### Final Build Verification

```json
{
  "hooks": {
    "Stop": [
      {
        "command": "pnpm build",
        "description": "Verify the production build at session end"
      }
    ]
  }
}
```

## Ordering

Recommended order:
1. format
2. lint
3. type check
4. build verification
```

### web/patterns.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/patterns.md](../common/patterns.md) with web-specific patterns.

# Web Patterns

## Component Composition

### Compound Components

Use compound components when related UI shares state and interaction semantics:

```tsx
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="overview">...</Tabs.Content>
  <Tabs.Content value="settings">...</Tabs.Content>
</Tabs>
```

- Parent owns state
- Children consume via context
- Prefer this over prop drilling for complex widgets

### Render Props / Slots

- Use render props or slot patterns when behavior is shared but markup must vary
- Keep keyboard handling, ARIA, and focus logic in the headless layer

### Container / Presentational Split

- Container components own data loading and side effects
- Presentational components receive props and render UI
- Presentational components should stay pure

## State Management

Treat these separately:

| Concern | Tooling |
|---------|---------|
| Server state | TanStack Query, SWR, tRPC |
| Client state | Zustand, Jotai, signals |
| URL state | search params, route segments |
| Form state | React Hook Form or equivalent |

- Do not duplicate server state into client stores
- Derive values instead of storing redundant computed state

## URL As State

Persist shareable state in the URL:
- filters
- sort order
- pagination
- active tab
- search query

## Data Fetching

### Stale-While-Revalidate

- Return cached data immediately
- Revalidate in the background
- Prefer existing libraries instead of rolling this by hand

### Optimistic Updates

- Snapshot current state
- Apply optimistic update
- Roll back on failure
- Emit visible error feedback when rolling back

### Parallel Loading

- Fetch independent data in parallel
- Avoid parent-child request waterfalls
- Prefetch likely next routes or states when justified
```

### web/performance.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/performance.md](../common/performance.md) with web-specific performance content.

# Web Performance Rules

## Core Web Vitals Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| FCP | < 1.5s |
| TBT | < 200ms |

## Bundle Budget

| Page Type | JS Budget (gzipped) | CSS Budget |
|-----------|---------------------|------------|
| Landing page | < 150kb | < 30kb |
| App page | < 300kb | < 50kb |
| Microsite | < 80kb | < 15kb |

## Loading Strategy

1. Inline critical above-the-fold CSS where justified
2. Preload the hero image and primary font only
3. Defer non-critical CSS or JS
4. Dynamically import heavy libraries

```js
const gsapModule = await import('gsap');
const { ScrollTrigger } = await import('gsap/ScrollTrigger');
```

## Image Optimization

- Explicit `width` and `height`
- `loading="eager"` plus `fetchpriority="high"` for hero media only
- `loading="lazy"` for below-the-fold assets
- Prefer AVIF or WebP with fallbacks
- Never ship source images far beyond rendered size

## Font Loading

- Max two font families unless there is a clear exception
- `font-display: swap`
- Subset where possible
- Preload only the truly critical weight/style

## Animation Performance

- Animate compositor-friendly properties only
- Use `will-change` narrowly and remove it when done
- Prefer CSS for simple transitions
- Use `requestAnimationFrame` or established animation libraries for JS motion
- Avoid scroll handler churn; use IntersectionObserver or well-behaved libraries

## Performance Checklist

- [ ] All images have explicit dimensions
- [ ] No accidental render-blocking resources
- [ ] No layout shifts from dynamic content
- [ ] Motion stays on compositor-friendly properties
- [ ] Third-party scripts load async/defer and only when needed
```

### web/security.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/security.md](../common/security.md) with web-specific security content.

# Web Security Rules

## Content Security Policy

Always configure a production CSP.

### Nonce-Based CSP

Use a per-request nonce for scripts instead of `'unsafe-inline'`.

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{RANDOM}' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.example.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
```

Adjust origins to the project. Do not cargo-cult this block unchanged.

## XSS Prevention

- Never inject unsanitized HTML
- Avoid `innerHTML` / `dangerouslySetInnerHTML` unless sanitized first
- Escape dynamic template values
- Sanitize user HTML with a vetted local sanitizer when absolutely necessary

## Third-Party Scripts

- Load asynchronously
- Use SRI when serving from a CDN
- Audit quarterly
- Prefer self-hosting for critical dependencies when practical

## HTTPS and Headers

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Forms

- CSRF protection on state-changing forms
- Rate limiting on submission endpoints
- Validate client and server side
- Prefer honeypots or light anti-abuse controls over heavy-handed CAPTCHA defaults
```

### web/testing.md
```markdown
---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/testing.md](../common/testing.md) with web-specific testing content.

# Web Testing Rules

## Priority Order

### 1. Visual Regression

- Screenshot key breakpoints: 320, 768, 1024, 1440
- Test hero sections, scrollytelling sections, and meaningful states
- Use Playwright screenshots for visual-heavy work
- If both themes exist, test both

### 2. Accessibility

- Run automated accessibility checks
- Test keyboard navigation
- Verify reduced-motion behavior
- Verify color contrast

### 3. Performance

- Run Lighthouse or equivalent against meaningful pages
- Keep CWV targets from [performance.md](performance.md)

### 4. Cross-Browser

- Minimum: Chrome, Firefox, Safari
- Test scrolling, motion, and fallback behavior

### 5. Responsive

- Test 320, 375, 768, 1024, 1440, 1920
- Verify no overflow
- Verify touch interactions

## E2E Shape

```ts
import { test, expect } from '@playwright/test';

test('landing hero loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
```

- Avoid flaky timeout-based assertions
- Prefer deterministic waits

## Unit Tests

- Test utilities, data transforms, and custom hooks
- For highly visual components, visual regression often carries more signal than brittle markup assertions
- Visual regression supplements coverage targets; it does not replace them
```

---

## 1.2 ההערה הנוספת שקיימת רק בגרסה המקומית של ה-INDEX

קובץ ה-`.claude/ecc-agents/INDEX.md` שב-git (וגרוק יראה) שונה ב-21 שורות מהגרסה
המקומית שלי ב-`/root/.claude/rules/ecc/agents-index/README.md`. ההבדל המדויק:

```diff
3c3,5
< Built from https://github.com/affaan-m/ECC agents/*.md — 68 entries.
---
> Built from https://github.com/affaan-m/ECC `agents/*.md` — 68 entries, committed
> here (`full/`) so the routing protocol in the repo root `CLAUDE.md` works from
> any clone, not just the container it was first indexed in.
5,8c7,15
< These are NOT installed as real Agent-tool subagent_types in this session
< (no ecc@ecc plugin materialized). Used as self-adopted persona/checklist
< text: read the matching agents/<name>.md body and follow its checklist
< when a task matches its description.
---
> These are NOT installed as real Agent-tool subagent_types — no `ecc@ecc` plugin
> has been observed to materialize in any session so far (checked
> `~/.claude/plugins/installed_plugins.json`; empty). Used instead as
> self-adopted persona/checklist text: read the matching `full/<name>.md` body
> and follow its checklist when a task matches its description. For work where
> a genuinely fresh-context review matters (e.g. `code-reviewer` or
> `security-reviewer` catching what the implementer was blind to), prefer
> spawning a real `general-purpose` Agent primed with that file's contents
> over self-adopting the persona inline.
```

(שורות שמתחילות ב-`<` = הגרסה המקומית שלי בלבד; שורות שמתחילות ב-`>` = הגרסה
שב-git, שגרוק יראה. ה-`<` כולל את המשפט המפורש: "no ecc@ecc plugin materialized"
ואת ההמלצה להריץ Agent אמיתי לביקורות קוד קריטיות במקום self-adopt.)

---


---

# Section 2 — Session-level context (structurally exclusive; cannot be "shared" by pointing at a URL)

This is a different kind of gap than Section 1. There is no file to commit
that closes it, because its contents are the *process* of doing the work,
not a fixed reference document. Three categories, each explained once as a
durable fact about how any AI coding assistant's environment works, then
illustrated with this session's own current contents as of 2026-09-27 (a
snapshot — it will be different, and larger, by the time you read this).

## 2.1 Conversation history — what it is, structurally

Every message exchanged between the user and the assistant in an ongoing
session: what was asked, what was tried, what broke, what was decided and
why, corrections the user made along the way. This is where the *reasoning
behind* a decision lives — the "why" that a committed file's final state
never fully captures on its own. Two assistants working from the same
repository can converge on different next steps if only one of them was
present for the conversation that ruled certain approaches out.

It is not stored anywhere outside the session itself unless someone
deliberately writes a decision down into a committed file (a code comment,
a `docs/*.md` entry, a commit message). Nothing about it is secret; it is
simply not persisted anywhere Grok could read it from a repo clone.

### 2.1.1 Snapshot: this session's conversation history (as of 2026-09-27)


הסשן הזה כלל שני חלקים: חלק ראשון שסוכם (compacted) על ידי המערכת כי היה ארוך
מדי, וחלק שני (מכאן ואילך) שנמצא במלואו. הנה שחזור מלא של שניהם:

### שלב א׳ — התקנת התוסף (Google OAuth)

המשתמש ביקש הדרכה להתקנת תוסף הכרום "Glance". עברנו יחד:
- יצירת פרויקט ב-Google Cloud Console ("Flow Extension")
- הקמת OAuth consent screen, הוספת test users
- זיהוי ה-Extension ID (`dnjhplgmnkabbjogfpbhofjedlkehkai`)
- יצירת Client ID (`93977330357-hsd2u2bjg480q135juftdpkvo5hcsn7j.apps.googleusercontent.com`) והכנסתו ל-`manifest.json`
- תיקון שגיאת 403 "access_denied" — לא הושלם תהליך אימות גוגל (Testing mode, נדרש להוסיף test user — נפתר)
- תיקון שגיאת 403 "could not read task lists" — התברר שיצירת OAuth Client ID לא מפעילה אוטומטית את ה-APIs עצמם (Tasks/Calendar/Gmail/Drive) בפרויקט Cloud חדש — נדרש להפעיל כל API בנפרד תחת APIs & Services → Library
- המשתמש הבחין בבעיית שקיפות אמיתית: כפתור "Connect Google Tasks" רמז שההרשאה מוגבלת ל-Tasks בלבד, בעוד שבפועל `chrome.identity.getAuthToken` ללא scopes override מבקש את כל 4 ה-scopes בבת אחת (tasks, calendar.events, gmail.compose, drive) — תוקן: שינוי הלייבל מ-"Google Tasks" ל-"Google", עדכון ה-note בקובץ `core/connectors.js` כך שיסביר בדיוק מה כל scope עושה

### שלב ב׳ — דיון אסטרטגי טהור (ללא שינויי קוד, לפי בקשה מפורשת)

המשתמש דיווח על ביקורת מחבר: האתר מערבב בבלבול בין מסרי Flow (ארגוני) ו-Glance
(תוסף חינמי), ו-Glance "נראה חלש" לעומת מתחרים. המשתמש ביקש רק דעה, לא שינויים.
נתתי דעה ראשונית (שהייתה עמוסה מדי בז'רגון — המשתמש ציין "לא הבנתי"), ואז
פישטתי. המשתמש ביקש אופציות נוספות מעבר ל"להפריד בבירור" — נתתי 7 אופציות.
נשאל "מה הכי טוב?" ואז "איך פרסום ל-Chrome Web Store משנה את ההמלצה?" ולבסוף
"אז מה כרגע כן אתה חושב שכדאי לבצע מאלו" — לחץ לתשובה קונקרטית וישימה.

המשתמש אישר לבצע אופציות #2+#4, עם שני סייגים מפורשים:
- לגבי #2: אנשים עדיין צריכים להגיע ל-Glance, רק שיהיה יותר ממוסגר וברור
  שזה לא מוצר Flow — לא להסתיר, רק להפריד ויזואלית/מבנית.
- לגבי #4: Glance עדיין צריך להיות ממוצג כמוצר אמיתי שפותר כאב — לא כ"מוכיח
  ומשכנע" (proof-of-Flow framing).

בוצע: שכתוב `.hero-glance` ב-`flow-landing/index.html` — נוספה `.hero-glance-tag`
(תווית + נקודה), הקופי שוכתב מ"הוכחה ל-Flow" למסגור עצמאי שפותר כאב בעצמו.
עודכן ה-CSS ב-`assets/home.css` — כרטיס עם border/panel/shadow, במקום מפריד דק.

### שלב ג׳ — Side Panel

המשתמש ביקש שפאנל הכוונון של התוסף ייפתח בצד הדף, כמו Cowork, במקום כ-popup
נפתח. שונה `manifest.json`: הוסר `action.default_popup`, נוסף
`"side_panel": {"default_path": "popup/popup.html"}` ו-`"sidePanel"` להרשאות.
ב-`background.js` נוסף `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true})`.

**באג אמיתי שנגרם על ידי:** הקריאה הראשונה הייתה top-level, לא מוגנת — אם
`chrome.sidePanel` לא היה קיים, זריקת שגיאה סינכרונית הייתה מקריסה את כל ה-
service worker לפני שכל handler נרשם. המשתמש דיווח "עשיתי רענון וכלום לא עובד".
אובחן ותוקן: עטיפת הקריאה ב-`try/if` מוגן. אומת ב-2 הרצות VM-sandbox (עם/בלי
stub של `chrome.sidePanel`).

**שגיאה שנייה, לא קשורה:** "Extension context invalidated" ב-`storage.js:30`.
זוהתה נכון כארטיפקט כרום מוכר ושפיר — נובע מטעינה מחדש של תוסף בעוד טאב Gmail
ישן פתוח עם content script ישן. הפתרון: לרענן את הטאב, לא את התוסף.

**אי-הבנה אמיתית של המשתמש**, שתוקנה בעדינות פעמיים: המשתמש ביקש שאתחבר
לחשבון גוגל שלו/אמק שלו ואפעיל "Cowork" כדי להבין למה זה לא עובד ("יש לך גישה
לכל"), ולאחר מכן: "אאבל אתה עובד דרך הקלוד לMAC", "אז איך לאנשים אחרים יש לך
גישה למק שלהם", ו"אני רוצה עכשיו גישה אמיצתית ושאאחרי שנסיר את זה אתה תבצע
הכל!" — הובהר שוב ושוב, בבירור אך בלי לזלזל: זהו סשן ענן/מרוחק, ללא שום גישה
פיזית למחשב המשתמש, ללא קשר לאיזה קליינט הוא מתקשר דרכו — הדרך היחידה
לגישה אמיתית היא התקנת Claude Code מקומית על המחשב שלו (סשן שונה לגמרי).

### שלב ד׳ — שני דיווחי באג/פיצ'ר אמיתיים

לאחר שהתוסף עבד שוב:
1. Task שנוצר לא כתב את התוכן שלו (Amount/Date/From בלבד, בלי המשפט המצוטט)
2. התוסף לא באמת נכנס לדרייב לבדוק אם קובץ מבוקש קיים ומצרף אותו — "זו המטרה
   של המוצר, לבצע משימות ולא רק לכתוב שיש משימה חדשה"

**Root cause לבאג #1:** `buildActionPayload()`'s ה-`googleTask` branch (ב-
`content-gmail.js`) העביר רק `facts`, מעולם לא `entities` — כך ש-`factLines()`
ב-`background.js` לא יכל לגשת ל-`entities.what`/`requestWhat` (המשפט המצוטט
עצמו), רק מטא-דאטה (סכום/תאריך/שולח/נושא). **תוקן:** העברת `entities`, הוספת
שורת `Quote` ל-`factLines()`, עם חיתוך ב-400 תווים + `…`. נוספו 3 בדיקות
regression חדשות (ציטוט אמיתי מופיע; אין ציטוט → אין שורת Quote; ציטוט של 500
תווים נחתך מתחת ל-450 עם `…`), פלוס הרחבת ה-harness לתפוס גם את גוף הבקשה
עצמו (לא רק method+URL כמו קודם) — בדיוק הפער שאיפשר לבאג הזה לחמוק בלי
שום בדיקה שתפסה אותו.

תיקון אגבי: `test/popup-open-corpus.cjs` נכשל בגלל fixture ישן ("Google Tasks")
משינוי שם קודם ("Google") — תוקן ה-assertion, לא קוד המוצר.

### שלב ה׳ — בניית פיצ'ר חיפוש-אוטומטי-בדרייב (הבקשה: "בנה. את 2")

המשתמש נתן אור ירוק ברור וחד-משמעי. נבנה:

- **`core/intent.js`**: חילוץ `requestedObjectTerm`/`requestedObjectMatch` דרך
  `.exec()` (לא רק `.test()`) מול `REQUESTED_OBJECT`/`REQUESTED_OBJECT_HE` —
  כדי לתפוס את שם העצם המדויק שתאם (למשל "invoice", "חוזה") ולהשתמש בו
  כמונח חיפוש בדרייב. נוסף ל-`entities` המוחזרים מ-`finish()`.
- **`core/actions.js`**: `draftAction()` — `mayFindFile = hasAttachment ||
  Boolean(e.requestedObjectTerm)`, נכנס ל-label/hint; `requestedObjectTerm`
  נכנס ל-`params` של הצעד המוחזר.
- **`src/background.js`**: שכתוב מלא של `gmailDraftWrite()` — 3 דרגי resolution
  לצרופה: (1) `thread` — קובץ שכבר מצורף ל-thread, (2) `picked` — קובץ שנבחר
  ידנית מהפיקר, (3) `auto` — חדש: `driveSearchAttachment(term)` שמחפש בדרייב
  לפי `name contains` / `fullText contains`, מדלג על קבצים גדולים מדי (8MB)
  לפי גודל שדווח ב-list *לפני* הורדת תוכן, מוריד את ההתאמה המעודכנת ביותר.
  `draftBodyText()` מוסיף הערת "please confirm it's the right file before
  sending" רק כאשר `attachmentSource === 'auto'`. שדה `target` בתשובה מסמן
  קובץ שנמצא אוטומטית כ"unverified".
- **`manifest.json`**: הרחבת ה-scope מ-`drive.file` ל-`drive.readonly`.
- **`core/connectors.js`**: עדכון הערת דיוק פנימית כדי לשקף את ה-scope החדש.

**אימות:** `node --check` על כל הקבצים ששונו; הרצת כל 15 (ואז 17) חבילות
הבדיקה. נמצא כשל אחד ב-`test/intent-actions-corpus.cjs` ("Draft label without
attachment is Draft reply") — לא רגרסיה אמיתית אלא הודעת הבדיקה שהפכה
מיושנת: ההודעה שנבדקה ("send me the signed contract") כן מכילה מונח
מוכר ("contract"), כך שעכשיו בצדק `mayFindFile=true` גם בלי thread attachment
— זו התנהגות חדשה נכונה, לא באג. תוקן: ההודעה הישנה שונתה למשפט REQUEST
אמיתי בלי מונח מוכר (path של `hasConcreteAnchor` בלבד — "confirm by
Friday, September 18") בשביל לבדוק את המקרה "בלי צרופה ובלי מונח" באמת,
ונוספו 4 בדיקות חדשות שמתעדות את ההתנהגות החדשה במפורש.

נכתבו **6 תרחישי regression חדשים** ב-`test/background-write-corpus.cjs`
(שדרשו גם תוספת `btoa`/`atob`/`crypto` ל-sandbox של הבדיקות, ופונקציית
`decodeDraftRaw()` שמפענחת base64url→MIME→ מזהה attachment filename וטקסט
גוף):
1. טיוטה רגילה בלי מה לצרף — הצלחה, בלי צרופה, בלי הערת אימות, ובלי קריאה
   כלשהי ל-Drive
2. חיפוש אוטומטי מוצלח בדרייב — קובץ נמצא, מצורף, עם ה-flag של "unverified"
3. חיפוש ריק — עדיין הצלחה, בלי צרופה, בלי הערה מזויפת
4. צרופת thread אמיתית תמיד מנצחת ניחוש דרייב — Drive אף פעם לא נשאל אם כבר
   יש צרופה אמיתית (מוכח על ידי כך שה-route של Drive לא הוגדר בכלל, ואם
   הקוד היה קורא לו בכל זאת, זה היה חוזר 500 ומוסתר בשקט — בדיוק המקרה
   שהבדיקה נועדה לתפוס)
5. מועמד גדול מדי בתוצאות דרייב מדולג בלי הורדה, המועמד הבא מנוסה
6. (חלק מ-4) — האימות שה-`target` וגוף הטיוטה משקפים במדויק את מקור הצרופה

### שלב ו׳ — ביקורת go/no-go מלאה + תיקון תיעוד

בהמשך ("המשך") ביצעתי ביקורת מקיפה:
- אימתתי שתוכנית ה-plan הישנה (`shiny-herding-bonbon.md`, ראה חלק 4 למטה)
  כבר בוצעה במלואה — כל 4 הפריטים המומלצים שם כבר תוקנו בעבר, שום דבר לא
  נותר.
- מצאתי פער אמיתי חדש: 3 מסמכים עדיין תיארו את ה-scope הישן (`drive.file`)
  אחרי שהורחב ל-`drive.readonly`:
  1. `flow-landing/privacy.html` — לא תיאר בכלל את יכולת החיפוש האוטומטי;
     נוספה פסקה מדויקת.
  2. `flow-trial-extension/README.md` — עדיין הראה `drive.file` ותיאר אותו
     כ"אף פעם לא גישה גורפת" — ההפך מהמצב האמיתי. תוקן, + אזהרה חדשה:
     `drive.readonly` נמצא ב-"restricted scope" של גוגל (לא רק "sensitive"
     כמו 3 ה-scopes האחרים) — verification משמעותית יותר כבד להשקה ציבורית.
  3. `docs/chrome-web-store-submission.md` — טבלת justification להרשאות
     תוארה רק את הפיקר הידני; עודכנה לתאר את שתי הדרכים (ידני + אוטומטי),
     ונוספה הערה שטבלת סיווג הנתונים אולי לא מכסה "תוכן מדרייב" כקטגוריה
     נפרדת — צריך בדיקה מול הטופס האמיתי של CWS.
- כל 17 חבילות בדיקה עדיין ירוקות אחרי כל השינויים.

### שלב ז׳ — שאלה חד-משפטית על Flow

המשתמש ביקש תיאור חד-משפטי של Flow (המוצר הארגוני). ניתן תיאור המבוסס על
`docs/product-architecture.md`: מערכת שצופה ברגעי החלטה במייל ומבצעת אותם
ישירות במערכות הארגון, עם פריסה מאובטחת ל-regulated orgs (SSO/audit
log/DPA), בשונה מ-Glance (self-serve, נתונים לא-רגישים).

### שלב ח׳ — פוש ל-Netlify + בדיקת דיפלוי

המשתמש ביקש להעלות את כל העדכונים לנטיפיי "בפעם אחת בלי לבזבז טוקנים".
בוצע: `git add -A` (15 קבצים ששונו), commit אחד עם הודעה מפורטת (כולל
attribution trailer שהושלם רק ב-amend שני, אחרי שנשכח בקומיט הראשון —
מותר לתקן כי טרם נדחף), ו-`git push` (82 קומיטים בסך הכל, כולל 81 שהמתינו
מראש). אומת מול Netlify MCP: הפרויקט `the-flow-ai` (site URL
`theflow-ai.com`) בנה ופרסם בדיוק את הקומיט הזה (`b096cbb`), state=`ready`,
secret scan נקי (0 ממצאים מתוך 159 קבצים שנסרקו).

כשנשאל "דרך איזה חשבון אתה עושה את הדפלוי" — הובהר שאין לי חשבון Netlify
עצמאי; רק דחפתי ל-GitHub, ו-Netlify (דרך auto-deploy on push שכבר מוגדר
בחשבון **של המשתמש**) עשה את שאר העבודה.

### שלב ט׳ — השאלה על גרוק (הטריגר למסמך הזה)

המשתמש דיווח שהתחיל לעבוד עם בוט Grok על אותו repo ב-GitHub, ושאל אם זו
בעיה ומי "יותר טוב". ניתנה תשובה: לא בעיה מובנית, אבל סיכון אמיתי אם אין
תיאום (קונפליקטים בגיט, החלטות סותרות אם גרוק לא נחשף לאותם מסמכי-על). לא
ניתנה תשובה סובייקטיבית ל"מי יותר טוב" — רק העובדה שלי יש היסטוריה מצטברת
של הפרויקט הזה שגרוק לא יביא איתו מאפס.

לאחר מכן נשאל במפורש איזה תוכן נגיש לי ולא בהכרח לגרוק דרך ה-git — נבדק
בפועל (לא ניחוש): `.claude/ecc-agents/full/*.md` **כן** ב-git (זהה ביט-לביט
לעותק המקומי שלי) — תיקון לתשובה ראשונית שגויה. מה שבאמת בלעדי: 17 קבצי
`common/`+`web/`, הפרש קטן בקובץ ה-INDEX, היסטוריית השיחה, רשימת המשימות,
וקבצי plan זמניים. זהו המסמך המלא שמרכז את כל ארבעת אלה, לבקשת המשתמש.

---

## 2.2 Internal task tracking — what it is, structurally

Claude Code's harness (the software running this assistant, separate from
the model itself) offers a lightweight task-list feature the assistant can
use to track multi-step work across a long session — create an item, mark
it in-progress, mark it done. This list is stored at the harness/session
level, not in any file the repository would contain, and is not readable
through any API a separate assistant (Grok or otherwise) could reach. It
functions as an informal running changelog of everything attempted, in
order, whether or not each attempt became a permanent commit.

### 2.2.1 Snapshot: this session's task list (as of 2026-09-27) — 175 items


זו רשימה שמנוהלת על ידי ה-harness (Claude Code) ברמת ה-session/סביבה, לא ב-git,
לא נגישה לשום כלי חיצוני. זהו כל ה-log, מהתחלת הפרויקט ועד עכשיו:

```
#1. [completed] Add security headers (_headers file)
#2. [completed] Create Privacy Policy and Terms of Service pages
#3. [completed] Add GA4 analytics with placeholder ID + conversion event
#4. [completed] Implement double opt-in email confirmation
#5. [completed] Build shared corridor-hero CSS/keyframes for blog pages
#6. [completed] Add corridor hero to all 30 article pages (top of page)
#7. [completed] Add corridor hero to blog index, keep scrollable grid below
#8. [completed] Respect reduced-motion in Insights carousel (homepage)
#9. [completed] Static fallback layout for corridor hero under reduced-motion
#10. [completed] Add always-visible mobile captions to Insights carousel cards
#11. [completed] Pause corridor + carousel animation when tab is hidden
#12. [completed] Add GA4 click tracking on carousel/corridor cards
#13. [completed] Extract and self-host the 29 PDF images, replace CDN links
#14. [completed] De-duplicate inline logo and shrink homepage payload
#15. [completed] Add 404 page, favicon assets, manifest, skip-link
#16. [completed] Create Security, About, Contact, Pricing pages
#17. [completed] Create industry solution pages (healthcare, legal, financial services)
#18. [completed] Wire new pages into nav, footer, sitemap
#19. [completed] Add JSON-LD structured data to 8 new pages
#20. [completed] Compress og.png, email-logo.png, email-doit-button.png
#21. [completed] Link 30 articles to relevant solutions pages
#22. [completed] Replace education-ai-ferpa external image with local one
#23. [completed] Self-host Action Graph video (was task #22-adjacent)
#24. [completed] Build Flow Trial extension skeleton (Phase 1, no API keys)
#25. [completed] Build /trial.html landing page for Flow Trial
#26. [completed] Wire trial signup into confirm-signup / new send-trial-access email
#27. [completed] Localize Flow Trial extension to English (fix Hebrew/English mismatch)
#28. [completed] Build real HubSpot OAuth + API write in the extension
#29. [completed] Gate the extension ZIP download behind confirmed email
#30. [completed] Apply trial.html content/UX critique fixes
#31. [completed] Remove circular Insights carousel from homepage
#32. [completed] Fix Google search result favicon (shows generic globe)
#33. [completed] Fix blog corridor-hero images hidden behind unreadable text
#34. [completed] Fix Action Graph video not appearing on scroll
#35. [completed] Fix mobile viewport zoom-out overflow bug
#36. [completed] Fix smudged/blurry Flow wordmark in mobile menu
#37. [completed] Clarify trial.html hero — unclear what the product is
#38. [completed] Unify design across all non-homepage pages, hamburger-only nav
#39. [completed] Verify Flow Trial signup/download flow actually works end-to-end
#40. [completed] Restore high-quality Flow logo (fix smudged wordmark)
#41. [completed] Replace Action Graph video with canvas scroll animation
#42. [completed] Fix mobile pinch-zoom-out blanking the screen
#43. [completed] Sharpen the free Flow Trial product and its positioning
#44. [completed] Premium design alignment across all non-homepage pages
#45. [completed] Install Everything Claude Code (ECC) into this environment
#46. [completed] Comprehensive site audit (ECC code-reviewer + performance-optimizer + a11y-architect)
#47. [completed] Security audit: form endpoints, third-party scripts, secrets hygiene
#48. [completed] Deep audit of Flow Trial product (value, wow-effect, growth, stickiness, ecosystem)
#49. [completed] Fix keyboard nav on trial.html connector/domain picker (radiogroup a11y)
#50. [completed] Self-host education-ai-ferpa hero image (task #22)
#51. [completed] Add referral/share loop to extension popup
#52. [completed] Track connector/domain picker choices via GA4 event
#53. [completed] Build real Salesforce connector (OAuth + API write)
#54. [completed] Build real Slack connector (OAuth + chat.postMessage write)
#55. [completed] Build real Monday.com connector (OAuth + API write)
#56. [completed] Modernize visual design further (site-wide pass)
#57. [completed] Rewrite homepage hero H1/subhead for 5-second clarity
#58. [completed] Unify default theme to dark across all 41 non-homepage pages
#59. [completed] Tighten jargon-heavy titles in homepage Architecture section
#60. [completed] Expand trial.html picker to feel more intuitive/inviting
#61. [completed] Add shimmering glass CTA button after the picker (vanilla, Flow-branded copy)
#62. [completed] Replace homepage Insights section images with a 3D coverflow carousel
#63. [completed] Add animated breathing gradient background to end of trial.html
#64. [completed] Rebuild trial.html hero to match responsive-hero-banner pattern (blue)
#65. [completed] Rewrite trial.html copy for clarity
#66. [completed] Implement 3-tier pricing table on pricing.html
#67. [completed] Wire real GA4 Measurement ID sitewide
#68. [completed] Migrate Flow signups to dedicated Supabase project
#69. [completed] Split pricing.html into two visually distinct products
#70. [completed] Rebuild homepage conversion architecture (waitlist → dual product paths)
#71. [completed] Replace mailto-only contact page with a real enterprise lead-qualification form
#72. [completed] Instrument the full funnel with GA4 events
#73. [completed] Rebrand Flow Trial → Glance: finalize logo assets
#74. [completed] Fix send-trial-access.js Flow branding
#75. [completed] Fix send-confirmation.js Flow branding
#76. [completed] Fix confirm-signup.js Flow branding
#77. [completed] Fix download-trial-zip.js Flow branding
#78. [completed] Spot-check 53 batch-replaced files
#79. [completed] Commit and push Glance rebrand
#80. [completed] Answer user's recipe/automation-sharing question
#81. [completed] Redesign about.html team section
#82. [completed] Elevate Glance positioning beyond 'free Gmail extension'
#83. [completed] Write and publish Glance product spec document
#84. [completed] Fix trial.html hero: black rectangle bug + light theme
#85. [completed] Remove 'See It In Action' button and badge pill from trial.html hero
#86. [completed] Rewrite trial.html hero headline/subhead copy
#87. [completed] Reorder trial.html sections: data-use + FAQ below Get Glance
#88. [completed] Redesign trial.html setup/characterization section
#89. [completed] Fix and relocate 'Set Up My Glance' glass-cta button
#90. [completed] Style selected team-size pill like the Do It button
#91. [completed] Investigate: Glance signup shows success but no email arrives
#92. [completed] Fix large empty gap after FAQ section on trial.html
#93. [completed] Restructure hamburger menu (sitewide)
#94. [completed] Fix confusing 'Request pricing' copy on contact.html
#95. [completed] Unify font site-wide to match homepage's font
#96. [completed] Restructure homepage: lead with Flow, then a Glance sub-section
#97. [completed] Homepage: replace 'Talk to Us' with Do-It CTA to email-first waitlist flow
#98. [completed] Upgrade Action Graph visual on homepage
#99. [completed] Fix pricing.html: tier-cta buttons -> Do It style + fix Notify Me/Request Pricing
#100. [completed] Fix privacy.html stale Playbook/discovery-call references
#101. [completed] Fix stale 'Playbook PDF' code comment in index.html
#102. [completed] Fix 30 blog posts + 404.html: 'Talk to Us About Flow' CTA friction
#103. [completed] Fix homepage legal-demo 'Talk to Us About Your Firm' CTA
#104. [completed] Audit Solutions pages for same issues
#105. [completed] Audit Chrome extension popup for Do-It design consistency
#106. [completed] Audit email templates for stale Playbook/Talk-to-Us language
#107. [completed] Audit about.html for stale Flow-vs-Glance positioning
#108. [completed] Add legal+support corpus cases, verify all 6 domains fire
#109. [completed] Create flow-landing/assets/glance-engine.js + sync script
#110. [completed] Wire live demo into trial.html specimen + picker
#111. [completed] Add free-text 'try your own line' demo input
#112. [completed] Verify live demo end-to-end (Playwright)
#113. [completed] Ship hero polish items 1-4 (safe shortlist)
#114. [completed] Phase 1: design tokens
#115. [completed] Phase 2: card consolidation
#116. [completed] Phase 3: hero padding bug + proportions
#117. [completed] Phase 6: remove G CTA badge
#118. [completed] Phase 4: H1 + lead copy rewrite
#119. [completed] Phase 5: demo section clarity pass
#120. [completed] Full verification pass
#121. [completed] Rework 'Send Me the Playbook' into a deal-closing lead flow
#122. [completed] Rebuild homepage hero visualization as 3D glowing cone network
#123. [completed] Center/redesign 'Ready to Reclaim Your Workflows' + Get Glance section
#124. [completed] Fix asymmetric section on trial.html (screenshot 2)
#125. [completed] Fix Supabase writes for form/email signups
#126. [completed] Fix nav: persistent Home link + collapse Solutions submenu
#127. [completed] Redesign blog/index.html in Apple-style minimal design language
#128. [completed] Extend Apple redesign to 30 blog article pages
#129. [completed] Move founders to top of about.html + Apple-clean redesign
#130. [completed] Rigorous post-upgrade verification (2 parallel reviewer agents)
#131. [completed] Bind submit-waitlist update to its create step with a signed token
#132. [completed] Glance extension: 4-feature roadmap (Privacy Shield, Draft-It, Attachment X-ray, CRM+Doc orchestrator)
#133. [completed] Build missed-deadline.html viral acquisition tool
#134. [completed] Fix mobile hero blue-sun rendering on trial.html
#135. [completed] Unify font-family across all 47 pages
#136. [completed] Site-wide performance pass
#137. [completed] Apple-style component polish pass
#138. [completed] Audit and test docreader.js / docwriter.js
#139. [completed] Weekly Closing Summary
#140. [completed] Subtle Persistent Indicator (extension icon badge)
#141. [completed] Contextual Resurfacing
#142. [completed] Unified Open Items Surface (popup)
#143. [completed] Architecture prep: tag process entries with source app
#144. [completed] Core/client architecture split (Glance vs future Flow)
#145. [completed] Fix execution-memory.js unserialized read-modify-write race
#146. [completed] Prevent duplicate/stale writes: re-check hasTerminalOutcome before acting
#147. [completed] Await storage writes before checkBrief() refresh
#148. [completed] Single source of truth for installId (drop duplicated generator)
#149. [completed] Per-intent-type precision/harm calibration + auto threshold tuning
#150. [completed] Higher-level pattern detection + silent self-tuning
#151. [completed] Magic Moment definition + first-ever-write closure copy
#152. [completed] Test + verify + commit the data-intelligence layer
#153. [completed] PMF metrics: durable counters + core/pmf-metrics.js + weekly-habit anonymous event
#154. [completed] Multi-host architecture readiness (beyond Gmail, no Outlook build)
#155. [completed] Enforce the strategic decision filter as a standing doc
#156. [completed] Test, verify, and commit the PMF + multi-host + filter work
#157. [completed] Full system audit + hardening pass (stabilization phase)
#158. [completed] Sharpen the closing experience + fix chip language coherence
#159. [completed] Website messaging/positioning sharpening pass (flow-landing)
#160. [completed] Broad quality-upgrade pass across Glance (detection, execution memory, stickiness)
#161. [completed] Design & implement organic growth-loop foundations for Glance
#162. [completed] Reality/proof phase: install-readiness, measurement, stabilization, magic moment, data layer, simplification
#163. [completed] Core value pass: closure quality, precision, consistency
#164. [completed] Cumulative value, simplicity, and install readiness pass
#165. [completed] Operational reliability + opinionated primary-loop pass (autonomous)
#166. [completed] Continue reliability sweep: brief.js, sidebar.js, weekly.js, core modules
#167. [completed] Pre-launch trust & coherence pass for Glance
#168. [completed] Apple-style design audit of flow-landing site (proposal only)
#169. [in_progress] Distill Glance's visible surface (simple/magical) while preserving all engine systems
#170. [completed] Widen COMMITMENT_OF_READER evidence gate (item 1)
#171. [completed] Date-only SCHEDULED_EVENT + all-day Calendar write (item 2)
#172. [completed] Self-calibration for hard-gated types (item 3)
#173. [completed] Local privacy-safe miss-rate telemetry (item 4)
#174. [completed] Massively broaden local (non-AI) classification vocabulary
#175. [completed] Full pre-ZIP reliability audit (go/no-go)
```

---

## 2.3 Plan-mode scratch files — what it is, structurally

When this assistant is asked to plan something substantial before
executing, Claude Code can enter a "plan mode" that produces a scratch
planning file on the local machine (under `/root/.claude/plans/` in this
environment), separate from the repository. It's a working document for
that one planning pass — read, acted on or revised, and eventually
superseded or discarded as the container/session ends. It was never
intended to be a permanent artifact, which is exactly why it was never
committed, but its contents (a concrete audit with file-level findings) are
genuinely useful context if the work it covers hasn't been done yet.

### 2.3.1 Snapshot: this session's most recent plan file


זהו קובץ תוכנית שנוצר כשהייתי במצב "plan mode" מוקדם יותר בסשן — ביקורת מלאה
של האתר מול `docs/design-principles.md`. קובץ זה חי רק תחת `/root/.claude/plans/`
על המכונה הזו, נמחק/מוחלף כשה-container הזה מסתיים, ולעולם לא היה חלק מהריפו.

```markdown
# Plan: Pre-deploy audit against docs/design-principles.md

## Context

Before pushing the trial.html redesign live, the product owner asked for a
full site audit against `docs/design-principles.md`'s 12 standing review
principles (5 "core" ones + 7 "additional" ones), across all 44 HTML pages
(9 core pages, 4 solutions pages, 31 blog pages), to catch anything that
would bother them before deploy.

The audit is done — combination of my own repo-wide greps/reads and one
Explore agent's deep read of the 5 highest-stakes pages (`index.html`,
`pricing.html`, `contact.html`, `about.html`, `security.html`). Findings
below, organized by principle, each tagged with a priority. **Nothing found
is a hard blocker** — the site is in solid shape — but there are a few real,
fixable issues and one product-level judgment call worth your input before
going live.

---

## Findings by principle

### P1 — Total design consistency (canonical `.doit` CTA)
**Clean, site-wide.** Grepped all 44 pages for competing button classes
(`class="btn"`, `.button`, `.cta-btn`, inline-styled `<button>`) — zero
matches in actual markup. Every real CTA on every page uses the canonical
`.doit` shell/ring/shine component.
- Minor cleanup only: a dead, unused `.btn{...}` CSS ruleset is
  copy-pasted into 4 page templates' inline `<style>` (`pricing.html`,
  `contact.html`, `about.html`, `security.html`) — never referenced in any
  markup. `assets/flow-premium.css` even has a comment noting `.btn` "is
  gone from the markup" — but nobody deleted the dead copies. **Priority:
  low, safe cleanup.**

### P2 — Zero gap between promise and reality
**Mostly clean** — pricing.html's "Notify Me" (Pro tier) and the homepage
"Playbook" waitlist are both real, working double-opt-in flows with honest
copy, not stubs. One thing worth your decision:
- **Homepage integrations marquee** (`index.html:442-473`) shows ~16
  integration logos (Salesforce, HubSpot, Slack, Excel, Google Drive,
  Notion, Jira, Outlook, Word, iManage, Zoom, Dropbox, Asana, QuickBooks,
  WhatsApp...) under a headline that doesn't say whether this is Flow's or
  Glance's integration surface. But Glance (the product the homepage hero
  leads with) only supports **5** connectors, one active at a time
  (Notion/HubSpot/Salesforce/Slack/Monday.com — and Monday.com isn't even
  in the marquee). A visitor could reasonably assume Glance works with all
  16 logos shown. **This is the one finding I'd flag as worth fixing before
  this deploy** — either label the marquee as Flow's (enterprise)
  integration surface, or trim it to Glance's real 5 connectors depending
  on what the section is meant to represent. **Priority: medium-high, needs
  your call on which product the marquee should represent.**
- Stale code comment in `index.html:1237` says a post-signup field is
  "mandatory," but the actual code and on-page copy both correctly treat it
  as optional — the UI is honest, only the comment is wrong. Landmine for a
  future edit. **Priority: low, safe cleanup.**

### P3 — Friction is the enemy
**Real finding: `contact.html`.** Page order is: 8-field enterprise
qualification form (name/email/org/role/seats/deployment/timeline/message)
first, then near the very bottom, the low-commitment "just want to try it?
Glance — free" path. Only email is actually required server-side, but
visually the heavy form dominates and the light option is buried after it
— exactly the pattern this principle flags. **Priority: medium — a real
UX improvement, but pre-existing (not touched by this session's redesign)
and a bigger structural edit (reordering a page), so flagging rather than
including in the default fix set unless you want it now.**

### P4 — Logical experience ordering
**`index.html` is clean** — hero introduces Flow-vs-Glance before the
email-capture waitlist section at the bottom. **`contact.html`** has the
same ordering issue as P3 (light option ordered last, not first/alongside).

### P5 — Visual bugs are always-urgent
**No confirmed visual bugs** in static review. Every canvas/JS animation
across the 5 audited pages checks `prefers-reduced-motion` and either
skips or resolves to a static end-state — no exceptions found. One
contrast issue below (P9) would read as a visual bug once rendered.

### P6 — Flow vs. Glance hierarchy
**Clean.** Explicit, careful framing on every page that mentions both —
`pricing.html` gives the two products visibly different heading treatments
by design (with a code comment explaining why), `contact.html` explicitly
disclaims Glance as "a separate product... not intended for sensitive or
regulated data," and `security.html`/`about.html` don't mention Glance at
all, so no blurring risk there.

### P7 — Hunt down every reference to a removed/renamed thing
**Real finding: dead i18n entries in `index.html`.** The JS translation
dictionary (`index.html:622-850`) still carries three entire dead
sections' worth of translated strings with no corresponding markup
anywhere on the page: a 6-card "Security & Compliance" grid (`s1.t`
through `s6.b`), a second differently-worded 6-pillar "Architecture"
section (`a1.t` through `a6.b`), and a full "Who it's for" use-case section
(`uc.eyebrow` through `uc4.b`) — leftovers from earlier page versions.
Zero runtime impact (dead JS object keys), but it's the "fixed in one
place, not the other" pattern this principle is about. Same category as
the duplicated dead `.btn{}` CSS from P1. **Priority: low, safe cleanup.**

### P8 — Every interactive element needs a real destination
**Clean.** Checked every internal link from the 5 audited pages (solutions
pages, blog, privacy/terms, trial.html, deep-linked blog articles, coverflow
images, founder photos) — all resolve to real files. No dead anchors.

### P9 — Light and dark theme both "done"
**Real, concrete finding.** `pricing.html`'s Pro-tier email-validation
error message (`.tier-notify-status.err{color:#C0392B}`, line 124) has
**no dark-theme override** — renders at ~3.7:1 contrast on the dark navy
background, under WCAG AA and visibly duller than intended. The identical
component on `contact.html` (`.lf-msg.err`) was already correctly fixed
with a dark-theme override (`#FF8A80`) — the fix just never made it to
pricing.html's copy of the same pattern. **Priority: high — one-line CSS
fix, real bug, on a real interactive form. Recommend fixing now.**

### P10 — Fix the same pattern everywhere, not just where flagged
**Directly the P9 finding** — the error-color dark-theme fix exists on one
page and not its sibling. Also covers the P1/P7 dead-CSS-and-i18n cleanup
(same pattern, 4 templates).

### P11 — Copy quality, no generic filler
**Clean.** Searched all 5 audited pages for common SaaS filler
("revolutionary," "seamless," "cutting-edge," "game-changing," etc.) — the
only hit was inside a JS code comment, not user-facing copy. Every claim
checked is specific and falsifiable (exact prices, named connectors, named
compliance frameworks, a specific reply-time commitment, named founders).

### P12 — Not done until visually confirmed
Process note, not a finding: the P9 contrast estimate and any "animation
looks fine" conclusion above come from reading source, not a rendered
screenshot. Whatever gets fixed from this list should get an actual
Playwright check (both themes) before being called done, same as the
trial.html redesign was.

### My own finding, outside the 12 principles: design-token fragmentation
Independent of anything above: the site currently runs **at least 4
separate, independently-maintained design-token systems** — `home.css`
(homepage), `trial.html`'s own inline tokens (just rebuilt this session),
`assets/flow-premium.css` (shared "premium" layer loaded by the other 42
pages), and each blog/solutions page's *own* inline `<style>` block with
its own `--bg/--txt/--accent/...` set (confirmed slightly different even
between two solutions pages I read directly). This is why trial.html's new
blue-tinted shadow (`rgba(28,64,150,...)`, matched to home.css) and
flow-premium.css's existing blue-tinted shadow (`rgba(11,20,45,...)`) are
similar in spirit but not numerically identical — a real, if subtle,
site-wide consistency gap. **Not a pre-deploy blocker** — it's pre-existing
architecture debt, not something this session's changes created or made
worse, and consolidating 4 token systems into 1 is a real project, not a
quick fix. Flagging as a recommended future pass, not part of this plan.

---

## Recommended fix set for this deploy

Small, safe, unambiguous — no product decisions required:

1. **`pricing.html` dark-theme error color** (P9/P10): add
   `:root[data-theme="dark"] .tier-notify-status.err{color:#FF8A80}` next
   to the existing light-theme rule, matching `contact.html`'s already-
   correct pattern exactly.
2. **Delete the 3 dead i18n blocks** in `index.html` (`s1.*`–`s6.*`,
   `a1.*`–`a6.*`, `uc.*`/`uc1.*`–`uc4.*`) (P7).
3. **Delete the dead `.btn{...}` ruleset** from `pricing.html`,
   `contact.html`, `about.html`, `security.html` (P1/P7).
4. **Fix the stale code comment** in `index.html:1237` so it matches the
   actual (correct) optional-field behavior (P2).

## Flagged for your decision, not included by default

- **Homepage integrations marquee vs. Glance's real 5 connectors** (P2) —
  needs a call on what the marquee is meant to represent before I touch
  copy on the highest-traffic page.
- **`contact.html` friction reorder** (P3/P4) — moving the low-commitment
  Glance path above/alongside the qualification form is a real structural
  edit to a page outside this session's redesign scope; flagging rather
  than assuming you want it done now.
- **Design-token consolidation** (4 systems → 1) — a real future project,
  not a quick pre-deploy fix.

## Verification

Same convention as the trial.html redesign: serve locally, Playwright
screenshot `pricing.html`'s Pro-tier error state in both themes (trigger
by submitting an invalid email) to confirm the contrast fix renders
correctly; grep to confirm the deleted i18n keys and `.btn` rules have zero
remaining references; no other page's rendering should change at all
(these are subtractive/isolated fixes).

### Critical files
- `flow-landing/pricing.html`
- `flow-landing/index.html`
- `flow-landing/contact.html`, `flow-landing/about.html`,
  `flow-landing/security.html` (dead `.btn{}` only)
```

---

# 3. Practical recommendation

If the goal is giving Grok (or any other assistant working on this repo) a
comparable starting baseline:

1. **Point it explicitly at `CLAUDE.md` and every file under `docs/`**, and
   instruct it to read them *before* making any product or design decision
   — they're already committed, so this costs nothing and closes most of
   the real gap.
2. **Commit this document** (or just Section 1's rule content) if you want
   the generic engineering-rules layer to stop being Claude-exclusive. It's
   non-secret and non-product-specific, so there's no downside to sharing
   it.
3. **Don't expect Section 2 to transfer.** No document can hand another
   assistant "having been present for the conversation." The only real
   mitigation is discipline on both sides: when a decision gets made in
   conversation that should constrain future work, write it into a
   committed file (a `docs/*.md` entry, a code comment explaining the
   *why*, a commit message that states the reasoning) — that's the
   mechanism that actually survives across assistants and across sessions,
   not a transcript dump.
4. **If both assistants will keep working on this repo concurrently**,
   the practical risk isn't "who has more context" — it's uncoordinated
   edits to the same files/branch. Give them separate branches, or make
   sure whichever one goes second re-reads the current `main` before
   proposing changes.
