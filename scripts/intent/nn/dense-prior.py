#!/usr/bin/env python3
"""Does a PRETRAINED dense prior help? A/B on the same trainer: linear softmax over hashed n-grams (A) versus the same plus the
mean of pretrained GloVe word vectors of the sentence (B). English only (no Hebrew vectors are available to us), so the
comparison is reported per language.

  python3 scripts/intent/nn/dense-prior.py <featureDir> <glove.100d.txt.gz> [--vocab 30000] [--epochs 8] [--export out.json]
Evaluated on dev (odd rows), blind, te, te2 as 'model alone' (argmax accuracy, ask/promise P/R at p>=0.75).
"""
import json, gzip, re, sys, argparse, time
import numpy as np
ap = argparse.ArgumentParser()
ap.add_argument('dir'); ap.add_argument('glove'); ap.add_argument('--vocab', type=int, default=30000); ap.add_argument('--epochs', type=int, default=8)
ap.add_argument('--seed', type=int, default=1); ap.add_argument('--export', default=None); ap.add_argument('--scale', type=float, default=1.0); ap.add_argument('--pca', type=int, default=0)
a = ap.parse_args()
DIM = 16384; NACT = 4

vecs = []; words = []
with gzip.open(a.glove, 'rt', encoding='utf8') as f:
    for i, line in enumerate(f):
        if i >= a.vocab: break
        p = line.rstrip().split(' ')
        if len(p) < 50: continue          # a header line such as '400000 100'
        words.append(p[0]); vecs.append(np.asarray(p[1:], dtype=np.float32))
V = np.stack(vecs); W2I = {w: i for i, w in enumerate(words)}
V = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-6)
if a.pca:
    mu = V.mean(0); U, S, Vt = np.linalg.svd(V - mu, full_matrices=False)
    V = (V - mu) @ Vt[:a.pca].T
    V = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-6)
D = V.shape[1]
TOK = re.compile(r"[a-z']+")
def dense(text):
    ids = [W2I[t] for t in TOK.findall(text.lower().replace("'", "")) if t in W2I]
    if not ids: return np.zeros(D, np.float32)
    v = V[ids].mean(0); n = np.linalg.norm(v); return (v / (n + 1e-6)) * a.scale

def load(name):
    d = json.load(open(f'{a.dir}/{name}.json'))
    n = len(d['idx']); L = max(len(x) for x in d['idx'])
    X = np.full((n, L), -1, dtype=np.int32)
    for i, x in enumerate(d['idx']): X[i, :len(x)] = x
    Z = np.stack([dense(t) for t in d['text']])
    return X, Z, np.array(d['act']), np.array(d['lang']), d

Xtr, Ztr, ytr, ltr, dtr = load('train')
evals = {k: load(k) for k in ('dev', 'blind', 'te', 'te2')}

def softmax(l):
    l = l - l.max(1, keepdims=True); e = np.exp(l); return e / e.sum(1, keepdims=True)

def run(use_dense):
    rs = np.random.default_rng(a.seed)
    Wt = np.zeros((DIM, NACT), np.float32); Gt = np.full_like(Wt, 1e-6)
    Wd = np.zeros((D, NACT), np.float32); Gd = np.full_like(Wd, 1e-6)
    b = np.zeros(NACT, np.float32)
    N = len(ytr); B = 128; lr = 0.35
    def logits(X, Z):
        mask = X >= 0; idx = np.where(mask, X, 0)
        l = (Wt[idx] * mask[..., None]).sum(1) + b
        if use_dense: l = l + Z @ Wd
        return l, idx, mask
    for ep in range(a.epochs):
        order = rs.permutation(N)
        for s in range(0, N, B):
            bi = order[s:s + B]; X = Xtr[bi]; Z = Ztr[bi]; y = ytr[bi]
            l, idx, mask = logits(X, Z); p = softmax(l); g = p.copy(); g[np.arange(len(bi)), y] -= 1; g /= len(bi) / 8.0
            gW = np.zeros_like(Wt)
            np.add.at(gW, idx.reshape(-1), (g[:, None, :] * mask[..., None]).reshape(-1, NACT))
            nz = np.nonzero(np.abs(gW).sum(1))[0]
            Gt[nz] += gW[nz] ** 2; Wt[nz] -= lr * gW[nz] / np.sqrt(Gt[nz])
            b -= 0.05 * g.sum(0)
            if use_dense:
                gd = Z.T @ g; Gd += gd ** 2; Wd -= lr * gd / np.sqrt(Gd)
    out = {}
    for k, (X, Z, y, lang, d) in evals.items():
        l, _, _ = logits(X, Z); pr = softmax(l); pred = pr.argmax(1); conf = pr.max(1)
        r = {}
        for lg in ('all', 'en', 'he'):
            sel = np.ones(len(y), bool) if lg == 'all' else (lang == lg)
            if not sel.any(): continue
            e = {'n': int(sel.sum()), 'acc': round(float((pred[sel] == y[sel]).mean()), 3)}
            for c, nm in ((0, 'ASK'), (1, 'PROMISE')):
                prop = sel & (pred == c) & (conf >= 0.75)
                tp = int((prop & (y == c)).sum()); fp = int((prop & (y != c)).sum()); fn = int((sel & (y == c) & ~prop).sum())
                e[nm] = {'p': round(tp / max(tp + fp, 1), 3), 'r': round(tp / max(tp + fn, 1), 3), 'fp': fp}
            r[lg] = e
        out[k] = r
    return out, (Wt, Wd, b)

t0 = time.time()
A, _ = run(False); print('A (n-grams only) done', round(time.time() - t0), 's', flush=True)
B, params = run(True); print('B (n-grams + GloVe) done', round(time.time() - t0), 's', flush=True)
for k in A:
    for lg in ('all', 'en', 'he'):
        if lg not in A[k]: continue
        x, y = A[k][lg], B[k][lg]
        print(f"{k:6s} {lg:3s} n={x['n']:3d}  acc {x['acc']:.3f} -> {y['acc']:.3f} | ASK P/R {x['ASK']['p']:.2f}/{x['ASK']['r']:.2f} -> {y['ASK']['p']:.2f}/{y['ASK']['r']:.2f} | PROMISE P/R {x['PROMISE']['p']:.2f}/{x['PROMISE']['r']:.2f} -> {y['PROMISE']['p']:.2f}/{y['PROMISE']['r']:.2f}")
if a.export:
    json.dump({'A': A, 'B': B}, open(a.export, 'w'), indent=1)
