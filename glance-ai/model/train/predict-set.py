#!/usr/bin/env python3
"""Predict a features jsonl with a saved lab model: predict-set.py --model v2x/fz-v2/v2.model.pkl --set features-frozen/frozen.jsonl --out preds.jsonl
Same decision rule as train-v2.py decide() (gate p >= tau (per label), base/product veto, cap veto). Lab only."""
import json, os, sys, argparse, pickle
import numpy as np
from scipy.sparse import csr_matrix
ap = argparse.ArgumentParser(); ap.add_argument('--model', required=True); ap.add_argument('--set', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--chooser-from', dest='chooser_from', default=None, help='take the family|step chooser from another saved lab model (the gate and its tau stay from --model)'); ap.add_argument('--kappa', type=float, default=None, help='override the saved step-confidence floor'); ap.add_argument('--single-tau', dest='single_tau', action='store_true', help='ignore the per-label thresholds and use the one OOF tau')
A = ap.parse_args()
HERE = os.path.dirname(os.path.abspath(__file__)); M = pickle.load(open(os.path.join(HERE, '..', A.model) if not os.path.isabs(A.model) else A.model, 'rb'))
rows = [json.loads(l) for l in open(os.path.join(HERE, A.set)) if l.strip()]
ind, ptr = [], [0]
for r in rows: ind.extend(r['x']); ptr.append(len(ind))
X = csr_matrix((np.ones(len(ind), dtype=np.float32), np.array(ind, dtype=np.int64), np.array(ptr)), shape=(len(rows), M['DIM']))
n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1; X = csr_matrix(X.multiply(1.0 / n[:, None]))
gate, chooser, tau, TAUS = M['gate'], M['chooser'], M['tau'], (None if A.single_tau else M['TAUS'])
if A.chooser_from: chooser = pickle.load(open(os.path.join(HERE, '..', A.chooser_from) if not os.path.isabs(A.chooser_from) else A.chooser_from, 'rb'))['chooser']
p = gate.predict_proba(X)[:, 1]; lab = chooser.predict(X)
KAPPA = A.kappa if A.kappa is not None else M.get('KAPPA')
STEP_OF = lambda l: str(l).split('|')[-1]
def step_conf(ch, X):
    P = ch.predict_proba(X); cl = [STEP_OF(c) for c in ch.classes_]; steps = sorted(set(cl))
    S = np.zeros((X.shape[0], len(steps)))
    for j, c in enumerate(cl): S[:, steps.index(c)] += P[:, j]
    return S.max(1)
CF = step_conf(chooser, X) if KAPPA else np.ones(X.shape[0])
def dec(r, pi, l, veto, cf=1.0):
    if pi < (TAUS.get(l, tau) if TAUS else tau): return 'SILENT'
    if KAPPA and cf < KAPPA: return 'SILENT'
    if veto:
        if r.get('vb') or r.get('vp'): return 'SILENT'
        step = l.split('|')[1]; vc = r.get('vc') or {}
        if vc.get('any') or vc.get(step): return 'SILENT'
    return l
with open(A.out, 'w') as fo:
    for r, pi, l, cf in zip(rows, p, lab, CF):
        fo.write(json.dumps({'id': r['id'], 'pred': dec(r, pi, l, True, cf), 'predAlone': dec(r, pi, l, False, cf), 'p': round(float(pi), 4), 'lang': r['lang'], 'vb': r.get('vb'), 'vp': r.get('vp'), 'tip': r.get('tip'), 'eng': r.get('eng')}) + '\n')
print(len(rows), 'predicted')
