#!/usr/bin/env python3
"""v2: (A) show/silence gate (binary LR) + (B) family|step chooser (multinomial LR over reference show labels).
Decision: gate p>=tau AND no base/product veto -> chooser argmax -> cap veto on that label -> else SILENT.
tau = smallest value whose VAL wrong-Do-It (pipeline incl. veto, vs product-correct reference) <= 0.29% (v1's level).
Outputs artifacts/v2.gate.weights.json, v2.chooser.weights.json (int8, JS runtime), v2.gate.onnx, v2.chooser.onnx, v2.report.json.
Usage: train-v2.py [--feat features-v2] [--tag v2] [--rows all|v1frames] [--no-export]"""
import json, os, sys, time, argparse
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import LogisticRegression
ap = argparse.ArgumentParser(); ap.add_argument('--feat', default='features-v2'); ap.add_argument('--tag', default='v2'); ap.add_argument('--rows', default='all'); ap.add_argument('--no-export', action='store_true')
ap.add_argument('--target', type=float, default=0.0029); ap.add_argument('--strict', dest='mask_unsure', action='store_false'); ap.add_argument('--gate-on-all', dest='gate_unvetoed', action='store_false'); ap.add_argument('--no-oof', dest='oof', action='store_false'); ap.add_argument('--extra', default=None, help='npz with dense extra features per set (e5 experiment)')
ap.add_argument('--out', default=None, help='artifact directory (default: model/artifacts). Refuses a path that is the shipped artifacts directory, so a dry-run cannot overwrite v2 weights.')
A = ap.parse_args()
HERE = os.path.dirname(os.path.abspath(__file__)); FEAT = os.path.join(HERE, A.feat)
_default_art = os.path.abspath(os.path.join(HERE, '..', 'artifacts'))
ART = os.path.abspath(A.out) if A.out else _default_art
if A.out and os.path.abspath(ART) == _default_art:
    raise SystemExit('refusing --out that is the shipped artifacts directory; pass a different directory')
os.makedirs(ART, exist_ok=True)
DIM = json.load(open(os.path.join(FEAT, 'meta.json')))['dim']
def load(name, keep=None):
    rows = [json.loads(l) for l in open(os.path.join(FEAT, name + '.jsonl')) if l.strip()]
    if keep: rows = [r for r in rows if keep(r)]
    ind, ptr = [], [0]
    for r in rows: ind.extend(r['x']); ptr.append(len(ind))
    X = csr_matrix((np.ones(len(ind), dtype=np.float32), np.array(ind, dtype=np.int64), np.array(ptr)), shape=(len(rows), DIM))
    n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1
    return rows, csr_matrix(X.multiply(1.0 / n[:, None]))
keep = None
if A.rows == 'v1frames': keep = lambda r: r['origin'] != 'v2-frame'
ap2 = A
# the gate learns P(show | not vetoed): rows the hard veto silences deterministically (own mail, quiet/family gates,
# product rules) are removed from GATE training so they cannot teach "ask-shaped text is silent"
train_keep = (lambda r: (keep(r) if keep else True) and not (r.get('unsure') and A.mask_unsure))
gate_keep = (lambda r: not (A.gate_unvetoed and (r['vb'] or r['vp'])))
tr, Xtr = load('train', train_keep); va, Xva = load('val'); te, Xte = load('test')
gidx = np.array([i for i, r in enumerate(tr) if gate_keep(r)])
ytr_bin = np.array([r['y'] != 'SILENT' for r in tr]); yva_bin = np.array([r['y'] != 'SILENT' for r in va])
print(f'[{A.tag}] gate rows {len(gidx)}; train {len(tr)} (show {ytr_bin.sum()}), val {len(va)}, test {len(te)}', flush=True)
# (A) gate
best = None
for C in (4.0, 16.0, 64.0):
    t0 = time.time(); g = LogisticRegression(C=C, max_iter=4000); g.fit(Xtr[gidx], ytr_bin[gidx])
    p = g.predict_proba(Xva)[:, 1]
    p = np.where(np.array([bool(r['vb'] or r['vp']) for r in va]) & A.gate_unvetoed, 0.0, p)  # selection on the gated pipeline
    # model-selection criterion: val recall at val wrong-Do-It <= target (model alone, no veto; unsure rows excluded)
    sure = np.array([not (r.get('unsure') and A.mask_unsure) for r in va])
    sil = ~yva_bin & sure; rec = 0.0
    for tau in np.arange(0.05, 0.996, 0.005):
        s = p >= tau
        if (s & sil).sum() / max(1, sil.sum()) <= A.target: rec = (s & yva_bin).sum() / max(1, yva_bin.sum()); break
    print(f'  gate C={C} (mask_unsure={A.mask_unsure}): val recall@wdi<={A.target:.4f} (model alone) = {rec:.3f}  ({time.time()-t0:.0f}s)', flush=True)
    if best is None or rec > best[0]: best = (rec, C, g)
_, Cg, gate = best
# (B) chooser
show_idx = np.where(ytr_bin)[0]
ych = [tr[i]['y'] for i in show_idx]
bestc = None
for C in (8.0, 32.0):
    ch = LogisticRegression(C=C, max_iter=4000); ch.fit(Xtr[show_idx], ych)
    vi = np.where(yva_bin)[0]; acc = float(np.mean(ch.predict(Xva[vi]) == np.array([va[i]['y'] for i in vi])))
    print(f'  chooser C={C}: val family|step acc (given show) = {acc:.3f}', flush=True)
    if bestc is None or acc > bestc[0]: bestc = (acc, C, ch)
_, Cc, chooser = bestc
CL = list(chooser.classes_)
TAUS = None
def decide(rows, X, tau, use_veto=True, per_label=None):
    p = gate.predict_proba(X)[:, 1]; lab = chooser.predict(X)
    out = []
    for r, pi, l in zip(rows, p, lab):
        if pi < (per_label[l] if per_label else tau): out.append('SILENT'); continue
        if use_veto:
            if r['vb'] or r['vp']: out.append('SILENT'); continue
            step = l.split('|')[1]; vc = r['vc'] or {}
            if vc.get('any') or vc.get(step): out.append('SILENT'); continue
        out.append(l)
    return np.array(out), p
def metrics(rows, pred, masked=True):
    if masked and A.mask_unsure:
        keepi = np.array([not r.get('unsure') for r in rows]); unsure_shows = int(sum(1 for r, p in zip(rows, pred) if r.get('unsure') and p != 'SILENT'))
        m = metrics([r for r, k in zip(rows, keepi) if k], pred[keepi], masked=False); m['unsureRows'] = int((~keepi).sum()); m['unsureShown'] = unsure_shows
        m['strict'] = {k: v for k, v in metrics(rows, pred, masked=False).items() if k in ('wrongDoIt', 'wrongDoItRate', 'missedRate', 'missedRate_he')}
        return m
    y = np.array([r['y'] for r in rows]); sil = y == 'SILENT'; show = pred != 'SILENT'
    he = np.array([r['lang'] == 'he' for r in rows])
    m = {'n': len(rows), 'refSilent': int(sil.sum()), 'refShow': int((~sil).sum()),
         'wrongDoIt': int((show & sil).sum()), 'wrongDoItRate': float((show & sil).sum() / max(1, sil.sum())),
         'missed': int((~show & ~sil).sum()), 'missedRate': float((~show & ~sil).sum() / max(1, (~sil).sum())),
         'wrongAction': int((show & ~sil & (pred != y)).sum()), 'agree': float((pred == y).mean())}
    for L, mask in (('he', he), ('en', ~he)):
        m['missedRate_' + L] = float((~show & ~sil & mask).sum() / max(1, (~sil & mask).sum()))
        m['wrongDoItRate_' + L] = float((show & sil & mask).sum() / max(1, (sil & mask).sum()))
    return m
# ---- final fit on train+val, tau from grouped 5-fold OOF over train+val (frames never shared between folds)
if A.oof:
    from sklearn.model_selection import GroupKFold
    allr = tr + [r for r in va if not (r.get('unsure') and A.mask_unsure)]
    from scipy.sparse import vstack
    keep_va = np.array([not (r.get('unsure') and A.mask_unsure) for r in va])
    Xall = vstack([Xtr, Xva[np.where(keep_va)[0]]]).tocsr()
    yall = np.array([r['y'] for r in allr]); ybin = yall != 'SILENT'
    gmask = np.array([gate_keep(r) for r in allr]); groups = np.array([r['tid'] for r in allr])
    oof_p = np.zeros(len(allr)); oof_l = np.array(['SILENT'] * len(allr), dtype=object)
    for k, (a, b) in enumerate(GroupKFold(n_splits=5).split(Xall, ybin, groups)):
        ga = a[gmask[a]]; gk = LogisticRegression(C=Cg, max_iter=4000).fit(Xall[ga], ybin[ga])
        sa = a[ybin[a]]; ck = LogisticRegression(C=Cc, max_iter=4000).fit(Xall[sa], yall[sa])
        oof_p[b] = gk.predict_proba(Xall[b])[:, 1]; oof_l[b] = ck.predict(Xall[b]); print(f'  oof fold {k} done', flush=True)
    gate = LogisticRegression(C=Cg, max_iter=4000).fit(Xall[np.where(gmask)[0]], ybin[np.where(gmask)[0]])
    chooser = LogisticRegression(C=Cc, max_iter=4000).fit(Xall[np.where(ybin)[0]], yall[np.where(ybin)[0]]); CL = list(chooser.classes_)
    def oof_decide(t):
        out = []
        for r, pi, l in zip(allr, oof_p, oof_l):
            if pi < t or r['vb'] or r['vp']: out.append('SILENT'); continue
            vc = r['vc'] or {}; st = l.split('|')[1]
            out.append('SILENT' if (vc.get('any') or vc.get(st)) else l)
        return np.array(out)
sweep = []; tau = None
for t in np.arange(0.05, 0.996, 0.005):
    pred, _ = decide(va, Xva, t); m = metrics(va, pred)
    sweep.append({'tau': round(float(t), 3), 'wdi': m['wrongDoItRate'], 'missed': m['missedRate'], 'missedHe': m['missedRate_he']})
    if tau is None and m['wrongDoItRate'] <= A.target: tau = round(float(t), 3)
if tau is None: tau = 0.99
if A.oof:
    tau = None; oof_sweep = []
    for t in np.arange(0.05, 0.996, 0.005):
        m = metrics(allr, oof_decide(t), masked=False)
        oof_sweep.append({'tau': round(float(t), 3), 'wdi': m['wrongDoItRate'], 'missed': m['missedRate'], 'missedHe': m['missedRate_he']})
        if tau is None and m['wrongDoItRate'] <= A.target: tau = round(float(t), 3)
    if tau is None: tau = 0.99
    print('  OOF tau', tau, [s for s in oof_sweep if s['tau'] == tau], flush=True)
    # per-label thresholds (greedy, OOF): lower the threshold of the label that buys the most recall per extra wrong-Do-It
    yref = yall; silent_n = int((yref == 'SILENT').sum())
    vet = np.array([bool(r['vb'] or r['vp']) or bool((r['vc'] or {}).get('any') or (r['vc'] or {}).get(l.split('|')[1])) for r, l in zip(allr, oof_l)])
    taus = {c: tau for c in CL}; grid = np.round(np.arange(0.30, 0.996, 0.005), 3)
    def count(tt):
        th = np.array([tt[l] for l in oof_l]); sh = (oof_p >= th) & ~vet
        return int((sh & (yref == 'SILENT')).sum()), int((sh & (yref != 'SILENT')).sum())
    budget = int(np.floor(A.target * silent_n)); w0, r0 = count(taus)
    while True:
        best_step = None
        for c in CL:
            lower = [g for g in grid if g < taus[c]]
            for g in sorted(lower, reverse=True)[:40]:
                tt = dict(taus); tt[c] = float(g); w, rr = count(tt)
                if w > budget or rr <= r0: continue
                gain = (rr - r0) / (1 + w - w0)
                if best_step is None or gain > best_step[0]: best_step = (gain, c, float(g), w, rr)
        if not best_step: break
        _, c, g, w0, r0 = best_step; taus[c] = g
    print('  per-label taus', taus, 'oof wdi', w0, '/', silent_n, 'oof shows', r0, flush=True)
    TAUS = taus
pv, _ = decide(va, Xva, tau, per_label=TAUS); pt, ptest = decide(te, Xte, tau, per_label=TAUS); pt_alone, _ = decide(te, Xte, tau, use_veto=False, per_label=TAUS)
pt_single, _ = decide(te, Xte, tau)
rep = {'calibration': 'grouped-5fold-OOF(train+val), final fit on train+val' if A.oof else 'val', 'oofSweep': (oof_sweep[::4] if A.oof else None), 'tag': A.tag, 'rows': A.rows, 'feat': A.feat, 'gateC': Cg, 'chooserC': Cc, 'tau': tau, 'target': A.target, 'classes': CL,
       'tauPerLabel': TAUS, 'val': metrics(va, pv), 'test': metrics(te, pt), 'testSingleTau': metrics(te, pt_single), 'testModelAlone': metrics(te, pt_alone), 'sweep': sweep[::4]}
print(json.dumps({k: rep[k] for k in ('tag', 'gateC', 'chooserC', 'tau')}), flush=True)
for k in ('val', 'test', 'testSingleTau', 'testModelAlone'): print(' ', k, json.dumps({a: (round(b, 4) if isinstance(b, float) else b) for a, b in rep[k].items()}), flush=True)
json.dump(rep, open(os.path.join(ART, A.tag + '.report.json'), 'w'), indent=1)
with open(os.path.join(ART, A.tag + '.test-preds.jsonl'), 'w') as fo:
    for r, a, b, c in zip(te, pt, ptest, pt_alone): fo.write(json.dumps({'id': r['id'], 'y': r['y'], 'pred': a, 'predAlone': c, 'p': round(float(b), 4), 'lang': r['lang'], 'scenario': r['scenario'], 'prov': r['prov'], 'eng': r['eng'], 'vb': r['vb'], 'vp': r['vp'], 'rule': r['rule'], 'voc': r['voc'], 'role': r['role']}, ensure_ascii=False) + '\n')
if A.no_export: sys.exit(0)
def q8(W):
    scale = np.abs(W).max(1) / 127.0; scale[scale == 0] = 1
    return np.round(W / scale[:, None]).astype(np.int8), scale
def export_linear(m, name, labels):
    W = m.coef_.astype(np.float32); b = m.intercept_.astype(np.float32)
    Q, s = q8(W)
    cls = [{'label': labels[k], 'bias': float(b[k]), 'scale': float(s[k]), 'idx': np.nonzero(Q[k])[0].tolist(), 'q': Q[k, np.nonzero(Q[k])[0]].tolist()} for k in range(W.shape[0])]
    return cls
gw = {'format': 'glance-close-gate/v2', 'variant': A.tag, 'dim': DIM, 'tau': tau, 'tauPerLabel': TAUS, 'C': Cg, 'featurizer': 'model/train/featurize-v2.cjs', 'kind': 'binary-logistic',
      'rows': export_linear(gate, 'gate', ['show']), 'trainRows': len(tr), 'trainedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
cw = {'format': 'glance-close-chooser/v2', 'variant': A.tag, 'dim': DIM, 'C': Cc, 'featurizer': 'model/train/featurize-v2.cjs', 'kind': 'multinomial-logistic',
      'classes': export_linear(chooser, 'chooser', CL), 'trainRows': int(len(show_idx))}
if len(CL) == 2:  # sklearn binary special case guard (not expected)
    raise SystemExit('chooser collapsed to 2 classes')
json.dump(gw, open(os.path.join(ART, A.tag + '.gate.weights.json'), 'w'), separators=(',', ':'))
json.dump(cw, open(os.path.join(ART, A.tag + '.chooser.weights.json'), 'w'), separators=(',', ':'))
onnx = {}
try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    import onnxruntime as ort
    for nm, m in (('gate', gate), ('chooser', chooser)):
        onx = convert_sklearn(m, initial_types=[('x', FloatTensorType([None, DIM]))], options={id(m): {'zipmap': False}}, target_opset=17)
        op = os.path.join(ART, f'{A.tag}.{nm}.onnx'); open(op, 'wb').write(onx.SerializeToString())
        sess = ort.InferenceSession(op, providers=['CPUExecutionProvider']); md = 0.0
        for s0 in range(0, 400, 100):
            xb = Xte[s0:s0+100].toarray().astype(np.float32); md = max(md, float(np.abs(sess.run(None, {'x': xb})[1] - m.predict_proba(Xte[s0:s0+100])).max()))
        onnx[nm] = {'path': os.path.relpath(op, os.path.join(HERE, '..')), 'bytes': os.path.getsize(op), 'parityMaxAbsDiff': md}
except Exception as e:
    onnx = {'error': repr(e)}
rep['onnx'] = onnx; rep['weightsJsonBytes'] = {k: os.path.getsize(os.path.join(ART, f'{A.tag}.{k}.weights.json')) for k in ('gate', 'chooser')}
json.dump(rep, open(os.path.join(ART, A.tag + '.report.json'), 'w'), indent=1)
print(json.dumps({'onnx': onnx, 'weightsJsonBytes': rep['weightsJsonBytes']}), flush=True)
