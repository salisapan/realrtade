"""Python rule on the 22 spec corpus rows + byte-equality with the JS outputs (out/corpus-js.json). Exit 1 unless 22/22 and equal."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from suggest_save import decide
D = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(D, 'corpus-22.json'), encoding='utf-8'))
js = json.load(open(os.path.join(D, 'out', 'corpus-js.json'), encoding='utf-8'))
rows, same = {}, 0
for c, j in zip(C, js):
    o = decide(c['input']); e = c['expect']; bad = []
    for k in ('suggest', 'reason', 'mode'):
        if k in e and o.get(k) != e[k]: bad.append(k)
    if e.get('target') and o.get('target') != e['target']: bad.append('target')
    ch = o.get('chip') or {}
    for k in ('count', 'en', 'he', 'names'):
        if k in e and ch.get(k) != e[k]: bad.append(k)
    rows.setdefault(c['row'], []).append(bad)
    eq = json.dumps(o, sort_keys=True, ensure_ascii=False) == json.dumps(j['out'], sort_keys=True, ensure_ascii=False)
    same += eq
    print(('FAIL ' if bad else 'ok   ') + str(c['row']).rjust(2) + ('/' + c['variant'] if c['variant'] else '') + '  ' + o['reason'] + ('' if eq else '  <- differs from JS'))
ok = sum(1 for b in rows.values() if all(not x for x in b))
XS = json.load(open(os.path.join(D, 'cases-extra.json'), encoding='utf-8'))
xjs = json.load(open(os.path.join(D, 'out', 'extra-js.json'), encoding='utf-8'))
xok = xeq = 0
for c, j in zip(XS, xjs):
    o = decide(c['input'])
    xok += o['reason'] == c['expect']['reason'] and ('count' not in c['expect'] or (o.get('chip') or {}).get('count') == c['expect']['count'])
    xeq += json.dumps(o, sort_keys=True, ensure_ascii=False) == json.dumps(j, sort_keys=True, ensure_ascii=False)
print('extra edge cases: %d/%d, JS-equal %d/%d' % (xok, len(XS), xeq, len(XS)))
print(json.dumps({'rowsPassed': '%d/%d' % (ok, len(rows)), 'jsEqual': '%d/%d' % (same, len(C))}))
sys.exit(0 if ok == 22 and same == len(C) and xok == len(XS) and xeq == len(XS) else 1)
