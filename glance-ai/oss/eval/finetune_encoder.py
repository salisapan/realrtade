# Fine-tune multilingual-e5-small (MIT, 118M) as a binary silence/act gate on teacher labels (CPU only).
# Train: worker train split (teacher labels, read-only). Eval: worker test subset + eval.jsonl (hand-checked gold).
import json, os, sys, time, random, resource, numpy as np, torch
from transformers import AutoTokenizer, AutoModel
torch.set_num_threads(int(os.environ.get('THREADS', '2'))); torch.manual_seed(0); random.seed(0)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from paths import ROOT as AI
MID = 'intfloat/multilingual-e5-small'; W = (os.environ.get('GLANCE_V1_DATASET') or os.path.join(AI, 'model', 'dataset', 'out')) + os.sep
NTRAIN = int(os.environ.get('NTRAIN', '6000')); EPOCHS = int(os.environ.get('EPOCHS', '2')); ML = 128
tok = AutoTokenizer.from_pretrained(MID); enc = AutoModel.from_pretrained(MID)
def load(p): return [json.loads(l) for l in open(p)]
train = load(W + 'train.jsonl'); test = load(W + 'test.jsonl'); ev = load('eval.jsonl')
random.shuffle(train); random.shuffle(test); train = train[:NTRAIN]; test = test[:1500]
def text(r, fmt):
    att = r.get('attachmentCount', 0) if fmt == 'w' else len(r.get('attachments') or [])
    return f"query: direction: {r.get('direction','inbound')}. attachments: {att}. subject: {r.get('subject','')}\n{r['body']}"
ylab = lambda r: 0 if r['teacher']['label'] == 'SILENT' else 1
class Gate(torch.nn.Module):
    def __init__(s): super().__init__(); s.enc = enc; s.head = torch.nn.Linear(384, 2)
    def forward(s, ids, am):
        h = s.enc(input_ids=ids, attention_mask=am).last_hidden_state
        v = (h * am[..., None]).sum(1) / am.sum(1, keepdim=True); return s.head(v)
m = Gate()
# Freeze the 96M-param embedding matrix and the lower 6 of 12 layers (CPU budget); train top 6 layers + head.
FREEZE = int(os.environ.get('FREEZE', '6'))
for p in m.enc.embeddings.parameters(): p.requires_grad = False
for l in m.enc.encoder.layer[:FREEZE]:
    for p in l.parameters(): p.requires_grad = False
opt = torch.optim.AdamW([p for p in m.parameters() if p.requires_grad], lr=5e-5, weight_decay=0.01)
pos = sum(ylab(r) for r in train); w = torch.tensor([1.0, (len(train) - pos) / max(1, pos)]) ** 0.5
lossf = torch.nn.CrossEntropyLoss(weight=w)
BS = 16; steps = EPOCHS * (len(train) // BS); sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 30) * max(0.0, 1 - s / steps))
t0 = time.time(); step = 0
for ep in range(EPOCHS):
    random.shuffle(train); m.train()
    for i in range(0, len(train) - BS + 1, BS):
        b = train[i:i + BS]; e = tok([text(r, 'w') for r in b], truncation=True, max_length=ML, padding=True, return_tensors='pt')
        loss = lossf(m(e['input_ids'], e['attention_mask']), torch.tensor([ylab(r) for r in b]))
        loss.backward(); torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0); opt.step(); sched.step(); opt.zero_grad(); step += 1
        if step % 25 == 0: print(f'ep{ep} step {step}/{steps} loss {loss.item():.3f} {time.time()-t0:.0f}s', flush=True)
train_s = time.time() - t0
@torch.no_grad()
def probs(rows, fmt, bs=32):
    m.eval(); out = []
    for i in range(0, len(rows), bs):
        e = tok([text(r, fmt) for r in rows[i:i + bs]], truncation=True, max_length=ML, padding=True, return_tensors='pt')
        out.append(torch.softmax(m(e['input_ids'], e['attention_mask']), -1)[:, 1].numpy())
    return np.concatenate(out)
pte = probs(test, 'w'); yte = np.array([ylab(r) for r in test])
t1 = time.time(); pev = probs(ev, 'e', bs=1); per_case_ms = 1000 * (time.time() - t1) / len(ev)
yev = np.array([1 if r['gold']['decision'] == 'act' else 0 for r in ev])
sys.path.insert(0, '.'); from score import veto_pack, veto_teacher
vm = np.array([veto_pack(r) or veto_teacher(r) for r in ev])
def met(p, y, t):
    pr = p >= t; s = y == 0; a = y == 1
    return {'wrongDoIt%': round(100 * (pr & s).sum() / max(1, s.sum()), 1), 'wrong_n': f'{int((pr & s).sum())}/{int(s.sum())}', 'missed%': round(100 * (~pr & a).sum() / max(1, a.sum()), 1), 'missed_n': f'{int((~pr & a).sum())}/{int(a.sum())}', 'acc%': round(100 * (pr == a).mean(), 1)}
res = {'model': MID + f' fine-tuned (top {12-FREEZE} layers + head, CPU)', 'ntrain': len(train), 'epochs': EPOCHS, 'train_s': round(train_s), 'per_case_ms_bs1': round(per_case_ms, 1), 'rss_peak_mb': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024, 'results': {}}
for t in [0.5, 0.8, 0.9]:
    res['results'][f'worker-test (teacher labels) t={t}'] = met(pte, yte, t)
    for name, f in [('eval ALL', lambda r: True), ('eval EN', lambda r: r['lang'] == 'en'), ('eval HE', lambda r: r['lang'] == 'he'), ('SetB adversarial', lambda r: r['set'] == 'B'), ('SetC worker-adv', lambda r: r['set'] == 'C'), ('SetD gold22', lambda r: r['set'] == 'D')]:
        mk = np.array([f(r) for r in ev]); res['results'][f'{name} t={t}'] = met(pev[mk], yev[mk], t)
    res['results'][f'eval ALL + veto t={t}'] = met(np.where(vm, 0, pev), yev, t)
json.dump({r['id']: float(p) for r, p in zip(ev, pev)}, open('../results/encoder-e5-ft-probs.json', 'w'))
json.dump(res, open('../results/encoder-e5-small-finetuned.json', 'w'), indent=1)
os.makedirs('../models/e5-gate-ft', exist_ok=True); torch.save(m.head.state_dict(), '../models/e5-gate-ft/head.pt')
print(json.dumps(res, indent=1))
