#!/usr/bin/env python3
"""Ask ONE small open model every prompt in prompts.json, greedily, the way the product's tier-2 session would (temperature 0, JSON only).
Scoring is NOT done here: score.cjs replays these raw answers through the real core/local-lm.js (parse, the two-asking rule, the gates).

    python3 scripts/intent/lm/generate.py /tmp/fixed --model Qwen/Qwen2.5-1.5B-Instruct --out /tmp/raw.json
    python3 scripts/intent/lm/generate.py /tmp/fixed --stub --out /tmp/raw.json        # plumbing check only, meaningless numbers

Honest differences from the product (written in docs/lm-fallback-evaluation-plan.md): full precision on a CPU instead of 4-bit in the
browser (so quality here is, if anything, an upper bound); decoding IS constrained to the schema's keys and values (as the product's session does); the first run of this experiment was not,
and the small models then broke the format on every answer, which measured the harness and not the model (docs/lm-fallback-evaluation-plan.md section 6); the model is not asked for the `when` and `amount` spans (they never change
whether a sentence is proposed; code re-reads dates and money itself).
"""
import json, argparse, time, os, sys, re

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--model', default='Qwen/Qwen2.5-1.5B-Instruct')
ap.add_argument('--out', required=True)
ap.add_argument('--stub', action='store_true')
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--trace', type=int, default=0, help='print the first N prompts with the model\'s scores per act (diagnosis)')
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
    import copy
    detail = {}
    ACTS = ['ASK', 'PROMISE', 'INFORM', 'ACK']
    ACTIONS = ['pay', 'sign', 'approve', 'confirm', 'schedule', 'decide', 'review', 'join', 'complete', 'send', 'reply', 'none']
    WHO = ['you', 'me', 'other', 'none']
    FIELDS = [('act', ACTS, '", "action": "'), ('action', ACTIONS, '", "who": "'), ('who', WHO, '", ')]
    opt_ids = {o: tok(o, add_special_tokens=False).input_ids for _, opts, _ in FIELDS for o in opts}
    def advance(past, text):
        ids = tok(text, return_tensors='pt', add_special_tokens=False).input_ids
        out = model(ids, past_key_values=past, use_cache=True)
        return out.past_key_values, out.logits[0, -1]
    def run(prompt):
        """Constrained decoding, the way the product's session works (Chrome's responseConstraint, Ollama's format, a JSON schema):
        the keys are fixed and each field can only take one of its listed values. Each value is the one the model finds most likely."""
        msgs = [{'role': 'user', 'content': prompt}]
        text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False) + PREFILL
        ids = tok(text, return_tensors='pt', add_special_tokens=False).input_ids
        with torch.no_grad():
            o = model(ids, use_cache=True)
            past, logits = o.past_key_values, o.logits[0, -1]
            chosen = []
            detail.clear()
            for fname, opts, sep in FIELDS:
                lp0 = torch.log_softmax(logits.float(), -1)
                best, best_score = None, None
                scores = {}
                for opt in opts:
                    t = opt_ids[opt]
                    score = lp0[t[0]].item()
                    if len(t) > 1:
                        branch = copy.deepcopy(past)
                        out = model(torch.tensor([t[:-1]]), past_key_values=branch, use_cache=True)
                        lps = torch.log_softmax(out.logits[0].float(), -1)
                        score += sum(lps[i, t[i + 1]].item() for i in range(len(t) - 1))
                    scores[opt] = round(score, 2)
                    if best_score is None or score > best_score: best, best_score = opt, score
                detail[fname] = scores
                chosen.append(best)
                past, logits = advance(past, best + sep)
        return '{"act": "%s", "action": "%s", "who": "%s", "when": null, "amount": null}' % tuple(chosen)

results, t0 = {}, time.time()
for i, p in enumerate(prompts):
    t1 = time.time()
    text = run(p)
    results[p] = {'text': text, 'sec': round(time.time() - t1, 3)}
    if not a.stub and a.trace and i < a.trace:
        m = re.search(r'Sentence: (".*")\s*$', p, re.S)
        print('TRACE', ('B' if 'You read one sentence' in p else 'A'), (json.loads(m.group(1)) if m else '')[:90], '->', text[:60], '| act scores', detail.get('act'), flush=True)
    if i < 4 or i % 25 == 0:
        print(f'[{i + 1}/{len(prompts)}] {time.time() - t0:.0f}s  {text[:110]!r}', flush=True)
from collections import Counter
dist = {k: Counter(json.loads(v['text'].replace('null', 'null')).get(k) for v in results.values() if v['text'].startswith('{')) for k in ('act', 'action', 'who')}
print('chosen values over all prompts:', {k: dict(v) for k, v in dist.items()}, flush=True)
json.dump({'model': 'stub' if a.stub else a.model, 'params': params, 'results': results}, open(a.out, 'w'))
secs = sorted(r['sec'] for r in results.values())
print(f'done: {len(results)} prompts in {time.time() - t0:.0f}s, median {secs[len(secs) // 2]:.2f}s per call', flush=True)
