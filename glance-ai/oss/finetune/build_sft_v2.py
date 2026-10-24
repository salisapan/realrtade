# SFT v2 for the Glance judge LoRA. Runs build_sft_v2.cjs (v1 rows re-checked with the runtime gate rules + new EN/HE examples,
# held-out overlap removed), then wraps every row with prompt_v2 (SYSTEM_V2 + render_v2, "Mailbox:" line) in chat format.
# v1 (data/sft_train.jsonl, data/sft_val.jsonl, data/manifest.json) is NOT touched. Output: data/v2/{sft_train,sft_val}.jsonl, manifest.json.
#   python build_sft_v2.py            # train with:  python train_lora.py --config qwen3.5-4b --train data/v2/sft_train.jsonl --val data/v2/sft_val.jsonl
# Eval must use the same prompt: python eval_sft.py --prompt-version v2 ...
import json, os, re, subprocess, collections, random, sys
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'data', 'v2')
sys.path.insert(0, os.path.join(HERE, '..', '..'))
from paths import ROOT as AI, eval_file
from prompt_v2 import SYSTEM_V2, render_v2
subprocess.run(['node', os.path.join(HERE, 'build_sft_v2.cjs')], check=True, stdout=subprocess.DEVNULL)
rows = [json.loads(l) for l in open(os.path.join(OUT, '_rows.jsonl'))]
D = os.environ.get('GLANCE_V2_DATASET') or os.path.join(AI, 'model', 'dataset', 'out-v2')
norm = lambda t: re.sub(r'\s+', ' ', re.sub(r'[\W_]+', ' ', (t or '').lower())).strip()
# independent disjointness check (python, Unicode \W) against every held-out set
held, held_ids = set(), set()
test_path = os.path.join(D, 'test.jsonl') if os.path.exists(os.path.join(D, 'test.jsonl')) else eval_file('v2-heldout-test.jsonl')
for l in open(test_path):
    r = json.loads(l); held.add(norm(r['body'])); held.add(norm(r.get('cleanBody'))); held_ids.add(r['id'])
adv_path = os.path.join(D, 'adversarial-v2.jsonl')
if os.path.exists(adv_path):
    for l in open(adv_path):
        r = json.loads(l); held.add(norm(r['body'])); held_ids.add(r['id'])
for l in open(eval_file('shadow-combined-cases.jsonl')):
    c = json.loads(l)
    if c['set'] == 'oss' and not c.get('core'): continue
    held.add(norm(c['prompt']['body'])); held.add(norm(c['own'])); held_ids.add(c['id'])
held.discard('')
bad = [r['meta']['id'] for r in rows if norm(r['case']['body']) in held or r['meta']['id'] in held_ids]
assert not bad, f'held-out overlap: {bad[:5]}'
tr_b = {norm(r['case']['body']) for r in rows if r['split'] == 'train'}
leak = sum(1 for r in rows if r['split'] == 'val' and norm(r['case']['body']) in tr_b)
rows = [r for r in rows if not (r['split'] == 'val' and norm(r['case']['body']) in tr_b)]  # keep val disjoint from train too
out = {'train': [], 'val': []}; cnt = collections.Counter(); cls = collections.Counter()
for r in rows:
    t = r['target']; c = r['case']
    msg = [{'role': 'system', 'content': SYSTEM_V2}, {'role': 'user', 'content': render_v2(c)}, {'role': 'assistant', 'content': json.dumps(t, ensure_ascii=False, separators=(',', ':'))}]
    out[r['split']].append({'messages': msg, 'meta': r['meta']})
    lab = t['family'] if t['decision'] == 'act' else 'SILENT'
    cnt[f"{r['split']}:{r['meta']['lang']}:{lab}"] += 1
    cls[f"{r['split']}:{r['meta']['src']}:{lab}"] += 1
random.Random(13).shuffle(out['train'])
for k, v in out.items():
    with open(os.path.join(OUT, f'sft_{k}.jsonl'), 'w') as fh:
        for x in v: fh.write(json.dumps(x, ensure_ascii=False) + '\n')
stats = json.load(open(os.path.join(OUT, '_stats.json')))
man = {'version': 'sft-v2', 'prompt': 'prompt_v2 (SYSTEM_V2 + render_v2 with Mailbox line), zero-shot', 'n_train': len(out['train']), 'n_val': len(out['val']),
       'heldout_overlap': 0, 'val_rows_dropped_body_also_in_train': leak,
       'heldout_sets_checked': ['v2 test split (6,982 rows, superset of the v2 held-out 400)', 'CORE162', 'adversarial-v2 (74)', 'injection hand set (47)'],
       'by_split_lang_label': dict(sorted(cnt.items())), 'by_source': dict(sorted(cls.items())),
       'v1_corrections': {k.split(':', 1)[1]: v for k, v in stats.items() if k.startswith('correction:')},
       'dropped_for_heldout_overlap': {k.split(':', 1)[1]: v for k, v in stats.items() if k.startswith('drop-heldout')},
       'generated_new': {k.split(':', 1)[1]: v for k, v in stats.items() if k.startswith('gen:')}}
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: man[k] for k in ['n_train', 'n_val', 'heldout_overlap', 'val_rows_dropped_body_also_in_train', 'v1_corrections', 'dropped_for_heldout_overlap']}, indent=1, ensure_ascii=False))
