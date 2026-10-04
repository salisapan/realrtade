#!/usr/bin/env python3
"""Encoder-as-FALLBACK experiment (docs/encoder-evaluation-plan.md). One question, decided by a rule fixed BEFORE any number was seen:

    When the shipped engine (lexicon + learned model + gates) stays SILENT on a sentence, would a small multilingual encoder with a
    linear head have been right to speak, without costing precision?

    node scripts/intent/dump-features.cjs   /tmp/fixed      # train.json (grammar + teacher sentences)
    node scripts/intent/dump-fixed-corpus.cjs /tmp/fixed    # corpus.json (fixed eval sentences + what the engine does), replies.json
    pip install onnxruntime tokenizers numpy huggingface_hub
    python3 scripts/intent/nn/encoder-fallback-eval.py /tmp/fixed --model Xenova/multilingual-e5-small [--out result.json]
    python3 scripts/intent/nn/encoder-fallback-eval.py /tmp/fixed --stub        # logic check only, meaningless numbers

The encoder is frozen (no fine-tuning); only a softmax head is trained, on the same training sentences the shipped model learned from.
The threshold is chosen on `dev` ONLY. The fallback never overrides the engine: it can only speak where the engine was silent, and it
must pass the same structural gate (shapedAsk / shapedPromise) the engine's own model tier needs. Strict-register chat sentences also
require a higher threshold bar (the chat rule: stricter than Gmail).
"""
import json, argparse, time, os, sys
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--model', default='Xenova/multilingual-e5-small')
ap.add_argument('--prefix', default='query: ')
ap.add_argument('--backend', default='onnx', choices=['onnx', 'st'])
ap.add_argument('--onnx-file', default='auto', help="'auto' picks the int8 export when the repo has one")
ap.add_argument('--stub', action='store_true')
ap.add_argument('--epochs', type=int, default=8)
ap.add_argument('--out', default=None)
ap.add_argument('--limit', type=int, default=0)
a = ap.parse_args()

ACTS = ['ASK', 'PROMISE', 'INFORM', 'ACK']
MIN_PRECISION = 0.97          # the product's own gate
POOLED_SETS = ('blind', 'te2', 'chat', 'human')   # never used to choose anything
t0 = time.time()

# ------------------------------------------------------------------------------------------------ the encoder
size_mb = None
latency_ms = None
if a.stub:
    def embed(texts):
        out = np.zeros((len(texts), 256), np.float32)
        for i, t in enumerate(texts):
            t = '^' + t.lower() + '$'
            for j in range(len(t) - 2): out[i, hash(t[j:j + 3]) % 256] += 1
            out[i] /= (np.linalg.norm(out[i]) + 1e-6)
        return out
elif a.backend == 'onnx':
    import onnxruntime as ort
    from tokenizers import Tokenizer
    from huggingface_hub import hf_hub_download
    from huggingface_hub import list_repo_files
    files = list_repo_files(a.model)
    print('onnx files in', a.model, ':', [f for f in files if f.endswith('.onnx')], flush=True)
    chosen = a.onnx_file
    if chosen == 'auto':
        chosen = next((f for f in ('onnx/model_quantized.onnx', 'onnx/model_int8.onnx', 'onnx/model_uint8.onnx', 'onnx/model.onnx') if f in files), None)
        if chosen is None: sys.exit('no ONNX export in ' + a.model)
    onnx_path = hf_hub_download(a.model, chosen)
    tok_path = hf_hub_download(a.model, 'tokenizer.json')
    size_mb = os.path.getsize(onnx_path) / 1e6
    tk = Tokenizer.from_file(tok_path)
    tk.enable_truncation(max_length=64)
    tk.enable_padding()
    so = ort.SessionOptions(); so.intra_op_num_threads = 2
    sess = ort.InferenceSession(onnx_path, so, providers=['CPUExecutionProvider'])
    names = {i.name for i in sess.get_inputs()}
    def embed(texts, bs=64):
        outs = []
        for s in range(0, len(texts), bs):
            enc = tk.encode_batch([a.prefix + t for t in texts[s:s + bs]])
            ids = np.array([e.ids for e in enc], np.int64); mask = np.array([e.attention_mask for e in enc], np.int64)
            feed = {'input_ids': ids, 'attention_mask': mask}
            if 'token_type_ids' in names: feed['token_type_ids'] = np.zeros_like(ids)
            h = sess.run(None, feed)[0]
            m = mask[..., None].astype(np.float32)
            v = (h * m).sum(1) / np.maximum(m.sum(1), 1)
            outs.append(v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9))
        return np.concatenate(outs).astype(np.float32)
else:
    from sentence_transformers import SentenceTransformer
    enc = SentenceTransformer(a.model)
    def embed(texts):
        return np.asarray(enc.encode([a.prefix + t for t in texts], batch_size=64, normalize_embeddings=True, show_progress_bar=False), np.float32)

# ------------------------------------------------------------------------------------------------ data
tr = json.load(open(f'{a.dir}/train.json'))
ttexts, tact = tr['text'], np.array(tr['act'])
if a.limit: ttexts, tact = ttexts[:a.limit], tact[:a.limit]
corpus = json.load(open(f'{a.dir}/corpus.json'))
uniq = {}
for t in ttexts: uniq.setdefault(t, len(uniq))
order = np.array([uniq[t] for t in ttexts])
Etr = embed(list(uniq.keys()))[order]
Ec = embed([r['t'] for r in corpus])
if not a.stub and a.backend == 'onnx':
    probe = [r['t'] for r in corpus[:64]]
    t1 = time.time(); embed(probe, bs=1); latency_ms = (time.time() - t1) / len(probe) * 1000
print(f'embedded {len(uniq)} training texts and {len(corpus)} eval sentences in {time.time() - t0:.0f}s' + (f'; model file {size_mb:.0f} MB, {latency_ms:.0f} ms per sentence (batch 1, 2 threads)' if latency_ms else ''), flush=True)

# ------------------------------------------------------------------------------------------------ the head (frozen encoder)
def softmax(l):
    l = l - l.max(1, keepdims=True); e = np.exp(l); return e / e.sum(1, keepdims=True)
rs = np.random.default_rng(1)
We = np.zeros((Etr.shape[1], len(ACTS)), np.float32); Ge = np.full_like(We, 1e-6); b = np.zeros(len(ACTS), np.float32)
N = len(tact); B = 128; lr = 0.35
for ep in range(a.epochs):
    perm = rs.permutation(N)
    for s in range(0, N, B):
        bi = perm[s:s + B]; p = softmax(Etr[bi] @ We + b); g = p.copy(); g[np.arange(len(bi)), tact[bi]] -= 1; g /= len(bi) / 8.0
        ge = Etr[bi].T @ g; Ge += ge ** 2; We -= lr * ge / np.sqrt(Ge); b -= 0.05 * g.sum(0)
P = softmax(Ec @ We + b)
for i, r in enumerate(corpus):
    r['p_ask'], r['p_prom'] = float(P[i, 0]), float(P[i, 1])

# ------------------------------------------------------------------------------------------------ the fallback decision
def speaks(r, T):
    """What the head would say about a sentence the engine was silent on, or None."""
    if r['pipe'] != 'X': return None
    bar = max(T, 0.9) if r.get('strict') else T
    if r['p_ask'] >= bar and r['shapedAsk'] and r['p_ask'] >= r['p_prom']: return 'ASK'
    if r['p_prom'] >= bar and r['shapedPromise']: return 'PROMISE'
    return None

def decide(r, T, fallback):
    if r['pipe'] != 'X': return r['pipe']
    return (speaks(r, T) if fallback else None) or 'X'

def prf(rows, T, fallback, cls):
    tp = sum(1 for r in rows if decide(r, T, fallback) == cls and r['gold'] == cls)
    fp = sum(1 for r in rows if decide(r, T, fallback) == cls and r['gold'] != cls)
    fn = sum(1 for r in rows if decide(r, T, fallback) != cls and r['gold'] == cls)
    return tp, fp, fn

def both(rows, T, fallback):
    tp = fp = fn = 0
    for cls in ('ASK', 'PROMISE'):
        x, y, z = prf(rows, T, fallback, cls); tp += x; fp += y; fn += z
    return {'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(tp / max(tp + fp, 1), 3), 'recall': round(tp / max(tp + fn, 1), 3)}

dev = [r for r in corpus if r['set'] == 'dev']
# T: the lowest threshold whose fallback keeps pooled precision >= 0.97 on dev (a lower threshold means more recall). dev ONLY.
grid = [round(x, 2) for x in np.arange(0.50, 1.0, 0.01)]
T = None
for t in grid:
    m = both(dev, t, True)
    if m['precision'] >= MIN_PRECISION and m['tp'] >= both(dev, t, False)['tp']:
        T = t; break
print('threshold chosen on dev only:', T, flush=True)
if T is None: T = 0.99

result = {'model': 'stub' if a.stub else a.model, 'sizeMB': size_mb, 'latencyMs': latency_ms, 'threshold': T, 'sets': {}, 'pooled': {}}
def show(name, rows):
    base, comb = both(rows, T, False), both(rows, T, True)
    added_tp, added_fp = comb['tp'] - base['tp'], comb['fp'] - base['fp']
    print(f"{name:12s} n={len(rows):4d} | engine P {base['precision']:.3f} R {base['recall']:.3f} | + encoder P {comb['precision']:.3f} R {comb['recall']:.3f} | added TP {added_tp:+d} FP {added_fp:+d}")
    return {'n': len(rows), 'engine': base, 'combined': comb, 'addedTP': added_tp, 'addedFP': added_fp}
print('\n--- per set and language (silent-sentence fallback only) ---')
for s in ('dev', 'blind', 'te', 'te2', 'chat', 'human'):
    for lg in ('en', 'he'):
        rows = [r for r in corpus if r['set'] == s and r['lang'] == lg]
        if rows: result['sets'][f'{s}/{lg}'] = show(f'{s}/{lg}', rows)
print('\n--- pooled over the sets that chose nothing:', ', '.join(POOLED_SETS), '---')
for lg in ('en', 'he'):
    rows = [r for r in corpus if r['set'] in POOLED_SETS and r['lang'] == lg]
    result['pooled'][lg] = show('pooled/' + lg, rows)

# ------------------------------------------------------------------------------------------------ the pre-registered rule
def gain(lg): p = result['pooled'][lg]; return p['combined']['recall'] - p['engine']['recall']
checks = {}
for lg in ('en', 'he'):
    p = result['pooled'][lg]
    checks[f'{lg}: pooled precision stays >= 0.97'] = p['combined']['precision'] >= MIN_PRECISION
    checks[f'{lg}: pooled recall gain >= +0.05'] = gain(lg) >= 0.05
    checks[f'{lg}: at least 10 more true proposals'] = p['addedTP'] >= 10
    checks[f'{lg}: at most 1 added wrong proposal per 20 added right ones'] = p['addedFP'] * 20 <= max(p['addedTP'], 0)
for s in ('blind', 'te2'):
    rows = [r for r in corpus if r['set'] == s]
    checks[f'{s}: gain in both languages individually (>0 added TP, and precision not down more than 0.02)'] = all(
        (lambda m: m['addedTP'] > 0 and m['combined']['precision'] >= m['engine']['precision'] - 0.02)(show(f'{s}/{lg} (check)', [r for r in rows if r['lang'] == lg])) for lg in ('en', 'he') if any(r['lang'] == lg for r in rows))
checks['size <= 30 MB (after pruning; the unpruned file is reported above)'] = True if a.stub else None   # decided by hand: pruning is a separate step
checks['latency <= 60 ms per sentence'] = True if a.stub else (latency_ms is not None and latency_ms <= 60)
decided = [v for v in checks.values() if v is not None]
verdict = all(decided)
print('\n--- the rule fixed in advance ---')
for k, v in checks.items(): print(('PASS ' if v else 'FAIL ' if v is False else 'OPEN ') + k)
print('\nVERDICT:', 'ADOPTION CONDITIONS MET (size still to be proven by pruning)' if verdict else 'NOT MET: STOP, no integration', '(stub: ignore)' if a.stub else '')
result['checks'] = checks; result['verdict'] = bool(verdict)

# ------------------------------------------------------------------------------------------------ the reply task (secondary)
rp = json.load(open(f'{a.dir}/replies.json')); classes = rp['classes']; rows = rp['rows']
rtr = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'reply', 'replies-train.json')))
Ert = embed([r['t'] for r in rtr]); yr = np.array([classes.index(r['c']) for r in rtr])
Wr = np.zeros((Ert.shape[1], len(classes)), np.float32); Gr = np.full_like(Wr, 1e-6); br = np.zeros(len(classes), np.float32)
for ep in range(a.epochs * 3):
    perm = rs.permutation(len(yr))
    for s in range(0, len(yr), 64):
        bi = perm[s:s + 64]; p = softmax(Ert[bi] @ Wr + br); g = p.copy(); g[np.arange(len(bi)), yr[bi]] -= 1; g /= len(bi) / 8.0
        ge = Ert[bi].T @ g; Gr += ge ** 2; Wr -= 0.35 * ge / np.sqrt(Gr); br -= 0.05 * g.sum(0)
Er = embed([r['t'] for r in rows]); Pr = softmax(Er @ Wr + br)
NOTANS = [classes.index(c) for c in ('INTERIM', 'ACK', 'OTHER')]
def hold_stats(prob_not):
    held = [i for i, r in enumerate(rows) if prob_not(i) >= 0.9]
    right = [i for i in held if rows[i]['cls'] in ('INTERIM', 'ACK', 'OTHER')]
    wrong = [i for i in held if rows[i]['cls'] == 'ANSWERED']
    truth = [i for i, r in enumerate(rows) if r['cls'] in ('INTERIM', 'ACK', 'OTHER')]
    return {'held': len(held), 'precision': round(len(right) / max(len(held), 1), 3), 'recall': round(len(right) / max(len(truth), 1), 3), 'realAnswersHeldOpen': len(wrong)}
ship = hold_stats(lambda i: sum(rows[i]['shipped'][c] for c in ('INTERIM', 'ACK', 'OTHER')))
enc = hold_stats(lambda i: float(Pr[i, NOTANS].sum()))
print('\n--- reply task: "this reply is not an answer, keep the loop open" at p >= 0.9 (only ever KEEPS a loop open) ---')
print('shipped reply model:', ship); print('encoder head       :', enc)
result['replies'] = {'shipped': ship, 'encoder': enc}
if a.out: json.dump(result, open(a.out, 'w'), indent=1)
