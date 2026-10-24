# per-source missed on the v2 held-out test (masked) from a python preds file: usage slice-v21.py <tag> [<tag>...]
import json, sys
U = {json.loads(l)['id']: json.loads(l)['unsure'] for l in open('train/features-v21/test_v2.jsonl')}
for tag in sys.argv[1:]:
    P = [json.loads(l) for l in open(f'artifacts/{tag}.test-preds.jsonl')]
    out = []
    for src in ('repo:', 'repo-test', 'synthetic'):
        rs = [p for p in P if p['prov'].startswith(src) and p['y'] != 'SILENT' and not U[p['id']]]
        m = sum(p['pred'] == 'SILENT' for p in rs); out.append(f'{src} {m}/{len(rs)}={m/len(rs):.3f}')
    print(tag.ljust(14), ' | '.join(out))
