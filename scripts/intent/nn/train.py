#!/usr/bin/env python3
"""A dense neural student for the intent model: hashed n-gram EMBEDDINGS (learned, 64-d) averaged, one hidden layer, two
heads (speech act, action). The question it answers: does a learned dense representation generalise better than the
shipped linear model to held-out domains and styles? Pure numpy, no framework.

  node scripts/intent/dump-features.cjs <dir>
  python3 scripts/intent/nn/train.py <dir> [--dim 64] [--hidden 128] [--epochs 8] [--seed 1] [--export out.json]

Evaluation sets: dev (odd rows), blind, te (teacher eval), te2 (teacher eval 2, first-contact style set).
Metric 'model alone': act accuracy, and ask/promise precision and recall when the model alone proposes at p >= 0.75.
"""
import json, sys, time, argparse
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('dir'); ap.add_argument('--dim', type=int, default=64); ap.add_argument('--hidden', type=int, default=128)
ap.add_argument('--epochs', type=int, default=8); ap.add_argument('--seed', type=int, default=1); ap.add_argument('--lr', type=float, default=3e-3)
ap.add_argument('--drop', type=float, default=0.25); ap.add_argument('--export', default=None); ap.add_argument('--teacher-weight', type=float, default=1.0)
a = ap.parse_args()
rng = np.random.default_rng(a.seed)
DIM = 16384; ACTS = ['ASK', 'PROMISE', 'INFORM', 'ACK']; NACT = 4; NACTION = 12

def load(name):
    d = json.load(open(f'{a.dir}/{name}.json'))
    n = len(d['idx']); L = max(len(x) for x in d['idx']) if n else 1
    X = np.full((n, L), -1, dtype=np.int32)
    for i, x in enumerate(d['idx']): X[i, :len(x)] = x
    return X, np.array(d['act']), np.array(d['action']), d

Xtr, ytr, ctr, dtr = load('train')
w = np.array([a.teacher_weight if s == 'teacher' else 1.0 for s in dtr['src']], dtype=np.float32)
evals = {k: load(k) for k in ('dev', 'blind', 'te', 'te2')}

E = (rng.standard_normal((DIM, a.dim)) * 0.05).astype(np.float32)
W1 = (rng.standard_normal((a.dim, a.hidden)) * np.sqrt(2 / a.dim)).astype(np.float32); b1 = np.zeros(a.hidden, np.float32)
W2 = (rng.standard_normal((a.hidden, NACT)) * 0.1).astype(np.float32); b2 = np.zeros(NACT, np.float32)
W3 = (rng.standard_normal((a.hidden, NACTION)) * 0.1).astype(np.float32); b3 = np.zeros(NACTION, np.float32)
params = [E, W1, b1, W2, b2, W3, b3]
m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]

def embed(X):
    mask = (X >= 0)
    idx = np.where(mask, X, 0)
    g = E[idx] * mask[..., None]
    n = np.maximum(mask.sum(1, keepdims=True), 1)
    return g.sum(1) / n, idx, mask, n

def forward(X, train=False):
    x, idx, mask, n = embed(X)
    z = x @ W1 + b1
    h = np.maximum(z, 0)
    dm = None
    if train and a.drop > 0:
        dm = (rng.random(h.shape) > a.drop).astype(np.float32) / (1 - a.drop); h = h * dm
    la = h @ W2 + b2; lc = h @ W3 + b3
    return x, z, h, dm, la, lc, idx, mask, n

def softmax(l):
    l = l - l.max(1, keepdims=True); e = np.exp(l); return e / e.sum(1, keepdims=True)

def predict(X):
    _, _, _, _, la, lc, _, _, _ = forward(X)
    return softmax(la), softmax(lc)

step = 0
def adam(grads, lr):
    global step
    step += 1
    for i, (p, g) in enumerate(zip(params, grads)):
        m[i] = 0.9 * m[i] + 0.1 * g; v[i] = 0.999 * v[i] + 0.001 * g * g
        mh = m[i] / (1 - 0.9 ** step); vh = v[i] / (1 - 0.999 ** step)
        p -= lr * mh / (np.sqrt(vh) + 1e-8)

def evaluate(name, X, y):
    pa, _ = predict(X)
    pred = pa.argmax(1); conf = pa.max(1)
    acc = float((pred == y).mean())
    out = {'n': int(len(y)), 'acc': round(acc, 3)}
    for c, nm in ((0, 'ASK'), (1, 'PROMISE')):
        prop = (pred == c) & (conf >= 0.75)
        tp = int((prop & (y == c)).sum()); fp = int((prop & (y != c)).sum()); fn = int(((y == c) & ~prop).sum())
        out[nm] = {'p': round(tp / max(tp + fp, 1), 3), 'r': round(tp / max(tp + fn, 1), 3), 'fp': fp}
    return out

N = len(ytr); B = 256
t0 = time.time()
for ep in range(a.epochs):
    order = rng.permutation(N); lsum = 0.0
    lr = a.lr * (0.5 if ep >= a.epochs - 2 else 1.0)
    for s in range(0, N, B):
        bi = order[s:s + B]
        X = Xtr[bi]; ya = ytr[bi]; yc = ctr[bi]; ww = w[bi]
        x, z, h, dm, la, lc, idx, mask, n = forward(X, True)
        pa = softmax(la); pc = softmax(lc)
        bs = len(bi)
        loss = -(np.log(pa[np.arange(bs), ya] + 1e-9) * ww).mean() - 0.5 * (np.log(pc[np.arange(bs), yc] + 1e-9) * ww).mean()
        lsum += loss * bs
        da = pa.copy(); da[np.arange(bs), ya] -= 1; da *= (ww / bs)[:, None]
        dc = pc.copy(); dc[np.arange(bs), yc] -= 1; dc *= (0.5 * ww / bs)[:, None]
        gW2 = h.T @ da; gb2 = da.sum(0); gW3 = h.T @ dc; gb3 = dc.sum(0)
        dh = da @ W2.T + dc @ W3.T
        if dm is not None: dh = dh * dm
        dz = dh * (z > 0)
        gW1 = x.T @ dz; gb1 = dz.sum(0)
        dx = dz @ W1.T
        gE = np.zeros_like(E)
        contrib = (dx / n)[:, None, :] * mask[..., None]
        np.add.at(gE, idx.reshape(-1), contrib.reshape(-1, a.dim))
        adam([gE, gW1, gb1, gW2, gb2, gW3, gb3], lr)
    print(f'epoch {ep + 1}/{a.epochs} loss {lsum / N:.4f} ({time.time() - t0:.0f}s)', flush=True)

res = {k: evaluate(k, X, y) for k, (X, y, c, d) in evals.items()}
print(json.dumps(res, indent=1))
if a.export:
    json.dump({'dim': a.dim, 'hidden': a.hidden, 'res': res}, open(a.export, 'w'))
