#!/usr/bin/env python3
"""Ask ONE small open model every prompt in prompts.json, greedily, the way the product's tier-2 session would (temperature 0, JSON only).
Scoring is NOT done here: score.cjs replays these raw answers through the real core/local-lm.js (parse, the two-asking rule, the gates).

    python3 scripts/intent/lm/generate.py /tmp/fixed --model Qwen/Qwen2.5-1.5B-Instruct --out /tmp/raw.json
    python3 scripts/intent/lm/generate.py /tmp/fixed --stub --out /tmp/raw.json        # plumbing check only, meaningless numbers

Honest differences from the product (written in docs/lm-fallback-evaluation-plan.md): full precision on a CPU instead of 4-bit in the
browser (so quality here is, if anything, an upper bound); decoding is not grammar-constrained (an off-vocabulary answer is a null, i.e.
silence, which can only cost recall, never precision); the model is not asked for the `when` and `amount` spans (they never change
whether a sentence is proposed; code re-reads dates and money itself).
"""
import json, argparse, time, os, sys, re

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--model', default='Qwen/Qwen2.5-1.5B-Instruct')
ap.add_argument('--out', required=True)
ap.add_argument('--stub', action='store_true')
ap.add_argument('--limit', type=int, default=0)
a = ap.parse_args()

prompts = json.load(open(f'{a.dir}/prompts.json'))['prompts']
if a.limit: prompts = prompts[:a.limit]
PREFILL = '{"act": "'
params = None

if a.stub:
    def run(p):
        s = json.loads(re.search(r'Sentence: (".*")\s*$', p, re.S).group(1)).lower()
        if re.search(r"\?|please|pls|can you|could you|תוכל|בבקשה", s): return '{"act": "ASK", "action": "reply", "who": "you", "when": null, "amount": null}'
        if re.search(r"i will|i'll|אני אשלח|אעביר", s): return '{"act": "PROMISE", "action": "send", "who": "me", "when": null, "amount": null}'
        return '{"act": "INFORM", "action": "none", "who": "none", "when": null, "amount": null}'
else:
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    torch.set_num_threads(os.cpu_count() or 2)
    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForCausalLM.from_pretrained(a.model, torch_dtype=torch.float32)
    model.eval()
    params = sum(p.numel() for p in model.parameters())
    print(f'loaded {a.model}: {params / 1e9:.2f}B parameters, {torch.get_num_threads()} threads', flush=True)
    def run(prompt):
        msgs = [{'role': 'user', 'content': prompt}]
        text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False) + PREFILL
        ids = tok(text, return_tensors='pt', add_special_tokens=False)
        with torch.no_grad():
            out = model.generate(**ids, max_new_tokens=40, do_sample=False, stop_strings=['"when"'], tokenizer=tok, pad_token_id=tok.eos_token_id)
        body = PREFILL + tok.decode(out[0, ids['input_ids'].shape[1]:], skip_special_tokens=True)
        cut = body.find('"when"')
        return body[:cut] + '"when": null, "amount": null}' if cut >= 0 else body

results, t0 = {}, time.time()
for i, p in enumerate(prompts):
    t1 = time.time()
    text = run(p)
    results[p] = {'text': text, 'sec': round(time.time() - t1, 3)}
    if i < 4 or i % 25 == 0:
        print(f'[{i + 1}/{len(prompts)}] {time.time() - t0:.0f}s  {text[:110]!r}', flush=True)
json.dump({'model': 'stub' if a.stub else a.model, 'params': params, 'results': results}, open(a.out, 'w'))
secs = sorted(r['sec'] for r in results.values())
print(f'done: {len(results)} prompts in {time.time() - t0:.0f}s, median {secs[len(secs) // 2]:.2f}s per call', flush=True)
