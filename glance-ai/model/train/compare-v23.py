# Compare v2 and v2.3 on the v2 test split: the model alone, and the product order (rules engine + hard veto first, the model
# only where the engine is silent). Reference rows and the engine blind-spot rows (gap, train/gap-labels-v23.cjs) are counted apart.
# usage (from glance-ai/model): .venv/bin/python train/compare-v23.py [<v2 test-preds rebuilt on the same dataset>]
import json,sys
feat={}
for l in open('train/features-v23/test.jsonl'):
  r=json.loads(l); feat[r['id']]=r
def load(p): return {r['id']:r for r in map(json.loads,open(p))}
def run(preds,name):
  out={}
  veto=lambda x: bool(x['vb'] or x['vp'])
  for mode in ['model','engine+model']:
    m={'sure_wdi':0,'sure_sil':0,'sure_miss':0,'sure_show':0,'wrongAct':0,'gap_n':0,'gap_caught':0,'gap_he':[0,0],'gap_en':[0,0],'gap_wrongact':0}
    for i,f in feat.items():
      x=preds.get(i)
      if not x: continue
      eng='SILENT' if veto(x) or not x['eng'] else x['eng']
      pred=x['pred'] if mode=='model' else (eng if eng!='SILENT' else x['pred'])
      if f.get('gap'):
        m['gap_n']+=1; L=m['gap_he'] if f['lang']=='he' else m['gap_en']; L[1]+=1
        if pred!='SILENT': 
          if pred==f['y']: m['gap_caught']+=1; L[0]+=1
          else: m['gap_wrongact']+=1
        continue
      if f.get('unsure'): continue
      if f['y']=='SILENT':
        m['sure_sil']+=1; m['sure_wdi']+= pred!='SILENT'
      else:
        m['sure_show']+=1; m['sure_miss']+= pred=='SILENT'; m['wrongAct']+= pred not in ('SILENT',f['y'])
    out[mode]=m
  return out
for name,p in [('v2 (today)','artifacts/v2.test-preds.jsonl' if len(sys.argv)<2 else sys.argv[1]),('v2.3','artifacts/v23.test-preds.jsonl')]:
  r=run(load(p),name)
  for mode,m in r.items():
    print(f"{name:11} {mode:13} wrongDoIt {m['sure_wdi']}/{m['sure_sil']}  missed {m['sure_miss']}/{m['sure_show']}  wrongAction {m['wrongAct']}  | engine blind spots caught {m['gap_caught']}/{m['gap_n']} (HE {m['gap_he'][0]}/{m['gap_he'][1]}, EN {m['gap_en'][0]}/{m['gap_en'][1]}), wrong kind {m['gap_wrongact']}")
