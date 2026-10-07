# Evaluate a fine-tuned Glance judge with the SAME scorer as the OSS eval (eval/score.py) + the combined shadow.
#   GGUF via llama-server:  python eval_sft.py --backend server --port 8093 --tag ft-qwen3.5-4b [--subset core|all] [--cases]
#   HF + LoRA adapter:      python eval_sft.py --backend hf --base Qwen/Qwen3.5-4B --adapter runs/qwen3.5-4b/adapter --tag ft-qwen3.5-4b
# Writes ../results/pred-<tag>-schema.jsonl (run_llm.py format, so `cd ../eval && python score.py` picks it up) and prints
# wrong-Do-It / missed / family / end-to-end / title-OK for ALL, CORE162, EN, HE. --cases also writes
# ../shadow-combined/llm-<tag>.jsonl so `node ../shadow-combined/combine.cjs qwen3.5-4b <tag>` scores "engine+veto -> fine-tuned inside".
# Prompt must match training: --prompt zero (default, build_sft.py default) or fewshot.
import argparse, json, os, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); EVAL = os.path.join(HERE, '..', 'eval')
sys.path.insert(0, EVAL)
from prompt import SYSTEM, FEWSHOT, SCHEMA, render
ap = argparse.ArgumentParser()
ap.add_argument('--backend', choices=['server', 'hf'], default='server'); ap.add_argument('--port', default='8093'); ap.add_argument('--tag', required=True)
ap.add_argument('--base'); ap.add_argument('--adapter'); ap.add_argument('--prompt', choices=['zero', 'fewshot'], default='zero')
ap.add_argument('--prompt-version', choices=['v1', 'v2'], default='v1', help='v2 = prompt_v2.py (SFT v2: SYSTEM_V2 + Mailbox line); must match training data')
ap.add_argument('--subset', choices=['core', 'all'], default='all'); ap.add_argument('--cases', action='store_true'); ap.add_argument('--limit', type=int, default=0)
a = ap.parse_args()
def msgs(c):
    if a.prompt_version == 'v2':
        sys.path.insert(0, HERE); from prompt_v2 import messages_v2
        return messages_v2(c)
    m = [{'role': 'system', 'content': SYSTEM}]
    if a.prompt == 'fewshot':
        for u, x in FEWSHOT: m += [{'role': 'user', 'content': u}, {'role': 'assistant', 'content': x}]
    return m + [{'role': 'user', 'content': render(c)}]
if a.backend == 'hf':
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    tok = AutoTokenizer.from_pretrained(a.adapter or a.base)
    model = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32, device_map='auto' if torch.cuda.is_available() else None)
    if a.adapter: model = PeftModel.from_pretrained(model, a.adapter)
    model.eval()
def ask(c):
    t0 = time.time()
    if a.backend == 'server':
        body = {'messages': msgs(c), 'temperature': 0, 'max_tokens': 120, 'cache_prompt': True, 'chat_template_kwargs': {'enable_thinking': False},
                'response_format': {'type': 'json_schema', 'json_schema': {'name': 'glance', 'schema': SCHEMA}}}
        req = urllib.request.Request(f'http://127.0.0.1:{a.port}/v1/chat/completions', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        txt = json.load(urllib.request.urlopen(req, timeout=600))['choices'][0]['message'].get('content') or ''
    else:
        import torch
        p = tok.apply_chat_template(msgs(c), tokenize=False, add_generation_prompt=True, enable_thinking=False)
        ids = tok(p, return_tensors='pt').to(model.device)
        with torch.no_grad(): out = model.generate(**ids, max_new_tokens=80, do_sample=False)
        txt = tok.decode(out[0][ids['input_ids'].shape[1]:], skip_special_tokens=True)
    try: pred = json.loads(txt[txt.find('{'): txt.rfind('}') + 1])
    except Exception: pred = None
    ok = isinstance(pred, dict) and all(k in pred for k in ['decision', 'family', 'action', 'title', 'due'])
    return {'raw': txt, 'pred': pred if ok else None, 'json_valid': ok, 'json_strict': ok and txt.strip().startswith('{'), 'latency_s': round(time.time() - t0, 2)}
rows = [json.loads(l) for l in open(os.path.join(EVAL, 'eval.jsonl'))]
CORE = set(open(os.path.join(EVAL, 'core_subset.txt')).read().strip().split(','))
if a.subset == 'core': rows = [r for r in rows if r['id'] in CORE]
if a.limit: rows = rows[: a.limit]
outp = os.path.join(HERE, '..', 'results', f'pred-{a.tag}-schema.jsonl'); preds = {}
with open(outp, 'w') as f:
    for r in rows:
        x = ask(r); x['id'] = r['id']; preds[r['id']] = x; f.write(json.dumps(x, ensure_ascii=False) + '\n'); f.flush()
os.chdir(EVAL); import score as S
P = {i: S.norm_model(x['pred']) for i, x in preds.items()}
for name, fn in [('ALL', None), ('CORE162', lambda c: c['id'] in CORE), ('EN', lambda c: c['lang'] == 'en'), ('HE', lambda c: c['lang'] == 'he')]:
    s = S.score(P, a.tag, fn); print(name, {k: s[k] for k in ['n', 'wrongDoIt%', 'wrongDoIt_n', 'missed%', 'missed_n', 'family_acc%', 'end2end%', 'title_ok%', 'title_n']})
print('NOTE: non-core OSS rows are in the SFT train set; CORE162 is the clean held-out number.')
if a.cases:
    cases = [json.loads(l) for l in open(os.path.join(HERE, '..', 'shadow-combined', 'cases.jsonl'))]
    with open(os.path.join(HERE, '..', 'shadow-combined', f'llm-{a.tag}.jsonl'), 'w') as f:
        for c in [c for c in cases if c['needLLM']][: a.limit or None]:
            x = ask(dict(c['prompt'], surface=c.get('surface', 'gmail'))); f.write(json.dumps({'id': c['id'], 'pred': x['pred'], 'raw': x['raw'], 'latency_s': x['latency_s'], 'reused': False}, ensure_ascii=False) + '\n')
