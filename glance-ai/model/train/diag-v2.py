import json, numpy as np, sys, collections as COL
sys.argv=['x','--no-export']; __file__='train-v2.py'
exec(open('train-v2.py').read().split("sweep = []; tau = None")[0])
def vetoed(r, lab):
    if r['vb'] or r['vp']: return True
    vc=r['vc'] or {}; st=lab.split('|')[1]; return bool(vc.get('any') or vc.get(st))
p = gate.predict_proba(Xva)[:,1]; lab=chooser.predict(Xva)
body={}
for l in open('../dataset/out-v2/val.jsonl'):
    r=json.loads(l); body[r['id']]=r
hi=[(p[i],va[i],lab[i]) for i in range(len(va)) if va[i]['y']=='SILENT' and not va[i].get('unsure') and not vetoed(va[i],lab[i]) and p[i]>0.75]
print('silent non-vetoed p>0.75:',len(hi))
print(COL.Counter((r['lang'],r['scenario'],body[r['id']].get('engine35CleanReason'),r['augment']) for _,r,_ in hi).most_common(25))
for pi,r,l in sorted(hi,key=lambda t:-t[0])[:40:2]:
    b=body[r['id']]; print(round(pi,3),l,r['scenario'],b.get('engine35CleanReason'),r['augment'],'|',repr((b.get('cleanBody'))[:110]))
