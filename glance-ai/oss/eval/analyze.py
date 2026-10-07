import json, sys, collections, glob, os
from score import rows, norm_model, title_ok, veto_pack, veto_teacher
for path in sorted(glob.glob('../results/pred-*-schema.jsonl')):
    tag = os.path.basename(path)[5:-12]; recs = [json.loads(l) for l in open(path)]
    wrong = collections.Counter(); miss = collections.Counter(); famerr = collections.Counter(); badtitle = []
    for r in recs:
        c = rows[r['id']]; p = norm_model(r['pred']); g = c['gold']
        if g['decision'] == 'silence' and p['decision'] == 'act': wrong[c['category'][:22] + '/' + c['lang']] += 1
        if g['decision'] == 'act' and p['decision'] != 'act': miss[c['category'][:22] + '/' + c['lang']] += 1
        if g['decision'] == 'act' and p['decision'] == 'act' and p.get('family') != g['family']: famerr[f"{g['family']}->{p.get('family')}"] += 1
        if g['decision'] == 'act' and p['decision'] == 'act' and g['family'] == 'task':
            ok, ch = title_ok(p.get('title'), c['lang'], c.get('fromName'))
            if not ok: badtitle.append((p.get('title'), [k for k, v in ch.items() if not v]))
    print(f'== {tag}  n={len(recs)}'); print('  wrong-Do-It by category:', dict(wrong.most_common())); print('  missed by category:', dict(miss.most_common()))
    print('  family confusions:', dict(famerr.most_common())); print('  bad task titles (sample):', badtitle[:6])
