"""Python rule vs the stored labels on eval-data/suggest-save-v22.jsonl: full-output equality,
plus an advisory count of chips whose text matches NEG_SAVE (must be 0).
A new chip (stored suggest false, live suggest true) is a failure even before equality is checked.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from suggest_save import decide, _rx
from paths import eval_file
D = os.path.dirname(os.path.abspath(__file__))
NEG_SAVE = _rx(r"\b(?:do\s+not|don['’]?t|no\s+need\s+to|never|you\s+don['’]?t\s+need\s+to|hold\s+off\s+on)\s+(?:\w+\s+){0,2}(?:sav(?:e|ing)|upload(?:ing)?|stor(?:e|ing)|fil(?:e|ing))\b|(?:^|[\s,.(])(?:אל|לא\s+צריך|אין\s+צורך|בבקשה\s+לא|בבקשה\s+אל|לא)\s+(?:ל|ת)?(?:שמור|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|לאחסן)")
n = same = tgt = adv = new_chip = 0
diffs = []
src = eval_file('suggest-save-v22.jsonl')
for line in open(src, encoding='utf-8'):
    r = json.loads(line); n += 1
    o = decide(r['input'])
    if (not r['out'].get('suggest')) and o.get('suggest'):
        new_chip += 1
    if json.dumps(o, sort_keys=True, ensure_ascii=False) == json.dumps(r['out'], sort_keys=True, ensure_ascii=False):
        same += 1
    elif len(diffs) < 5:
        diffs.append((r['id'], o['reason'], r['out']['reason']))
    t = 'suggest-save' if o['suggest'] else r['target']
    tgt += t == r['target']
    if o['suggest'] and NEG_SAVE.search(r['input']['text']):
        adv += 1
res = {'rows': n, 'fullOutputEqual': same, 'targetEqual': tgt, 'diffs': diffs, 'advisoryChipsWithProductNegSave': adv, 'newChips': new_chip}
os.makedirs(os.path.join(D, 'out'), exist_ok=True)
json.dump(res, open(os.path.join(D, 'out', 'dataset-py-check.json'), 'w'), indent=1)
print(json.dumps(res))
sys.exit(0 if same == n and new_chip == 0 and adv == 0 else 1)
