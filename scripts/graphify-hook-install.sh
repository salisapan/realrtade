#!/usr/bin/env bash
# Install graphify git hooks + chain Obsidian community export refresh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
graphify hook install
HOOK="$ROOT/.git/hooks/post-commit"
if ! grep -q 'realrtade-graphify-obsidian-start' "$HOOK"; then
  cat >> "$HOOK" << 'HOOKEOF'

# realrtade-graphify-obsidian-start
(
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    if [ -f "$ROOT/graphify-out/graph.json" ]; then
      NOW=$(date +%s)
      MTIME=$(stat -c %Y "$ROOT/graphify-out/graph.json" 2>/dev/null || echo 0)
      AGE=$((NOW - MTIME))
      if [ "$AGE" -ge 1 ] && [ "$i" -ge 2 ]; then break; fi
    fi
  done
  if [ -x "$ROOT/scripts/graphify-export-obsidian.sh" ]; then
    "$ROOT/scripts/graphify-export-obsidian.sh" >>"${HOME}/.cache/graphify-obsidian.log" 2>&1 || true
  fi
) &
# realrtade-graphify-obsidian-end
HOOKEOF
fi
echo "Hooks installed. Obsidian export chained on post-commit."
graphify hook status
