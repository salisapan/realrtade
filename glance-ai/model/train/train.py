#!/usr/bin/env python3
"""Train the compact Glance close model (hashed features -> multinomial logistic regression).
Variants: v1 = pure teacher distillation; v1c = teacher + 2 spec corrections (negation->silence, OneDrive save).
Outputs (artifacts/): <v>.weights.json (int8-quantized, consumed by model/runtime/glance-model.cjs),
<v>.onnx (linear softmax over the hashed vector, for server/on-device), <v>.report.json."""
import json, os, sys, time
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import LogisticRegression

HERE = os.path.dirname(os.path.abspath(__file__))
FEAT = os.path.join(HERE, 'features')
ART = os.path.join(HERE, '..', 'artifacts'); os.makedirs(ART, exist_ok=True)
DIM = json.load(open(os.path.join(FEAT, 'meta.json')))['dim']

def load(name):
    rows = [json.loads(l) for l in open(os.path.join(FEAT, name + '.jsonl')) if l.strip()]
    ind, ptr = [], [0]
    for r in rows:
        ind.extend(r['x']); ptr.append(len(ind))
    data = np.ones(len(ind), dtype=np.float32)
    X = csr_matrix((data, np.array(ind), np.array(ptr)), shape=(len(rows), DIM))
    n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1
    X = csr_matrix(X.multiply(1.0 / n[:, None]))
    return rows, X

def train_variant(v, ycol):
    tr, Xtr = load('train'); va, Xva = load('val')
    ytr = [r[ycol] for r in tr]; yva_t = [r['y'] for r in va]
    classes = sorted(set(ytr), key=lambda c: (c != 'SILENT', c))
    best = None
    for C in (8.0, 32.0, 128.0):
        m = LogisticRegression(C=C, max_iter=3000)
        t0 = time.time(); m.fit(Xtr, ytr)
        P = m.predict_proba(Xva); cl = list(m.classes_)
        pred = [cl[i] for i in P.argmax(1)]
        acc = np.mean([p == y for p, y in zip(pred, [r[ycol] for r in va])])
        print(f'{v} C={C} val acc={acc:.4f} ({time.time()-t0:.1f}s)', flush=True)
        if best is None or acc > best[0]: best = (acc, C, m)
    acc, C, m = best
    cl = list(m.classes_); si = cl.index('SILENT')
    P = m.predict_proba(Xva)
    # tau: smallest show-threshold on P(not silent) with val wrong-Do-It (vs the v's own target) <= 0.3%
    yv = [r[ycol] for r in va]
    silent_n = sum(1 for y in yv if y == 'SILENT')
    taus = []
    for tau in np.arange(0.30, 0.991, 0.01):
        show = (1 - P[:, si]) >= tau
        wdi = sum(1 for s, y in zip(show, yv) if s and y == 'SILENT')
        tp = sum(1 for s, y in zip(show, yv) if s and y != 'SILENT')
        taus.append((round(float(tau), 2), wdi / max(1, silent_n), tp / max(1, len(yv) - silent_n)))
    ok = [t for t in taus if t[1] <= 0.003]
    tau = ok[0][0] if ok else 0.95
    W = m.coef_.astype(np.float32); b = m.intercept_.astype(np.float32)
    # int8 per-class quantization
    scale = np.abs(W).max(1) / 127.0; scale[scale == 0] = 1
    Q = np.round(W / scale[:, None]).astype(np.int8)
    nz = int((Q != 0).sum())
    # sparse export: only non-zero int8 weights, per class as [idx..],[q..]
    classes_out = []
    for k, c in enumerate(cl):
        idx = np.nonzero(Q[k])[0]
        classes_out.append({'label': c, 'bias': float(b[k]), 'scale': float(scale[k]), 'idx': idx.tolist(), 'q': Q[k, idx].tolist()})
    wj = {'format': 'glance-close-linear/v1', 'variant': v, 'dim': DIM, 'tau': tau, 'C': C, 'featurizer': 'model/train/featurize.cjs',
          'classes': classes_out, 'trainedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'trainRows': len(tr), 'labelColumn': ycol}
    p = os.path.join(ART, v + '.weights.json'); json.dump(wj, open(p, 'w'), separators=(',', ':'))
    # ONNX: dense float input [N, DIM] (already hashed + L2-normalized by featurize.cjs)
    onnx_info = None
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType
        import onnxruntime as ort
        onx = convert_sklearn(m, initial_types=[('x', FloatTensorType([None, DIM]))], options={id(m): {'zipmap': False}}, target_opset=17)
        op = os.path.join(ART, v + '.onnx'); open(op, 'wb').write(onx.SerializeToString())
        te, Xte = load('test')
        sess = ort.InferenceSession(op, providers=['CPUExecutionProvider'])
        maxdiff = 0.0
        for s in range(0, min(Xte.shape[0], 600), 200):
            xb = Xte[s:s+200].toarray().astype(np.float32)
            po = sess.run(None, {'x': xb})[1]
            ps = m.predict_proba(Xte[s:s+200])
            maxdiff = max(maxdiff, float(np.abs(po - ps).max()))
        onnx_info = {'path': os.path.relpath(op, os.path.join(HERE, '..')), 'bytes': os.path.getsize(op), 'parityMaxAbsDiffVsSklearn': maxdiff}
    except Exception as e:
        onnx_info = {'error': repr(e)}
    rep = {'variant': v, 'C': C, 'valAcc': float(acc), 'tau': tau, 'classes': cl, 'nonzeroInt8Weights': nz,
           'weightsJsonBytes': os.path.getsize(p), 'onnx': onnx_info, 'tauSweep': taus[::5]}
    json.dump(rep, open(os.path.join(ART, v + '.report.json'), 'w'), indent=2)
    print(json.dumps({k: rep[k] for k in ('variant', 'C', 'valAcc', 'tau', 'nonzeroInt8Weights', 'weightsJsonBytes', 'onnx')}), flush=True)

if __name__ == '__main__':
    which = sys.argv[1:] or ['v1', 'v1c']
    for v in which:
        train_variant(v, 'y' if v == 'v1' else 'yc')
