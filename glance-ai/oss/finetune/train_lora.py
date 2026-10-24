# LoRA SFT for the Glance judge (HF transformers + peft). GPU target: bf16 on 1x L4 24GB / A100 40GB.
# Data: data/sft_train.jsonl + data/sft_val.jsonl from build_sft.py (chat format, assistant turn = JSON matching eval/prompt.py SCHEMA).
# Loss is on the assistant JSON only (prompt tokens masked). Thinking is disabled in the chat template (same as inference).
#   python train_lora.py --config qwen3.5-4b                         # full GPU run
#   python train_lora.py --config qwen3.5-0.8b-smoke --cpu           # tiny CPU smoke test (few dozen steps, ~200 rows)
import argparse, json, math, os, random, time, resource
import torch
from torch.utils.data import Dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, Trainer, TrainingArguments
from peft import LoraConfig, get_peft_model

CONFIGS = {
    # 2B: on-device candidate. 4B: server/desktop candidate (best zero-shot judge, 0 wrong-Do-It on CORE162).
    'qwen3.5-2b': dict(model='Qwen/Qwen3.5-2B', r=16, alpha=32, dropout=0.05, lr=2e-4, epochs=2, per_device_bs=8, grad_accum=4, max_len=1024, warmup=0.03, wd=0.0),
    'qwen3.5-4b': dict(model='Qwen/Qwen3.5-4B', r=16, alpha=32, dropout=0.05, lr=1e-4, epochs=2, per_device_bs=4, grad_accum=8, max_len=1024, warmup=0.03, wd=0.0),
    'qwen3.5-0.8b-smoke': dict(model='Qwen/Qwen3.5-0.8B', r=8, alpha=16, dropout=0.0, lr=2e-4, epochs=1, per_device_bs=2, grad_accum=2, max_len=768, warmup=0.0, wd=0.0, max_steps=40, limit=200),
}
# all text-model linear layers: gated attention (q/k/v/o), Gated DeltaNet linear attention (in_proj_*, out_proj), MLP. Vision tower is not loaded.
TARGETS = ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'in_proj_qkv', 'in_proj_z', 'in_proj_b', 'in_proj_a', 'out_proj', 'gate_proj', 'up_proj', 'down_proj']

class SFT(Dataset):
    def __init__(self, path, tok, max_len, limit=0, seed=0):
        rows = [json.loads(l) for l in open(path)]
        if limit:
            random.Random(seed).shuffle(rows)
            act = [r for r in rows if '"act"' in r['messages'][-1]['content']]; sil = [r for r in rows if r not in act]
            rows = act[: limit // 2] + sil[: limit - limit // 2]  # balanced smoke subset
        self.items, self.truncated = [], 0
        for r in rows:
            msgs = r['messages']
            prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True, enable_thinking=False)
            p_ids = tok(prompt, add_special_tokens=False)['input_ids']
            a_ids = tok(msgs[-1]['content'] + '<|im_end|>\n', add_special_tokens=False)['input_ids']
            ids = p_ids + a_ids
            if len(ids) > max_len: self.truncated += 1; ids = ids[-max_len:]; p_len = max(0, len(ids) - len(a_ids))
            else: p_len = len(p_ids)
            self.items.append((ids, [-100] * p_len + ids[p_len:]))
    def __len__(self): return len(self.items)
    def __getitem__(self, i): return self.items[i]

def collate(pad_id):
    def f(batch):
        L = max(len(x[0]) for x in batch)
        ids = torch.full((len(batch), L), pad_id); lab = torch.full((len(batch), L), -100); att = torch.zeros((len(batch), L), dtype=torch.long)
        for i, (x, y) in enumerate(batch): ids[i, :len(x)] = torch.tensor(x); lab[i, :len(y)] = torch.tensor(y); att[i, :len(x)] = 1
        return {'input_ids': ids, 'labels': lab, 'attention_mask': att}
    return f

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True, choices=list(CONFIGS)); ap.add_argument('--train', default='data/sft_train.jsonl'); ap.add_argument('--val', default='data/sft_val.jsonl')
    ap.add_argument('--out', default=None); ap.add_argument('--cpu', action='store_true'); ap.add_argument('--threads', type=int, default=3)
    ap.add_argument('--max-steps', type=int, default=None); ap.add_argument('--limit', type=int, default=None); ap.add_argument('--val-limit', type=int, default=None)
    ap.add_argument('--dry-run', action='store_true', help='tokenize + report lengths/steps, no model load')
    ap.add_argument('--max-len', type=int, default=None); ap.add_argument('--bs', type=int, default=None); ap.add_argument('--grad-accum', type=int, default=None)
    ap.add_argument('--dtype', choices=['auto', 'fp32', 'bf16'], default='auto', help='auto = fp32 on CPU, bf16 on GPU; bf16 on CPU needs AVX512-BF16/AMX')
    a = ap.parse_args(); C = dict(CONFIGS[a.config])
    if a.max_steps is not None: C['max_steps'] = a.max_steps
    if a.limit is not None: C['limit'] = a.limit
    if a.max_len is not None: C['max_len'] = a.max_len
    if a.bs is not None: C['per_device_bs'] = a.bs
    if a.grad_accum is not None: C['grad_accum'] = a.grad_accum
    out = a.out or f'runs/{a.config}'
    os.makedirs(out, exist_ok=True)
    if a.cpu: torch.set_num_threads(a.threads)
    t0 = time.time()
    tok = AutoTokenizer.from_pretrained(C['model'])
    if tok.pad_token_id is None: tok.pad_token = tok.eos_token
    tr = SFT(a.train, tok, C['max_len'], C.get('limit', 0)); va = SFT(a.val, tok, C['max_len'], a.val_limit or (40 if C.get('limit') else 0), seed=1)
    lens = sorted(len(x[0]) for x in tr.items)
    eff_bs = C['per_device_bs'] * C['grad_accum']; steps = C.get('max_steps') or math.ceil(len(tr) / eff_bs) * C['epochs']
    info = {'config': a.config, 'dtype': a.dtype, 'cpu': a.cpu, **C, 'n_train': len(tr), 'n_val': len(va), 'truncated': tr.truncated, 'tok_p50': lens[len(lens) // 2], 'tok_p95': lens[int(.95 * len(lens))], 'tok_max': lens[-1],
            'train_tokens_per_epoch': sum(lens), 'effective_batch': eff_bs, 'optimizer_steps': steps}
    print(json.dumps(info, indent=1)); json.dump(info, open(f'{out}/data_info.json', 'w'), indent=1)
    if a.dry_run: return
    dtype = {'fp32': torch.float32, 'bf16': torch.bfloat16}.get(a.dtype) or (torch.float32 if a.cpu else torch.bfloat16)
    model = AutoModelForCausalLM.from_pretrained(C['model'], dtype=dtype)
    model.config.use_cache = False
    if not a.cpu: model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant': False}); model.enable_input_require_grads()
    present = {n.split('.')[-1] for n, m in model.named_modules() if isinstance(m, torch.nn.Linear)}
    lcfg = LoraConfig(r=C['r'], lora_alpha=C['alpha'], lora_dropout=C['dropout'], target_modules=[t for t in TARGETS if t in present], task_type='CAUSAL_LM')
    model = get_peft_model(model, lcfg); model.print_trainable_parameters()
    args = TrainingArguments(output_dir=out, per_device_train_batch_size=C['per_device_bs'], per_device_eval_batch_size=C['per_device_bs'], gradient_accumulation_steps=C['grad_accum'],
        learning_rate=C['lr'], num_train_epochs=C['epochs'], max_steps=C.get('max_steps', -1) or -1, warmup_steps=C['warmup'],  # transformers>=5: float in [0,1) = ratio (warmup_ratio was removed)
        lr_scheduler_type='cosine', weight_decay=C['wd'],
        logging_steps=5 if a.cpu else 20, eval_strategy='steps', eval_steps=max(10, steps // 10) if not a.cpu else (C.get('max_steps') or 40), save_strategy='steps', save_steps=max(10, steps // 4) if not a.cpu else 10**9,
        save_total_limit=2, bf16=(not a.cpu) or dtype == torch.bfloat16, use_cpu=a.cpu, report_to=[], dataloader_num_workers=0, remove_unused_columns=False, seed=13)
    trainer = Trainer(model=model, args=args, train_dataset=tr, eval_dataset=va, data_collator=collate(tok.pad_token_id))
    ev0 = trainer.evaluate(); print('eval before', ev0)
    res = trainer.train(); ev1 = trainer.evaluate(); print('eval after', ev1)
    model.save_pretrained(f'{out}/adapter'); tok.save_pretrained(f'{out}/adapter')
    summ = {'train': res.metrics, 'eval_loss_before': ev0.get('eval_loss'), 'eval_loss_after': ev1.get('eval_loss'), 'wall_s': round(time.time() - t0, 1),
            'peak_rss_mb': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024, 'log': trainer.state.log_history}
    json.dump(summ, open(f'{out}/train_summary.json', 'w'), indent=1); print(json.dumps({k: v for k, v in summ.items() if k != 'log'}, indent=1))

if __name__ == '__main__':
    main()
