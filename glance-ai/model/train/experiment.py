#!/usr/bin/env python3
"""Quick model-family comparison on the same hashed features (template-grouped val/test).
Metric that matters: missed-close on test at the tau that keeps VAL wrong-Do-It <= 0.3% (vs teacher)."""
import json, os, sys, time, numpy as np, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(__file__))
from train import load
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier

tr, Xtr = load('train'); va, Xva = load('val'); te, Xte = load('test')
ytr = np.array([r['y'] for r in tr]); yva = np.array([r['y'] for r in va]); yte = np.array([r['y'] for r in te])

def op(P, cl, y, tau):
    si = cl.index('SILENT'); nonsil = P.copy(); nonsil[:, si] = -1
    top = np.array(cl)[nonsil.argmax(1)]; show = (1 - P[:, si]) >= tau
    pred = np.where(show, top, 'SILENT')
    ts = y == 'SILENT'
    wdi = (show & ts).sum() / ts.sum(); miss = (~show & ~ts).sum() / (~ts).sum()
    both = show & ~ts
    wa = (np.array([p.split('|')[-1] for p in pred[both]]) != np.array([t.split('|')[-1] for t in y[both]])).mean() if both.sum() else 0
    return wdi, miss, wa, (pred == y).mean()

def evaluate(name, m):
    t0 = time.time(); m.fit(Xtr, ytr); cl = list(m.classes_)
    Pv, Pt = m.predict_proba(Xva), m.predict_proba(Xte)
    tau = next((t for t in np.arange(0.2, 0.995, 0.01) if op(Pv, cl, yva, t)[0] <= 0.003), 0.99)
    w, mi, wa, acc = op(Pt, cl, yte, tau)
    w5, mi5, wa5, acc5 = op(Pt, cl, yte, 0.5)
    print(f'{name:28s} tau={tau:.2f} test: wrongDoIt={w*100:.2f}% missed={mi*100:.1f}% wrongAct={wa*100:.1f}% acc={acc*100:.1f}% | @0.5 wdi={w5*100:.2f}% missed={mi5*100:.1f}% ({time.time()-t0:.0f}s)', flush=True)
    return m

which = sys.argv[1:] or ['lr', 'lrbal', 'mlp']
if 'lr' in which: evaluate('LR C=8', LogisticRegression(C=8, max_iter=3000))
if 'lrbal' in which: evaluate('LR C=8 balanced', LogisticRegression(C=8, max_iter=3000, class_weight='balanced'))
if 'mlp' in which: evaluate('MLP 64 relu', MLPClassifier(hidden_layer_sizes=(64,), alpha=1e-4, max_iter=60, early_stopping=False, random_state=0))
if 'mlp128' in which: evaluate('MLP 128 relu', MLPClassifier(hidden_layer_sizes=(128,), alpha=1e-3, max_iter=60, random_state=0))
