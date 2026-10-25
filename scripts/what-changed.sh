#!/usr/bin/env bash
# One page for every agent (Grok bot, Cursor, a person): what actually changed in the shipped code on the working branch,
# straight from git, so nothing depends on anyone's memory or on a summary. Usage: scripts/what-changed.sh [since] > docs/glance-ai/shipped-in-code.md
set -eu
cd "$(git rev-parse --show-toplevel)"
BR=${BR:-origin/claude/install-uiux-pro-max-skill-a4agox}
SINCE=${1:-2026-10-20}
echo "# What changed in the code (generated from git, do not edit by hand)"
echo
echo "Glance closes open loops. Gmail is where it starts today."
echo
echo "Source: \`git log $BR --since=$SINCE\` limited to \`flow-trial-extension/core\`, \`flow-trial-extension/src\`, \`flow-trial-extension/manifest.json\` and \`glance-gmail-addon/\`. Regenerate: \`scripts/what-changed.sh $SINCE > docs/glance-ai/shipped-in-code.md\`."
echo
echo "- Extension version in \`manifest.json\` on the branch: $(git show $BR:flow-trial-extension/manifest.json | grep -m1 '"version"' | sed 's/[^0-9.]//g')"
echo "- Commits on the working branch that are not on \`main\`: $(git rev-list --count origin/main..$BR). \`main\` and the store package do not carry them yet (merging to main and publishing need the owner's «מאשר»)."
echo "- Lines changed in core, src and the add-on since \`main\`: $(git diff --shortstat origin/main $BR -- flow-trial-extension/core flow-trial-extension/src glance-gmail-addon | sed 's/^ //')"
echo
echo "| Commit | When | What it changed in code | Files in core, src or the add-on |"
echo "|---|---|---|---|"
git log "$BR" --since="$SINCE" --no-merges --format='%h|%ad|%s' --date=short -- flow-trial-extension/core flow-trial-extension/src flow-trial-extension/manifest.json glance-gmail-addon | while IFS='|' read -r h d s; do
  files=$(git show --name-only --format= "$h" -- flow-trial-extension/core flow-trial-extension/src flow-trial-extension/manifest.json glance-gmail-addon | sed 's#flow-trial-extension/##' | head -4 | tr '\n' ' ')
  s=$(echo "$s" | cut -c1-150 | sed 's/|/ /g')
  echo "| $h | $d | $s | $files |"
done
