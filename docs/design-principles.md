# Design & UX review principles

> Distilled by the product owner from a long series of live feedback passes
> on the site (2026-09-07). These are standing review criteria, not a
> one-time checklist — apply them to every future UI, copy, or flow change,
> and re-check existing pages against them whenever a nearby page changes.
> When a fix to one page reveals the same problem exists elsewhere, fix it
> everywhere in the same pass rather than waiting to be told about each
> instance separately (see principle 10).

## The five core principles (verbatim from the product owner)

### 1. עיצוב אחיד לחלוטין — total design consistency

כל כפתור ראשי חייב להיראות כמו Do It (shell/ring/shine). לא כפתור שטוח, לא
כפתור אחר "שנשכח" מאיזה עיצוב ישן.

Every primary call-to-action must use the canonical `.doit` component
(shell/ring/shine glass pill — defined once in `flow-premium.css` /
`home.css`). A flat solid-color button, a bespoke one-off button class, or
any leftover pre-redesign button style is a defect the moment it's found,
even if nobody explicitly flagged that specific page yet.

### 2. אפס חפיפה בין הבטחה למציאות — zero gap between promise and reality

אם הכפתור אומר "Request pricing" זה חייב להתקשר למחיר. אם נכתב "Playbook"
זה חייב שיהיה קובץ אמיתי שנשלח. טקסט שלא תואם את מה שבאמת קורה מתויג מיד.

If a button or a sentence names a specific noun ("pricing," "Playbook," "a
real number," "we'll be in touch"), the code path behind it must actually
deliver that exact thing — no more, no less. Before rewriting copy that
removes a promise, verify what the current code path *actually does*
end-to-end (grep the real handler, not just the page that calls it) —
assuming an asset or step doesn't exist without checking is exactly the
kind of promise/reality mismatch this principle exists to prevent.

### 3. חיכוך = אויב — friction is the enemy

כל צעד "כבד" (טופס חיצוני, "Talk to Us", שיחת מכירה) לפני שהמשתמש התחייב
למשהו קטן צריך להיעלם או לזוז לסוף.

Any heavy step — an external qualification form, a "Talk to Us" CTA, a
sales-call ask — placed *before* the visitor has committed to something
small (an email address) is friction working against conversion. Move it
to after the small commitment, or remove it. This applies uniformly:
finding it acceptable on the homepage hero but not on a blog post's
closing CTA is inconsistent application of the same rule.

### 4. סדר לוגי של חוויית משתמש — logical experience ordering

סקשנים/שדות חייבים להופיע בסדר שבו אדם באמת חווה אותם (לא "פרטיות" לפני
"התקנה", לא Glance לפני Flow).

Section and field order on a page must match the order a real person
encounters them in the actual flow — not the order that was easiest to
build, or the historical order features were added in. When two products
or two steps are shown together, the more foundational one leads.

### 5. תקלות ויזואליות = חוסמות — visual bugs are blockers

כל דבר ש"נראה שבור" (גרף כאוטי, ריבוע שחור, פער ריק, זוהר חד-צדדי) מקבל
עדיפות דחופה, גם בלי שהתבקש בפירוש.

Anything that visually reads as broken — a chaotic scroll animation, a
solid block hiding a background layer, an empty gap where content should
be, an asymmetric glow/shadow that looks like a rendering error — is an
urgent-priority defect the moment it's noticed, independent of whether it
was the thing actually asked about that session.

## Additional principles (derived from this session's pattern of findings)

These follow from applying the five principles above literally and
repeatedly across the codebase — each one below was learned from a
concrete instance where a fix was applied in one place but the same defect
was still live somewhere else.

### 6. Positioning hierarchy must hold everywhere it's mentioned, not just where it was defined

Flow (enterprise) and Glance (self-serve) must read as two distinct
products — with a consistent hierarchy between them — on *every* page that
mentions both, not only on the one page where the distinction was most
recently clarified. See `docs/product-architecture.md` §4 for the specific
product rule this generalizes from.

### 7. A structural rename or removal isn't done until every reference to the old thing is gone

When a flow, section, or concept is renamed, restructured, or retired
(e.g. "Playbook" copy removed from a page), every other place that names
the same thing — other pages, transactional emails, privacy-policy
language, code comments — must be hunted down and reconciled in the same
pass. A page-level fix that leaves the backend, the legal copy, or a
sibling page describing the old behavior is a new promise/reality mismatch
(principle 2), just moved one layer down.

### 8. Every interactive element needs a real destination

A `mailto:` link, a "coming soon" stub, or a dead anchor reads as broken to
a visitor even when it was an intentional placeholder for unbuilt backend
work. If the real thing isn't built yet, the visible affordance should
either not exist yet, or should route into the same real, working capture
mechanism used elsewhere on the site (e.g. the double opt-in waitlist),
not a link class of its own that quietly fails on managed/corporate
devices.

### 9. Light and dark theme are both "done," or neither is

Every new or changed component must be verified in both themes before it's
considered finished — a component that only looks right in one theme is
the same category of defect as principle 5's visual bugs, just gated
behind a toggle instead of always visible.

### 10. Fix the pattern everywhere in the same pass, not just where it was flagged

When a review finds an instance of one of these principles being violated,
grep the rest of the codebase for the same pattern before considering the
fix complete. A fix applied to only the page that was explicitly mentioned,
while identical instances remain elsewhere, is an incomplete fix that will
just generate the same feedback again on the next page the reviewer
happens to look at.

### 11. Copy earns its place — no generic SaaS filler

Every sentence should say something specific and verifiably true about how
the product actually behaves — a real field name, a real threshold, a real
worked example — rather than generic category language ("revolutionary,"
"AI-powered," "seamless"). If a sentence would be equally true of a
competitor's product with the words swapped, it isn't saying anything.

### 12. A fix isn't confirmed until it's seen running, in both themes, at more than one breakpoint

Before calling a UI fix complete, render the actual page (not just read
the diff) and check it visually — desktop and mobile, light and dark where
applicable — the same way every fix in this session was verified via
Playwright screenshots before being committed. A diff that looks correct
on paper can still render incorrectly; only a live render confirms it.
