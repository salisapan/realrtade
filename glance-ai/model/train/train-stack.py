#!/usr/bin/env python3
"""E5 of docs/glance-ai/model-upgrade-plan-2.md: does a non-linear second level over the linear gate's score plus structured facts beat the linear gate alone?
Level 1: the v2 logistic gate and chooser on the hashed features (grouped 5-fold OOF over train+val, as train-v2.py does).
Level 2: HistGradientBoosting on [level-1 OOF score, the engine's own decision and vetoes, language, addressee voc and role, attachment count, 12 speech-act frames],
         all of them available on the device at inference time. Same decision rule as train-v2.py (gate p >= tau, veto, chooser), tau chosen on level-2 OOF at the same
         wrong-Do-It target (0.29%). Lab only. usage: train-stack.py --feat features-v29 --tag stack --out v2x/fz-stack --predict-set features-frozen/frozen.jsonl"""
import json, os, re, argparse, time
import numpy as np
from scipy.sparse import csr_matrix, vstack
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import GroupKFold
ap = argparse.ArgumentParser(); ap.add_argument('--feat', default='features-v29'); ap.add_argument('--tag', default='stack'); ap.add_argument('--out', required=True)
ap.add_argument('--predict-set', dest='predict_set', default=None); ap.add_argument('--target', type=float, default=0.0029)
A = ap.parse_args()
HERE = os.path.dirname(os.path.abspath(__file__)); FEAT = os.path.join(HERE, A.feat); ART = os.path.abspath(os.path.join(HERE, '..', A.out)) if not os.path.isabs(A.out) else A.out
os.makedirs(ART, exist_ok=True)
DIM = json.load(open(os.path.join(FEAT, 'meta.json')))['dim']
rd = lambda p: [json.loads(l) for l in open(p) if l.strip()]
# texts for the frame regexes (dataset rows by id; frozen rows by id from the frozen set)
text = {}
for s in ('train', 'val', 'test'):
    for r in rd(os.path.join(HERE, '..', 'dataset', 'out-v2', s + '.jsonl')): text[r['id']] = r.get('cleanBody') or r.get('body') or ''
for r in rd(os.path.join(HERE, '..', '..', 'labeling', 'frozen-eval.jsonl')): text[r['id']] = r['body']
FR = [r"\b(?:can|could|would|will)\s+you\b|\bany chance\b|\bplease\b|\bkindly\b|אפשר\s+(?:ל|לה)|תוכל|תוכלי|תוכלו|יש מצב|בבקשה|נא\s+ל", r"\bneed(?:s)?\b[^.?!]{0,40}\bfrom you\b|צריך(?:ים)? ממך|חסר לנו",
      r"\byou(?:'ll| will| would)\b|\byou (?:said|promised|agreed)\b|\bas (?:agreed|promised|discussed)\b|התחייבת|הבטחת|סיכמנו ש|לפי מה שאמרת", r"\bI(?:'ll| will)\b|\bwe(?:'ll| will)\b|אני (?:אשלח|אעביר|אשלם)",
      r"\b(?:confirm(?:ed|ing)?|approved)\b|אושר|אישרנו|מאשרים", r"\b(?:about|around|approximately|roughly)\b|בערך|בסביבות", r"\bno need to (?:reply|respond)\b|\bfyi\b|לידיעתך",
      r"\b(?:already|yesterday)\b|שלחתי כבר|כבר שלחתי|שולמה", r"\b(?:hi|hello|hey|dear)\s+(?:all|everyone|team)\b|(?:היי|שלום)\s+(?:לכולם|צוות)", r"\?", r"\b(?:asap|as soon as possible)\b|בהקדם",
      r"\b(?:create|make|prepare|schedule|review|proofread|sign|fix|update|book)\b|תכין|תכיני|תעבור על|תחתום|תקבע", r"\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|sunday|end of (?:the )?week)\b|מחר|היום|יום [א-ו]|סוף (?:ה)?שבוע|\d{1,2}[/.]\d{1,2}"]
FRC = [re.compile(x, re.I) for x in FR]
VOC = ['own', 'none', 'other', 'group']; ROLE = ['to', 'cc-only', 'none']
def dense(rows):
    D = np.zeros((len(rows), 5 + len(VOC) + len(ROLE) + 4 + len(FRC)), dtype=np.float32)
    for i, r in enumerate(rows):
        t = text.get(r['id'], ''); j = 0
        D[i, j] = 1.0 if r.get('lang') == 'he' else 0.0; j += 1
        D[i, j] = min(3, r.get('att') or 0); j += 1
        D[i, j] = 1.0 if (r.get('eng') and r['eng'] != 'SILENT') else 0.0; j += 1
        D[i, j] = 1.0 if r.get('vb') else 0.0; j += 1
        D[i, j] = 1.0 if r.get('vp') else 0.0; j += 1
        for v in VOC: D[i, j] = 1.0 if r.get('voc') == v else 0.0; j += 1
        for v in ROLE: D[i, j] = 1.0 if r.get('role') == v else 0.0; j += 1
        vc = r.get('vc') or {}; D[i, j] = 1.0 if vc.get('any') else 0.0; j += 1
        D[i, j] = min(6, len(t.split()) / 10.0); j += 1
        D[i, j] = 1.0 if re.search(r'[֐-׿]', t) else 0.0; j += 1
        D[i, j] = 1.0 if '>' in t else 0.0; j += 1
        for c in FRC: D[i, j] = 1.0 if c.search(t) else 0.0; j += 1
    return D
def sp(rows):
    ind, ptr = [], [0]
    for r in rows: ind.extend(r['x']); ptr.append(len(ind))
    X = csr_matrix((np.ones(len(ind), dtype=np.float32), np.array(ind, dtype=np.int64), np.array(ptr)), shape=(len(rows), DIM))
    n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1
    return csr_matrix(X.multiply(1.0 / n[:, None]))
tr = rd(os.path.join(FEAT, 'train.jsonl')); va = rd(os.path.join(FEAT, 'val.jsonl')); te = rd(os.path.join(FEAT, 'test.jsonl'))
sure = lambda r: not r.get('unsure')
allr = tr + [r for r in va if sure(r)]
allr = [r for r in allr if sure(r)]
X = sp(allr); y = np.array([r['y'] for r in allr]); yb = y != 'SILENT'; groups = np.array([r['tid'] for r in allr]); gkeep = np.array([not (r['vb'] or r['vp']) for r in allr])
Cg, Cc = 16.0, 8.0
t0 = time.time(); oof = np.zeros(len(allr)); oofl = np.array(['SILENT'] * len(allr), dtype=object)
for k, (a, b) in enumerate(GroupKFold(n_splits=5).split(X, yb, groups)):
    ga = a[gkeep[a]]; g = LogisticRegression(C=Cg, max_iter=4000).fit(X[ga], yb[ga]); sa = a[yb[a]]; c = LogisticRegression(C=Cc, max_iter=4000).fit(X[sa], y[sa])
    oof[b] = g.predict_proba(X[b])[:, 1]; oofl[b] = c.predict(X[b]); print(f'  L1 fold {k} ({time.time()-t0:.0f}s)', flush=True)
gate1 = LogisticRegression(C=Cg, max_iter=4000).fit(X[gkeep], yb[gkeep]); chooser = LogisticRegression(C=Cc, max_iter=4000).fit(X[yb], y[yb])
D = dense(allr); F = np.column_stack([oof, D])
# level 2, itself OOF (grouped) so tau is chosen on predictions the level-2 model did not train on
oof2 = np.zeros(len(allr))
for k, (a, b) in enumerate(GroupKFold(n_splits=5).split(F, yb, groups)):
    ga = a[gkeep[a]]; m = HistGradientBoostingClassifier(max_depth=4, learning_rate=0.08, max_iter=200, l2_regularization=1.0, random_state=0).fit(F[ga], yb[ga]); oof2[b] = m.predict_proba(F[b])[:, 1]; print(f'  L2 fold {k}', flush=True)
gate2 = HistGradientBoostingClassifier(max_depth=4, learning_rate=0.08, max_iter=200, l2_regularization=1.0, random_state=0).fit(F[gkeep], yb[gkeep])
def decide_rows(rows, p, lab, tau):
    out = []
    for r, pi, l in zip(rows, p, lab):
        if pi < tau or r['vb'] or r['vp']: out.append('SILENT'); continue
        vc = r.get('vc') or {}; st = l.split('|')[1]
        out.append('SILENT' if (vc.get('any') or vc.get(st)) else l)
    return np.array(out)
silent_n = int((y == 'SILENT').sum()); tau = 0.99
for t in np.arange(0.05, 0.996, 0.005):
    pred = decide_rows(allr, oof2, oofl, t); wdi = int(((pred != 'SILENT') & (y == 'SILENT')).sum()) / max(1, silent_n)
    if wdi <= A.target: tau = round(float(t), 3); break
print('  tau (level-2 OOF)', tau, flush=True)
def predict(rows):
    Xr = sp(rows); p1 = gate1.predict_proba(Xr)[:, 1]; lab = chooser.predict(Xr); p2 = gate2.predict_proba(np.column_stack([p1, dense(rows)]))[:, 1]
    p1b = gate1.predict_proba(Xr)[:, 1]
    return p2, lab, decide_rows(rows, p2, lab, tau), decide_rows(rows, p2, lab, tau) if False else np.array([l if p >= tau else 'SILENT' for p, l in zip(p2, lab)])
def write(rows, name, extra):
    p2, lab, pv, alone = predict(rows)
    with open(os.path.join(ART, A.tag + '.' + name), 'w') as fo:
        for r, a, b, c in zip(rows, pv, p2, alone): fo.write(json.dumps({'id': r['id'], 'pred': a, 'predAlone': c, 'p': round(float(b), 4), 'lang': r['lang'], 'vb': r.get('vb'), 'vp': r.get('vp'), 'tip': r.get('tip'), 'eng': r.get('eng'), **({'y': r['y']} if extra else {})}) + '\n')
write(te, 'test-preds.jsonl', True)
if A.predict_set: write(rd(os.path.join(HERE, A.predict_set)), 'extra-preds.jsonl', False)
print('done', flush=True)
