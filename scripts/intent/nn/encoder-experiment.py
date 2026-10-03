#!/usr/bin/env python3
"""The pretrained multilingual encoder experiment: to be RUN BY THE OWNER on a machine with access to Hugging Face
(the build sandbox cannot reach it). It answers one question with numbers: would a pretrained multilingual sentence
encoder, running on the device, beat the shipped n-gram model on held-out domains, in Hebrew and English?

  pip install sentence-transformers numpy
  node scripts/intent/dump-features.cjs /tmp/intent-nn
  python3 scripts/intent/nn/encoder-experiment.py /tmp/intent-nn [--model intfloat/multilingual-e5-small] [--prefix "query: "] [--out result.json]
  python3 scripts/intent/nn/encoder-experiment.py /tmp/intent-nn --stub      # logic check only, no download, meaningless numbers

What it does: embeds every training sentence (generated + teacher) and the four hand-written evaluation sets, trains a softmax head on
(a) the embedding alone, (b) the embedding plus the hashed n-gram features, with the same optimiser as the shipped linear model, and prints
act accuracy and ask/promise precision and recall (model alone, p >= 0.75) per set and per language, next to (c) n-grams only.

Adoption rule (docs/ai-engine-upgrade.md): adopt only if (b) beats (c) by at least 3 points of accuracy on BOTH te and te2, in BOTH
languages, with no loss of precision, AND the quantised model fits the size and latency budget (about 30 MB, under 60 ms per sentence on a laptop).
"""
import json, argparse, time
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('dir'); ap.add_argument('--model', default='intfloat/multilingual-e5-small'); ap.add_argument('--prefix', default='query: ')
ap.add_argument('--stub', action='store_true'); ap.add_argument('--epochs', type=int, default=8); ap.add_argument('--out', default=None)
ap.add_argument('--limit', type=int, default=0, help='train on at most N sentences (debugging)')
a = ap.parse_args()
DIM = 16384; NACT = 4

def load(name):
    d = json.load(open(f'{a.dir}/{name}.json'))
    n = len(d['idx']); L = max(len(x) for x in d['idx'])
    X = np.full((n, L), -1, dtype=np.int32)
    for i, x in enumerate(d['idx']): X[i, :len(x)] = x
    return X, np.array(d['act']), np.array(d['lang']), d['text']

train = load('train')
if a.limit:
    train = (train[0][:a.limit], train[1][:a.limit], train[2][:a.limit], train[3][:a.limit])
evals = {k: load(k) for k in ('dev', 'blind', 'te', 'te2')}

if a.stub:
    def embed(texts):
        out = np.zeros((len(texts), 256), np.float32)
        for i, t in enumerate(texts):
            t = '^' + t.lower() + '$'
            for j in range(len(t) - 2): out[i, hash(t[j:j + 3]) % 256] += 1
            out[i] /= (np.linalg.norm(out[i]) + 1e-6)
        return out
else:
    from sentence_transformers import SentenceTransformer
    enc = SentenceTransformer(a.model)
    def embed(texts):
        return np.asarray(enc.encode([a.prefix + t for t in texts], batch_size=64, normalize_embeddings=True, show_progress_bar=False), np.float32)

t0 = time.time()
# Embed the unique training texts once (the teacher sentences are repeated with augmentation).
uniq = {}; order = []
for t in train[3]:
    if t not in uniq: uniq[t] = len(uniq)
    order.append(uniq[t])
Etr_u = embed(list(uniq.keys())); Etr = Etr_u[np.array(order)]
Eev = {k: embed(v[3]) for k, v in evals.items()}
print(f'embedded {len(uniq)} unique training texts and {sum(len(v[3]) for v in evals.values())} eval texts in {time.time() - t0:.0f}s', flush=True)
Dm = Etr.shape[1]

def softmax(l):
    l = l - l.max(1, keepdims=True); e = np.exp(l); return e / e.sum(1, keepdims=True)

def run(use_emb, use_ngram):
    rs = np.random.default_rng(1)
    Wt = np.zeros((DIM, NACT), np.float32); Gt = np.full_like(Wt, 1e-6)
    We = np.zeros((Dm, NACT), np.float32); Ge = np.full_like(We, 1e-6)
    b = np.zeros(NACT, np.float32)
    X, y, lang, text = train; N = len(y); B = 128; lr = 0.35
    def logits(Xs, Es):
        l = np.tile(b, (len(Xs), 1))
        if use_ngram:
            mask = Xs >= 0; idx = np.where(mask, Xs, 0); l = l + (Wt[idx] * mask[..., None]).sum(1)
        if use_emb: l = l + Es @ We
        return l
    for ep in range(a.epochs):
        perm = rs.permutation(N)
        for s in range(0, N, B):
            bi = perm[s:s + B]; l = logits(X[bi], Etr[bi]); p = softmax(l); g = p.copy(); g[np.arange(len(bi)), y[bi]] -= 1; g /= len(bi) / 8.0
            if use_ngram:
                mask = X[bi] >= 0; idx = np.where(mask, X[bi], 0); gW = np.zeros_like(Wt)
                np.add.at(gW, idx.reshape(-1), (g[:, None, :] * mask[..., None]).reshape(-1, NACT))
                nz = np.nonzero(np.abs(gW).sum(1))[0]; Gt[nz] += gW[nz] ** 2; Wt[nz] -= lr * gW[nz] / np.sqrt(Gt[nz])
            if use_emb:
                ge = Etr[bi].T @ g; Ge += ge ** 2; We -= lr * ge / np.sqrt(Ge)
            b -= 0.05 * g.sum(0)
    res = {}
    for k, (Xs, ys, ls, ts) in evals.items():
        pr = softmax(logits(Xs, Eev[k])); pred = pr.argmax(1); conf = pr.max(1); r = {}
        for lg in ('all', 'en', 'he'):
            sel = np.ones(len(ys), bool) if lg == 'all' else (ls == lg)
            if not sel.any(): continue
            e = {'n': int(sel.sum()), 'acc': round(float((pred[sel] == ys[sel]).mean()), 3)}
            for c, nm in ((0, 'ASK'), (1, 'PROMISE')):
                prop = sel & (pred == c) & (conf >= 0.75); tp = int((prop & (ys == c)).sum()); fp = int((prop & (ys != c)).sum()); fn = int((sel & (ys == c) & ~prop).sum())
                e[nm] = {'p': round(tp / max(tp + fp, 1), 3), 'r': round(tp / max(tp + fn, 1), 3)}
            r[lg] = e
        res[k] = r
    return res

C = run(False, True); print('(c) n-grams only done', flush=True)
A = run(True, False); print('(a) embedding only done', flush=True)
Bb = run(True, True); print('(b) embedding + n-grams done', flush=True)
for k in ('dev', 'blind', 'te', 'te2'):
    for lg in ('all', 'en', 'he'):
        if lg not in C[k]: continue
        c, x, y = C[k][lg], A[k][lg], Bb[k][lg]
        print(f"{k:5s} {lg:3s} n={c['n']:3d} acc: n-grams {c['acc']:.3f} | emb {x['acc']:.3f} | emb+n-grams {y['acc']:.3f} (delta {y['acc'] - c['acc']:+.3f}) | ASK P/R {c['ASK']['p']:.2f}/{c['ASK']['r']:.2f} -> {y['ASK']['p']:.2f}/{y['ASK']['r']:.2f} | PROMISE {c['PROMISE']['p']:.2f}/{c['PROMISE']['r']:.2f} -> {y['PROMISE']['p']:.2f}/{y['PROMISE']['r']:.2f}")
adopt = all(Bb[k][lg]['acc'] - C[k][lg]['acc'] >= 0.03 for k in ('te', 'te2') for lg in ('en', 'he') if lg in C[k])
print('\nADOPTION RULE (>= +3 points on te and te2, both languages):', 'MET' if adopt else 'NOT MET', '' if not a.stub else '(stub encoder: ignore)')
if a.out: json.dump({'ngrams': C, 'embedding': A, 'both': Bb, 'model': 'stub' if a.stub else a.model, 'adopt': bool(adopt)}, open(a.out, 'w'), indent=1)
