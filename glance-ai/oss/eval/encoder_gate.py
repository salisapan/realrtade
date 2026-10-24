# Small multilingual encoder as a fast silence/act gate: frozen ONNX embeddings + logistic regression.
# Train: parallel worker's teacher-labeled train split (read-only). Eval: worker test split + this dir's eval.jsonl (sets A-D).
import json, sys, time, os, numpy as np, onnxruntime as ort, resource
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from paths import ROOT as AI
from tokenizers import Tokenizer
from sklearn.linear_model import LogisticRegression
MODEL = sys.argv[1]  # e5-small | granite-97m
THREADS = int(os.environ.get('THREADS', '3'))
# Encoder weights are not in git. Download them into glance-ai/oss/models/<name>/ before running.
D = os.path.join(AI, 'oss', 'models', MODEL)
W = (os.environ.get('GLANCE_V1_DATASET') or os.path.join(AI, 'model', 'dataset', 'out')) + os.sep
tok = Tokenizer.from_file(D + '/tokenizer.json'); tok.enable_truncation(256); tok.enable_padding()
so = ort.SessionOptions(); so.intra_op_num_threads = THREADS
sess = ort.InferenceSession(D + '/model_int8.onnx', so, providers=['CPUExecutionProvider'])
inames = [i.name for i in sess.get_inputs()]
def text_of(r, fmt):
    if fmt == 'worker':
        direction = r.get('direction', 'inbound'); att = r.get('attachmentCount', 0)
    else:
        direction = r.get('direction', 'inbound'); att = len(r.get('attachments') or [])
    t = f"direction: {direction}. attachments: {att}. subject: {r.get('subject','')}\n{r['body']}"
    return ('query: ' + t) if MODEL.startswith('e5') else t
def embed(texts, bs=32):
    out = []
    for i in range(0, len(texts), bs):
        enc = tok.encode_batch(texts[i:i + bs])
        ids = np.array([e.ids for e in enc], dtype=np.int64); am = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feed = {'input_ids': ids, 'attention_mask': am}
        if 'token_type_ids' in inames: feed['token_type_ids'] = np.zeros_like(ids)
        h = sess.run(None, feed)[0]
        if MODEL.startswith('e5'): v = (h * am[..., None]).sum(1) / am.sum(1, keepdims=True)
        else: v = h[:, 0]
        v = v / np.linalg.norm(v, axis=1, keepdims=True); out.append(v)
    return np.vstack(out)
def load(p): return [json.loads(l) for l in open(p)]
train = load(W + 'train.jsonl'); val = load(W + 'val.jsonl'); test = load(W + 'test.jsonl')
ev = load('eval.jsonl')
import random; random.seed(1); random.shuffle(train); random.shuffle(test); train = train[:int(os.environ.get('NTRAIN','4000'))]; test = test[:int(os.environ.get('NTEST','1500'))]
y = lambda rows: np.array([0 if r['teacher']['label'] == 'SILENT' else 1 for r in rows])
t0 = time.time(); Xtr = embed([text_of(r, 'worker') for r in train]); t_tr = time.time() - t0
Xva = embed([text_of(r, 'worker') for r in val]); Xte = embed([text_of(r, 'worker') for r in test])
t0 = time.time(); Xev = embed([text_of(r, 'eval') for r in ev], bs=1); per_case_ms = 1000 * (time.time() - t0) / len(ev)
clf = LogisticRegression(C=4.0, max_iter=3000, class_weight='balanced').fit(Xtr, y(train))
pva = clf.predict_proba(Xva)[:, 1]; yva = y(val)
# high-precision threshold: smallest t with FP rate on val silence <= 1%
ths = sorted(set(np.round(np.linspace(0.3, 0.995, 140), 3)))
hp = next((t for t in ths if ((pva >= t) & (yva == 0)).sum() / max(1, (yva == 0).sum()) <= 0.01), 0.99)
def metrics(p, ytrue, t):
    pred = p >= t; sil = ytrue == 0; act = ytrue == 1
    return {'wrongDoIt%': round(100 * (pred & sil).sum() / max(1, sil.sum()), 1), 'wrong_n': f'{int((pred & sil).sum())}/{int(sil.sum())}',
            'missed%': round(100 * (~pred & act).sum() / max(1, act.sum()), 1), 'missed_n': f'{int((~pred & act).sum())}/{int(act.sum())}', 'acc%': round(100 * (pred == act).mean(), 1)}
res = {'model': MODEL, 'threads': THREADS, 'train_n': len(train), 'embed_train_s': round(t_tr, 1), 'per_case_ms_bs1': round(per_case_ms, 1),
       'rss_peak_mb': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024, 'hp_threshold': float(hp), 'results': {}}
pte = clf.predict_proba(Xte)[:, 1]
for t_name, t in [('t=0.5', 0.5), (f'hp t={hp}', hp)]:
    res['results'][f'worker-test (teacher labels) {t_name}'] = metrics(pte, y(test), t)
    pev = clf.predict_proba(Xev)[:, 1]
    yev = np.array([1 if r['gold']['decision'] == 'act' else 0 for r in ev])
    for name, f in [('eval ALL (hand-checked gold)', lambda r: True), ('eval EN', lambda r: r['lang'] == 'en'), ('eval HE', lambda r: r['lang'] == 'he'),
                    ('eval SetB adversarial', lambda r: r['set'] == 'B'), ('eval SetC worker-adversarial', lambda r: r['set'] == 'C'), ('eval SetD gold22 real', lambda r: r['set'] == 'D')]:
        m = np.array([f(r) for r in ev])
        res['results'][f'{name} {t_name}'] = metrics(pev[m], yev[m], t)
    # with rule veto (outbound / negation / addressed-other / unsubscribe) applied after the gate
    sys.path.insert(0, '.'); from score import veto_pack, veto_teacher
    vmask = np.array([veto_pack(r) or veto_teacher(r) for r in ev])
    res['results'][f'eval ALL + veto {t_name}'] = metrics(np.where(vmask, 0, pev), yev, t)
    # save per-case probs
    json.dump({r['id']: float(p) for r, p in zip(ev, pev)}, open(f'../results/encoder-{MODEL}-probs.json', 'w'))
json.dump(res, open(f'../results/encoder-{MODEL}.json', 'w'), indent=1)
print(json.dumps(res, indent=1))
