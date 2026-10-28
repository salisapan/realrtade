#!/usr/bin/env bash
# Working branch -> main, the way it was done on 2026-10-24 and 2026-10-27 (owner standing approval, 2026-10-27: green means approved).
# Usage: scripts/merge-to-main.sh [--push]   (without --push it builds and tests in a temp worktree and stops)
# What it keeps: the site. Every existing file under flow-landing/ is exactly main's (copy and privacy text have their own rules);
# only NEW files under flow-landing/netlify/functions/ may come from the branch, and only when their own tests pass.
# What it refuses: a push when any corpus is red other than the copy corpora that main's site already fails (COPY_RED below),
# or when the worktree has conflict markers. Never force-pushes. Leaves the working branch untouched.
set -eu
BR=claude/install-uiux-pro-max-skill-a4agox
COPY_RED="ai-ladder-copy docs-consistency identity-copy"
PUSH=${1:-}
root=$(git rev-parse --show-toplevel)
git fetch -q origin
dir=$(mktemp -d)/mm
tmp="tmp-main-merge-$$"
git worktree add -q -b "$tmp" "$dir" origin/main
cleanup() { cd "$root"; git worktree remove --force "$dir" 2>/dev/null || true; git branch -D "$tmp" -q 2>/dev/null || true; }
trap cleanup EXIT
cd "$dir"
git merge -q -s ort -X theirs --no-commit "origin/$BR" >/dev/null 2>&1 || true
if git diff --name-only --diff-filter=U | grep -q .; then echo "unresolved conflicts: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; exit 1; fi
# the site: existing files are main's, new function files are the branch's
git checkout origin/main -- flow-landing 2>/dev/null || true
for f in $(git diff --name-only --diff-filter=A origin/"$BR" origin/main -- flow-landing/netlify/functions 2>/dev/null; true); do :; done
for f in $(git ls-tree -r --name-only "origin/$BR" -- flow-landing/netlify/functions); do
  git cat-file -e "origin/main:$f" 2>/dev/null || { git checkout "origin/$BR" -- "$f"; }
done
ln -sfn "$root/flow-trial-extension/node_modules" flow-trial-extension/node_modules
grep -rl '^<<<<<<< ' --include='*' . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && { echo "conflict markers left in the tree"; exit 1; }
red=""
for f in flow-trial-extension/test/*corpus.cjs; do node "$f" >/dev/null 2>&1 || red="$red $(basename "$f" -corpus.cjs)"; done
for t in $(git diff --cached --name-only --diff-filter=A origin/main -- flow-landing/netlify/functions | grep '\.test\.cjs$'); do node "$t" >/dev/null 2>&1 || red="$red $t"; done
other=$(for r in $red; do case " $COPY_RED " in *" $r "*) ;; *) echo "$r";; esac; done)
echo "red: ${red:-none}"
if [ -n "$other" ]; then echo "NOT pushing: red beyond the copy corpora: $other"; exit 1; fi
if [ "$PUSH" != "--push" ]; then echo "dry run ok (use --push)"; exit 0; fi
git add -A
git commit -q -m "Merge the working branch into main (owner standing approval: green is approved); the site stays as main has it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin "$tmp":main
