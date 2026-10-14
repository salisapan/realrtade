"""Python stripper vs JS: sha256 of strip_for_engine / normalize_text for every text hashed by test-strip.cjs.
Dataset files are hashed only when they exist, matching test-strip.cjs. Exit 1 on any mismatch."""
import hashlib, json, os, sys
D = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(D, '..')
sys.path.insert(0, D)
from glance_strip import strip_for_engine, normalize_text
H = json.load(open(os.path.join(D, 'out', 'js-strip-sha.json'), encoding='utf-8'))
sha = lambda s: hashlib.sha256(s.encode('utf-8', 'surrogatepass')).hexdigest()[:16]
def rd(rel):
    p = os.path.join(M, rel)
    if not os.path.exists(p):
        return None
    return [json.loads(l) for l in open(p, encoding='utf-8') if l.strip()]
P = {}
def add(k, t):
    P[k + ':strip'] = sha(strip_for_engine(t)); P[k + ':norm'] = sha(normalize_text(t))
all_rows = rd('dataset/out-v2/all.jsonl')
if all_rows:
    for r in all_rows:
        add('v2:%s:body' % r['id'], r['body'])
        if r.get('cleanBody') is not None: add('v2:%s:clean' % r['id'], r['cleanBody'])
        add('v2:%s:subj' % r['id'], r.get('subject'))
for rel, prefix, field in (
    ('dataset/out-v21/test.jsonl', 'v21t:%s:body', 'body'),
    ('dataset/out/gold22.jsonl', 'g22:%s', 'body'),
    ('dataset/out-v21/adversarial-v21.jsonl', 'adv:%s', 'body'),
):
    rows = rd(rel)
    if rows:
        for r in rows: add(prefix % r['id'], r[field])
for i, t in enumerate(json.load(open(os.path.join(D, 'stress-cases.json'), encoding='utf-8'))):
    add('stress:%d' % i, t)
missing = [k for k in H if k not in P]
bad = [k for k in H if k in P and P[k] != H[k]]
res = {'texts': len(H), 'equal': len(H) - len(bad) - len(missing), 'mismatch': len(bad), 'missing': len(missing), 'examples': bad[:10]}
os.makedirs(os.path.join(D, 'out'), exist_ok=True)
json.dump(res, open(os.path.join(D, 'out', 'py-equality.json'), 'w'), indent=1)
print(json.dumps(res))
sys.exit(0 if not bad and not missing else 1)
