#!/usr/bin/env bash
# One command for any agent (Claude routine, Cursor, Codex, a person): install Graphify and build the code graph.
# AST only, no API cost. graphify-out/ is not committed (it is about 14 MB and changes on every commit), so each
# checkout builds its own. Safe to run twice. Never installs git hooks: that stays a decision for a person's checkout.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
if ! command -v graphify >/dev/null 2>&1; then
  command -v uv >/dev/null 2>&1 || python3 -m pip install -q uv 2>/dev/null
  uv tool install graphifyy >/dev/null 2>&1 || pip install -q graphifyy 2>/dev/null
  export PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v graphify >/dev/null 2>&1; then echo "graphify unavailable: continue with grep and Read and note it in the run report"; exit 0; fi
graphify update . >/dev/null 2>&1 && echo "graph ready: graphify query \"<question>\" | graphify path \"<A>\" \"<B>\" | graphify explain \"<concept>\"" || echo "graphify update failed: continue with grep and Read"
