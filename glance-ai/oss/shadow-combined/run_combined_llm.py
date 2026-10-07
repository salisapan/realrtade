# Runs one LLM (llama-server on :8093) on every combined-shadow case that needs it (inbound, no base/product/text veto).
# OSS cases reuse earlier predictions from ../results/pred-<tag>-schema.jsonl when present (same prompt, same server settings).
import json, sys, time, urllib.request, argparse, os
sys.path.insert(0, '../eval')
from prompt import messages, SCHEMA
ap = argparse.ArgumentParser(); ap.add_argument('--tag', required=True); ap.add_argument('--reuse', default=''); ap.add_argument('--pid', type=int, default=0)
ap.add_argument('--sets', default='inj,adv,oss,v2test')
a = ap.parse_args()
cases = [json.loads(l) for l in open('cases.jsonl')]
reuse = {}
if a.reuse and os.path.exists(a.reuse):
    for l in open(a.reuse):
        r = json.loads(l); reuse['oss-' + r['id']] = r
out = f'llm-{a.tag}.jsonl'; done = set()
if os.path.exists(out): done = {json.loads(l)['id'] for l in open(out)}
f = open(out, 'a')
def rss(pid):
    try:
        for l in open(f'/proc/{pid}/status'):
            if l.startswith('VmRSS'): return int(l.split()[1]) // 1024
    except Exception: return None
order = {s: i for i, s in enumerate(a.sets.split(','))}
todo = sorted([c for c in cases if c['needLLM'] and c['set'] in order and c['id'] not in done], key=lambda c: order[c['set']])
print('todo', len(todo), flush=True)
for i, c in enumerate(todo):
    if c['id'] in reuse:
        r = reuse[c['id']]; rec = {'id': c['id'], 'pred': r['pred'], 'raw': r['raw'], 'latency_s': r['latency_s'], 'reused': True, 'rss_mb': r.get('rss_mb')}
        f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush(); continue
    body = {"messages": messages(c['prompt']), "temperature": 0, "max_tokens": 120, "cache_prompt": True,
            "chat_template_kwargs": {"enable_thinking": False}, "response_format": {"type": "json_schema", "json_schema": {"name": "glance", "schema": SCHEMA}}}
    t0 = time.time()
    try:
        req = urllib.request.Request('http://127.0.0.1:8093/v1/chat/completions', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        resp = json.load(urllib.request.urlopen(req, timeout=600)); txt = resp['choices'][0]['message'].get('content') or ''
    except Exception as e:
        txt = ''; print('ERR', e, flush=True)
    dt = time.time() - t0
    try: pred = json.loads(txt[txt.find('{'): txt.rfind('}') + 1])
    except Exception: pred = None
    rec = {'id': c['id'], 'pred': pred, 'raw': txt, 'latency_s': round(dt, 2), 'reused': False, 'rss_mb': rss(a.pid) if a.pid else None}
    f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
    print(i, c['set'], c['id'], round(dt, 1), txt[:100].replace('\n', ' '), flush=True)
print('DONE', flush=True)
