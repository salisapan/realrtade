#!/usr/bin/env bash
# Refresh docs/graphify/ community-level Obsidian notes from graphify-out/graph.json.
# Safe to run after `graphify update .` or from the local post-commit hook.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v graphify >/dev/null 2>&1; then
  echo "[graphify-obsidian] graphify not on PATH; skip" >&2
  exit 0
fi

# Ensure a code-only graph exists (no LLM / no API key).
if [[ ! -f graphify-out/graph.json ]]; then
  echo "[graphify-obsidian] no graph yet — running code-only extract"
  GRAPHIFY_BACKEND=none graphify extract . --code-only --out . || true
  GRAPHIFY_BACKEND=none graphify cluster-only . --no-label || true
fi

python3 <<'PY'
from __future__ import annotations
import json, re, shutil
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path('.').resolve()
OUT = ROOT / 'docs' / 'graphify'
GRAPH = ROOT / 'graphify-out' / 'graph.json'
REPORT = ROOT / 'graphify-out' / 'GRAPH_REPORT.md'
if not GRAPH.exists():
    raise SystemExit(0)

g = json.loads(GRAPH.read_text())
nodes = {n['id']: n for n in g['nodes']}
links = g.get('links') or g.get('edges') or []
comm_members: dict[int, list[str]] = defaultdict(list)
for nid, n in nodes.items():
    cid = n.get('community')
    if cid is not None:
        comm_members[int(cid)].append(nid)
deg = Counter()
for e in links:
    u = e.get('source') or e.get('from')
    v = e.get('target') or e.get('to')
    if u: deg[u] += 1
    if v: deg[v] += 1
inter = defaultdict(Counter)
for e in links:
    u = e.get('source') or e.get('from')
    v = e.get('target') or e.get('to')
    if u not in nodes or v not in nodes: continue
    cu, cv = nodes[u].get('community'), nodes[v].get('community')
    if cu is None or cv is None or cu == cv: continue
    inter[int(cu)][int(cv)] += 1
    inter[int(cv)][int(cu)] += 1

def safe(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|]', '_', s)
    s = s.strip('. ') or 'untitled'
    return s[:120]

def community_note_name(cid: int) -> str:
    label = nodes[comm_members[cid][0]].get('community_name') if comm_members[cid] else f'Community {cid}'
    return f'_COMMUNITY_{safe(label or f"Community {cid}")}'

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
ordered = sorted(comm_members.keys(), key=lambda c: (-len(comm_members[c]), c))
name_by_cid = {cid: community_note_name(cid) for cid in ordered}
for cid in ordered:
    members = comm_members[cid]
    members_sorted = sorted(members, key=lambda i: (-deg[i], nodes[i].get('label','')))
    cname = nodes[members[0]].get('community_name') or f'Community {cid}'
    files = sorted({nodes[i].get('source_file') for i in members if nodes[i].get('source_file')})
    top = members_sorted[:25]
    lines = [
        '---', 'tags: [graphify, community]', f'community_id: {cid}',
        f'members: {len(members)}', 'generated_by: graphify (community-only export)', '---',
        f'# {cname}', '',
        f'> {len(members)} nodes · auto-exported for the Obsidian vault under `docs/graphify/`.',
        '', '## Key concepts', '',
    ]
    for i in top:
        n = nodes[i]
        lines.append(f"- `{n.get('label') or i}` ({deg[i]} connections) — `{n.get('source_file') or ''}`")
    if len(members) > 25:
        lines.append(f'- *…and {len(members)-25} more*')
    lines.append('')
    others = inter[cid].most_common(12)
    if others:
        lines += ['## Related communities', '']
        for other, cnt in others:
            lines.append(f'- [[{name_by_cid[other]}]] ({cnt} shared edges)')
        lines.append('')
    if files:
        lines += ['## Source files', '']
        for f in files[:40]:
            lines.append(f'- `{f}`')
        if len(files) > 40:
            lines.append(f'- *…and {len(files)-40} more*')
        lines.append('')
    lines += ['## See also', '', '- [[_GRAPHIFY_INDEX]]', '- [[GRAPH_REPORT]]', '']
    (OUT / f'{name_by_cid[cid]}.md').write_text('\n'.join(lines), encoding='utf-8')

idx = [
    '---', 'tags: [graphify, index]', 'generated_by: graphify (community-only export)', '---',
    '# Graphify — code knowledge graph', '',
    f'> **{len(nodes)} nodes · {len(links)} edges · {len(comm_members)} communities**', '',
    'Community-level notes for the Obsidian vault (`docs/` is the vault root).',
    'Symbol-level notes are omitted on purpose. Query with `graphify query` / `graphify-out/graph.json`.',
    '', '## Communities (largest first)', '',
]
for cid in ordered:
    n = len(comm_members[cid])
    cname = nodes[comm_members[cid][0]].get('community_name') or f'Community {cid}'
    idx.append(f'- [[{name_by_cid[cid]}|{cname}]] — {n} nodes')
idx += ['', '## Related', '', '- [[GRAPH_REPORT]] — architecture highlights', '- [[Home]] — vault home', '']
(OUT / '_GRAPHIFY_INDEX.md').write_text('\n'.join(idx), encoding='utf-8')
if REPORT.exists():
    (OUT / 'GRAPH_REPORT.md').write_text(REPORT.read_text(encoding='utf-8'), encoding='utf-8')
(OUT / 'README.md').write_text(
'''# docs/graphify/ — Obsidian view of the code graph

Auto-generated community-level notes from Graphify (`graphifyy` on PyPI).

- Vault root is `docs/`. These notes land under `docs/graphify/` so a Mac Obsidian vault that pulls the repo picks them up.
- One note per community (`_COMMUNITY_*.md`) plus `_GRAPHIFY_INDEX.md` and `GRAPH_REPORT.md`.
- Refresh: `scripts/graphify-export-obsidian.sh` (chained from the local git hook after `graphify hook install`).

Do not edit by hand — regenerate instead.
''', encoding='utf-8')
print(f'[graphify-obsidian] wrote {len(list(OUT.glob("*.md")))} notes to {OUT}')
PY
