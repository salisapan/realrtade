#!/usr/bin/env bash
# How the working branch reaches main without touching the site (owner «מאשר», 2026-10-24). Run only when the owner has said so.
# Main is not the working branch's descendant (squashed history, a newer site), so a plain merge conflicts and would replace
# the site copy. This recipe: merge with the branch winning on code, restore flow-landing/ from main exactly, drop any file the
# branch added under flow-landing/ (Netlify functions go live from main: adding an endpoint is a deploy decision), run the
# corpora, then push. Leaves the working branch untouched.
set -eu
BR=claude/install-uiux-pro-max-skill-a4agox
git fetch -q origin
dir=$(mktemp -d)/mm
git worktree add -q -b "tmp-main-merge-$$" "$dir" origin/main
cd "$dir"
git merge -q -s ort -X theirs --no-commit "origin/$BR" || true
git checkout origin/main -- flow-landing
git checkout "origin/$BR" -- flow-trial-extension glance-gmail-addon
git ls-files -z --others --exclude-standard flow-landing | xargs -0 -r rm -f
git diff --name-only --diff-filter=A origin/main -- flow-landing | xargs -r git rm -q -f
ln -sfn "$(git -C "$OLDPWD" rev-parse --show-toplevel)/flow-trial-extension/node_modules" flow-trial-extension/node_modules
echo "flow-landing differs from main in: $(git diff --cached --name-only origin/main -- flow-landing | wc -l) files (must be 0)"
(cd flow-trial-extension && for f in test/*corpus.cjs; do node "$f" >/dev/null 2>&1 || echo "RED $f"; done)
echo "Review the RED list (copy tests that main's site already fails are the owner's), then: git commit, git push origin HEAD:main"
