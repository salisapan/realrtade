#!/usr/bin/env python3
"""v2.1 (copy of train-v2.py; v2 untouched): adds a chooser confidence floor (OOF-calibrated, step-level) on top of per-label tau,
scores the v2 held-out test (test_v2) as the primary test and the v2.1 test (incl. bare/short shapes) as secondary.
v2: (A) show/silence gate (binary LR) + (B) family|step chooser (multinomial LR over reference show labels).
Decision: gate p>=tau AND no base/product veto -> chooser argmax -> cap veto on that label -> else SILENT.
tau = smallest value whose VAL wrong-Do-It (pipeline incl. veto, vs product-correct reference) <= 0.29% (v1's level).
Outputs artifacts/v2.gate.weights.json, v2.chooser.weights.json (int8, JS runtime), v2.gate.onnx, v2.chooser.onnx, v2.report.json.
Usage: train-v2.py [--feat features-v2] [--tag v2] [--rows all|v1frames] [--no-export]"""
import json, os, sys, time, argparse, zlib
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import LogisticRegression
ap = argparse.ArgumentParser(); ap.add_argument('--feat', default='features-v21'); ap.add_argument('--tag', default='v21'); ap.add_argument('--wa-cost', type=float, default=3.0); ap.add_argument('--prune', type=int, default=0); ap.add_argument('--repo-weight', type=float, default=1.0); ap.add_argument('--strict-target', type=float, default=0.0143); ap.add_argument('--shape-tau', type=int, default=1); ap.add_argument('--gate-c', type=float, default=None); ap.add_argument('--chooser-c', type=float, default=None); ap.add_argument('--rows', default='all'); ap.add_argument('--no-export', action='store_true')
ap.add_argument('--target', type=float, default=0.0029); ap.add_argument('--strict', dest='mask_unsure', action='store_false'); ap.add_argument('--gate-on-all', dest='gate_unvetoed', action='store_false'); ap.add_argument('--no-oof', dest='oof', action='store_false'); ap.add_argument('--extra', default=None, help='npz with dense extra features per set (e5 experiment)')
A = ap.parse_args()
HERE = os.path.dirname(os.path.abspath(__file__)); FEAT = os.path.join(HERE, A.feat)
ART = os.path.join(HERE, '..', 'artifacts'); os.makedirs(ART, exist_ok=True)
DIM = json.load(open(os.path.join(FEAT, 'meta.json')))['dim']
_CACHE = {}
def _parse(name):
    # memory-lean loader (box RAM is shared): indices go straight into a compact int32 array, row dicts keep metadata only
    if name in _CACHE: return _CACHE[name]
    from array import array
    rows, ind, ptr = [], array('i'), [0]
    with open(os.path.join(FEAT, name + '.jsonl')) as fh:
        for l in fh:
            if not l.strip(): continue
            r = json.loads(l); ind.extend(r.pop('x')); ptr.append(len(ind)); rows.append(r)
    _CACHE[name] = (rows, np.frombuffer(ind, dtype=np.int32).copy(), np.array(ptr, dtype=np.int64)); return _CACHE[name]
def load(name, keep=None):
    rows, ind, ptr = _parse(name)
    sel = [i for i, r in enumerate(rows) if (keep(r) if keep else True)]
    lens = ptr[1:] - ptr[:-1]
    idx = np.concatenate([np.arange(ptr[i], ptr[i + 1]) for i in sel]) if sel else np.zeros(0, dtype=np.int64)
    nptr = np.concatenate([[0], np.cumsum(lens[sel])])
    X = csr_matrix((np.ones(len(idx), dtype=np.float32), ind[idx], nptr), shape=(len(sel), DIM))
    n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1
    return [rows[i] for i in sel], csr_matrix(X.multiply(1.0 / n[:, None]))
keep = None
if A.rows == 'v1frames': keep = lambda r: r['origin'] != 'v2-frame'
ap2 = A
# the gate learns P(show | not vetoed): rows the hard veto silences deterministically (own mail, quiet/family gates,
# product rules) are removed from GATE training so they cannot teach "ask-shaped text is silent"
train_keep = (lambda r: (keep(r) if keep else True) and not (r.get('unsure') and A.mask_unsure))
gate_keep = (lambda r: not (A.gate_unvetoed and (r['vb'] or r['vp'])))
tr, Xtr = load('train', train_keep); trU, XtrU = load('train', lambda r: bool(r.get('unsure'))); va, Xva = load('val'); te, Xte = load('test_v2'); te21, Xte21 = load('test')
gidx = np.array([i for i, r in enumerate(tr) if gate_keep(r)])
ytr_bin = np.array([r['y'] != 'SILENT' for r in tr]); yva_bin = np.array([r['y'] != 'SILENT' for r in va])
print(f'[{A.tag}] gate rows {len(gidx)}; train {len(tr)} (show {ytr_bin.sum()}), val {len(va)}, test {len(te)}', flush=True)
# (A) gate
best = None
for C in ((A.gate_c,) if A.gate_c else (4.0, 16.0, 64.0)):
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
for C in ((A.chooser_c,) if A.chooser_c else (8.0, 32.0)):
    ch = LogisticRegression(C=C, max_iter=4000); ch.fit(Xtr[show_idx], ych)
    vi = np.where(yva_bin)[0]; acc = float(np.mean(ch.predict(Xva[vi]) == np.array([va[i]['y'] for i in vi])))
    print(f'  chooser C={C}: val family|step acc (given show) = {acc:.3f}', flush=True)
    if bestc is None or acc > bestc[0]: bestc = (acc, C, ch)
_, Cc, chooser = bestc
CL = list(chooser.classes_)
TAUS = None
FLOOR = {'kind': 'none', 'value': 0.0}; LAST = {}
def decide(rows, X, tau, use_veto=True, per_label=None, floor=None):
    p = gate.predict_proba(X)[:, 1]; PR = chooser.predict_proba(X); cls = np.array(chooser.classes_); kk = PR.argmax(1); lab = cls[kk]
    stp = np.array([c.split('|')[1] for c in cls]); pl = PR[np.arange(len(kk)), kk]; ps = np.array([PR[i, stp == stp[kk[i]]].sum() for i in range(len(kk))])
    conf = pl if (floor and floor['kind'] == 'label') else ps
    LAST.update(top=lab, pl=pl, ps=ps)
    out = []
    for r, pi, l, cf in zip(rows, p, lab, conf):
        if pi < ((per_label.get(l + '@' + r.get('shape', 'mail'), per_label.get(l, tau))) if per_label else tau): out.append('SILENT'); continue
        if floor and floor['kind'] != 'none' and cf < floor['value']: out.append('SILENT'); continue
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
         'wrongAction': int((show & ~sil & (pred != y)).sum()), 'agree': float((pred == y).mean()),
         'wrongStep': int(sum(1 for a, b in zip(pred, y) if a != 'SILENT' and b != 'SILENT' and a.split('|')[1] != b.split('|')[1]))}
    m['wrongActionPctOfShows'] = float(m['wrongAction'] / max(1, int((show & ~sil).sum())))
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
    SW = np.array([A.repo_weight if str(r.get('prov') or '').startswith('repo') else 1.0 for r in allr])
    # unsure (engine-recall-gap) rows: never trained on, but scored OOF (by the fold that holds out their frame) so the
    # STRICT wrong-Do-It can be budgeted at calibration time too (v2.1: strict must not get worse than v2).
    vaU_idx = np.where(~keep_va)[0]; rowsU = trU + [va[i] for i in vaU_idx]; XU = vstack([XtrU, Xva[vaU_idx]]).tocsr() if len(vaU_idx) else XtrU
    gU = np.array([r['tid'] for r in rowsU]); oofU_p = np.zeros(len(rowsU)); oofU_l = np.array(['SILENT'] * len(rowsU), dtype=object); seenG = set(groups.tolist())
    oof_p = np.zeros(len(allr)); oof_l = np.array(['SILENT'] * len(allr), dtype=object); oof_pl = np.zeros(len(allr)); oof_ps = np.zeros(len(allr))
    for k, (a, b) in enumerate(GroupKFold(n_splits=5).split(Xall, ybin, groups)):
        ga = a[gmask[a]]; gk = LogisticRegression(C=Cg, max_iter=4000).fit(Xall[ga], ybin[ga], sample_weight=SW[ga])
        sa = a[ybin[a]]; ck = LogisticRegression(C=Cc, max_iter=4000).fit(Xall[sa], yall[sa], sample_weight=SW[sa])
        heldG = set(groups[b].tolist()); ui = np.array([i for i, g in enumerate(gU) if g in heldG or (g not in seenG and zlib.crc32(g.encode()) % 5 == k)], dtype=int)
        if len(ui): oofU_p[ui] = gk.predict_proba(XU[ui])[:, 1]; oofU_l[ui] = ck.predict(XU[ui])
        oof_p[b] = gk.predict_proba(Xall[b])[:, 1]; PR = ck.predict_proba(Xall[b]); cls = np.array(ck.classes_); kk = PR.argmax(1); oof_l[b] = cls[kk]; oof_pl[b] = PR[np.arange(len(b)), kk]
        stp = np.array([c.split('|')[1] for c in cls]); oof_ps[b] = np.array([PR[i, stp == stp[kk[i]]].sum() for i in range(len(b))]); print(f'  oof fold {k} done', flush=True)
    gi = np.where(gmask)[0]; si = np.where(ybin)[0]
    gate = LogisticRegression(C=Cg, max_iter=4000).fit(Xall[gi], ybin[gi], sample_weight=SW[gi])
    chooser = LogisticRegression(C=Cc, max_iter=4000).fit(Xall[si], yall[si], sample_weight=SW[si]); CL = list(chooser.classes_)
    vetU = np.array([bool(r['vb'] or r['vp']) or bool((r['vc'] or {}).get('any') or (r['vc'] or {}).get(l.split('|')[1])) for r, l in zip(rowsU, oofU_l)])
    nU = len(rowsU); print(f'  unsure rows scored OOF: {nU}', flush=True)
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
        uS = int(((oofU_p >= t) & ~vetU).sum()); strict = (m['wrongDoIt'] + uS) / max(1, m['refSilent'] + nU); oof_sweep[-1]['strict'] = strict
        if tau is None and m['wrongDoItRate'] <= A.target and strict <= A.strict_target: tau = round(float(t), 3)
    if tau is None: tau = 0.99
    print('  OOF tau', tau, [s for s in oof_sweep if s['tau'] == tau], flush=True)
    # per-label thresholds (greedy, OOF): lower the threshold of the label that buys the most recall per extra wrong-Do-It
    yref = yall; silent_n = int((yref == 'SILENT').sum())
    vet = np.array([bool(r['vb'] or r['vp']) or bool((r['vc'] or {}).get('any') or (r['vc'] or {}).get(l.split('|')[1])) for r, l in zip(allr, oof_l)])
    SH = ('bare', 'mail') if A.shape_tau else ('',)
    key = (lambda l, r: l + '@' + r.get('shape', 'mail')) if A.shape_tau else (lambda l, r: l)
    kAll = np.array([key(l, r) for l, r in zip(oof_l, allr)]); kU = np.array([key(l, r) for l, r in zip(oofU_l, rowsU)])
    taus = {(c + '@' + s_ if A.shape_tau else c): tau for c in CL for s_ in SH}; grid = np.round(np.arange(0.30, 0.996, 0.005), 3)
    KEYS = list(taus); KI = {k: i for i, k in enumerate(KEYS)}; cAll = np.array([KI[k] for k in kAll]); cU = np.array([KI.get(k, -1) for k in kU])
    isSil = yref == 'SILENT'
    def count(tt):
        tv = np.array([tt[k] for k in KEYS] + [tau]); sh = (oof_p >= tv[cAll]) & ~vet
        shU = (oofU_p >= tv[cU]) & ~vetU
        w = int((sh & isSil).sum()); return w + 100000 * int(w + int(shU.sum()) > sbudget), int((sh & ~isSil).sum())
    budget = int(np.floor(A.target * silent_n)); sbudget = int(np.floor(A.strict_target * (silent_n + nU))); w0, r0 = count(taus)
    print(f'  budgets: masked {budget}/{silent_n}, strict {sbudget}/{silent_n + nU}', flush=True)
    while True:
        best_step = None
        for c in list(taus):
            lower = [g for g in grid if g < taus[c]]
            for g in sorted(lower, reverse=True)[:40]:
                tt = dict(taus); tt[c] = float(g); w, rr = count(tt)
                if w > budget or rr <= r0: continue
                gain = (rr - r0) / (1 + w - w0)
                if best_step is None or gain > best_step[0]: best_step = (gain, c, float(g), w, rr)
        if not best_step: break
        _, c, g, w0, r0 = best_step; taus[c] = g
    thU = np.array([taus.get(k, tau) for k in kU]); uFinal = int(((oofU_p >= thU) & ~vetU).sum())
    print('  per-label taus', taus, 'oof wdi', w0, '/', silent_n, 'oof shows', r0, 'oof unsure shows', uFinal, '/', nU, flush=True)
    TAUS = taus
    # chooser confidence floor (v2.1): abstain when the chooser is unsure WHICH action. A wrong action costs --wa-cost
    # correct closes (silence beats a wrong Do It). Chosen on OOF only; step-level confidence (p summed over labels that
    # share the step) vs label-level confidence compared, best utility kept.
    th = np.array([taus[k] for k in kAll]); shown = (oof_p >= th) & ~vet & (yref != 'SILENT')
    ystep = np.array([y.split('|')[1] if y != 'SILENT' else 'SILENT' for y in yref]); pstep = np.array([l.split('|')[1] for l in oof_l])
    FLOOR = {'kind': 'none', 'value': 0.0}; best_u = None; floor_sweep = []
    for kind, conf in (('label', oof_pl), ('step', oof_ps)):
        for f in np.round(np.arange(0.0, 0.951, 0.05), 2):
            keep = shown & (conf >= f); ok = int((keep & (oof_l == yref)).sum()); wa = int((keep & (oof_l != yref)).sum()); was = int((keep & (pstep != ystep)).sum())
            u = ok - A.wa_cost * wa; floor_sweep.append({'kind': kind, 'floor': float(f), 'correct': ok, 'wrongAction': wa, 'wrongStep': was, 'utility': u})
            if best_u is None or u > best_u + 1e-9: best_u = u; FLOOR = {'kind': kind, 'value': float(f)}
    print('  chooser floor', FLOOR, [x for x in floor_sweep if x['floor'] in (0.0, FLOOR['value']) and x['kind'] in ('label', FLOOR['kind'])], flush=True)
pv, _ = decide(va, Xva, tau, per_label=TAUS, floor=FLOOR); pt, ptest = decide(te, Xte, tau, per_label=TAUS, floor=FLOOR); TOP = dict(LAST); pt_alone, _ = decide(te, Xte, tau, use_veto=False, per_label=TAUS, floor=FLOOR)
pt_single, _ = decide(te, Xte, tau); pt_nofloor, _ = decide(te, Xte, tau, per_label=TAUS); pt21, _ = decide(te21, Xte21, tau, per_label=TAUS, floor=FLOOR)
rep = {'calibration': 'grouped-5fold-OOF(train+val), final fit on train+val' if A.oof else 'val', 'oofSweep': (oof_sweep[::4] if A.oof else None), 'tag': A.tag, 'rows': A.rows, 'feat': A.feat, 'gateC': Cg, 'chooserC': Cc, 'tau': tau, 'target': A.target, 'classes': CL,
       'tauPerLabel': TAUS, 'chooserFloor': FLOOR, 'repoWeight': A.repo_weight, 'strictTarget': A.strict_target, 'floorSweep': (floor_sweep if A.oof else None), 'val': metrics(va, pv), 'test': metrics(te, pt), 'testNoFloor': metrics(te, pt_nofloor), 'testV21': metrics(te21, pt21), 'testSingleTau': metrics(te, pt_single), 'testModelAlone': metrics(te, pt_alone), 'sweep': sweep[::4]}
print(json.dumps({k: rep[k] for k in ('tag', 'gateC', 'chooserC', 'tau')}), flush=True)
for k in ('val', 'test', 'testNoFloor', 'testV21', 'testSingleTau', 'testModelAlone'): print(' ', k, json.dumps({a: (round(b, 4) if isinstance(b, float) else b) for a, b in rep[k].items()}), flush=True)
json.dump(rep, open(os.path.join(ART, A.tag + '.report.json'), 'w'), indent=1)
with open(os.path.join(ART, A.tag + '.test-preds.jsonl'), 'w') as fo:
    for j, (r, a, b, c) in enumerate(zip(te, pt, ptest, pt_alone)): fo.write(json.dumps({'id': r['id'], 'y': r['y'], 'pred': a, 'predAlone': c, 'p': round(float(b), 4), 'top': str(TOP['top'][j]), 'pl': round(float(TOP['pl'][j]), 3), 'shape': r.get('shape'), 'lang': r['lang'], 'scenario': r['scenario'], 'prov': r['prov'], 'eng': r['eng'], 'vb': r['vb'], 'vp': r['vp'], 'rule': r['rule'], 'voc': r['voc'], 'role': r['role']}, ensure_ascii=False) + '\n')
if A.no_export: sys.exit(0)
def q8(W):
    scale = np.abs(W).max(1) / 127.0; scale[scale == 0] = 1
    return np.round(W / scale[:, None]).astype(np.int8), scale
def export_linear(m, name, labels):
    W = m.coef_.astype(np.float32); b = m.intercept_.astype(np.float32)
    Q, s = q8(W)
    if A.prune: Q[np.abs(Q) <= A.prune] = 0
    cls = [{'label': labels[k], 'bias': float(b[k]), 'scale': float(s[k]), 'idx': np.nonzero(Q[k])[0].tolist(), 'q': Q[k, np.nonzero(Q[k])[0]].tolist()} for k in range(W.shape[0])]
    return cls
gw = {'format': 'glance-close-gate/v2', 'variant': A.tag, 'dim': DIM, 'tau': tau, 'tauPerLabel': TAUS, 'chooserFloor': FLOOR, 'prune': A.prune, 'C': Cg, 'featurizer': 'model/train/featurize-v21.cjs', 'kind': 'binary-logistic',
      'rows': export_linear(gate, 'gate', ['show']), 'trainRows': len(tr), 'trainedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
cw = {'format': 'glance-close-chooser/v2', 'variant': A.tag, 'dim': DIM, 'C': Cc, 'featurizer': 'model/train/featurize-v21.cjs', 'kind': 'multinomial-logistic',
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
