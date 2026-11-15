#!/usr/bin/env python3
"""Lab kind head (kinds-v0, 2026-11-15). A multinomial linear head over the SAME featurizer family as train-v2.py (featurize-v2.cjs hashed features, L2 norm, sklearn LR),
with the KIND as the label: 21 close kinds + `none`. It sits over the family head's data: the shipped-pool rows (task / calendar / draft / file_save / SILENT, out-v2 train)
join the teacher-labelled synthetic kind rows (model/dataset/kinds-v0/rows.jsonl), so the four old families stay in the label space.
Decision (mirrors train-v2.py decide): show only if 1 - P(none) >= tau, the step confidence >= kappa, and the lab veto (vb/vp/vc) passes; tau and kappa come from grouped 5-fold OOF
over the training rows, never from a held-out set. A model answer is a PROPOSAL; this head is OFF and unwired (no manifest, no runtime file, no export).
NEVER trained on: frozen-eval.jsonl, kind-frozen-v0.cjs, the validation batches, the sealed batch (texts are checked against them; overlaps are dropped).
usage: train-kinds.py --kinds-feat <kinds.jsonl> --frozen-feat features-frozen/frozen.jsonl --kind-frozen-feat <kf.jsonl> --out <dir>"""
import json, os, sys, argparse, random, re, time
import numpy as np
from scipy.sparse import csr_matrix, vstack
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
ap = argparse.ArgumentParser()
ap.add_argument('--kinds-feat', required=True); ap.add_argument('--frozen-feat', required=True); ap.add_argument('--kind-frozen-feat', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--target', type=float, default=0.0029); ap.add_argument('--action-target', type=float, default=0.02); ap.add_argument('--pool-none', type=int, default=3000); ap.add_argument('--pool-step', type=int, default=1200); ap.add_argument('--seed', type=int, default=11)
A = ap.parse_args(); os.makedirs(A.out, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); G = os.path.join(HERE, '..', '..'); DIM = 1 << 17
rng = random.Random(A.seed)
norm = lambda s: re.sub(r'\s+', ' ', str(s or '')).strip()
rd = lambda p: [json.loads(l) for l in open(p) if l.strip()]
# ---- what the head may map to (kind -> the step the 4-label scoreboard understands, or its own name when the old labels cannot say it)
STEP = {'cal_hold': 'calendar', 'cal_booking': 'calendar', 'cal_recurring': 'calendar', 'video_link': 'calendar', 'draft_reply': 'draft', 'task': 'task', 'commit_sender': 'task', 'commit_reader': 'task', 'notice_system': 'task', 'pay': 'task', 'sheet_row': 'task', 'file_save': 'file_save'}
WANT = {'cal_hold': 'calendar', 'cal_booking': 'calendar', 'cal_recurring': 'calendar', 'cal_move': 'calendar', 'cal_cancel': 'calendar', 'video_link': 'video_link', 'draft_reply': 'draft', 'task': 'task', 'commit_sender': 'task', 'commit_reader': 'task', 'notice_system': 'task', 'pay': 'pay', 'file_save': 'file_save', 'doc_create': 'doc_create', 'sheet_create': 'sheet_create', 'slides_create': 'slides_create', 'form_create': 'form_create', 'word_create': 'word_create', 'excel_create': 'excel_create', 'sheet_row': 'sheet_row', 'doc_append': 'doc_append'}
stepOf = lambda k: STEP.get(k, k)          # what the scoreboard sees for a predicted kind
POOL = {'task': 'task', 'calendar': 'cal_hold', 'draft': 'draft_reply', 'file_save': 'file_save'}
# ---- held-out texts the pool must not contain (pool ids -> bodies from out-v2 train, same order as features-v2/train.jsonl)
held = set(norm(r['body']) for r in rd(os.path.join(G, 'labeling', 'frozen-eval.jsonl')))
for f in os.listdir(os.path.join(G, 'labeling')):
    if re.match(r'batch-\d+\.json$', f):
        held |= set(norm(r['body']) for r in json.load(open(os.path.join(G, 'labeling', f))))
import subprocess
kf = subprocess.run(['node', '-e', 'console.log(JSON.stringify(require(process.argv[1]).map(r=>r[2])))', os.path.abspath(os.path.join(G, 'labeling', 'kind-frozen', 'kind-frozen-v0.cjs'))], capture_output=True, text=True, check=True).stdout
held |= set(norm(t) for t in json.loads(kf))
body_by_id = {r['id']: norm(r.get('body')) for r in rd(os.path.join(G, 'model', 'dataset', 'out-v2', 'train.jsonl'))}
# ---- pool rows (the family head's data), subsampled
pool_all = rd(os.path.join(HERE, 'features-v2', 'train.jsonl')); n_held = 0; byc = {}
for r in pool_all:
    if r.get('unsure'): continue
    if body_by_id.get(r['id']) in held: n_held += 1; continue
    y = r['y']; k = 'none' if y == 'SILENT' else POOL.get(str(y).split('|')[-1])
    if k is None: continue
    byc.setdefault(k, []).append(dict(r, kind=k, grp='pool:' + str(r.get('tid') or r['id'])))
pool = []
for k, rows in byc.items():
    rng.shuffle(rows); pool += rows[:A.pool_none if k == 'none' else A.pool_step]
# ---- synthetic kind rows (teacher == intended; the engine never edits the label)
syn = [dict(r, kind=r['y'], grp='syn:' + r['id']) for r in rd(A.kinds_feat)]
rows = syn + pool
KL = sorted({r['kind'] for r in rows}); NONE = KL.index('none')
print(f'train rows: synthetic {len(syn)} + pool {len(pool)} (pool rows dropped for overlapping a held-out text: {n_held}); classes {len(KL)}', flush=True)
def mat(rs):
    ind, ptr = [], [0]
    for r in rs: ind.extend(r['x']); ptr.append(len(ind))
    X = csr_matrix((np.ones(len(ind), dtype=np.float32), np.array(ind, dtype=np.int64), np.array(ptr)), shape=(len(rs), DIM))
    n = np.sqrt(np.asarray(X.multiply(X).sum(1)).ravel()); n[n == 0] = 1
    return csr_matrix(X.multiply(1.0 / n[:, None]))
X = mat(rows); y = np.array([KL.index(r['kind']) for r in rows]); groups = np.array([r['grp'] for r in rows])
# ---- C: chosen on the synthetic validation split (kinds-v0 `val`, 20%), accuracy on rows with a close + silence on the rest
tr = [i for i, r in enumerate(rows) if not (r['grp'].startswith('syn:') and r.get('split') == 'val')]; va = [i for i, r in enumerate(rows) if r['grp'].startswith('syn:') and r.get('split') == 'val']
best = None
for C in (8.0, 32.0, 128.0):
    t0 = time.time(); m = LogisticRegression(C=C, max_iter=3000).fit(X[tr], y[tr]); pv = m.predict(X[va]); acc = float(np.mean(pv == y[va]))
    print(f'  C={C}: synthetic-val kind accuracy {acc:.3f} ({time.time()-t0:.0f}s)', flush=True)
    if best is None or acc > best[0]: best = (acc, C)
C = best[1]
# ---- grouped OOF probabilities over ALL training rows -> tau, kappa
oof = np.zeros((len(rows), len(KL)))
for k, (a, b) in enumerate(GroupKFold(n_splits=5).split(X, y, groups)):
    m = LogisticRegression(C=C, max_iter=3000).fit(X[a], y[a]); P = np.zeros((len(b), len(KL))); P[:, m.classes_] = m.predict_proba(X[b]); oof[b] = P; print(f'  oof fold {k}', flush=True)
VETO = lambda r, st: bool(r.get('vb') or r.get('vp') or (r.get('vc') or {}).get('any') or (r.get('vc') or {}).get(st))
TAUS = None
def decide(rs, P, tau, kappa, veto=True):
    out = []
    for r, p in zip(rs, P):
        ps = 1.0 - p[NONE]; q = p.copy(); q[NONE] = -1; j = int(q.argmax()); k = KL[j]
        if ps < (TAUS[k] if TAUS else tau): out.append('none'); continue
        w = WANT[k]; cf = sum(p[KL.index(c)] for c in KL if c != 'none' and WANT[c] == w) / max(ps, 1e-9)
        if cf < kappa: out.append('none'); continue
        if veto and VETO(r, stepOf(k)): out.append('none'); continue
        out.append(k)
    return out
truth = [r['kind'] for r in rows]; nonePos = [i for i, k in enumerate(truth) if k == 'none']; actPos = [i for i, k in enumerate(truth) if k != 'none']
tau = 0.99
for t in np.arange(0.05, 0.996, 0.005):
    pr = decide(rows, oof, t, 0.0); wd = sum(pr[i] != 'none' for i in nonePos)
    if wd / len(nonePos) <= A.target: tau = round(float(t), 3); break
# per-label thresholds (greedy on OOF, as train-v2.py): lower the threshold of the kind that buys the most recall per extra wrong Do It, inside the same wrong-Do-It budget
oof_ps = 1.0 - oof[:, NONE]; oq = oof.copy(); oq[:, NONE] = -1; oof_lab = [KL[int(j)] for j in oq.argmax(1)]
vet = np.array([VETO(r, stepOf(l)) for r, l in zip(rows, oof_lab)]); isnone = np.array([k == 'none' for k in truth])
taus = {c: tau for c in KL if c != 'none'}; grid = np.round(np.arange(0.30, 0.996, 0.005), 3); budget = int(np.floor(A.target * len(nonePos)))
def count(tt):
    th = np.array([tt[l] for l in oof_lab]); sh = (oof_ps >= th) & ~vet
    right = sum(1 for i in np.where(sh & ~isnone)[0] if WANT[oof_lab[i]] == WANT[truth[i]])
    return int((sh & isnone).sum()), right
w0, r0 = count(taus)
while True:
    best_step = None
    for c in taus:
        for gv in sorted([g for g in grid if g < taus[c]], reverse=True)[:60]:
            tt = dict(taus); tt[c] = float(gv); w, rr = count(tt)
            if w > budget or rr <= r0: continue
            gain = (rr - r0) / (1 + w - w0)
            if best_step is None or gain > best_step[0]: best_step = (gain, c, float(gv), w, rr)
    if not best_step: break
    _, c, gv, w0, r0 = best_step; taus[c] = gv
TAUS = taus; print('per-label taus', taus, 'oof wrong Do It', w0, '/', len(nonePos), 'oof right shows', r0, flush=True)
kappa = 0.0
for kp in np.arange(0.40, 0.996, 0.01):
    pr = decide(rows, oof, tau, kp); shown = [i for i in actPos if pr[i] != 'none']
    wa = sum(WANT[pr[i]] != WANT[truth[i]] for i in shown)
    if shown and wa / len(shown) <= A.action_target: kappa = round(float(kp), 2); break
pr = decide(rows, oof, tau, kappa)
oofrep = {'tau': tau, 'kappa': kappa, 'noneRows': len(nonePos), 'oofWrongDoIt': sum(pr[i] != 'none' for i in nonePos), 'actRows': len(actPos), 'oofShown': sum(pr[i] != 'none' for i in actPos), 'oofRight': sum(pr[i] != 'none' and WANT[pr[i]] == WANT[truth[i]] for i in actPos)}
print('OOF', json.dumps(oofrep), flush=True)
# ---- final fit on everything, predict the held-out sets
model = LogisticRegression(C=C, max_iter=3000).fit(X, y)
def predict(path, outp, keep):
    rs = rd(path); Xs = mat(rs); P = np.zeros((len(rs), len(KL))); P[:, model.classes_] = model.predict_proba(Xs)
    with open(outp, 'w') as fo:
        for r, p, a, b in zip(rs, P, decide(rs, P, tau, kappa, True), decide(rs, P, tau, kappa, False)):
            ps = 1.0 - p[NONE]
            fo.write(json.dumps(Object_ := {'id': r['id'], 'pred': stepOf(a) if a != 'none' else 'SILENT', 'predAlone': stepOf(b) if b != 'none' else 'SILENT', 'predKind': a, 'predKindAlone': b, 'p': round(float(ps), 4), 'lang': r.get('lang'), 'vb': r.get('vb'), 'vp': r.get('vp'), **{k: r[k] for k in keep if k in r}}, ensure_ascii=False) + '\n')
    return len(rs)
n1 = predict(A.frozen_feat, os.path.join(A.out, 'kinds-head.extra-preds.jsonl'), ['tip'])
n2 = predict(A.kind_frozen_feat, os.path.join(A.out, 'kinds-head.kind-frozen-preds.jsonl'), ['kind', 'want', 'surface'])
rep = {'tag': 'kinds-v0', 'tauPerLabel': TAUS, 'C': C, 'classes': KL, 'tau': tau, 'kappa': kappa, 'oof': oofrep, 'rows': {'synthetic': len(syn), 'pool': len(pool), 'poolHeldOutDropped': n_held}, 'predicted': {'frozen701': n1, 'kindFrozen': n2}, 'syntheticValAcc': best[0]}
json.dump(rep, open(os.path.join(A.out, 'kinds-head.report.json'), 'w'), indent=1); print(json.dumps(rep))
